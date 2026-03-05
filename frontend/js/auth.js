const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const toast = document.getElementById('toast');

const termsLink = document.getElementById('termsLink');
const termsBackdrop = document.getElementById('termsBackdrop');
const termsCloseBtn = document.getElementById('termsCloseBtn');
const termsCloseIcon = document.getElementById('termsCloseIcon');

function openTermsModal() {
  if (termsBackdrop) termsBackdrop.style.display = 'flex';
}

function closeTermsModal() {
  if (termsBackdrop) termsBackdrop.style.display = 'none';
}

if (termsLink) {
  termsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openTermsModal();
  });
}

if (termsCloseBtn) termsCloseBtn.addEventListener('click', closeTermsModal);
if (termsCloseIcon) termsCloseIcon.addEventListener('click', closeTermsModal);

if (termsBackdrop) {
  termsBackdrop.addEventListener('click', (e) => {
    if (e.target === termsBackdrop) closeTermsModal();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && termsBackdrop && termsBackdrop.style.display === 'flex') {
    closeTermsModal();
  }
});

if (loginTab && signupTab) {
  loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
  });
  signupTab.addEventListener('click', () => {
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    signupForm.style.display = 'block';
    loginForm.style.display = 'none';
  });
}

const gotoLogin = document.getElementById('gotoLogin');
if (gotoLogin) {
  gotoLogin.addEventListener('click', (e) => {
    e.preventDefault();
    loginTab.click();
  });
}

function showToast(msg, ok = true) {
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = ok ? '#e7f7eb' : '#fde0e0';
  toast.style.color = ok ? '#1a7a4e' : '#c45555';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

function toggleVisibility(triggerId, inputId) {
  const trig = document.getElementById(triggerId);
  const input = document.getElementById(inputId);
  if (!trig || !input) return;
  trig.addEventListener('click', () => {
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
  });
}

toggleVisibility('toggleLoginPass', 'loginPassword');
toggleVisibility('toggleSupass1', 'suPass');
toggleVisibility('toggleSupass2', 'suPass2');

function syncSelectPlaceholderState(select) {
  if (!select) return;
  select.classList.toggle('select-placeholder', !select.value);
}

const suSuffixSelect = document.getElementById('suSuffix');
if (suSuffixSelect) {
  syncSelectPlaceholderState(suSuffixSelect);
  suSuffixSelect.addEventListener('change', () => syncSelectPlaceholderState(suSuffixSelect));
}

const suGenderSelect = document.getElementById('suGender');
if (suGenderSelect) {
  syncSelectPlaceholderState(suGenderSelect);
  suGenderSelect.addEventListener('change', () => syncSelectPlaceholderState(suGenderSelect));
}

function validatePasswordRules(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.';
  return '';
}

function normalizePhoneNumber(raw = '') {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return digits;
  if (digits.length === 10 && digits.startsWith('9')) return digits.slice(1);
  if (digits.length === 11 && digits.startsWith('09')) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith('639')) return digits.slice(3);
  return digits.slice(0, 9);
}

const suPhone = document.getElementById('suPhone');
if (suPhone) {
  suPhone.addEventListener('input', (event) => {
    event.target.value = normalizePhoneNumber(event.target.value);
  });
}

async function requestJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    try {
      const identifier = document.getElementById('loginIdentifier').value.trim();
      const password = document.getElementById('loginPassword').value;
      await requestJSON('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });
      showToast('Login successful!');
      setTimeout(() => {
        window.location.href = '/home.html';
      }, 800);
    } catch (err) {
      showToast(err.message, false);
    }
  });
}

const signupBtn = document.getElementById('signupBtn');
if (signupBtn) {
  signupBtn.addEventListener('click', async () => {
    const lastName = document.getElementById('suLastName').value.trim();
    const firstName = document.getElementById('suFirstName').value.trim();
    const middleName = document.getElementById('suMiddleName').value.trim();
    const suffix = document.getElementById('suSuffix').value;
    const gender = document.getElementById('suGender').value;
    const phoneNumber = normalizePhoneNumber(document.getElementById('suPhone').value.trim());
    const role = document.getElementById('suRole').value.trim();
    const username = document.getElementById('suUsername').value.trim();
    const email = document.getElementById('suEmail').value.trim();
    const password = document.getElementById('suPass').value;
    const password2 = document.getElementById('suPass2').value;
    const agree = document.getElementById('suAgree').checked;

    if (!lastName || !firstName || !middleName || !gender || !phoneNumber || !role || !username || !email || !password) {
      return showToast('Please complete all required fields.', false);
    }

    if (!/^\d{9}$/.test(phoneNumber)) {
      return showToast('Phone number must be 9 digits after +639 (example: +639123456789).', false);
    }

    if (password !== password2) return showToast('Passwords do not match', false);
    const policyMsg = validatePasswordRules(password);
    if (policyMsg) return showToast(policyMsg, false);

    try {
      await requestJSON('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName,
          suffix: suffix || null,
          gender,
          phone_number: phoneNumber,
          role,
          username,
          email,
          password,
          agree
        })
      });
      showToast('Account created! Please log in.');
      document.getElementById('loginIdentifier').value = username || email;
      loginTab.click();
    } catch (err) {
      showToast(err.message, false);
    }
  });
}

const forgotLink = document.getElementById('forgotLink');
if (forgotLink) {
  forgotLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = (prompt('Enter your registered email:') || '').trim();
    if (!email) return;
    try {
      await requestJSON('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      showToast('If the email exists, a reset link was sent.');
    } catch (err) {
      showToast(err.message, false);
    }
  });
}

fetch('/api/auth/me', { credentials: 'include' }).then((r) => {
  if (r.ok) window.location.href = '/home.html';
});
