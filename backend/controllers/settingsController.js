const bcrypt = require('bcrypt');
const pool = require('../db');
const { logActivity } = require('../utils/logger');
const { validatePasswordRules } = require('../utils/passwordPolicy');

const VALID_SUFFIXES = new Set(['Jr.', 'II', 'III']);

function buildDisplayName(last_name, first_name, middle_name, suffix = '') {
  const last = String(last_name || '').trim();
  const first = String(first_name || '').trim();
  const middle = String(middle_name || '').trim();
  const normalizedSuffix = String(suffix || '').trim();
  const middleAndSuffix = [middle, normalizedSuffix].filter(Boolean).join(' ');
  return `${last}, ${first}${middleAndSuffix ? ` ${middleAndSuffix}` : ''}`.trim();
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

async function updateProfile(req, res) {
  const { last_name, first_name, middle_name, username, email } = req.body;
  const suffix = String(req.body.suffix || '').trim() || null;
  const phone_number = normalizePhoneNumber(req.body.phone_number);

  if (!last_name || !first_name || !middle_name || !username || !email || !phone_number) {
    return res.status(400).json({ error: 'Last name, first name, middle name, username, email, and phone number are required' });
  }

  if (suffix && !VALID_SUFFIXES.has(suffix)) {
    return res.status(400).json({ error: 'Invalid suffix.' });
  }

  if (!/^\d{9}$/.test(phone_number)) {
    return res.status(400).json({ error: 'Phone number must be 9 digits after +639 (example: +639123456789).' });
  }

  try {
    const [[dup]] = await pool.query(
      'SELECT user_id FROM users WHERE (username = ? OR email = ?) AND user_id <> ?',
      [username, email, req.session.user.user_id]
    );
    if (dup) return res.status(409).json({ error: 'Username or email already exists.' });

    await pool.query(
      `UPDATE users
       SET last_name=?, first_name=?, middle_name=?, suffix=?, phone_number=?, username=?, email=?, updated_at=NOW()
       WHERE user_id=?`,
      [last_name, first_name, middle_name, suffix, phone_number, username, email, req.session.user.user_id]
    );

    req.session.user.last_name = last_name;
    req.session.user.first_name = first_name;
    req.session.user.middle_name = middle_name;
    req.session.user.suffix = suffix;
    req.session.user.phone_number = phone_number;
    req.session.user.name = buildDisplayName(last_name, first_name, middle_name, suffix);
    req.session.user.username = username;
    req.session.user.email = email;

    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'UPDATE_PROFILE',
      description: 'Profile updated'
    });

    return res.json({
      message: 'Profile updated successfully.',
      user: {
        user_id: req.session.user.user_id,
        role: req.session.user.role,
        last_name,
        first_name,
        middle_name,
        suffix,
        gender: req.session.user.gender,
        phone_number,
        name: req.session.user.name,
        username,
        email
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing passwords' });

  const policy = validatePasswordRules(newPassword);
  if (!policy.ok) return res.status(400).json({ error: policy.message });

  try {
    const [[user]] = await pool.query('SELECT password_hash FROM users WHERE user_id=?', [req.session.user.user_id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=?, updated_at=NOW() WHERE user_id=?', [hash, req.session.user.user_id]);
    await logActivity({
      user_id: req.session.user.user_id,
      action_type: 'CHANGE_PASSWORD',
      description: 'Password changed'
    });
    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update password' });
  }
}

module.exports = {
  updateProfile,
  updatePassword
};
