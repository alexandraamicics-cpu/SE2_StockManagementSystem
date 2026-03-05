const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');
const { generateUserId } = require('../utils/userId');
const { logActivity } = require('../utils/logger');
const { validatePasswordRules } = require('../utils/passwordPolicy');

const VALID_SUFFIXES = new Set(['Jr.', 'II', 'III']);
const VALID_GENDERS = new Set(['Male', 'Female']);

function getBaseUrl() {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
}

function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || '587');

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function parseLegacyName(name = '') {
  const raw = String(name || '').trim();
  if (!raw) return { last_name: '', first_name: '', middle_name: '' };

  if (!raw.includes(',')) {
    return { last_name: '', first_name: raw, middle_name: '' };
  }

  const [lastRaw, restRaw] = raw.split(',');
  const last_name = (lastRaw || '').trim();
  const rest = (restRaw || '').trim();
  if (!rest) return { last_name, first_name: '', middle_name: '' };

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (!tokens.length) return { last_name, first_name: '', middle_name: '' };

  let middle_name = '';
  if (tokens.length > 1 && /^[A-Za-z]{1,3}\.?$/.test(tokens[tokens.length - 1])) {
    middle_name = tokens.pop();
  }

  return {
    last_name,
    first_name: tokens.join(' ').trim(),
    middle_name: middle_name.trim()
  };
}

function normalizeNameParts(payload = {}) {
  let last_name = String(payload.last_name || '').trim();
  let first_name = String(payload.first_name || '').trim();
  let middle_name = String(payload.middle_name || '').trim();

  if ((!last_name || !first_name || !middle_name) && payload.name) {
    const parsed = parseLegacyName(payload.name);
    if (!last_name) last_name = parsed.last_name;
    if (!first_name) first_name = parsed.first_name;
    if (!middle_name) middle_name = parsed.middle_name;
  }

  return { last_name, first_name, middle_name };
}

function normalizePhoneNumber(raw = '') {
  const clean = String(raw || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 9) return clean;
  if (clean.length === 10 && clean.startsWith('9')) return clean.slice(1);
  if (clean.length === 11 && clean.startsWith('09')) return clean.slice(2);
  if (clean.length === 12 && clean.startsWith('639')) return clean.slice(3);
  return '';
}

function buildDisplayName(last_name, first_name, middle_name, suffix = '') {
  const last = String(last_name || '').trim();
  const first = String(first_name || '').trim();
  const middle = String(middle_name || '').trim();
  const normalizedSuffix = String(suffix || '').trim();
  const middleAndSuffix = [middle, normalizedSuffix].filter(Boolean).join(' ');
  return `${last}, ${first}${middleAndSuffix ? ` ${middleAndSuffix}` : ''}`.trim();
}

async function sendResetEmail(email, token) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Forgot-password email is not configured. Set SMTP_USER and SMTP_PASS in .env (for Gmail, use an App Password).');
  }

  const resetUrl = `${getBaseUrl()}/reset-password.html?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: '1800 Soles - Password Reset',
    text: `Use this link to reset your password: ${resetUrl}
This link expires in 1 hour.`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`
  });
}

async function register(req, res) {
  const { username, email, password, agree } = req.body;
  const { last_name, first_name, middle_name } = normalizeNameParts(req.body);
  const role = String(req.body.role || '').trim();
  const suffix = String(req.body.suffix || '').trim() || null;
  const gender = String(req.body.gender || '').trim();
  const phone_number = normalizePhoneNumber(req.body.phone_number);

  if (!agree) return res.status(400).json({ error: 'Please accept terms and conditions.' });
  if (!last_name || !first_name || !middle_name || !role || !username || !email || !password || !gender || !phone_number) {
    return res.status(400).json({ error: 'Last name, first name, middle name, role, username, email, gender, phone number, and password are required.' });
  }

  if (suffix && !VALID_SUFFIXES.has(suffix)) {
    return res.status(400).json({ error: 'Invalid suffix.' });
  }

  if (!VALID_GENDERS.has(gender)) {
    return res.status(400).json({ error: 'Gender must be Male or Female.' });
  }

  if (!/^\d{9}$/.test(phone_number)) {
    return res.status(400).json({ error: 'Phone number must be 9 digits after +639 (example: +639123456789).' });
  }

  const policy = validatePasswordRules(password);
  if (!policy.ok) return res.status(400).json({ error: policy.message });

  try {
    const [[existingUser]] = await pool.query(
      'SELECT user_id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existingUser) return res.status(409).json({ error: 'Username or email already exists.' });

    const user_id = await generateUserId();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (user_id, role, last_name, first_name, middle_name, suffix, gender, phone_number, username, email, password_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [user_id, role, last_name, first_name, middle_name, suffix, gender, phone_number, username, email, hash]
    );

    try {
      await logActivity({ user_id, action_type: 'REGISTER', description: 'User registered' });
    } catch (logErr) {
      console.warn('Activity log failed for REGISTER:', logErr);
    }

    return res.json({ message: 'Registered successfully, please log in.', user_id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    const msg = err.sqlMessage || err.message || 'Registration failed';
    console.error('Register error:', err);
    return res.status(500).json({ error: msg });
  }
}

async function login(req, res) {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const [[user]] = await pool.query(
      `SELECT user_id, role, last_name, first_name, middle_name, suffix, gender, phone_number, username, email, password_hash
       FROM users
       WHERE (username = ? OR email = ?) AND is_active = 1
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = {
      user_id: user.user_id,
      role: user.role,
      last_name: user.last_name,
      first_name: user.first_name,
      middle_name: user.middle_name,
      suffix: user.suffix,
      gender: user.gender,
      phone_number: user.phone_number,
      name: buildDisplayName(user.last_name, user.first_name, user.middle_name, user.suffix),
      username: user.username,
      email: user.email
    };

    await logActivity({ user_id: user.user_id, action_type: 'LOGIN', description: 'User logged in' });
    return res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Login failed' });
  }
}

function logout(req, res) {
  const user = req.session.user;
  req.session.destroy(async () => {
    if (user) await logActivity({ user_id: user.user_id, action_type: 'LOGOUT', description: 'User logged out' });
    return res.json({ message: 'Logged out' });
  });
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    const [[user]] = await pool.query(
      'SELECT user_id, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
      [email]
    );

    if (!user) {
      return res.json({ message: 'If that email exists, a reset link was sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await pool.query(
      'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.user_id]
    );

    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [user.user_id, tokenHash]
    );

    await sendResetEmail(user.email, token);
    return res.json({ message: 'If that email exists, a reset link was sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process forgot password request.' });
  }
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  const policy = validatePasswordRules(newPassword);
  if (!policy.ok) return res.status(400).json({ error: policy.message });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [[resetRow]] = await pool.query(
      `SELECT pr.reset_id, pr.user_id
       FROM password_resets pr
       JOIN users u ON u.user_id = pr.user_id
       WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > NOW() AND u.is_active = 1
       ORDER BY pr.reset_id DESC
       LIMIT 1`,
      [tokenHash]
    );

    if (!resetRow) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE user_id = ?', [newHash, resetRow.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE reset_id = ?', [resetRow.reset_id]);

    await logActivity({
      user_id: resetRow.user_id,
      action_type: 'CHANGE_PASSWORD',
      description: 'Password changed via forgot-password flow'
    });

    return res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
}

function me(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({ user: req.session.user });
}

module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  me
};
