/**
 * MediAlert - Doctor Clinical Portal Controller
 * Manages shared patient records in real-time
 */

document.addEventListener('DOMContentLoaded', async () => {
  await medialertReady;
  const session = readActiveSession();
  if (!session || session.role !== ROLES.DOCTOR) {
    location.replace('index.html');
    return;
  }

  let selectedPatientEmail = '';
  let patientRecord = null;
  let pendingDeletePatientId = null;
  let verifiedPatientId = '';
  let verifiedPatientAccountId = '';
  let editingClinicalNoteId = null;
  let clinicalNoteType = 'note';

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

  // ==========================================
  // DYNAMIC DOCTOR IDENTITY RENDERING
  // ==========================================

  function getActiveDoctorProfile() {
    const accounts = readAccounts();
    const doc = accounts.find(a => a.email.toLowerCase() === session.email.toLowerCase()) || session;
    return {
      name: doc.name || 'Doctor',
      specialization: doc.specialization || '--',
      qualification: doc.qualification || '--',
      hospitalClinic: doc.hospitalClinic || '--',
      department: doc.department || '',
      contact: doc.contact || doc.phone || '--'
    };
  }

  function renderDoctorHeaderAndSidebar() {
    const doc = getActiveDoctorProfile();
    const initials = typeof computeUserInitials === 'function' ? computeUserInitials(doc.name) : 'DR';

    // Update Topbar
    const topbarTitle = document.querySelector('#doctor-topbar-title');
    if (topbarTitle) {
      topbarTitle.textContent = `${doc.name} · ${doc.specialization}`;
    }

    const headerAvatar = document.querySelector('#header-avatar');
    if (headerAvatar) {
      headerAvatar.textContent = initials;
    }

    // Update Sidebar
    const sbName = document.querySelector('#sidebar-name');
    if (sbName) {
      sbName.textContent = doc.name;
    }

    const sbSpec = document.querySelector('#sidebar-specialization');
    if (sbSpec) {
      sbSpec.textContent = doc.specialization;
    }

    const sbAvatar = document.querySelector('#sidebar-avatar');
    if (sbAvatar) {
      sbAvatar.textContent = initials;
    }
  }

  // ==========================================
  // SIDEBAR NAVIGATION & TAB SWITCHING
  // ==========================================

  const tabToNavMap = {
    'tab-overview': 'nav-doc-patients',
    'tab-medicines': 'nav-doc-medicines',
    'tab-calendar': 'nav-doc-calendar',
    'tab-reports': 'nav-doc-reports',
    'tab-notes': 'nav-doc-patients',
    'tab-activity': 'nav-doc-patients'
  };

  const navToTabMap = {
    'nav-doc-patients': 'tab-overview',
    'nav-doc-calendar': 'tab-calendar',
    'nav-doc-medicines': 'tab-medicines',
    'nav-doc-reports': 'tab-reports'
  };

  function switchActiveTab(targetTabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.tab === targetTabId);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('is-active', pane.id === targetTabId);
    });

    // Update sidebar active link
    const activeNavId = tabToNavMap[targetTabId] || 'nav-doc-patients';
    document.querySelectorAll('#doctor-sidebar-nav .nav-link').forEach(link => {
      link.classList.toggle('is-active', link.id === activeNavId);
    });
  }

  // Bind Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchActiveTab(btn.dataset.tab);
    });
  });

  // Bind Sidebar links
  document.querySelectorAll('#doctor-sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        const tabId = navToTabMap[link.id];
        if (tabId) switchActiveTab(tabId);
      }
    });
  });

  const requestedTab = window.location.hash.slice(1);
  if (Object.prototype.hasOwnProperty.call(tabToNavMap, requestedTab)) {
    switchActiveTab(requestedTab);
  }

  // ==========================================
  // PATIENT LIST & SEARCH
  // ==========================================

  function renderPatientList(query = '') {
    const container = document.querySelector('#patient-list-container');
    const allPatients = getAllPatientAccounts();
    const cleanQuery = query.trim().toLowerCase();

    const filtered = allPatients.filter(p => {
      return (
        p.name.toLowerCase().includes(cleanQuery) ||
        p.email.toLowerCase().includes(cleanQuery) ||
        p.patientId.toLowerCase().includes(cleanQuery) ||
        p.phone.toLowerCase().includes(cleanQuery) ||
        p.conditions.toLowerCase().includes(cleanQuery)
      );
    });

    if (!allPatients.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:24px 12px;background:#faf8ff;border-radius:12px;border:1px dashed var(--border-lavender);">
          <span style="font-size:24px;display:block;margin-bottom:6px;">👤</span>
          <strong style="font-size:13px;color:var(--ink);display:block;">No patients added yet</strong>
          <small style="color:var(--secondary);font-size:11px;display:block;margin:4px 0 12px;">Add or connect a patient to start managing care.</small>
          <button class="primary-btn" id="btn-empty-add-patient" type="button" style="min-height:30px;font-size:11px;padding:0 12px;">+ Add Patient</button>
        </div>
      `;
      document.querySelector('#btn-empty-add-patient')?.addEventListener('click', () => {
        openModal('modal-doc-add-patient');
      });
      return;
    }

    if (!filtered.length) {
      container.innerHTML = `<p style="font-size:12px;color:var(--secondary);text-align:center;padding:16px;">No patients match "${escapeHtml(query)}".</p>`;
      return;
    }

    // Ensure a valid selected patient
    if (!allPatients.some(p => p.email.toLowerCase() === selectedPatientEmail.toLowerCase())) {
      selectedPatientEmail = allPatients[0].email;
    }

    container.innerHTML = filtered.map(p => {
      const isActive = p.email.toLowerCase() === selectedPatientEmail.toLowerCase();
      return `
        <article class="patient-item-card ${isActive ? 'is-active' : ''}" data-email="${escapeHtml(p.email)}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <small style="color:var(--secondary);">${escapeHtml(p.patientId)} · ${escapeHtml(p.email)}</small>
              <small style="color:var(--primary-purple);font-weight:600;margin-top:2px;">${escapeHtml(p.conditions)}</small>
            </div>
            <button class="icon-button" data-action="delete-patient" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-patient-id="${escapeHtml(p.patientId)}" title="Remove patient" style="width:28px;height:28px;border-radius:8px;color:var(--danger);flex-shrink:0;border-color:#f7d2d2;background:#fff;">✕</button>
          </div>
        </article>
      `;
    }).join('');
  }

  // Patient Selection & Delete Action Delegation
  document.querySelector('#patient-list-container')?.addEventListener('click', e => {
    const delBtn = e.target.closest('[data-action="delete-patient"]');
    if (delBtn) {
      e.stopPropagation();
      const patientId = delBtn.dataset.id;
      const name = delBtn.dataset.name;
      promptRemovePatient(patientId, name, delBtn.dataset.patientId);
      return;
    }

    const card = e.target.closest('.patient-item-card');
    if (card) {
      document.querySelector('#doctor-patient-status').textContent = '';
      const email = card.dataset.email;
      loadPatientWorkspace(email);
    }
  });

  // Search Filter Input (Live real-time filter)
  document.querySelector('#patient-search-input')?.addEventListener('input', e => {
    renderPatientList(e.target.value);
  });

  // ==========================================
  // LOAD SELECTED PATIENT WORKSPACE
  // ==========================================

  function loadPatientWorkspace(email) {
    const allPatients = getAllPatientAccounts();
    const selectedPatient = allPatients.find(patient =>
      patient.email.toLowerCase() === String(email || selectedPatientEmail).toLowerCase()
    );
    if (!selectedPatient) {
      selectedPatientEmail = '';
      patientRecord = null;
      renderEmptyWorkspace();
      return;
    }

    selectedPatientEmail = selectedPatient.email;
    patientRecord = getPatientRecord(selectedPatient.email);
    if (!patientRecord) {
      initializeEmptyPatientData(selectedPatient.email);
      patientRecord = getPatientRecord(selectedPatient.email);
    }

    document.querySelectorAll('#btn-doc-add-vital, #btn-doc-add-med, #btn-doc-add-rx, #btn-doc-add-note, #btn-doc-add-treatment').forEach(button => {
      button.disabled = false;
    });
    renderPatientBanner();
    renderOverviewAndVitals();
    renderMedicinesAndPrescriptions();
    renderFollowUps();
    renderMedicalReports();
    renderClinicalNotes();
    renderAuditActivity();
    renderPatientList(document.querySelector('#patient-search-input')?.value || '');
  }

  function renderEmptyWorkspace() {
    selectedPatientEmail = '';
    patientRecord = null;
    document.querySelector('#patient-name-display').textContent = 'No Patient Selected';
    document.querySelector('#patient-email-display').textContent = 'Connect an authorized patient to view their records.';
    document.querySelector('#patient-age-gender').textContent = '--';
    document.querySelector('#patient-blood-group').textContent = '--';
    document.querySelector('#patient-conditions').textContent = '--';
    document.querySelector('#patient-allergies').textContent = '--';
    document.querySelector('#btn-banner-remove-patient').style.display = 'none';
    document.querySelector('#doc-vitals-grid').innerHTML = '<p class="empty-state">No patient records available.</p>';
    document.querySelector('#doc-treatment-overview-box').innerHTML = '<p style="margin:0;">No patient records available.</p>';
    document.querySelector('#doc-medicines-list').innerHTML = '<div class="empty-state"><p>No patient records available.</p></div>';
    document.querySelector('#doc-prescriptions-list').innerHTML = '<p class="empty-state">No patient records available.</p>';
    document.querySelector('#doc-calendar-events-list').innerHTML = '<div class="empty-state"><p>No appointments scheduled.</p></div>';
    document.querySelector('#doc-reports-list').innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><p>No patient reports available.</p></div>';
    document.querySelector('#doc-clinical-notes-list').innerHTML = '<div class="empty-state"><p>No patient records available.</p></div>';
    document.querySelector('#doc-activity-list').innerHTML = '<div class="empty-state"><p>No patient activity available.</p></div>';
    document.querySelectorAll('#btn-doc-add-vital, #btn-doc-add-med, #btn-doc-add-rx, #btn-doc-add-note, #btn-doc-add-treatment').forEach(button => {
      button.disabled = true;
    });
    renderPatientList('');
  }

  function renderPatientBanner() {
    const prof = patientRecord?.profile || {};
    const linkedPatient = getAllPatientAccounts().find(patient => patient.email.toLowerCase() === selectedPatientEmail.toLowerCase());
    const patientId = linkedPatient?.patientId || '--';

    document.querySelector('#btn-banner-remove-patient').style.display = '';
    document.querySelector('#patient-name-display').textContent = prof.name || 'Patient';
    document.querySelector('#patient-email-display').textContent = `${prof.email || selectedPatientEmail} · ID: ${patientId}`;
    document.querySelector('#patient-age-gender').textContent = `${prof.age || '--'} Yrs / ${prof.gender || '--'}`;
    document.querySelector('#patient-blood-group').textContent = prof.bloodGroup || '--';
    document.querySelector('#patient-conditions').textContent = prof.medicalConditions || '--';
    document.querySelector('#patient-allergies').textContent = prof.allergies || '--';
  }

  // Remove button in banner
  document.querySelector('#btn-banner-remove-patient')?.addEventListener('click', () => {
    const prof = patientRecord?.profile || {};
    const linkedPatient = getAllPatientAccounts().find(patient => patient.email.toLowerCase() === selectedPatientEmail.toLowerCase());
    if (linkedPatient) promptRemovePatient(linkedPatient.id, prof.name || 'Patient', linkedPatient.patientId);
  });

  // 1. OVERVIEW & VITALS
  function renderOverviewAndVitals() {
    const vitalsGrid = document.querySelector('#doc-vitals-grid');
    const vitals = patientRecord?.vitals || [];

    const defaultDefs = [
      { key: 'Blood Pressure', label: 'Blood Pressure', unit: 'mmHg' },
      { key: 'Blood Sugar', label: 'Blood Sugar', unit: 'mg/dL' },
      { key: 'Heart Rate', label: 'Heart Rate', unit: 'BPM' },
      { key: 'Body Weight', label: 'Body Weight', unit: 'kg' },
      { key: 'Oxygen Level', label: 'Oxygen Level', unit: '%' }
    ];

    vitalsGrid.innerHTML = defaultDefs.map(def => {
      const match = vitals.find(v => v.type.toLowerCase() === def.key.toLowerCase());
      const displayVal = match ? (match.secondaryValue ? `${match.primaryValue}/${match.secondaryValue}` : match.primaryValue) : '--';
      const recordedDate = match?.recordedAt ? formatDate(match.recordedAt, { month: 'short', day: 'numeric' }) : '--';

      return `
        <article class="metric-card">
          <p class="metric-card__label">${escapeHtml(def.label)}</p>
          <p class="metric-card__value">${escapeHtml(displayVal)}<small>${escapeHtml(def.unit)}</small></p>
          <div class="metric-card__footer">
            <span class="tag tag--optimal">${escapeHtml(match?.statusTag || '--')}</span>
            <small>${escapeHtml(recordedDate)}</small>
          </div>
        </article>
      `;
    }).join('');

    // Treatment overview summary
    const notes = patientRecord?.clinicalNotes || [];
    const overviewBox = document.querySelector('#doc-treatment-overview-box');
    if (overviewBox) {
      if (notes.length > 0) {
        overviewBox.innerHTML = `
          <strong>Latest Clinical Assessment (${formatDate(notes[0].date)} by ${escapeHtml(notes[0].doctorName || 'Doctor')}):</strong><br>
          <p style="margin:6px 0 0; color:var(--ink);">${escapeHtml(notes[0].content)}</p>
          ${notes[0].treatmentPlan ? `<p style="margin:8px 0 0; color:var(--primary-purple); font-weight:600;">Plan: ${escapeHtml(notes[0].treatmentPlan)}</p>` : ''}
        `;
      } else {
        overviewBox.innerHTML = `<p style="margin:0;">No clinical notes recorded yet for this patient. Click "+ Add Clinical Note" to document directives.</p>`;
      }
    }
  }

  // 2. MEDICINES & PRESCRIPTIONS
  function renderMedicinesAndPrescriptions() {
    const medList = document.querySelector('#doc-medicines-list');
    const meds = patientRecord?.medicines || [];

    if (!meds.length) {
      medList.innerHTML = `<div class="empty-state"><p>No medications prescribed for this patient.</p></div>`;
    } else {
      medList.innerHTML = meds.map(m => `
        <article class="med-card" style="display:flex;align-items:center;justify-content:space-between;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="font-size:24px;background:var(--soft-lavender);width:44px;height:44px;display:grid;place-items:center;border-radius:12px;">💊</div>
            <div>
              <strong style="font-size:14px;color:var(--ink);">${escapeHtml(m.name)} <span style="font-size:12px;color:var(--secondary);font-weight:normal;">${escapeHtml(m.dosage || '')}</span></strong>
              <small style="display:block;color:var(--secondary);margin-top:2px;">${escapeHtml(m.form || 'Tablet')} · ${escapeHtml(m.frequency || 'Daily')} · Scheduled: ${escapeHtml(m.scheduledTimes?.[0] ? formatTime(m.scheduledTimes[0]) : (m.reminderTime ? formatTime(m.reminderTime) : '08:00 AM'))}</small>
              ${m.instructions ? `<small style="display:block;color:var(--primary-purple);margin-top:2px;">Notes: ${escapeHtml(m.instructions)}</small>` : ''}
            </div>
          </div>
          <button class="rep-btn rep-btn--danger" data-action="doc-delete-med" data-id="${escapeHtml(m.id)}" type="button">Discontinue</button>
        </article>
      `).join('');
    }

    // Prescriptions List
    const rxList = document.querySelector('#doc-prescriptions-list');
    const rx = patientRecord?.prescriptions || [];

    if (!rx.length) {
      rxList.innerHTML = `<p style="font-size:12px;color:var(--secondary);">No formal prescriptions archived yet.</p>`;
    } else {
      rxList.innerHTML = rx.map(r => `
        <article style="padding:14px;border:1px solid var(--line);border-radius:12px;background:#faf9ff;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="font-size:13px;color:var(--ink);">Diagnosis: ${escapeHtml(r.diagnosis || 'Prescription')}</strong>
            <small style="color:var(--secondary);">${formatDate(r.date)}</small>
          </div>
          <p style="margin:0;font-size:12px;color:var(--secondary);white-space:pre-line;">${escapeHtml(r.medicinesText || r.notes || '')}</p>
          <small style="display:block;margin-top:6px;color:var(--primary-purple);font-weight:600;">Prescribed by: ${escapeHtml(r.doctorName || r.prescribedBy || 'Attending Doctor')}</small>
        </article>
      `).join('');
    }
  }

  // 3. PATIENT FOLLOW-UPS
  function renderFollowUps() {
    const calList = document.querySelector('#doc-calendar-events-list');
    const patientName = patientRecord?.profile?.name;
    const isFollowUp = item => /follow[\s-]?up/i.test([
      item.title,
      item.reason,
      item.purpose,
      item.notes
    ].filter(Boolean).join(' '));
    const events = (patientRecord?.calendarEvents || [])
      .filter(ev => ev.type === 'follow_up' || (ev.type === 'doctor_appointment' && isFollowUp(ev)))
      .map(ev => ({ ...ev, reason: ev.reason || ev.purpose || ev.notes }));
    const appointmentFollowUps = (patientRecord?.appointments || [])
      .filter(isFollowUp)
      .filter(appointment => !events.some(ev =>
        ev.date === appointment.appointmentDate &&
        ev.time === appointment.appointmentTime &&
        (ev.location || '') === (appointment.hospitalClinic || appointment.location || '')
      ))
      .map(appointment => ({
          title: appointment.purpose || appointment.doctorName,
          date: appointment.appointmentDate,
          time: appointment.appointmentTime,
          location: appointment.hospitalClinic || appointment.location,
          reason: appointment.notes || appointment.purpose
      }));
    events.push(...appointmentFollowUps);

    if (!events.length) {
      calList.innerHTML = `<div class="empty-state"><p>No follow-up dates scheduled.</p></div>`;
      return;
    }

    calList.innerHTML = events.map(ev => `
      <article style="padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:#fff;margin-bottom:10px;">
        <strong style="font-size:13px;color:var(--ink);">${escapeHtml(patientName || 'Patient')}</strong>
        <small style="display:block;color:var(--secondary);margin-top:4px;">Follow-up: ${formatDate(ev.date)}${ev.time ? ` at ${formatTime(ev.time)}` : ''}</small>
        ${ev.title ? `<small style="display:block;color:var(--secondary);margin-top:4px;">${escapeHtml(ev.title)}</small>` : ''}
        ${ev.reason || ev.purpose || ev.notes ? `<small style="display:block;color:var(--secondary);margin-top:4px;">Reason: ${escapeHtml(ev.reason || ev.purpose || ev.notes)}</small>` : ''}
        ${ev.location ? `<small style="display:block;color:var(--secondary);margin-top:4px;">Location: ${escapeHtml(ev.location)}</small>` : ''}
      </article>
    `).join('');
  }

  // 4. MEDICAL REPORTS
  function renderMedicalReports() {
    const repGrid = document.querySelector('#doc-reports-list');
    const reports = patientRecord?.medicalReports || [];

    if (!reports.length) {
      repGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>No medical PDF reports uploaded by the patient.</p></div>`;
      return;
    }

    repGrid.innerHTML = reports.map(r => `
      <article class="report-card">
        <div class="report-card__header">
          <span class="report-card__icon">📄</span>
          <div class="report-card__title">
            <strong>${escapeHtml(r.name)}</strong>
            <span>${escapeHtml(r.type || 'Lab Report')}</span>
          </div>
        </div>
        <div class="report-card__meta">
          <span>Date: ${formatDate(r.date)}</span>
          <span>Size: ${escapeHtml(r.fileSize || 'PDF Document')}</span>
        </div>
        <div class="report-card__actions">
          <button class="rep-btn rep-btn--primary" data-action="doc-view-pdf" data-id="${escapeHtml(r.id)}" type="button">View PDF</button>
          <button class="rep-btn" data-action="doc-download-pdf" data-id="${escapeHtml(r.id)}" type="button">Download</button>
        </div>
      </article>
    `).join('');
  }

  // 5. CLINICAL NOTES
  function renderClinicalNotes() {
    const notesList = document.querySelector('#doc-clinical-notes-list');
    const notes = patientRecord?.clinicalNotes || [];

    if (!notes.length) {
      notesList.innerHTML = `<div class="empty-state"><p>No clinical notes documented for this patient.</p></div>`;
      return;
    }

    notesList.innerHTML = notes.map(n => `
      <article style="padding:16px;border:1px solid var(--line);border-radius:14px;background:#fff;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <small style="display:block;color:var(--secondary);font-size:10px;margin-bottom:3px;">${n.entryType === 'treatment' ? 'Treatment History' : 'Clinical Note'}</small>
            <strong style="font-size:14px;color:var(--secondary-purple);">${escapeHtml(n.title)}</strong>
          </div>
          <small style="color:var(--secondary);font-size:11px;">${formatDate(n.updatedAt || n.date)}</small>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:var(--ink);line-height:1.5;">${escapeHtml(n.content)}</p>
        ${n.treatmentPlan ? `<div style="background:#faf8ff;padding:8px 12px;border-radius:8px;font-size:12px;color:var(--primary-purple);font-weight:600;">Plan: ${escapeHtml(n.treatmentPlan)}</div>` : ''}
        <small style="display:block;margin-top:8px;color:var(--muted);font-size:10px;">Documented by: ${escapeHtml(n.doctorName || 'Attending Physician')}</small>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button class="secondary-btn" data-action="edit-clinical-note" data-id="${escapeHtml(n.id)}" type="button" style="min-height:30px;padding:0 12px;font-size:11px;">Edit</button>
          <button class="secondary-btn" data-action="delete-clinical-note" data-id="${escapeHtml(n.id)}" type="button" style="min-height:30px;padding:0 12px;font-size:11px;color:var(--danger);border-color:#f7d2d2;">Delete</button>
        </div>
      </article>
    `).join('');
  }

  // 6. AUDIT ACTIVITY
  function renderAuditActivity() {
    const actList = document.querySelector('#doc-activity-list');
    const activities = patientRecord?.recentActivities || [];

    if (!activities.length) {
      actList.innerHTML = `<div class="empty-state"><p>No activity logged yet.</p></div>`;
      return;
    }

    actList.innerHTML = activities.slice(0, 15).map(a => `
      <div class="activity-item">
        <span class="activity-item__icon">${a.icon || '📌'}</span>
        <div class="activity-item__body">
          <strong>${escapeHtml(a.title)}</strong>
          <small>${escapeHtml(a.detail || '')}</small>
        </div>
        <span class="activity-item__time">${formatDate(a.timestamp, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `).join('');
  }

  // ==========================================
  // MODAL CONTROLLER & ACTIONS
  // ==========================================

  function openModal(id) {
    document.querySelector(`#${id}`)?.classList.add('is-open');
  }

  function closeModal(id) {
    document.querySelector(`#${id}`)?.classList.remove('is-open');
  }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.closeModal);
    });
  });

  // ==========================================
  // ADD PATIENT (DOCTOR PORTAL)
  // ==========================================

  function resetPatientVerification() {
    verifiedPatientId = '';
    verifiedPatientAccountId = '';
    document.querySelector('#verified-patient').hidden = true;
    document.querySelector('#btn-connect-patient').hidden = true;
    document.querySelector('#btn-connect-patient').disabled = true;
    document.querySelector('#btn-verify-patient').hidden = false;
  }

  document.querySelector('#btn-doc-add-patient')?.addEventListener('click', () => {
    document.querySelector('#new-pat-id').value = '';
    document.querySelector('#add-pat-error').textContent = '';
    document.querySelector('#doctor-patient-status').textContent = '';
    resetPatientVerification();
    openModal('modal-doc-add-patient');
  });

  document.querySelector('#new-pat-id')?.addEventListener('input', () => {
    resetPatientVerification();
    document.querySelector('#add-pat-error').textContent = '';
  });

  document.querySelector('#btn-verify-patient')?.addEventListener('click', () => {
    const patientId = document.querySelector('#new-pat-id').value.trim();
    const errEl = document.querySelector('#add-pat-error');
    errEl.textContent = '';
    resetPatientVerification();
    const result = verifyPatientAccountById(patientId);
    if (!result.ok) {
      errEl.textContent = result.message;
      return;
    }
    verifiedPatientId = patientId;
    verifiedPatientAccountId = result.patient.id;
    document.querySelector('#verified-patient-name').textContent = result.patient.name;
    document.querySelector('#verified-patient-id').textContent = result.patient.patientId;
    document.querySelector('#verified-patient').hidden = false;
    if (result.alreadyLinked) {
      errEl.textContent = 'This patient is already connected to your account.';
      return;
    }
    document.querySelector('#btn-verify-patient').hidden = true;
    document.querySelector('#btn-connect-patient').hidden = false;
    document.querySelector('#btn-connect-patient').disabled = false;
  });

  document.querySelector('#btn-connect-patient')?.addEventListener('click', async () => {
    const patientId = document.querySelector('#new-pat-id').value.trim();
    const errEl = document.querySelector('#add-pat-error');
    if (!verifiedPatientId || patientId !== verifiedPatientId) {
      resetPatientVerification();
      errEl.textContent = 'Verify the Patient ID again before connecting.';
      return;
    }
    try {
      const res = await addPatientAccountByDoctor({ patientId, expectedPatientAccountId: verifiedPatientAccountId });
      if (!res.ok) {
        errEl.textContent = res.message;
        return;
      }
      closeModal('modal-doc-add-patient');
      const status = document.querySelector('#doctor-patient-status');
      if (status) status.textContent = res.alreadyLinked ? 'This patient is already on your list.' : 'Patient added to your list.';
      loadPatientWorkspace(res.patient.email);
    } catch (error) {
      console.error('Unable to connect patient:', error);
      errEl.textContent = 'Unable to connect patient. Please try again.';
    }
  });

  // ==========================================
  // REMOVE PATIENT (DOCTOR PORTAL)
  // ==========================================

  function promptRemovePatient(accountId, name, patientId) {
    pendingDeletePatientId = accountId;
    document.querySelector('#remove-pat-name-display').textContent = name || 'Patient';
    document.querySelector('#remove-pat-email-display').textContent = patientId || '';
    openModal('modal-doc-confirm-remove');
  }

  document.querySelector('#btn-confirm-remove-pat')?.addEventListener('click', async () => {
    if (!pendingDeletePatientId) return;
    let removed;
    try {
      removed = await removePatientAccountByDoctor(pendingDeletePatientId);
    } catch (error) {
      console.error('Unable to remove patient relationship:', error);
      const status = document.querySelector('#doctor-patient-status');
      if (status) status.textContent = 'Unable to remove this patient from your list. Please try again.';
      return;
    }
    closeModal('modal-doc-confirm-remove');
    pendingDeletePatientId = null;

    const status = document.querySelector('#doctor-patient-status');
    if (!removed) {
      if (status) status.textContent = 'Unable to remove this patient from your list.';
      return;
    }
    if (status) status.textContent = 'Patient removed from your list. Their account and medical records remain unchanged.';
    const remainingPatients = getAllPatientAccounts();
    loadPatientWorkspace(remainingPatients.some(patient => patient.email.toLowerCase() === selectedPatientEmail.toLowerCase())
      ? selectedPatientEmail
      : remainingPatients[0]?.email || '');
  });

  // ==========================================
  // 1. DOCTOR PRESCRIBE MEDICINE
  // ==========================================

  document.querySelector('#btn-doc-add-med')?.addEventListener('click', () => {
    document.querySelector('#form-doc-med').reset();
    openModal('modal-doc-med');
  });

  document.querySelector('#form-doc-med')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.querySelector('#doc-med-name').value.trim();
    const dosage = document.querySelector('#doc-med-dosage').value.trim();
    const form = document.querySelector('#doc-med-form').value;
    const freq = document.querySelector('#doc-med-freq').value;
    const time = document.querySelector('#doc-med-time').value || '08:00';
    const instructions = document.querySelector('#doc-med-instructions').value.trim();

    if (!name || !dosage) return;

    if (!Array.isArray(patientRecord.medicines)) patientRecord.medicines = [];
    const doc = getActiveDoctorProfile();

    const newMed = {
      id: `med_${Date.now()}`,
      name,
      dosage,
      form,
      frequency: freq,
      scheduledTimes: [time],
      instructions,
      prescribedBy: `${doc.name} (Doctor)`,
      createdAt: new Date().toISOString()
    };

    patientRecord.medicines.unshift(newMed);

    logPatientActivity(selectedPatientEmail, {
      icon: '💊',
      title: 'Doctor Prescribed Medicine',
      detail: `${name} ${dosage} prescribed by ${doc.name}`,
      actor: `${doc.name} (Doctor)`
    });

    savePatientRecord(selectedPatientEmail, patientRecord);
    closeModal('modal-doc-med');
    loadPatientWorkspace(selectedPatientEmail);
  });

  // Delete Medicine Handler
  document.querySelector('#doc-medicines-list')?.addEventListener('click', e => {
    const delBtn = e.target.closest('[data-action="doc-delete-med"]');
    if (delBtn) {
      const medId = delBtn.dataset.id;
      if (confirm('Are you sure you want to discontinue this medicine?')) {
        const doc = getActiveDoctorProfile();
        patientRecord.medicines = patientRecord.medicines.filter(m => m.id !== medId);
        logPatientActivity(selectedPatientEmail, {
          icon: '💊',
          title: 'Medicine Discontinued',
          detail: `Medication discontinued by ${doc.name}`,
          actor: `${doc.name} (Doctor)`
        });
        savePatientRecord(selectedPatientEmail, patientRecord);
        loadPatientWorkspace(selectedPatientEmail);
      }
    }
  });

  // ==========================================
  // 3. DOCTOR CLINICAL NOTES & TREATMENT HISTORY
  // ==========================================

  function openClinicalEntry(type, note = null) {
    editingClinicalNoteId = note?.id || null;
    clinicalNoteType = note?.entryType === 'treatment' ? 'treatment' : type;
    const isEditing = Boolean(note);
    document.querySelector('#form-doc-note').reset();
    document.querySelector('#doc-note-modal-title').textContent = isEditing
      ? `Edit ${clinicalNoteType === 'treatment' ? 'Treatment History' : 'Clinical Note'}`
      : `+ Add ${clinicalNoteType === 'treatment' ? 'Treatment History' : 'Clinical Note & Treatment Update'}`;
    document.querySelector('#doc-note-save-button').textContent = isEditing ? 'Save Changes' : 'Save';
    document.querySelector('#doc-note-title').value = note?.title || '';
    document.querySelector('#doc-note-content').value = note?.content || '';
    document.querySelector('#doc-note-treatment').value = note?.treatmentPlan || '';
    openModal('modal-doc-note');
  }

  function getLatestAuthorizedClinicalRecord() {
    const patient = getAllPatientAccounts().find(account =>
      account.email.toLowerCase() === selectedPatientEmail.toLowerCase()
    );
    if (!patient) return null;
    return getPatientRecord(patient.email);
  }

  function recordClinicalActivity(record, title, detail, doctorName) {
    if (!Array.isArray(record.recentActivities)) record.recentActivities = [];
    record.recentActivities.unshift({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      icon: '📋',
      title,
      detail,
      actor: `${doctorName} (Doctor)`,
      timestamp: new Date().toISOString()
    });
    record.recentActivities = record.recentActivities.slice(0, 25);
  }

  document.querySelector('#btn-doc-add-note')?.addEventListener('click', () => {
    openClinicalEntry('note');
  });

  document.querySelector('#btn-doc-add-treatment')?.addEventListener('click', () => {
    openClinicalEntry('treatment');
  });

  document.querySelector('#doc-clinical-notes-list')?.addEventListener('click', event => {
    const editButton = event.target.closest('[data-action="edit-clinical-note"]');
    const deleteButton = event.target.closest('[data-action="delete-clinical-note"]');
    if (!editButton && !deleteButton) return;

    const record = getLatestAuthorizedClinicalRecord();
    if (!record) {
      document.querySelector('#doctor-patient-status').textContent = 'This patient is no longer connected to your account.';
      loadPatientWorkspace('');
      return;
    }
    const noteId = (editButton || deleteButton).dataset.id;
    const notes = Array.isArray(record.clinicalNotes) ? record.clinicalNotes : [];
    const note = notes.find(item => item.id === noteId);
    if (!note) {
      document.querySelector('#doctor-patient-status').textContent = 'This clinical entry could not be found. Refresh the patient record and try again.';
      loadPatientWorkspace(selectedPatientEmail);
      return;
    }

    if (editButton) {
      openClinicalEntry(note.entryType === 'treatment' ? 'treatment' : 'note', note);
      return;
    }

    if (!window.confirm(`Delete "${note.title}" from ${note.entryType === 'treatment' ? 'treatment history' : 'clinical notes'}? This cannot be undone.`)) return;
    const doctor = getActiveDoctorProfile();
    record.clinicalNotes = notes.filter(item => item.id !== noteId);
    recordClinicalActivity(
      record,
      note.entryType === 'treatment' ? 'Doctor Deleted Treatment History' : 'Doctor Deleted Clinical Note',
      note.title,
      doctor.name
    );
    if (!savePatientRecord(selectedPatientEmail, record)) {
      document.querySelector('#doctor-patient-status').textContent = 'Unable to delete this entry. Please try again.';
      return;
    }
    patientRecord = record;
    loadPatientWorkspace(selectedPatientEmail);
  });

  document.querySelector('#form-doc-note')?.addEventListener('submit', e => {
    e.preventDefault();
    const title = document.querySelector('#doc-note-title').value.trim();
    const content = document.querySelector('#doc-note-content').value.trim();
    const treatmentPlan = document.querySelector('#doc-note-treatment').value.trim();

    if (!title || !content) return;

    const record = getLatestAuthorizedClinicalRecord();
    if (!record) {
      document.querySelector('#doctor-patient-status').textContent = 'This patient is no longer connected to your account.';
      closeModal('modal-doc-note');
      loadPatientWorkspace('');
      return;
    }
    if (!Array.isArray(record.clinicalNotes)) record.clinicalNotes = [];
    const doc = getActiveDoctorProfile();
    const now = new Date().toISOString();
    if (editingClinicalNoteId) {
      const index = record.clinicalNotes.findIndex(note => note.id === editingClinicalNoteId);
      if (index === -1) {
        document.querySelector('#doctor-patient-status').textContent = 'This clinical entry could not be found. Refresh the patient record and try again.';
        closeModal('modal-doc-note');
        loadPatientWorkspace(selectedPatientEmail);
        return;
      }
      const current = record.clinicalNotes[index];
      record.clinicalNotes[index] = {
        ...current,
        title,
        content,
        treatmentPlan,
        updatedAt: now,
        updatedBy: doc.name
      };
      recordClinicalActivity(
        record,
        clinicalNoteType === 'treatment' ? 'Doctor Updated Treatment History' : 'Doctor Updated Clinical Note',
        title,
        doc.name
      );
    } else {
      record.clinicalNotes.unshift({
        id: `cn_${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
        entryType: clinicalNoteType,
        title,
        content,
        treatmentPlan,
        doctorName: doc.name,
        date: now.slice(0, 10),
        createdAt: now
      });
      recordClinicalActivity(
        record,
        clinicalNoteType === 'treatment' ? 'Doctor Added Treatment History' : 'Doctor Added Clinical Note',
        title,
        doc.name
      );
    }
    if (!savePatientRecord(selectedPatientEmail, record)) {
      document.querySelector('#doctor-patient-status').textContent = 'Unable to save this clinical entry. Please try again.';
      return;
    }
    patientRecord = record;
    editingClinicalNoteId = null;
    closeModal('modal-doc-note');
    loadPatientWorkspace(selectedPatientEmail);
  });

  // ==========================================
  // 4. DOCTOR ADD PRESCRIPTION
  // ==========================================

  document.querySelector('#btn-doc-add-rx')?.addEventListener('click', () => {
    document.querySelector('#form-doc-rx').reset();
    openModal('modal-doc-rx');
  });

  document.querySelector('#form-doc-rx')?.addEventListener('submit', e => {
    e.preventDefault();
    const diagnosis = document.querySelector('#doc-rx-diagnosis').value.trim();
    const medicinesText = document.querySelector('#doc-rx-medicines').value.trim();
    const notes = document.querySelector('#doc-rx-notes').value.trim();

    if (!diagnosis || !medicinesText) return;

    if (!Array.isArray(patientRecord.prescriptions)) patientRecord.prescriptions = [];
    const doc = getActiveDoctorProfile();

    const newRx = {
      id: `rx_${Date.now()}`,
      doctorName: doc.name,
      diagnosis,
      date: new Date().toISOString().slice(0, 10),
      medicinesText,
      notes,
      prescribedBy: doc.name
    };

    patientRecord.prescriptions.unshift(newRx);

    logPatientActivity(selectedPatientEmail, {
      icon: '📋',
      title: 'Doctor Issued Prescription',
      detail: diagnosis,
      actor: `${doc.name} (Doctor)`
    });

    savePatientRecord(selectedPatientEmail, patientRecord);
    closeModal('modal-doc-rx');
    loadPatientWorkspace(selectedPatientEmail);
  });

  // ==========================================
  // 5. VIEW / DOWNLOAD PATIENT PDF REPORTS
  // ==========================================

  document.querySelector('#doc-reports-list')?.addEventListener('click', e => {
    const viewBtn = e.target.closest('[data-action="doc-view-pdf"]');
    const dlBtn = e.target.closest('[data-action="doc-download-pdf"]');

    if (viewBtn) {
      const repId = viewBtn.dataset.id;
      const rep = patientRecord.medicalReports.find(r => r.id === repId);
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

    if (dlBtn) {
      const repId = dlBtn.dataset.id;
      const rep = patientRecord.medicalReports.find(r => r.id === repId);
      if (!rep) return;

      const a = document.createElement('a');
      a.href = rep.pdfData;
      a.download = rep.fileName || `${rep.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  });

  // Current Date display dynamically generated from browser date
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

  // Cross-component listeners
  window.addEventListener('medialert:profile-updated', () => {
    renderDoctorHeaderAndSidebar();
  });

  window.addEventListener('medialert:patients-updated', e => {
    const allPatients = getAllPatientAccounts();
    const requestedEmail = e.detail?.email;
    if (requestedEmail && allPatients.some(patient => patient.email.toLowerCase() === requestedEmail.toLowerCase())) {
      loadPatientWorkspace(requestedEmail);
      return;
    }
    const selectedIsStillLinked = allPatients.some(patient => patient.email.toLowerCase() === selectedPatientEmail.toLowerCase());
    loadPatientWorkspace(selectedIsStillLinked ? selectedPatientEmail : allPatients[0]?.email || '');
  });

  window.addEventListener('storage', e => {
    if (e.key !== MEDIALERT_CONFIG.accountsKey) return;
    const allPatients = getAllPatientAccounts();
    const selectedIsStillLinked = allPatients.some(patient =>
      patient.email.toLowerCase() === selectedPatientEmail.toLowerCase()
    );
    renderPatientList(document.querySelector('#patient-search-input')?.value || '');
    loadPatientWorkspace(selectedIsStillLinked ? selectedPatientEmail : allPatients[0]?.email || '');
  });

  // Initial Load
  renderDoctorHeaderAndSidebar();
  renderPatientList();
  loadPatientWorkspace(selectedPatientEmail);
});
