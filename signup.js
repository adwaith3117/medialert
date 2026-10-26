/**
 * MediAlert - Registration Controller
 * Registers Patient/Guardian and Doctor accounts using their shared account store
 */

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.querySelector('#signup-form');
  const nameInput = document.querySelector('#full-name');
  const signupEmail = document.querySelector('#signup-email');
  const signupPassword = document.querySelector('#signup-password');
  const confirmPassword = document.querySelector('#confirm-password');
  const setupPin = document.querySelector('#setup-pin');
  const setupPinConfirm = document.querySelector('#setup-pin-confirm');
  const signupStatus = document.querySelector('#signup-status');
  const passwordStrength = document.querySelector('#password-strength');
  const pinSetupError = document.querySelector('#pin-setup-error');
  const passwordToggle = document.querySelector('#signup-password-toggle');
  const isDoctorRegistration = new URLSearchParams(window.location.search).get('role') === 'doctor';

  if (isDoctorRegistration) {
    document.title = 'MediAlert | Doctor Registration';
    document.querySelector('#signup-role-eyebrow').textContent = 'Doctor Account';
    document.querySelector('#signup-brand-description').textContent = 'Create your Doctor sign-in now and add professional profile details after logging in.';
    document.querySelector('#signup-role-label').textContent = 'Doctor Registration';
    document.querySelector('#signup-intro-copy').textContent = 'Create your Doctor account. Add professional details later from your profile.';
    document.querySelector('#pin-setup-box').remove();
    document.querySelector('#signup-legal-copy').textContent = 'Doctor accounts and profile details are stored in this browser only and are not shared across devices. Professional credentials are not verified by account creation.';
  }

  function setSignupError(input, message) {
    let errorElementId;
    if (input.id === 'full-name') errorElementId = 'name-error';
    else if (input.id === 'signup-email') errorElementId = 'signup-email-error';
    else if (input.id === 'signup-password') errorElementId = 'password-error';
    else if (input.id === 'confirm-password') errorElementId = 'confirm-error';
    else errorElementId = 'signup-status';

    const error = document.querySelector(`#${errorElementId}`);
    const group = input.closest('.field-group');
    if (group) group.classList.toggle('has-error', Boolean(message));
    if (error) error.textContent = message || '';
  }

  function isStrongPassword(value) {
    return (
      value.length >= 8 &&
      /[A-Z]/.test(value) &&
      /[a-z]/.test(value) &&
      /\d/.test(value) &&
      /[^A-Za-z0-9]/.test(value)
    );
  }

  function updateStrength() {
    const value = signupPassword.value;
    const checks = [
      value.length >= 8,
      /[A-Z]/.test(value),
      /[a-z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value)
    ];
    const score = checks.filter(Boolean).length;
    const label = !value ? 'Not entered' : score <= 2 ? 'Weak' : score < 5 ? 'Medium' : 'Strong';
    passwordStrength.innerHTML = `Strength: <strong>${label}</strong>`;
    passwordStrength.dataset.strength = label.toLowerCase().replace(' ', '-');
  }

  signupPassword?.addEventListener('input', updateStrength);

  passwordToggle?.addEventListener('click', () => {
    const visible = signupPassword.type === 'password';
    signupPassword.type = visible ? 'text' : 'password';
    passwordToggle.textContent = visible ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} password`);
  });

  // Restrict PIN to digits only
  [setupPin, setupPinConfirm].forEach(el => {
    el?.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      if (pinSetupError) pinSetupError.textContent = '';
    });
  });

  signupForm?.addEventListener('submit', async event => {
    event.preventDefault();
    signupStatus.textContent = '';
    if (pinSetupError) pinSetupError.textContent = '';

    [nameInput, signupEmail, signupPassword, confirmPassword].forEach(input => setSignupError(input, ''));

    let valid = true;

    if (!nameInput.value.trim()) {
      setSignupError(nameInput, 'Full name is required.');
      valid = false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(signupEmail.value.trim())) {
      setSignupError(signupEmail, 'Please enter a valid email address.');
      valid = false;
    }

    if (!isStrongPassword(signupPassword.value)) {
      setSignupError(
        signupPassword,
        'Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.'
      );
      valid = false;
    }

    if (confirmPassword.value !== signupPassword.value) {
      setSignupError(confirmPassword, 'Passwords do not match.');
      valid = false;
    }

    // Quick PIN is available only to Patient / Guardian accounts.
    const pin = setupPin?.value.trim() || '';
    const pinConfirm = setupPinConfirm?.value.trim() || '';

    if (!isDoctorRegistration && (pin || pinConfirm)) {
      if (pin.length < 4 || pin.length > 6) {
        if (pinSetupError) pinSetupError.textContent = 'Quick PIN must be 4 to 6 digits.';
        valid = false;
      } else if (pin !== pinConfirm) {
        if (pinSetupError) pinSetupError.textContent = 'Quick PINs do not match.';
        valid = false;
      }
    }

    if (!valid) {
      signupForm.querySelector('.has-error input')?.focus();
      return;
    }

    const submitBtn = document.querySelector('#signup-submit-btn');
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.querySelector('span').textContent = 'Creating account...';

    try {
      const details = {
        name: nameInput.value.trim(),
        email: signupEmail.value.trim(),
        password: signupPassword.value
      };
      const result = isDoctorRegistration
        ? await registerDoctorAccount(details)
        : await registerPatientAccount({ ...details, pin: pin || null });

      if (!result.ok) {
        setSignupError(signupEmail, result.message);
        signupStatus.textContent = result.message;
        return;
      }

      // Log in and route automatically to the dashboard for the new account role.
      setActiveSession(result.account, true);
      window.location.assign(getDashboardUrl(result.account.role));
    } catch (err) {
      console.error(err);
      signupStatus.textContent = 'Account creation failed. Please try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.querySelector('span').textContent = 'Create Account';
    }
  });
});
