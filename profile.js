/**
 * MediAlert - Profile & Security Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  await medialertReady;
  const session = readActiveSession();
  if (!session) {
    location.replace('index.html');
    return;
  }

  const accounts = readAccounts();
  const activeAccount = accounts.find(a => a.email.toLowerCase() === session.email.toLowerCase());
  const validRoles = [ROLES.DOCTOR, ROLES.PATIENT_GUARDIAN];
  if (!activeAccount || !validRoles.includes(session.role) || activeAccount.role !== session.role) {
    clearActiveSession();
    location.replace('index.html');
    return;
  }

  const isDoctor = session.role === ROLES.DOCTOR;
  const patientEmail = activeAccount.email.toLowerCase();
  let patientRecord = !isDoctor ? getPatientRecord(patientEmail) : null;

  function getConnectedDoctorNames() {
    if (isDoctor || typeof getConnectedDoctorsForPatient !== 'function') return [];
    return getConnectedDoctorsForPatient(patientEmail).map(doctor => doctor.name);
  }

  const profileForm = document.querySelector('#profile-form');
  const profileStatus = document.querySelector('#profile-status');
  const editBtn = document.querySelector('#edit-profile-btn');
  const saveBtn = document.querySelector('#save-profile-btn');
  const pinContainer = document.querySelector('#pin-section-container');

  const brandLink = document.querySelector('#profile-brand-link');
  if (brandLink) {
    brandLink.href = isDoctor ? 'doctor-dashboard.html' : 'dashboard.html';
  }

  function getInitials(name) {
    if (typeof computeUserInitials === 'function') return computeUserInitials(name);
    const clean = (name || '').trim().replace(/^dr\.?\s+/i, '');
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return '👤';
    if (parts.length === 1) return parts[0].length >= 2 ? parts[0].slice(0, 2).toUpperCase() : parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderProfileDetails() {
    const name = activeAccount.name || (patientRecord?.profile?.name) || 'User';
    const initials = getInitials(name);

    document.querySelector('#profile-name-display').textContent = name;
    document.querySelector('#profile-role-display').textContent = isDoctor ? 'Doctor / Clinical Care Account' : 'Patient / Guardian Account';
    document.querySelector('#profile-avatar').textContent = initials;
    document.querySelector('#header-avatar').textContent = initials;
    document.querySelector('#sidebar-avatar').textContent = initials;
    document.querySelector('#sidebar-name').textContent = name;
    document.querySelector('#sidebar-role-label').textContent = isDoctor ? 'Doctor' : 'Patient / Guardian';

    document.querySelector('#full-name').value = name;
    document.querySelector('#email-field').value = activeAccount.email;

    if (isDoctor) {
      document.querySelector('#doctor-account-id-group').style.display = 'block';
      document.querySelector('#doctor-account-id').value = activeAccount.doctorAccountId || '';
      document.querySelector('#doctor-storage-note').style.display = 'block';
      // Setup Doctor Sidebar Nav
      const sidebarNav = document.querySelector('#profile-sidebar-nav');
      if (sidebarNav) {
        sidebarNav.innerHTML = `
          <a class="nav-link" href="doctor-dashboard.html"><span aria-hidden="true">👥</span> Patient Records</a>
          <a class="nav-link" href="doctor-dashboard.html#tab-calendar"><span aria-hidden="true">📅</span> Follow-ups</a>
          <a class="nav-link" href="doctor-dashboard.html#tab-medicines"><span aria-hidden="true">💊</span> Prescribe Meds</a>
          <a class="nav-link" href="doctor-dashboard.html#tab-reports"><span aria-hidden="true">📄</span> Patient Reports</a>
          <a class="nav-link is-active" href="profile.html"><span aria-hidden="true">⚙️</span> Doctor Profile</a>
        `;
      }

      // Show Doctor Fields
      ['#doc-specialization-group', '#doc-qualification-group', '#doc-phone-group', '#doc-hospital-group', '#doc-id-group', '#doc-registration-group', '#doc-experience-group', '#doc-bio-group'].forEach(id => {
        const el = document.querySelector(id);
        if (el) el.style.display = 'block';
      });

      document.querySelector('#email-field').disabled = !isEditing;
      document.querySelector('#doc-specialization').value = activeAccount.specialization || '';
      document.querySelector('#doc-qualification').value = activeAccount.qualification || '';
      document.querySelector('#doc-phone').value = activeAccount.contact || activeAccount.phone || '';
      document.querySelector('#doc-hospital').value = activeAccount.hospitalClinic || '';
      document.querySelector('#doc-id').value = activeAccount.doctorId || '';
      document.querySelector('#doc-registration').value = activeAccount.medicalRegistrationNumber || '';
      document.querySelector('#doc-experience').value = activeAccount.yearsExperience || '';
      document.querySelector('#doc-bio').value = activeAccount.professionalBio || '';

      // Hide patient-specific clinical fields
      ['#age-group', '#gender-group', '#blood-group-field', '#emergency-contact-group', '#primary-doctor-group', '#address-group', '#conditions-group', '#allergies-group'].forEach(id => {
        const el = document.querySelector(id);
        if (el) el.style.display = 'none';
      });
      document.querySelector('#patient-id-group').style.display = 'none';
      if (pinContainer) pinContainer.style.display = 'none';
    } else {
      // Patient Fields
      document.querySelector('#patient-id-group').style.display = 'block';
      document.querySelector('#patient-account-id').value = activeAccount.patientId || '';
      document.querySelector('#doctor-account-id-group').style.display = 'none';
      document.querySelector('#doctor-storage-note').style.display = 'none';
      document.querySelector('#email-field').disabled = true;
      ['#doc-specialization-group', '#doc-qualification-group', '#doc-phone-group', '#doc-hospital-group', '#doc-id-group', '#doc-registration-group', '#doc-experience-group', '#doc-bio-group'].forEach(id => {
        const el = document.querySelector(id);
        if (el) el.style.display = 'none';
      });

      ['#age-group', '#gender-group', '#blood-group-field', '#emergency-contact-group', '#address-group', '#conditions-group', '#allergies-group'].forEach(id => {
        const el = document.querySelector(id);
        if (el) el.style.display = 'block';
      });
      document.querySelector('#primary-doctor-group').style.display = 'block';
      const primaryDoctorInput = document.querySelector('#primary-doctor');
      primaryDoctorInput.readOnly = true;
      primaryDoctorInput.placeholder = 'No doctor connected';
      primaryDoctorInput.value = getConnectedDoctorNames().join(', ');

      if (patientRecord?.profile) {
        document.querySelector('#age').value = patientRecord.profile.age || '';
        document.querySelector('#gender').value = patientRecord.profile.gender || '';
        document.querySelector('#blood-group').value = patientRecord.profile.bloodGroup || '';
        document.querySelector('#emergency-contact').value = patientRecord.profile.emergencyContact || '';
        document.querySelector('#address').value = patientRecord.profile.address || '';
        document.querySelector('#medical-conditions').value = patientRecord.profile.medicalConditions || '';
        document.querySelector('#allergies').value = patientRecord.profile.allergies || '';
      }

      renderPinStatus();
    }
  }

  function renderPinStatus() {
    const hasPin = activeAccount.pinEnabled && activeAccount.pinHash;
    const title = document.querySelector('#pin-status-title');
    const desc = document.querySelector('#pin-status-desc');
    const changeBtn = document.querySelector('#btn-change-pin');
    const disableBtn = document.querySelector('#btn-disable-pin');

    if (hasPin) {
      title.textContent = 'Quick PIN: Enabled';
      desc.textContent = 'Configured with secure PBKDF2 hashing.';
      changeBtn.textContent = 'Change Quick PIN';
      disableBtn.style.display = 'inline-flex';
    } else {
      title.textContent = 'Quick PIN: Disabled';
      desc.textContent = 'No PIN configured. Enable Quick PIN for faster sign in.';
      changeBtn.textContent = 'Enable Quick PIN';
      disableBtn.style.display = 'none';
    }
  }

  // Profile Form Edit Toggle
  let isEditing = false;
  editBtn?.addEventListener('click', () => {
    isEditing = !isEditing;
    profileStatus.textContent = '';
    const editableInputs = profileForm.querySelectorAll('input, textarea');
    editableInputs.forEach(input => {
      input.disabled = !isEditing || (!isDoctor && input.id === 'email-field');
    });
    saveBtn.disabled = !isEditing;
    editBtn.textContent = isEditing ? 'Cancel Edit' : 'Edit Profile';
    if (!isEditing) {
      renderProfileDetails();
      profileStatus.textContent = '';
    }
  });

  profileForm?.addEventListener('submit', e => {
    e.preventDefault();
    const updatedName = document.querySelector('#full-name').value.trim();
    const updatedEmail = document.querySelector('#email-field').value.trim();
    if (!updatedName) {
      profileStatus.style.color = 'var(--danger)';
      profileStatus.textContent = 'Full name is required.';
      return;
    }
    if (isDoctor && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(updatedEmail)) {
      profileStatus.style.color = 'var(--danger)';
      profileStatus.textContent = 'Please enter a valid email address.';
      return;
    }
    const medicalRegistrationNumber = isDoctor ? document.querySelector('#doc-registration').value.trim() : '';
    if (medicalRegistrationNumber && !/^[A-Za-z0-9][A-Za-z0-9./ -]{1,39}$/.test(medicalRegistrationNumber)) {
      profileStatus.style.color = 'var(--danger)';
      profileStatus.textContent = 'Enter a valid medical registration number using 2–40 letters, numbers, spaces, ".", "/", or "-".';
      return;
    }
    const yearsExperience = isDoctor ? document.querySelector('#doc-experience').value.trim() : '';
    if (yearsExperience && (!/^\d+$/.test(yearsExperience) || Number(yearsExperience) > 80)) {
      profileStatus.style.color = 'var(--danger)';
      profileStatus.textContent = 'Years of experience must be a whole number from 0 to 80.';
      return;
    }

    profileStatus.textContent = '';
    try {
      if (isDoctor) {
        const updatedSpecialization = document.querySelector('#doc-specialization').value.trim();
        const updatedQualification = document.querySelector('#doc-qualification').value.trim();
        const updatedPhone = document.querySelector('#doc-phone').value.trim();
        const updatedHospital = document.querySelector('#doc-hospital').value.trim();
        const doctorId = document.querySelector('#doc-id').value.trim();
        const professionalBio = document.querySelector('#doc-bio').value.trim();

        const saved = typeof updateDoctorProfile === 'function' && updateDoctorProfile({
          name: updatedName,
          email: updatedEmail,
          specialization: updatedSpecialization,
          qualification: updatedQualification,
          phone: updatedPhone,
          hospitalClinic: updatedHospital,
          doctorId,
          medicalRegistrationNumber,
          yearsExperience,
          professionalBio
        });
        if (!saved) {
          profileStatus.style.color = 'var(--danger)';
          profileStatus.textContent = 'Unable to save profile. The email may already belong to another account.';
          return;
        }
        const updatedAccount = readAccounts().find(account => account.email.toLowerCase() === updatedEmail.toLowerCase());
        if (!updatedAccount) throw new Error('Updated doctor account was not found.');
        Object.assign(activeAccount, updatedAccount);
      } else {
        activeAccount.name = updatedName;
        if (!patientRecord) patientRecord = { profile: {} };
        patientRecord.profile = {
          ...patientRecord.profile,
          name: updatedName,
          age: document.querySelector('#age').value.trim(),
          gender: document.querySelector('#gender').value.trim(),
          bloodGroup: document.querySelector('#blood-group').value.trim(),
          emergencyContact: document.querySelector('#emergency-contact').value.trim(),
          primaryDoctor: document.querySelector('#primary-doctor').value.trim(),
          address: document.querySelector('#address').value.trim(),
          medicalConditions: document.querySelector('#medical-conditions').value.trim(),
          allergies: document.querySelector('#allergies').value.trim()
        };
        savePatientRecord(patientEmail, patientRecord);

        const allAccounts = readAccounts();
        const idx = allAccounts.findIndex(a => a.email.toLowerCase() === activeAccount.email.toLowerCase());
        if (idx === -1) throw new Error('Patient account was not found.');
        allAccounts[idx] = {
          ...activeAccount,
          id: allAccounts[idx].id,
          patientId: allAccounts[idx].patientId,
          role: allAccounts[idx].role
        };
        saveAccounts(allAccounts);
        setActiveSession(activeAccount, true);

        if (typeof syncActiveUserProfileUI === 'function') syncActiveUserProfileUI();
        window.dispatchEvent(new CustomEvent('medialert:profile-updated', { detail: activeAccount }));
      }

      isEditing = false;
      const editableInputs = profileForm.querySelectorAll('input, textarea');
      editableInputs.forEach(input => input.disabled = true);
      saveBtn.disabled = true;
      editBtn.textContent = 'Edit Profile';

      renderProfileDetails();
      profileStatus.style.color = 'var(--success)';
      profileStatus.textContent = 'Profile updated successfully.';
    } catch (error) {
      profileStatus.style.color = 'var(--danger)';
      profileStatus.textContent = 'Unable to save profile. Please try again.';
    }
  });

  // QUICK PIN MANAGEMENT MODAL
  function openModal(id) {
    document.querySelector(`#${id}`)?.classList.add('is-open');
  }

  function closeModal(id) {
    document.querySelector(`#${id}`)?.classList.remove('is-open');
  }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  document.querySelector('#btn-change-pin')?.addEventListener('click', () => {
    document.querySelector('#form-pin-settings').reset();
    document.querySelector('#modal-pin-error').textContent = '';
    const hasPin = activeAccount.pinEnabled && activeAccount.pinHash;
    document.querySelector('#pin-modal-heading').textContent = hasPin ? 'Change Quick PIN' : 'Enable Quick PIN';
    openModal('modal-pin-settings');
  });

  document.querySelector('#btn-disable-pin')?.addEventListener('click', () => {
    if (confirm('Disable Quick PIN for this account? You will log in using your password.')) {
      disableAccountPin(activeAccount.email);
      const allAccounts = readAccounts();
      const ref = allAccounts.find(a => a.email.toLowerCase() === activeAccount.email.toLowerCase());
      if (ref) activeAccount.pinEnabled = ref.pinEnabled;
      renderPinStatus();
      const statusEl = document.querySelector('#pin-action-status');
      statusEl.style.color = 'var(--secondary)';
      statusEl.textContent = 'Quick PIN has been disabled.';
    }
  });

  // Restrict PIN digits in modal
  ['#modal-new-pin', '#modal-confirm-pin'].forEach(sel => {
    document.querySelector(sel)?.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
  });

  document.querySelector('#form-pin-settings')?.addEventListener('submit', async e => {
    e.preventDefault();
    const pin = document.querySelector('#modal-new-pin').value.trim();
    const pinConfirm = document.querySelector('#modal-confirm-pin').value.trim();
    const errorEl = document.querySelector('#modal-pin-error');
    errorEl.textContent = '';

    if (pin.length < 4 || pin.length > 6) {
      errorEl.textContent = 'Quick PIN must be 4 to 6 digits.';
      return;
    }

    if (pin !== pinConfirm) {
      errorEl.textContent = 'PINs do not match.';
      return;
    }

    const res = await setAccountPin(activeAccount.email, pin);
    if (!res.ok) {
      errorEl.textContent = res.message;
      return;
    }

    const allAccounts = readAccounts();
    const ref = allAccounts.find(a => a.email.toLowerCase() === activeAccount.email.toLowerCase());
    if (ref) {
      activeAccount.pinHash = ref.pinHash;
      activeAccount.pinEnabled = ref.pinEnabled;
    }

    closeModal('modal-pin-settings');
    renderPinStatus();
    const statusEl = document.querySelector('#pin-action-status');
    statusEl.style.color = 'var(--success)';
    statusEl.textContent = 'Quick PIN updated successfully.';
  });

  window.addEventListener('storage', event => {
    if (isDoctor || (event.key && event.key !== MEDIALERT_CONFIG.accountsKey)) return;
    patientRecord = getPatientRecord(patientEmail);
    document.querySelector('#primary-doctor').value = getConnectedDoctorNames().join(', ');
  });

  window.addEventListener('medialert:patients-updated', () => {
    if (isDoctor) return;
    patientRecord = getPatientRecord(patientEmail);
    document.querySelector('#primary-doctor').value = getConnectedDoctorNames().join(', ');
  });

  renderProfileDetails();
});
