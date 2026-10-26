/**
 * MediAlert - Add / Edit Medicine Form Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const session = readActiveSession();
  const currentEmail = session?.email?.toLowerCase() || 'guardian@medialert.com';
  let patientRecord = getPatientRecord(currentEmail);

  const medicineForm = document.querySelector('#medicine-form');
  const formStatus = document.querySelector('#form-status');
  const fields = {
    name: document.querySelector('#medicine-name'),
    form: document.querySelector('#medicine-type'),
    dosage: document.querySelector('#dosage'),
    frequency: document.querySelector('#frequency'),
    reminderTime: document.querySelector('#reminder-time'),
    startDate: document.querySelector('#start-date'),
    endDate: document.querySelector('#end-date'),
    notes: document.querySelector('#notes')
  };

  function setError(field, message) {
    if (!field) return;
    const errorElement = document.querySelector(`#${field.id}-error`);
    field.closest('.field-group')?.classList.toggle('has-error', Boolean(message));
    if (errorElement) errorElement.textContent = message || '';
  }

  function clearErrors() {
    Object.values(fields).forEach((field) => setError(field, ''));
    if (formStatus) formStatus.textContent = '';
  }

  function validateForm() {
    let isValid = true;
    const requiredFields = ['name', 'form', 'dosage', 'frequency', 'reminderTime', 'startDate', 'endDate'];
    requiredFields.forEach((fieldName) => {
      const field = fields[fieldName];
      if (field && !field.value.trim()) {
        setError(field, 'This field is required.');
        isValid = false;
      }
    });

    if (fields.startDate?.value && fields.endDate?.value && fields.endDate.value < fields.startDate.value) {
      setError(fields.endDate, 'End date must be on or after the start date.');
      isValid = false;
    }

    return isValid;
  }

  function loadMedicineForEditing() {
    patientRecord = getPatientRecord(currentEmail);
    const editingId = new URLSearchParams(window.location.search).get('edit');
    if (!editingId) return;

    const medicine = patientRecord?.medicines?.find((item) => item.id === editingId);
    if (!medicine) return;

    if (fields.name) fields.name.value = medicine.name || '';
    if (fields.form) fields.form.value = medicine.form || '';
    if (fields.dosage) fields.dosage.value = medicine.dosage || '';
    if (fields.frequency) fields.frequency.value = medicine.frequency || '';
    if (fields.reminderTime) fields.reminderTime.value = medicine.reminderTime || medicine.scheduledTimes?.[0] || '';
    if (fields.startDate) fields.startDate.value = medicine.startDate || '';
    if (fields.endDate) fields.endDate.value = medicine.endDate || '';
    if (fields.notes) fields.notes.value = medicine.notes || medicine.instructions || '';

    const formTitle = document.querySelector('#form-title');
    if (formTitle) formTitle.textContent = 'Edit medicine';
    const saveBtn = document.querySelector('.form-button--save');
    if (saveBtn) saveBtn.textContent = 'Update medicine';
  }

  medicineForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();

    if (!validateForm()) {
      if (formStatus) formStatus.textContent = 'Please complete the highlighted fields.';
      document.querySelector('.has-error input, .has-error select')?.focus();
      return;
    }

    patientRecord = getPatientRecord(currentEmail);
    if (!Array.isArray(patientRecord.medicines)) patientRecord.medicines = [];

    const editingId = new URLSearchParams(window.location.search).get('edit');
    const medicineData = {
      id: editingId || `med_${Date.now()}`,
      name: fields.name.value.trim(),
      form: fields.form.value,
      dosage: fields.dosage.value.trim(),
      frequency: fields.frequency.value,
      scheduledTimes: [fields.reminderTime.value],
      reminderTime: fields.reminderTime.value,
      startDate: fields.startDate.value,
      endDate: fields.endDate.value,
      instructions: fields.notes.value.trim(),
      notes: fields.notes.value.trim(),
      createdAt: new Date().toISOString()
    };

    if (editingId) {
      const idx = patientRecord.medicines.findIndex(m => m.id === editingId);
      if (idx !== -1) patientRecord.medicines[idx] = { ...patientRecord.medicines[idx], ...medicineData };
    } else {
      patientRecord.medicines.unshift(medicineData);
      logPatientActivity(currentEmail, {
        icon: '💊',
        title: 'Medicine Added',
        detail: `${medicineData.name} ${medicineData.dosage} added to regimen`,
        actor: 'Patient / Guardian'
      });
    }

    // Clear past triggered alert occurrences for this medicine so new schedule triggers immediately
    try {
      const raw = localStorage.getItem(getNotificationStateKey(currentEmail));
      if (raw) {
        const state = JSON.parse(raw);
        const filterKey = (k) => !k.startsWith(medicineData.id);
        state.warned5Min = (state.warned5Min || []).filter(filterKey);
        state.alertedDue = (state.alertedDue || []).filter(filterKey);
        state.dismissed = (state.dismissed || []).filter(filterKey);
        localStorage.setItem(getNotificationStateKey(currentEmail), JSON.stringify(state));
      }
    } catch (e) {}

    // Reset today's doseLog for this medicine so the new time is eligible for reminder
    if (Array.isArray(patientRecord.doseLogs)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      patientRecord.doseLogs = patientRecord.doseLogs.filter(l => !(l.medicineId === medicineData.id && l.scheduledDate === todayStr));
    }

    savePatientRecord(currentEmail, patientRecord);
    window.dispatchEvent(new CustomEvent('medialert:medicines-updated'));

    if (formStatus) {
      formStatus.style.color = 'var(--success)';
      formStatus.textContent = 'Medicine saved. Returning...';
    }

    window.setTimeout(() => {
      window.location.href = 'medicines.html';
    }, 400);
  });

  document.querySelector('#cancel-button')?.addEventListener('click', () => {
    window.location.href = 'medicines.html';
  });

  document.querySelector('#mobile-menu')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('is-open');
  });

  loadMedicineForEditing();
});
