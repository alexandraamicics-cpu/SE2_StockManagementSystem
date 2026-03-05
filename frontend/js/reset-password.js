const toast = document.getElementById('toast');

function showToast(msg, ok = true) {
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = ok ? '#e7f7eb' : '#fde0e0';
  toast.style.color = ok ? '#1a7a4e' : '#c45555';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function validatePasswordRules(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.';
  return '';
}

async function resetPassword() {
  const token = new URLSearchParams(window.location.search).get('token');
  const newPassword = document.getElementById('rpPass').value;
  const confirmPassword = document.getElementById('rpPass2').value;

  if (!token) return showToast('Invalid reset link.', false);
  if (newPassword !== confirmPassword) return showToast('Passwords do not match.', false);

  const policyMessage = validatePasswordRules(newPassword);
  if (policyMessage) return showToast(policyMessage, false);

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Failed to reset password.');

    showToast('Password reset successful! Redirecting to login...');
    setTimeout(() => { window.location.href = '/index.html'; }, 1200);
  } catch (err) {
    showToast(err.message, false);
  }
}

document.getElementById('resetBtn').addEventListener('click', resetPassword);
