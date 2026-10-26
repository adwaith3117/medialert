/**
 * MediAlert - Healthcare History Controller
 */

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
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildHistoryEvents() {
  const session = readActiveSession();
  const currentEmail = session?.email?.toLowerCase() || 'guardian@medialert.com';
  let record = getPatientRecord(currentEmail);
  if (!record) {
    initializeEmptyPatientData(currentEmail);
    record = getPatientRecord(currentEmail);
  }

  const events = [];

  (record.recentActivities || []).forEach(act => {
    events.push({
      type: 'activity',
      label: 'Activity',
      title: act.title,
      detail: `${act.detail} · By ${act.actor || 'Care Team'}`,
      date: act.timestamp,
      timestamp: act.timestamp
    });
  });

  (record.doseLogs || []).forEach((item) => {
    events.push({
      type: 'medicines',
      label: 'Medicine',
      title: `${item.medicineName || 'Medicine'} marked as ${item.status || 'Scheduled'}`,
      detail: item.scheduledTime ? `Scheduled for ${item.scheduledTime}` : 'Medication activity',
      date: item.actionTimestamp || item.scheduledDate,
      timestamp: item.actionTimestamp || item.scheduledDate
    });
  });

  (record.appointments || []).forEach((item) => {
    events.push({
      type: 'appointments',
      label: 'Appointment',
      title: `Visit with ${item.doctorName || 'doctor'}`,
      detail: `${item.specialization || 'Consultation'}${item.location ? ` at ${item.location}` : ''}`,
      date: item.appointmentDate,
      timestamp: `${item.appointmentDate || ''}T${item.appointmentTime || '00:00'}`
    });
  });

  (record.medicalReports || []).forEach((item) => {
    events.push({
      type: 'reports',
      label: 'Medical Report',
      title: `${item.name} (${item.type || 'PDF Report'})`,
      detail: item.hospital ? `From ${item.hospital}` : 'Uploaded document',
      date: item.date,
      timestamp: item.uploadedAt || item.date
    });
  });

  (record.vitals || []).forEach((item) => {
    events.push({
      type: 'records',
      label: 'Health Record',
      title: `${item.type || item.recordType || 'Vital reading'} logged`,
      detail: `${item.primaryValue}${item.secondaryValue ? `/${item.secondaryValue}` : ''} ${item.unit || ''} (${item.statusTag || 'Logged'})`,
      date: item.recordedAt || item.timestamp,
      timestamp: item.recordedAt || item.timestamp
    });
  });

  return events.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

document.addEventListener('DOMContentLoaded', () => {
  const timeline = document.querySelector('#history-timeline');
  const historySearch = document.querySelector('#history-search');
  const historyCount = document.querySelector('#history-count');
  const filterButtons = document.querySelectorAll('.filter-button');
  let activeFilter = 'all';
  const allEvents = buildHistoryEvents();

  function renderHistory() {
    const query = historySearch?.value.trim().toLowerCase() || '';
    const visibleEvents = allEvents.filter((event) =>
      (activeFilter === 'all' || event.type === activeFilter) &&
      `${event.title} ${event.detail} ${event.label}`.toLowerCase().includes(query)
    );

    if (historyCount) {
      historyCount.textContent = `${visibleEvents.length} ${visibleEvents.length === 1 ? 'activity' : 'activities'} shown`;
    }

    if (!visibleEvents.length) {
      if (timeline) {
        timeline.innerHTML = `<div class="timeline-empty"><strong>No matching history</strong><small>${query || activeFilter !== 'all' ? 'Try another search or filter.' : 'Your care activity will appear here as you use MediAlert.'}</small></div>`;
      }
      return;
    }

    if (timeline) {
      timeline.innerHTML = visibleEvents.map((event) => `
        <article class="timeline-item">
          <span class="timeline-dot" aria-hidden="true"></span>
          <div class="timeline-item__top">
            <span class="timeline-type">${escapeHtml(event.label)}</span>
            <time class="timeline-date">${escapeHtml(formatDate(event.date))}</time>
          </div>
          <h2>${escapeHtml(event.title)}</h2>
          <p>${escapeHtml(event.detail)}</p>
        </article>
      `).join('');
    }
  }

  historySearch?.addEventListener('input', renderHistory);
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      renderHistory();
    });
  });

  document.querySelector('#mobile-menu')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('is-open');
  });

  renderHistory();
});
