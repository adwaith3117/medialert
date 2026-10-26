/**
 * MediAlert - Login Controller
 * Supports Password Login (Doctor & Patient) and Quick PIN Login (Patient/Guardian ONLY)
 */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('#login-form');
  const emailInput = document.querySelector('#email');
  const passwordInput = document.querySelector('#password');
  const emailGroup = document.querySelector('#email-field-group');
  const passwordGroup = document.querySelector('#password-field-group');
  const emailError = document.querySelector('#email-error');
  const passwordError = document.querySelector('#password-error');
  const formStatus = document.querySelector('#form-status');
  const passwordToggle = document.querySelector('#password-toggle');
  const helpButton = document.querySelector('#help-button');
  const forgotPasswordBtn = document.querySelector('#forgot-password');

  // Quick PIN Elements
  const pinForm = document.querySelector('#pin-form');
  const pinInput = document.querySelector('#quick-pin');
  const pinError = document.querySelector('#pin-error');
  const pinButton = document.querySelector('#pin-login-btn');
  const forgotPinBtn = document.querySelector('#forgot-pin');

  function setFieldError(group, errorElement, message) {
    if (group) group.classList.toggle('has-error', Boolean(message));
    if (errorElement) errorElement.textContent = message || '';
  }

  function clearAllErrors() {
    setFieldError(emailGroup, emailError, '');
    setFieldError(passwordGroup, passwordError, '');
    if (pinError) pinError.textContent = '';
    formStatus.textContent = '';
  }

  function validateEmail() {
    const email = emailInput.value.trim();
    if (!email) {
      setFieldError(emailGroup, emailError, 'Email is required.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
      setFieldError(emailGroup, emailError, 'Please enter a valid email address.');
      return false;
    }
    setFieldError(emailGroup, emailError, '');
    return true;
  }

  function validatePassword() {
    const password = passwordInput.value;
    if (!password) {
      setFieldError(passwordGroup, passwordError, 'Password is required.');
      return false;
    }
    setFieldError(passwordGroup, passwordError, '');
    return true;
  }

  // Password visibility toggle
  passwordToggle?.addEventListener('click', () => {
    const shouldShow = passwordInput.type === 'password';
    passwordInput.type = shouldShow ? 'text' : 'password';
    passwordToggle.textContent = shouldShow ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', `${shouldShow ? 'Hide' : 'Show'} password`);
  });

  // Digits only restriction for Quick PIN
  pinInput?.addEventListener('input', e => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = val;
    if (pinError.textContent) pinError.textContent = '';
  });

  // 1. Password Login Handler
  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    clearAllErrors();

    const isEmailValid = validateEmail();
    const isPasswordValid = validatePassword();
    if (!isEmailValid || !isPasswordValid) return;

    const submitBtn = document.querySelector('#password-login-btn');
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.querySelector('span').textContent = 'Signing in...';

    try {
      const result = await authenticateWithPassword(emailInput.value.trim(), passwordInput.value);
      if (!result.ok) {
        setFieldError(passwordGroup, passwordError, result.message);
        formStatus.textContent = result.message;
        passwordInput.focus();
        return;
      }

      const selectedRole = window.activeRole === 'doctor' ? ROLES.DOCTOR : ROLES.PATIENT_GUARDIAN;
      if (result.account.role !== selectedRole) {
        const roleName = selectedRole === ROLES.DOCTOR ? 'Doctor' : 'Patient / Guardian';
        const message = `This account is not registered as a ${roleName} account.`;
        setFieldError(passwordGroup, passwordError, message);
        formStatus.textContent = message;
        passwordInput.focus();
        return;
      }

      const remember = document.querySelector('#remember-me')?.checked || false;
      setActiveSession(result.account, remember);

      // Route automatically based on user's role
      const redirectUrl = getDashboardUrl(result.account.role);
      window.location.assign(redirectUrl);
    } catch (err) {
      console.error(err);
      formStatus.textContent = 'Sign in error. Please verify your details.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.querySelector('span').textContent = 'Login';
    }
  });

  // 2. Quick PIN Login Handler (Patient / Guardian ONLY)
  pinForm?.addEventListener('submit', async event => {
    event.preventDefault();
    clearAllErrors();

    if (window.activeRole === 'doctor') {
      pinError.textContent = 'Doctor accounts must log in with Email and Password.';
      return;
    }

    const pin = pinInput.value.trim();
    if (!pin || pin.length < 4 || pin.length > 6) {
      pinError.textContent = 'Please enter a valid 4 to 6 digit PIN.';
      pinInput.focus();
      return;
    }

    pinButton.disabled = true;
    pinButton.querySelector('span').textContent = 'Verifying PIN...';

    try {
      const result = await authenticateWithPin(pin);
      if (!result.ok) {
        pinError.textContent = result.message;
        formStatus.textContent = result.message;
        pinInput.value = '';
        pinInput.focus();
        return;
      }

      // Security check: Doctor MUST NOT log in via PIN
      if (result.account.role === ROLES.DOCTOR) {
        pinError.textContent = 'Doctor accounts must log in with Email and Password.';
        return;
      }

      setActiveSession(result.account, true);

      // Route automatically to Patient / Guardian Dashboard
      window.location.assign('dashboard.html');
    } catch (err) {
      console.error(err);
      pinError.textContent = 'PIN verification could not be completed.';
    } finally {
      pinButton.disabled = false;
      pinButton.querySelector('span').textContent = 'Quick Login';
    }
  });

  // Forgot PIN button -> Focus email and password
  forgotPinBtn?.addEventListener('click', e => {
    e.preventDefault();
    clearAllErrors();
    formStatus.textContent = 'Please sign in using your normal Email and Password.';
    emailInput.focus();
  });

  // Forgot Password
  forgotPasswordBtn?.addEventListener('click', e => {
    e.preventDefault();
    formStatus.textContent = 'For demo accounts, use password "MediAlert@2026" or register a new patient account.';
  });

  // Help button
  helpButton?.addEventListener('click', () => {
    formStatus.textContent = 'MediAlert Clinical Support is available 24/7 at support@medialert.com';
  });

  // Helper function attached to window for quick demo pre-fill
  window.fillCredentials = (email, pass, pin = '') => {
    emailInput.value = email;
    passwordInput.value = pass;
    if (pin && pinInput) pinInput.value = pin;
    clearAllErrors();
  };
});
