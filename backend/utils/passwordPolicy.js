function validatePasswordRules(password) {
  if (typeof password !== 'string') {
    return { ok: false, message: 'Password is required.' };
  }
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must include a lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must include an uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must include a number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, message: 'Password must include a special character.' };
  }
  return { ok: true };
}

module.exports = { validatePasswordRules };
