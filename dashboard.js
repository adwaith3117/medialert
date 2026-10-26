/**
 * MediAlert - Patient & Guardian Dashboard Controller
 * Connects to the single source of truth patient record
 */

document.addEventListener('DOMContentLoaded', async () => {
  await medialertReady;
  const session = readActiveSession();
  if (!session) return;

  const currentPatientEmail = session.email.toLowerCase();
  let patientRecord = getPatientRecord(currentPatientEmail);

  if (!patientRecord) {
    initializeEmptyPatientData(currentPatientEmail);
    patientRecord = getPatientRecord(currentPatientEmail);
  }

  // Calendar State
  let calCurrentDate = new Date();
  let calSelectedDate = null;

  // ==========================================
  // ESCAPE & FORMATTING UTILITIES
  // ==========================================

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function formatDate(dateVal, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
    if (!dateVal) return 'Not set';
    const date = String(dateVal).includes('T') ? new Date(dateVal) : new Date(`${dateVal}T00:00:00`);
    if (isNaN(date.getTime())) return escapeHtml(dateVal);
    return date.toLocaleDateString(undefined, options);
  }

  function formatTime(timeVal) {
    if (!timeVal) return '';
    const [h, m] = String(timeVal).split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return escapeHtml(timeVal);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatProperCase(str) {
    if (!str) return '';
    return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  function getInitials(name) {
    if (typeof computeUserInitials === 'function') return computeUserInitials(name);
    const clean = (name || '').trim().replace(/^dr\.?\s+/i, '');
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return '👤';
    if (parts.length === 1) return parts[0].length >= 2 ? parts[0].slice(0, 2).toUpperCase() : parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getEventIcon(type) {
    const map = {
      doctor_appointment: '🩺',
      blood_test: '🧪',
      vaccination: '💉',
      health_checkup: '❤️',
      medicine_prescription: '💊',
      follow_up: '📋',
      medical_report: '📄',
      reminder: '🔔'
    };
    return map[type] || '🩺';
  }

  function getEventTypeName(type) {
    const map = {
      doctor_appointment: 'Doctor Appointment',
      blood_test: 'Blood Test / Lab Test',
      vaccination: 'Vaccination',
      health_checkup: 'Health Checkup',
      medicine_prescription: 'Medicine / Prescription',
      follow_up: 'Follow-up',
      medical_report: 'Medical Report',
      reminder: 'Reminder'
    };
    return map[type] || 'Health Event';
  }

  // ==========================================
  // RENDER SECTIONS
  // ==========================================

  function renderProfile() {
    const rawName = patientRecord?.profile?.name || session.name || 'Patient';
    const name = formatProperCase(rawName);
    const initials = getInitials(name);
    const firstName = name.split(' ')[0] || 'Patient';

    const welcomeTitle = document.querySelector('#welcome-title');
    if (welcomeTitle) {
      welcomeTitle.innerHTML = `Good morning, ${escapeHtml(firstName)}<span>.</span>`;
    }

    const sbName = document.querySelector('#sidebar-name');
    if (sbName) sbName.textContent = name;

    const sbAvatar = document.querySelector('#sidebar-avatar');
    if (sbAvatar) sbAvatar.textContent = initials;

    const hdAvatar = document.querySelector('#header-avatar');
    if (hdAvatar) hdAvatar.textContent = initials;

    const doctorStatus = document.querySelector('#primary-doctor-status');
    const doctorLabel = document.querySelector('#primary-doctor-label');
    const connectedDoctors = typeof getConnectedDoctorsForPatient === 'function'
      ? getConnectedDoctorsForPatient(currentPatientEmail)
      : [];
    if (doctorStatus) {
      doctorStatus.textContent = connectedDoctors.length
        ? connectedDoctors.map(doctor => doctor.name).join(', ')
        : 'No doctor connected';
    }
    if (doctorLabel) {
      if (!connectedDoctors.length) {
        doctorLabel.textContent = 'A doctor can connect using your registered email.';
      } else {
        doctorLabel.innerHTML = connectedDoctors.map(doctor => `
          <span class="connected-doctor-card" style="display:block;margin-top:6px;">
            <small>${escapeHtml(doctor.specialization)} · ${escapeHtml(doctor.qualification)}</small>
            <small>${escapeHtml(doctor.hospitalClinic)} · ${escapeHtml(doctor.department)}</small>
            <small>${escapeHtml(doctor.phone)} · ${escapeHtml(doctor.email)}</small>
            <small>Doctor ID: ${escapeHtml(doctor.doctorId)} · Registration: ${escapeHtml(doctor.medicalRegistrationNumber)} · Experience: ${escapeHtml(doctor.yearsExperience)} years</small>
            ${doctor.professionalBio ? `<small>${escapeHtml(doctor.professionalBio)}</small>` : ''}
          </span>
        `).join('');
      }
    }
  }

  function renderVitals() {
    const vitalsGrid = document.querySelector('#vitals-grid');
    const vitals = patientRecord?.vitals || [];

    const defaultDefs = [
      { key: 'Blood Pressure', label: 'Blood Pressure', unit: 'mmHg' },
      { key: 'Blood Sugar', label: 'Blood Sugar', unit: 'mg/dL' },
      { key: 'Heart Rate', label: 'Heart Rate', unit: 'BPM' },
      { key: 'Body Weight', label: 'Body Weight', unit: 'kg' },
      { key: 'Temperature', label: 'Temperature', unit: '°C' },
      { key: 'Oxygen Level', label: 'Oxygen Level', unit: '%' }
    ];

    vitalsGrid.innerHTML = defaultDefs.map(def => {
      const match = vitals.find(v => v.type === def.key);
      const val = match ? `${match.primaryValue}${match.secondaryValue ? `/${match.secondaryValue}` : ''}` : '--';
      const tag = match?.statusTag ? ` · ${escapeHtml(match.statusTag)}` : '';
      return `
        <article class="metric">
          <span class="metric__label"><span class="metric__dot" aria-hidden="true"></span>${escapeHtml(def.label)}</span>
          <strong class="metric__value">${escapeHtml(val)}</strong>
          <span class="metric__unit">${escapeHtml(def.unit)}${tag}</span>
        </article>
      `;
    }).join('');
  }

  // ==========================================
  // HEALTH CALENDAR CONTROLLER
  // ==========================================

  function renderCalendar() {
    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    const monthName = calCurrentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    document.querySelector('#calendar-month-year').textContent = monthName;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const events = patientRecord?.calendarEvents || [];

    const grid = document.querySelector('#calendar-days-grid');
    grid.innerHTML = '';

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      grid.innerHTML += `<div class="cal-day cal-day--other"><span class="cal-day__num">${dayNum}</span></div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dayDateStr === todayStr;
      const isSelected = dayDateStr === calSelectedDate;
      const dayEvents = events.filter(e => e.date === dayDateStr);

      const dotsHtml = dayEvents.slice(0, 4).map(e => `<span class="cal-dot cal-dot--${e.type}" title="${escapeHtml(e.title)}"></span>`).join('');

      const dayEl = document.createElement('div');
      dayEl.className = `cal-day ${isToday ? 'cal-day--today' : ''} ${isSelected ? 'cal-day--selected' : ''}`;
      dayEl.dataset.date = dayDateStr;
      dayEl.innerHTML = `
        <span class="cal-day__num">${day}</span>
        <div class="cal-day__dots">${dotsHtml}</div>
      `;

      dayEl.addEventListener('click', () => {
        calSelectedDate = (calSelectedDate === dayDateStr) ? null : dayDateStr;
        renderCalendar();
        renderUpcomingEvents();
      });

      grid.appendChild(dayEl);
    }

    renderUpcomingEvents();
  }

  function renderUpcomingEvents() {
    const list = document.querySelector('#upcoming-events-list');
    const heading = document.querySelector('#events-panel-heading');
    const filterHint = document.querySelector('#events-filter-hint');
    const events = patientRecord?.calendarEvents || [];

    let displayEvents = [...events];

    if (calSelectedDate) {
      heading.textContent = `Events on ${formatDate(calSelectedDate, { month: 'short', day: 'numeric' })}`;
      filterHint.innerHTML = `<a href="#" id="clear-cal-filter" style="color:var(--primary-purple);font-weight:700;">Show all</a>`;
      displayEvents = displayEvents.filter(e => e.date === calSelectedDate);
      document.querySelector('#clear-cal-filter')?.addEventListener('click', (e) => {
        e.preventDefault();
        calSelectedDate = null;
        renderCalendar();
      });
    } else {
      heading.textContent = 'Upcoming Health Events';
      filterHint.textContent = 'All upcoming';
      displayEvents.sort((a, b) => a.date.localeCompare(b.date));
    }

    if (!displayEvents.length) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__mark">📅</span>
          <strong>No events ${calSelectedDate ? 'on this date' : 'scheduled'}</strong>
          <small>Click "+ Add Health Event" to record doctor visits or lab dates.</small>
        </div>
      `;
      return;
    }

    list.innerHTML = displayEvents.map(evt => {
      const icon = getEventIcon(evt.type);
      const typeName = getEventTypeName(evt.type);
      const timeStr = evt.time ? ` · ${formatTime(evt.time)}` : '';
      const doctorOrLoc = evt.location || evt.doctor || '';

      return `
        <article class="event-card" data-event-id="${escapeHtml(evt.id)}">
          <span class="event-card__icon" aria-hidden="true">${icon}</span>
          <div class="event-card__body">
            <strong>${escapeHtml(evt.title)}</strong>
            <div class="event-card__meta">
              <span>📅 ${formatDate(evt.date, { month: 'short', day: 'numeric' })}${timeStr}</span>
              ${doctorOrLoc ? `<span>📍 ${escapeHtml(doctorOrLoc)}</span>` : ''}
              <span>🏷️ ${escapeHtml(typeName)}</span>
            </div>
            ${evt.notes ? `<small style="display:block;margin-top:4px;color:var(--muted);font-size:10px;">${escapeHtml(evt.notes)}</small>` : ''}
          </div>
          <div class="event-card__actions">
            <button class="event-mini-btn" type="button" data-action="edit-event" data-id="${escapeHtml(evt.id)}" title="Edit event">✏️</button>
            <button class="event-mini-btn event-mini-btn--del" type="button" data-action="delete-event" data-id="${escapeHtml(evt.id)}" title="Delete event">&times;</button>
          </div>
        </article>
      `;
    }).join('');
  }

  // ==========================================
  // TODAY'S MEDICINES & DOSE ACTIONS
  // ==========================================

  function renderTodayMedicines() {
    const list = document.querySelector('#today-medicines-list');
    const medicines = patientRecord?.medicines || [];
    const doseLogs = patientRecord?.doseLogs || [];
    const todayStr = new Date().toISOString().slice(0, 10);

    if (!medicines.length) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__mark">💊</span>
          <strong>No medicines added yet</strong>
          <small>Add your medication and schedule to track adherence.</small>
          <a class="text-link" href="add-medicine.html">Add Medicine &rarr;</a>
        </div>
      `;
      return;
    }

    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    list.innerHTML = medicines.map(med => {
      const time = med.scheduledTimes?.[0] || med.reminderTime || '08:00';
      const log = doseLogs.find(l => l.medicineId === med.id && l.scheduledDate === todayStr);
      let status = log?.status;

      if (!status) {
        const [h, m] = String(time).split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const medTotalMinutes = h * 60 + m;
          if (currentTotalMinutes >= medTotalMinutes + 5) {
            status = 'Missed';
          } else {
            status = 'Pending';
          }
        } else {
          status = 'Pending';
        }
      }

      const statusClass = status.toLowerCase();
      const statusLabel = status === 'Missed' ? '⚠️ Missed' : (status === 'Taken' ? '✓ Taken' : 'Pending');

      return `
        <article class="data-item">
          <span class="data-item__icon" aria-hidden="true">💊</span>
          <div class="data-item__body">
            <strong>${escapeHtml(med.name)} ${escapeHtml(med.dosage || '')}</strong>
            <small>${escapeHtml(med.instructions || 'As prescribed')} · ${formatTime(time)}</small>
          </div>
          <span class="status status--${statusClass}">${escapeHtml(statusLabel)}</span>
          <div style="display:flex;gap:4px;margin-left:auto;">
            ${status !== 'Taken' ? `
              <button class="dose-action-btn dose-action-btn--take" type="button" data-action="take-dose" data-id="${escapeHtml(med.id)}" data-name="${escapeHtml(med.name)}">
                ${status === 'Missed' ? 'Mark Taken' : 'Mark Taken'}
              </button>
            ` : ''}
            ${status === 'Pending' ? `
              <button class="dose-action-btn dose-action-btn--miss" type="button" data-action="miss-dose" data-id="${escapeHtml(med.id)}" data-name="${escapeHtml(med.name)}">
                Missed
              </button>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  // ==========================================
  // UPCOMING DOCTOR VISITS
  // ==========================================

  function renderNextAppointment() {
    const container = document.querySelector('#next-appointment-card');
    const appointments = patientRecord?.appointments || [];
    const upcoming = appointments.filter(a => a.status !== 'Cancelled').sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))[0];

    if (!upcoming) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__mark">🩺</span>
          <strong>No appointments scheduled</strong>
          <small>Schedule your next consultation with your healthcare provider.</small>
          <a class="text-link" href="add-appointment.html">Schedule an appointment &rarr;</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="padding:14px;border:1px solid var(--line);border-radius:14px;background:#faf9ff;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:40px;height:40px;border-radius:12px;background:var(--soft-lavender);color:var(--primary-purple);display:grid;place-items:center;font-size:18px;">🩺</div>
          <div>
            <strong style="display:block;font-size:14px;color:var(--ink);">${escapeHtml(upcoming.doctorName || 'Doctor Visit')}</strong>
            <small style="color:var(--secondary);font-size:11px;">${escapeHtml(upcoming.specialization || 'Consultation')}</small>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;padding:8px 0;border-top:1px solid #ede8fa;">
          <div><span style="color:var(--muted)">Date:</span> <strong>${formatDate(upcoming.appointmentDate)}</strong></div>
          <div><span style="color:var(--muted)">Time:</span> <strong>${formatTime(upcoming.appointmentTime)}</strong></div>
        </div>
        ${upcoming.location ? `<div style="font-size:11px;color:var(--secondary);margin-top:4px;">📍 ${escapeHtml(upcoming.location)}</div>` : ''}
      </div>
    `;
  }

  // ==========================================
  // MEDICAL REPORTS (PDF) CONTROLLER
  // ==========================================

  function renderMedicalReports() {
    const list = document.querySelector('#reports-list');
    const reports = patientRecord?.medicalReports || [];

    if (!reports.length) {
      list.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <span class="empty-state__mark">📄</span>
          <strong>No reports uploaded yet</strong>
          <small>Upload your blood tests, CBC, X-rays, and prescription scans in PDF format.</small>
        </div>
      `;
      return;
    }

    list.innerHTML = reports.map(rep => {
      return `
        <article class="report-card" data-report-id="${escapeHtml(rep.id)}">
          <div class="report-card__header">
            <span class="report-card__icon" aria-hidden="true">📄</span>
            <div class="report-card__title">
              <strong>${escapeHtml(rep.name)}</strong>
              <span>${escapeHtml(rep.type || 'Medical Report')}</span>
            </div>
          </div>
          <div class="report-card__meta">
            <span>📅 <strong>Date:</strong> ${formatDate(rep.date)}</span>
            ${rep.hospital ? `<span>🏥 <strong>Facility:</strong> ${escapeHtml(rep.hospital)}</span>` : ''}
            <span>📁 <strong>File:</strong> ${escapeHtml(rep.fileName || 'Report.pdf')} (${escapeHtml(rep.fileSize || 'PDF')})</span>
            ${rep.notes ? `<span style="margin-top:2px;font-style:italic;">"${escapeHtml(rep.notes)}"</span>` : ''}
          </div>
          <div class="report-card__actions">
            <button class="rep-btn rep-btn--primary" type="button" data-action="view-pdf" data-id="${escapeHtml(rep.id)}">
              View PDF
            </button>
            <button class="rep-btn" type="button" data-action="download-pdf" data-id="${escapeHtml(rep.id)}">
              Download
            </button>
            <button class="rep-btn" type="button" data-action="rename-pdf" data-id="${escapeHtml(rep.id)}">
              Rename
            </button>
            <button class="rep-btn rep-btn--danger" type="button" data-action="delete-pdf" data-id="${escapeHtml(rep.id)}">
              Delete
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  // ==========================================
  // RECENT ACTIVITY STREAM
  // ==========================================

  function renderRecentActivity() {
    const list = document.querySelector('#activity-list');
    const activities = patientRecord?.recentActivities || [];

    if (!activities.length) {
      list.innerHTML = `<p style="color:var(--secondary);font-size:12px;text-align:center;padding:12px;">No activity logged yet.</p>`;
      return;
    }

    list.innerHTML = activities.slice(0, 6).map(act => {
      const relTime = formatDate(act.timestamp, { month: 'short', day: 'numeric' });
      return `
        <article class="activity-item">
          <span class="activity-item__icon" aria-hidden="true">${act.icon || '🩺'}</span>
          <div class="activity-item__body">
            <strong>${escapeHtml(act.title)}</strong>
            <small>${escapeHtml(act.detail)}</small>
            <small style="color:var(--primary-purple);font-weight:600;">By: ${escapeHtml(act.actor || 'Patient / Guardian')}</small>
          </div>
          <time class="activity-item__time">${relTime}</time>
        </article>
      `;
    }).join('');
  }

  function renderCareHubBadges() {
    const medCount = patientRecord?.medicines?.length || 0;
    const apts = patientRecord?.appointments || [];
    const nextApt = apts.filter(a => a.status !== 'Cancelled').sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate))[0];
    const tests = patientRecord?.medicalTests || [];
    const pendingTests = tests.filter(t => !t.isCompleted && t.status !== 'Completed').length;
    const rxCount = patientRecord?.prescriptions?.length || 0;
    const vitalsCount = patientRecord?.vitals?.length || 0;

    const medsBadge = document.querySelector('#hub-meds-badge');
    if (medsBadge) medsBadge.textContent = medCount ? `${medCount} Active` : 'None yet';

    const aptsBadge = document.querySelector('#hub-apts-badge');
    if (aptsBadge) aptsBadge.textContent = nextApt ? `Next: ${formatDate(nextApt.appointmentDate, { month: 'short', day: 'numeric' })}` : 'Schedule';

    const testsBadge = document.querySelector('#hub-tests-badge');
    if (testsBadge) testsBadge.textContent = pendingTests ? `${pendingTests} Pending` : 'None yet';

    const rxBadge = document.querySelector('#hub-rx-badge');
    if (rxBadge) rxBadge.textContent = rxCount ? `${rxCount} Script${rxCount === 1 ? '' : 's'}` : 'None yet';

    const recordsBadge = document.querySelector('#hub-records-badge');
    if (recordsBadge) recordsBadge.textContent = vitalsCount ? `${vitalsCount} Logged` : 'None yet';
  }

  // ==========================================
  // FULL REFRESH FUNCTION
  // ==========================================

  function refreshAll() {
    patientRecord = getPatientRecord(currentPatientEmail);
    renderProfile();
    renderCareHubBadges();
    renderVitals();
    renderCalendar();
    renderTodayMedicines();
    renderNextAppointment();
    renderMedicalReports();
    renderRecentActivity();
  }

  // ==========================================
  // MODAL CONTROLLERS & INTERACTION HANDLERS
  // ==========================================

  function openModal(id) {
    document.querySelector(`#${id}`)?.classList.add('is-open');
  }

  function closeModal(id) {
    document.querySelector(`#${id}`)?.classList.remove('is-open');
  }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.closeModal;
      closeModal(modalId);
    });
  });

  // Modal Backdrop Click to Close
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        backdrop.classList.remove('is-open');
      }
    });
  });

  // Calendar Navigation
  document.querySelector('#cal-prev-month')?.addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
    renderCalendar();
  });

  document.querySelector('#cal-next-month')?.addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
    renderCalendar();
  });

  document.querySelector('#cal-today-btn')?.addEventListener('click', () => {
    calCurrentDate = new Date();
    calSelectedDate = new Date().toISOString().slice(0, 10);
    renderCalendar();
  });

  // 1. ADD / EDIT HEALTH EVENT
  document.querySelector('#btn-open-add-event')?.addEventListener('click', () => {
    document.querySelector('#form-add-event').reset();
    document.querySelector('#event-edit-id').value = '';
    document.querySelector('#event-modal-title').textContent = '+ Add Health Event';
    document.querySelector('#event-date').value = calSelectedDate || new Date().toISOString().slice(0, 10);
    openModal('modal-add-event');
  });

  document.querySelector('#form-add-event')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.querySelector('#event-edit-id').value;
    const type = document.querySelector('#event-type').value;
    const title = document.querySelector('#event-title').value.trim();
    const date = document.querySelector('#event-date').value;
    const time = document.querySelector('#event-time').value;
    const location = document.querySelector('#event-location').value.trim();
    const notes = document.querySelector('#event-notes').value.trim();

    if (!title || !date) return;

    if (!Array.isArray(patientRecord.calendarEvents)) patientRecord.calendarEvents = [];

    if (editId) {
      const idx = patientRecord.calendarEvents.findIndex(ev => ev.id === editId);
      if (idx !== -1) {
        patientRecord.calendarEvents[idx] = {
          ...patientRecord.calendarEvents[idx],
          type,
          title,
          date,
          time,
          location,
          notes
        };
      }
    } else {
      const newEvent = {
        id: `evt_${Date.now()}`,
        type,
        title,
        date,
        time,
        location,
        doctor: location,
        notes,
        createdByRole: 'patient_guardian',
        createdByName: session.name || 'Patient / Guardian',
        createdAt: new Date().toISOString()
      };
      patientRecord.calendarEvents.push(newEvent);

      // Log activity
      logPatientActivity(currentPatientEmail, {
        icon: getEventIcon(type),
        title: `${getEventTypeName(type)} added`,
        detail: `${title} on ${date}`,
        actor: 'Patient / Guardian'
      });
    }

    savePatientRecord(currentPatientEmail, patientRecord);
    closeModal('modal-add-event');
    refreshAll();
  });

  // Event List Edit / Delete Delegate
  document.querySelector('#upcoming-events-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-action="edit-event"]');
    const delBtn = e.target.closest('[data-action="delete-event"]');

    if (editBtn) {
      const eventId = editBtn.dataset.id;
      const ev = patientRecord.calendarEvents.find(item => item.id === eventId);
      if (!ev) return;
      document.querySelector('#event-edit-id').value = ev.id;
      document.querySelector('#event-modal-title').textContent = 'Edit Health Event';
      document.querySelector('#event-type').value = ev.type || 'doctor_appointment';
      document.querySelector('#event-title').value = ev.title || '';
      document.querySelector('#event-date').value = ev.date || '';
      document.querySelector('#event-time').value = ev.time || '';
      document.querySelector('#event-location').value = ev.location || ev.doctor || '';
      document.querySelector('#event-notes').value = ev.notes || '';
      openModal('modal-add-event');
    }

    if (delBtn) {
      const eventId = delBtn.dataset.id;
      if (confirm('Are you sure you want to remove this health event?')) {
        patientRecord.calendarEvents = patientRecord.calendarEvents.filter(item => item.id !== eventId);
        savePatientRecord(currentPatientEmail, patientRecord);
        refreshAll();
      }
    }
  });

  // 2. MEDICINE DOSE ACTIONS (TAKEN / MISSED)
  document.querySelector('#today-medicines-list')?.addEventListener('click', (e) => {
    const takeBtn = e.target.closest('[data-action="take-dose"]');
    const missBtn = e.target.closest('[data-action="miss-dose"]');

    if (takeBtn) {
      const medId = takeBtn.dataset.id;
      const medName = takeBtn.dataset.name;
      const todayStr = new Date().toISOString().slice(0, 10);

      if (!Array.isArray(patientRecord.doseLogs)) patientRecord.doseLogs = [];
      const existingIdx = patientRecord.doseLogs.findIndex(l => l.medicineId === medId && l.scheduledDate === todayStr);

      if (existingIdx !== -1) {
        patientRecord.doseLogs[existingIdx].status = 'Taken';
        patientRecord.doseLogs[existingIdx].actionTimestamp = new Date().toISOString();
      } else {
        patientRecord.doseLogs.push({
          id: `dose_${Date.now()}`,
          medicineId: medId,
          medicineName: medName,
          scheduledDate: todayStr,
          status: 'Taken',
          actionTimestamp: new Date().toISOString(),
          actionBy: 'Patient / Guardian'
        });
      }

      logPatientActivity(currentPatientEmail, {
        icon: '💊',
        title: 'Medicine marked as Taken',
        detail: `${medName} confirmed taken for today`,
        actor: 'Patient / Guardian'
      });

      savePatientRecord(currentPatientEmail, patientRecord);
      refreshAll();
    }

    if (missBtn) {
      const medId = missBtn.dataset.id;
      const medName = missBtn.dataset.name;
      const todayStr = new Date().toISOString().slice(0, 10);

      if (!Array.isArray(patientRecord.doseLogs)) patientRecord.doseLogs = [];
      const existingIdx = patientRecord.doseLogs.findIndex(l => l.medicineId === medId && l.scheduledDate === todayStr);

      if (existingIdx !== -1) {
        patientRecord.doseLogs[existingIdx].status = 'Missed';
        patientRecord.doseLogs[existingIdx].actionTimestamp = new Date().toISOString();
      } else {
        patientRecord.doseLogs.push({
          id: `dose_${Date.now()}`,
          medicineId: medId,
          medicineName: medName,
          scheduledDate: todayStr,
          status: 'Missed',
          actionTimestamp: new Date().toISOString(),
          actionBy: 'Patient / Guardian'
        });
      }

      logPatientActivity(currentPatientEmail, {
        icon: '⚠️',
        title: 'Medicine marked as Missed',
        detail: `${medName} recorded as missed for today`,
        actor: 'Patient / Guardian'
      });

      savePatientRecord(currentPatientEmail, patientRecord);
      refreshAll();
    }
  });

  // 3. UPLOAD REPORT (PDF)
  document.querySelector('#btn-open-upload-report')?.addEventListener('click', () => {
    document.querySelector('#form-upload-report').reset();
    document.querySelector('#report-upload-error').textContent = '';
    document.querySelector('#report-date').value = new Date().toISOString().slice(0, 10);
    openModal('modal-upload-report');
  });

  document.querySelector('#form-upload-report')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = document.querySelector('#report-upload-error');
    errorEl.textContent = '';

    const name = document.querySelector('#report-name').value.trim();
    const type = document.querySelector('#report-type').value;
    const date = document.querySelector('#report-date').value;
    const hospital = document.querySelector('#report-hospital').value.trim();
    const notes = document.querySelector('#report-notes').value.trim();
    const fileInput = document.querySelector('#report-file');

    if (!name || !date) {
      errorEl.textContent = 'Please fill all required fields.';
      return;
    }

    const file = fileInput.files?.[0];
    if (!file) {
      errorEl.textContent = 'Please select a PDF document to upload.';
      return;
    }

    // Validate PDF file format
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      errorEl.textContent = 'Invalid file format. Only PDF (.pdf) documents are accepted.';
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      errorEl.textContent = 'File size exceeds 10 MB limit.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const pdfBase64 = reader.result;
      const fileSizeFormatted = `${Math.round(file.size / 1024)} KB`;

      if (!Array.isArray(patientRecord.medicalReports)) patientRecord.medicalReports = [];

      const newReport = {
        id: `rep_${Date.now()}`,
        name,
        type,
        date,
        hospital,
        notes,
        pdfData: pdfBase64,
        fileName: file.name,
        fileSize: fileSizeFormatted,
        uploadedBy: 'Patient / Guardian',
        uploadedAt: new Date().toISOString()
      };

      patientRecord.medicalReports.unshift(newReport);

      logPatientActivity(currentPatientEmail, {
        icon: '📄',
        title: `${type} Report Uploaded`,
        detail: `${name} uploaded by Patient / Guardian`,
        actor: 'Patient / Guardian'
      });

      savePatientRecord(currentPatientEmail, patientRecord);
      window.dispatchEvent(new CustomEvent('medialert:patient-updated'));
      closeModal('modal-upload-report');
      refreshAll();
    };

    reader.onerror = () => {
      errorEl.textContent = 'Error reading the PDF file. Please try again.';
    };

    reader.readAsDataURL(file);
  });

  // Reports Actions Delegate (View PDF, Download, Rename, Delete)
  document.querySelector('#reports-list')?.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-action="view-pdf"]');
    const downloadBtn = e.target.closest('[data-action="download-pdf"]');
    const renameBtn = e.target.closest('[data-action="rename-pdf"]');
    const delBtn = e.target.closest('[data-action="delete-pdf"]');

    if (viewBtn) {
      const reportId = viewBtn.dataset.id;
      const rep = patientRecord.medicalReports.find(r => r.id === reportId);
      if (!rep) return;

      document.querySelector('#pdf-modal-title').textContent = rep.name;
      document.querySelector('#pdf-modal-meta').textContent = `${rep.type || 'Report'} · ${formatDate(rep.date)} ${rep.hospital ? `· ${rep.hospital}` : ''}`;
      
      const frame = document.querySelector('#pdf-frame');
      frame.src = rep.pdfData;

      const dlLink = document.querySelector('#pdf-download-link');
      dlLink.href = rep.pdfData;
      dlLink.download = rep.fileName || `${rep.name.replace(/\s+/g, '_')}.pdf`;

      openModal('modal-pdf-viewer');
    }

    if (downloadBtn) {
      const reportId = downloadBtn.dataset.id;
      const rep = patientRecord.medicalReports.find(r => r.id === reportId);
      if (!rep) return;

      const a = document.createElement('a');
      a.href = rep.pdfData;
      a.download = rep.fileName || `${rep.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    if (renameBtn) {
      const reportId = renameBtn.dataset.id;
      const rep = patientRecord.medicalReports.find(r => r.id === reportId);
      if (!rep) return;

      document.querySelector('#rename-report-id').value = rep.id;
      document.querySelector('#rename-report-name').value = rep.name;
      openModal('modal-rename-report');
    }

    if (delBtn) {
      const reportId = delBtn.dataset.id;
      const rep = patientRecord.medicalReports.find(r => r.id === reportId);
      if (!rep) return;

      if (confirm(`Delete report "${rep.name}"? This action cannot be undone.`)) {
        patientRecord.medicalReports = patientRecord.medicalReports.filter(r => r.id !== reportId);
        savePatientRecord(currentPatientEmail, patientRecord);
        window.dispatchEvent(new CustomEvent('medialert:patient-updated'));
        refreshAll();
      }
    }
  });

  // Rename Report Submit
  document.querySelector('#form-rename-report')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.querySelector('#rename-report-id').value;
    const newName = document.querySelector('#rename-report-name').value.trim();
    if (!newName) return;

    const rep = patientRecord.medicalReports.find(r => r.id === id);
    if (rep) {
      rep.name = newName;
      savePatientRecord(currentPatientEmail, patientRecord);
      window.dispatchEvent(new CustomEvent('medialert:patient-updated'));
      closeModal('modal-rename-report');
      refreshAll();
    }
  });

  // 4. LOG VITALS SUBMIT
  document.querySelector('#btn-open-log-vitals')?.addEventListener('click', () => {
    openModal('modal-log-vitals');
  });

  document.querySelector('#form-log-vitals')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const bpSys = document.querySelector('#vital-bp-sys').value.trim();
    const bpDia = document.querySelector('#vital-bp-dia').value.trim();
    const sugar = document.querySelector('#vital-sugar').value.trim();
    const pulse = document.querySelector('#vital-pulse').value.trim();
    const weight = document.querySelector('#vital-weight').value.trim();
    const spo2 = document.querySelector('#vital-spo2').value.trim();
    const temperature = document.querySelector('#vital-temperature').value.trim();

    if (!Array.isArray(patientRecord.vitals)) patientRecord.vitals = [];

    const now = new Date().toISOString();

    if (bpSys && bpDia) {
      patientRecord.vitals.unshift({
        id: `vit_${Date.now()}_bp`,
        type: 'Blood Pressure',
        primaryValue: bpSys,
        secondaryValue: bpDia,
        unit: 'mmHg',
        statusTag: Number(bpSys) < 120 ? 'Optimal' : Number(bpSys) <= 139 ? 'Pre-hypertension' : 'Elevated',
        recordedAt: now,
        recordedBy: 'Patient / Guardian'
      });
    }

    if (sugar) {
      patientRecord.vitals.unshift({
        id: `vit_${Date.now()}_sugar`,
        type: 'Blood Sugar',
        primaryValue: sugar,
        secondaryValue: '',
        unit: 'mg/dL',
        statusTag: 'Logged',
        recordedAt: now,
        recordedBy: 'Patient / Guardian'
      });
    }

    if (pulse) {
      patientRecord.vitals.unshift({
        id: `vit_${Date.now()}_pulse`,
        type: 'Heart Rate',
        primaryValue: pulse,
        secondaryValue: '',
        unit: 'BPM',
        statusTag: 'Resting',
        recordedAt: now,
        recordedBy: 'Patient / Guardian'
      });
    }

    if (weight) {
      patientRecord.vitals.unshift({
        id: `vit_${Date.now()}_weight`,
        type: 'Body Weight',
        primaryValue: weight,
        secondaryValue: '',
        unit: 'kg',
        statusTag: 'Tracked',
        recordedAt: now,
        recordedBy: 'Patient / Guardian'
      });
    }

    if (temperature) {
      patientRecord.vitals.unshift({
        id: `vit_${Date.now()}_temperature`,
        type: 'Temperature',
        primaryValue: temperature,
        secondaryValue: '',
        unit: '°C',
        statusTag: 'Logged',
        recordedAt: now,
        recordedBy: 'Patient / Guardian'
      });
    }

    if (spo2) {
      patientRecord.vitals.unshift({
        id: `vit_${Date.now()}_spo2`,
        type: 'Oxygen Level',
        primaryValue: spo2,
        secondaryValue: '',
        unit: '%',
        statusTag: 'SpO2',
        recordedAt: now,
        recordedBy: 'Patient / Guardian'
      });
    }

    logPatientActivity(currentPatientEmail, {
      icon: '❤️',
      title: 'Health Vitals Updated',
      detail: 'New biometric measurements recorded',
      actor: 'Patient / Guardian'
    });

    savePatientRecord(currentPatientEmail, patientRecord);
    closeModal('modal-log-vitals');
    refreshAll();
  });

  // Mobile menu toggle
  const mobileMenu = document.querySelector('#mobile-menu');
  const sidebar = document.querySelector('.sidebar');
  mobileMenu?.addEventListener('click', () => {
    sidebar?.classList.toggle('is-open');
  });

  // ==========================================
  // NOTIFICATION CENTER CONTROLLER
  // ==========================================

  let notifPanelOpen = false;
  let dismissedNotifIds = new Set();

  function buildNotificationsList() {
    const notifs = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const doseLogs = patientRecord?.doseLogs || [];

    // 1. Medicines due today
    const medicines = patientRecord?.medicines || [];
    medicines.forEach(m => {
      const times = m.scheduledTimes || (m.reminderTime ? [m.reminderTime] : []);
      times.forEach(t => {
        const isTaken = doseLogs.some(d => d.medicineId === m.id && d.scheduledDate === todayStr && d.status === 'Taken');
        const notifId = `notif_med_${m.id}_${t}`;
        if (!isTaken && !dismissedNotifIds.has(notifId)) {
          notifs.push({
            id: notifId,
            icon: '💊',
            title: `Medicine Due: ${m.name}`,
            desc: `${m.dosage || ''} scheduled for ${formatTime(t)}`,
            link: 'medicines.html',
            type: 'med'
          });
        }
      });
    });

    // 2. Upcoming events & appointments
    const events = patientRecord?.calendarEvents || [];
    events.forEach(ev => {
      const notifId = `notif_evt_${ev.id}`;
      if (ev.date >= todayStr && !dismissedNotifIds.has(notifId)) {
        notifs.push({
          id: notifId,
          icon: getEventIcon(ev.type),
          title: ev.title,
          desc: `${formatDate(ev.date)} ${ev.time ? `at ${formatTime(ev.time)}` : ''}`,
          link: '#calendar-section',
          type: 'event'
        });
      }
    });

    // 3. Pending tests
    const tests = patientRecord?.medicalTests || [];
    tests.forEach(t => {
      const notifId = `notif_test_${t.id}`;
      if (!t.isCompleted && !dismissedNotifIds.has(notifId)) {
        notifs.push({
          id: notifId,
          icon: '🧪',
          title: `Pending Test: ${t.testName}`,
          desc: `Due ${formatDate(t.dueDate)} at ${t.facility || 'Lab'}`,
          link: 'tests.html',
          type: 'test'
        });
      }
    });

    return notifs;
  }

  function updateNotificationBadge() {
    const notifs = buildNotificationsList();
    const countEl = document.querySelector('#notification-count');
    if (countEl) {
      countEl.textContent = notifs.length;
      countEl.style.display = notifs.length > 0 ? 'inline-block' : 'none';
    }
  }

  // Notification dropdown handled universally by notificationService.js


  // Initialize dynamic date display from local browser/system date
  const curDateEl = document.querySelector('#current-date');
  if (curDateEl) {
    const today = new Date();
    try {
      curDateEl.textContent = today.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      curDateEl.textContent = `${days[today.getDay()]}, ${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
    }
  }

  // Live sync with updates from other pages
  window.addEventListener('medialert:patient-updated', () => {
    patientRecord = getPatientRecord(currentPatientEmail);
    refreshAll();
  });

  window.addEventListener('medialert:medicines-updated', () => {
    patientRecord = getPatientRecord(currentPatientEmail);
    refreshAll();
  });

  window.addEventListener('medialert:profile-updated', () => {
    patientRecord = getPatientRecord(currentPatientEmail);
    refreshAll();
  });

  window.addEventListener('medialert:patients-updated', () => {
    refreshAll();
  });

  window.addEventListener('storage', () => {
    patientRecord = getPatientRecord(currentPatientEmail);
    refreshAll();
  });

  // Auto-refresh today's medicine statuses every 5 seconds to reflect Missed threshold
  setInterval(() => {
    renderTodayMedicines();
  }, 5000);

  updateNotificationBadge();
  refreshAll();
});
