/**
 * MediAlert - Add / Edit Appointment Form Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  await medialertReady;
  const session = readActiveSession();
  if (!session || session.role !== ROLES.PATIENT_GUARDIAN) {
    window.location.replace('index.html');
    return;
  }
  const currentEmail = session.email.toLowerCase();
  let patientRecord = getPatientRecord(currentEmail);
  if (!patientRecord) {
    initializeEmptyPatientData(currentEmail);
    patientRecord = getPatientRecord(currentEmail);
  }

  const appointmentForm = document.querySelector('#appointment-form');
  const formStatus = document.querySelector('#form-status');
  const fields = {
    doctorName: document.querySelector('#doctor-name'),
    specialization: document.querySelector('#specialization'),
    appointmentDate: document.querySelector('#appointment-date'),
    appointmentTime: document.querySelector('#appointment-time'),
    hospitalClinic: document.querySelector('#hospital-clinic'),
    purpose: document.querySelector('#purpose'),
    notes: document.querySelector('#notes')
  };

  function setError(field, message) {
    if (!field) return;
    const errorElement = document.querySelector(`#${field.id}-error`);
    field.closest('.field-group, .form-field')?.classList.toggle('has-error', Boolean(message));
    if (errorElement) errorElement.textContent = message || '';
  }

  function clearErrors() {
    Object.values(fields).forEach((field) => setError(field, ''));
    if (formStatus) formStatus.textContent = '';
  }

  function validateForm() {
    let isValid = true;
    const requiredFields = ['doctorName', 'specialization', 'hospitalClinic', 'appointmentDate', 'appointmentTime', 'purpose'];
    requiredFields.forEach((fieldName) => {
      const field = fields[fieldName];
      if (field && !field.value.trim()) {
        setError(field, 'This field is required.');
        isValid = false;
      }
    });
    return isValid;
  }

  function loadAppointmentForEditing() {
    patientRecord = getPatientRecord(currentEmail);
    if (!patientRecord) {
      initializeEmptyPatientData(currentEmail);
      patientRecord = getPatientRecord(currentEmail);
    }
    if (!patientRecord) {
      if (formStatus) {
        formStatus.style.color = 'var(--danger)';
        formStatus.textContent = 'Unable to load your patient record. Please refresh and try again.';
      }
      return;
    }
    const editingId = new URLSearchParams(window.location.search).get('edit');
    if (!editingId) return;

    const appointment = patientRecord?.appointments?.find((item) => item.id === editingId);
    if (!appointment) return;

    if (fields.doctorName) fields.doctorName.value = appointment.doctorName || '';
    if (fields.specialization) fields.specialization.value = appointment.specialization || '';
    if (fields.appointmentDate) fields.appointmentDate.value = appointment.appointmentDate || '';
    if (fields.appointmentTime) fields.appointmentTime.value = appointment.appointmentTime || '';
    if (fields.hospitalClinic) fields.hospitalClinic.value = appointment.hospitalClinic || appointment.location || '';
    if (fields.purpose) fields.purpose.value = appointment.purpose || appointment.notes || '';
    if (fields.notes) fields.notes.value = appointment.notes || '';

    const formTitle = document.querySelector('#form-title');
    if (formTitle) formTitle.textContent = 'Edit appointment';
    const saveBtn = document.querySelector('.form-button--save');
    if (saveBtn) saveBtn.textContent = 'Update appointment';
  }

  appointmentForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();

    if (!validateForm()) {
      if (formStatus) formStatus.textContent = 'Please complete the highlighted fields.';
      document.querySelector('.has-error input')?.focus();
      return;
    }

    patientRecord = getPatientRecord(currentEmail);
    if (!patientRecord) {
      initializeEmptyPatientData(currentEmail);
      patientRecord = getPatientRecord(currentEmail);
    }
    if (!patientRecord) {
      if (formStatus) {
        formStatus.style.color = 'var(--danger)';
        formStatus.textContent = 'Unable to load your patient record. Please refresh and try again.';
      }
      return;
    }
    if (!Array.isArray(patientRecord.appointments)) patientRecord.appointments = [];
    if (!Array.isArray(patientRecord.calendarEvents)) patientRecord.calendarEvents = [];

    const editingId = new URLSearchParams(window.location.search).get('edit');
    const appointmentData = {
      id: editingId || `apt_${Date.now()}`,
      doctorName: fields.doctorName.value.trim(),
      specialization: fields.specialization.value.trim(),
      appointmentDate: fields.appointmentDate.value,
      appointmentTime: fields.appointmentTime.value,
      hospitalClinic: fields.hospitalClinic.value.trim(),
      location: fields.hospitalClinic.value.trim(),
      purpose: fields.purpose.value.trim(),
      notes: fields.notes.value.trim(),
      status: patientRecord.appointments.find(appointment => appointment.id === editingId)?.status || 'Confirmed'
    };

    if (editingId) {
      const idx = patientRecord.appointments.findIndex(a => a.id === editingId);
      if (idx === -1) {
        if (formStatus) {
          formStatus.style.color = 'var(--danger)';
          formStatus.textContent = 'This appointment could not be found. Return to the appointment list and try again.';
        }
        return;
      }
      patientRecord.appointments[idx] = { ...patientRecord.appointments[idx], ...appointmentData };
      const calendarEvent = patientRecord.calendarEvents.find(eventItem => eventItem.id === `evt_${editingId}`);
      if (calendarEvent) {
        Object.assign(calendarEvent, {
          title: `Appointment with ${appointmentData.doctorName}`,
          date: appointmentData.appointmentDate,
          time: appointmentData.appointmentTime,
          location: appointmentData.hospitalClinic,
          doctor: appointmentData.doctorName,
          notes: appointmentData.notes
        });
      }
    } else {
      patientRecord.appointments.unshift(appointmentData);

      // Also add to Health Calendar
      patientRecord.calendarEvents.push({
        id: `evt_${appointmentData.id}`,
        type: 'doctor_appointment',
        title: `Appointment with ${appointmentData.doctorName}`,
        date: appointmentData.appointmentDate,
        time: appointmentData.appointmentTime,
        location: appointmentData.hospitalClinic,
        doctor: appointmentData.doctorName,
        notes: appointmentData.notes,
        createdByRole: 'patient_guardian',
        createdByName: session?.name || 'Patient / Guardian',
        createdAt: new Date().toISOString()
      });

      logPatientActivity(currentEmail, {
        icon: '🩺',
        title: 'Doctor Appointment Scheduled',
        detail: `Consultation with ${appointmentData.doctorName} on ${appointmentData.appointmentDate}`,
        actor: 'Patient / Guardian'
      });
    }

    if (!savePatientRecord(currentEmail, patientRecord)) {
      if (formStatus) {
        formStatus.style.color = 'var(--danger)';
        formStatus.textContent = 'Unable to save the appointment. Please try again.';
      }
      return;
    }

    if (formStatus) {
      formStatus.style.color = 'var(--success)';
      formStatus.textContent = 'Appointment saved. Returning...';
    }

    window.setTimeout(() => {
      window.location.href = 'appointments.html';
    }, 400);
  });

  document.querySelector('#cancel-button')?.addEventListener('click', () => {
    window.location.href = 'appointments.html';
  });

  loadAppointmentForEditing();
});
