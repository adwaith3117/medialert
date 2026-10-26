/**
 * MediAlert - Appointment Directory Controller
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

  const appointmentList = document.querySelector('#appointment-list');
  const appointmentSearch = document.querySelector('#appointment-search');
  const appointmentCount = document.querySelector('#appointment-count');
  const listStatus = document.querySelector('#list-status');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[character]));
  }

  function formatDate(value) {
    if (!value) return 'Date not set';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(value) {
    if (!value) return 'Time not set';
    const [hours, minutes] = String(value).split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function daysRemaining(value) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${value}T00:00:00`);
    return Math.max(0, Math.ceil((date - today) / 86400000));
  }

  function emptyState(isSearchResult) {
    return `
      <div class="directory-empty">
        <span class="directory-empty__mark" aria-hidden="true">🩺</span>
        <h2>${isSearchResult ? 'No matching appointments' : 'No appointments scheduled'}</h2>
        <p>${isSearchResult ? 'Try another doctor or specialization.' : 'Schedule your next consultation to see it here.'}</p>
        ${isSearchResult ? '' : '<a href="add-appointment.html">Add an appointment</a>'}
      </div>
    `;
  }

  function renderAppointments(query = '') {
    patientRecord = getPatientRecord(currentEmail);
    const appointments = patientRecord?.appointments || [];
    const normalizedQuery = query.trim().toLowerCase();
    const visibleAppointments = appointments.filter((appointment) =>
      `${appointment.doctorName || ''} ${appointment.specialization || ''}`.toLowerCase().includes(normalizedQuery)
    );

    if (appointmentCount) {
      appointmentCount.textContent = `${visibleAppointments.length} ${visibleAppointments.length === 1 ? 'appointment' : 'appointments'} shown`;
    }

    if (!visibleAppointments.length) {
      appointmentList.innerHTML = emptyState(Boolean(normalizedQuery));
      return;
    }

    appointmentList.innerHTML = visibleAppointments
      .sort((a, b) => `${a.appointmentDate}${a.appointmentTime}`.localeCompare(`${b.appointmentDate}${b.appointmentTime}`))
      .map((appointment) => {
        const days = daysRemaining(appointment.appointmentDate);
        return `
          <article class="appointment-card">
            <div class="appointment-card__top">
              <span class="appointment-card__icon" aria-hidden="true">🩺</span>
              <div class="appointment-card__title">
                <h2 title="${escapeHtml(appointment.doctorName)}">${escapeHtml(appointment.doctorName || 'Doctor not set')}</h2>
                <p>${escapeHtml(appointment.specialization || 'Specialization not set')}</p>
              </div>
            </div>
            <div class="appointment-card__details">
              <div class="appointment-detail"><span>Next visit</span><strong>${escapeHtml(formatDate(appointment.appointmentDate))}</strong></div>
              <div class="appointment-detail"><span>Days remaining</span><strong>${days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}</strong></div>
              <div class="appointment-detail"><span>Time</span><strong>${escapeHtml(formatTime(appointment.appointmentTime))}</strong></div>
              <div class="appointment-detail"><span>Purpose</span><strong>${escapeHtml(appointment.purpose || appointment.notes || 'Follow-up Consultation')}</strong></div>
            </div>
            <p class="appointment-card__clinic">${escapeHtml(appointment.location || appointment.hospitalClinic || 'Hospital / clinic not set')}</p>
            <div class="appointment-card__actions">
              <a class="appointment-action appointment-action--edit" href="add-appointment.html?edit=${encodeURIComponent(appointment.id)}">Edit</a>
              <button class="appointment-action medicine-action--delete" type="button" data-delete-id="${escapeHtml(appointment.id)}">Delete</button>
            </div>
          </article>
        `;
      }).join('');
  }

  function deleteAppointment(id) {
    patientRecord = getPatientRecord(currentEmail);
    const appointments = patientRecord?.appointments || [];
    const appointment = appointments.find((item) => item.id === id);
    if (!appointment || !window.confirm(`Delete the appointment with ${appointment.doctorName}?`)) return;

    patientRecord.appointments = appointments.filter((item) => item.id !== id);
    if (Array.isArray(patientRecord.calendarEvents)) {
      patientRecord.calendarEvents = patientRecord.calendarEvents.filter(e => e.id !== id && e.title !== `Consultation with ${appointment.doctorName}`);
    }

    if (!savePatientRecord(currentEmail, patientRecord)) {
      if (listStatus) listStatus.textContent = 'Unable to delete this appointment. Please try again.';
      return;
    }

    logPatientActivity(currentEmail, {
      icon: '🩺',
      title: 'Appointment Cancelled',
      detail: `Visit with ${appointment.doctorName} was removed`,
      actor: 'Patient / Guardian'
    });

    if (listStatus) listStatus.textContent = `Appointment with ${appointment.doctorName} was deleted.`;
    renderAppointments(appointmentSearch?.value || '');
  }

  appointmentSearch?.addEventListener('input', (event) => renderAppointments(event.target.value));
  appointmentList?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-id]');
    if (deleteButton) deleteAppointment(deleteButton.dataset.deleteId);
  });

  document.querySelector('#mobile-menu')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('is-open');
  });

  renderAppointments();
});
