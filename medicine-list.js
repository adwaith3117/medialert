/**
 * MediAlert - Medicine Directory Controller
 * Syncs directly with single-source-of-truth patient record
 */

document.addEventListener('DOMContentLoaded', () => {
  const session = readActiveSession();
  const currentEmail = session?.email?.toLowerCase() || 'guardian@medialert.com';
  let patientRecord = getPatientRecord(currentEmail);

  const medicineList = document.querySelector('#medicine-list');
  const medicineSearch = document.querySelector('#medicine-search');
  const medicineCount = document.querySelector('#medicine-count');
  const listStatus = document.querySelector('#list-status');

  function loadProfileIdentity() {
    const prof = patientRecord?.profile || {};
    const name = prof.name || session?.name || 'Patient';
    const initials = typeof computeUserInitials === 'function' ? computeUserInitials(name) : (name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '👤');
    document.querySelectorAll('.profile-mini strong').forEach(el => el.textContent = name);
    document.querySelectorAll('.profile-mini .avatar, .topbar__actions .avatar').forEach(el => el.textContent = initials);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[character]));
  }

  function formatTime(value) {
    if (!value) return 'Not set';
    const [hours, minutes] = String(value).split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function emptyState(isSearchResult) {
    return `
      <div class="directory-empty">
        <span class="directory-empty__mark" aria-hidden="true">💊</span>
        <h2>${isSearchResult ? 'No matching medicines' : 'No medicines added yet'}</h2>
        <p>${isSearchResult ? 'Try searching for another medicine name.' : 'Add your first medicine to start building your daily regimen.'}</p>
        ${isSearchResult ? '' : '<a href="add-medicine.html">Add your first medicine</a>'}
      </div>
    `;
  }

  function renderMedicines(query = '') {
    patientRecord = getPatientRecord(currentEmail);
    const medicines = patientRecord?.medicines || [];
    const doseLogs = patientRecord?.doseLogs || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const normalizedQuery = query.trim().toLowerCase();
    const visibleMedicines = medicines.filter((medicine) => String(medicine.name || '').toLowerCase().includes(normalizedQuery));

    if (medicineCount) {
      medicineCount.textContent = `${visibleMedicines.length} ${visibleMedicines.length === 1 ? 'medicine' : 'medicines'} shown`;
    }

    if (!visibleMedicines.length) {
      medicineList.innerHTML = emptyState(Boolean(normalizedQuery));
      return;
    }

    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    medicineList.innerHTML = visibleMedicines.map((medicine) => {
      const reminderTime = medicine.reminderTime || medicine.scheduledTimes?.[0];
      const log = doseLogs.find(l => l.medicineId === medicine.id && l.scheduledDate === todayStr);
      let status = log?.status;

      if (!status && reminderTime) {
        const [h, m] = String(reminderTime).split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const medTotalMinutes = h * 60 + m;
          if (currentTotalMinutes >= medTotalMinutes + 5) {
            status = 'Missed';
          }
        }
      }

      const isTaken = status === 'Taken';
      const isMissed = status === 'Missed';

      return `
        <article class="medicine-card">
          <div class="medicine-card__top">
            <span class="medicine-card__icon" aria-hidden="true">💊</span>
            <div class="medicine-card__title">
              <h2 title="${escapeHtml(medicine.name)}">${escapeHtml(medicine.name)}</h2>
              <p>${escapeHtml(medicine.form || 'Tablet')} · ${escapeHtml(medicine.dosage || '')}</p>
            </div>
            <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
              ${isTaken ? `
                <span class="status status--taken" style="font-size:11px;padding:3px 8px;border-radius:6px;background:#d1fae5;color:#065f46;font-weight:700;">✓ Taken Today</span>
              ` : isMissed ? `
                <span class="status status--missed" style="font-size:11px;padding:3px 8px;border-radius:6px;background:#fee2e2;color:#b91c1c;font-weight:700;">⚠️ Missed</span>
                <button class="medicine-action" type="button" data-action="take-dose" data-id="${escapeHtml(medicine.id)}" data-name="${escapeHtml(medicine.name)}" data-time="${escapeHtml(reminderTime || '')}" style="background:#f0ebff;color:#7448ee;border:0;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Mark Taken</button>
              ` : `
                <button class="medicine-action" type="button" data-action="take-dose" data-id="${escapeHtml(medicine.id)}" data-name="${escapeHtml(medicine.name)}" data-time="${escapeHtml(reminderTime || '')}" style="background:#f0ebff;color:#7448ee;border:0;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Mark Taken</button>
              `}
            </div>
          </div>
          <div class="medicine-card__details">
            <div class="medicine-detail"><span>Dosage</span><strong>${escapeHtml(medicine.dosage || 'Not set')}</strong></div>
            <div class="medicine-detail"><span>Frequency</span><strong>${escapeHtml(medicine.frequency || 'Daily')}</strong></div>
            <div class="medicine-detail"><span>Scheduled time</span><strong>${escapeHtml(formatTime(reminderTime))}</strong></div>
            <div class="medicine-detail"><span>Schedule duration</span><strong>${escapeHtml(medicine.startDate || 'Ongoing')} - ${escapeHtml(medicine.endDate || 'Ongoing')}</strong></div>
          </div>
          <div class="medicine-card__actions">
            <a class="medicine-action medicine-action--edit" href="add-medicine.html?edit=${encodeURIComponent(medicine.id)}">Edit</a>
            <button class="medicine-action medicine-action--delete" type="button" data-delete-id="${escapeHtml(medicine.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function handleTakeDose(medId, medName, schedTime) {
    if (window.medialertNotifier && typeof window.medialertNotifier.markMedicineTaken === 'function') {
      window.medialertNotifier.markMedicineTaken(medId, medName, schedTime);
    } else {
      patientRecord = getPatientRecord(currentEmail);
      if (!Array.isArray(patientRecord.doseLogs)) patientRecord.doseLogs = [];
      const todayStr = new Date().toISOString().slice(0, 10);
      patientRecord.doseLogs.push({
        id: `dose_${Date.now()}`,
        medicineId: medId,
        medicineName: medName,
        scheduledDate: todayStr,
        scheduledTime: schedTime,
        status: 'Taken',
        actionTimestamp: new Date().toISOString(),
        actionBy: 'Patient / Guardian'
      });
      savePatientRecord(currentEmail, patientRecord);
      window.dispatchEvent(new CustomEvent('medialert:medicines-updated'));
    }
    renderMedicines(medicineSearch?.value || '');
  }

  function deleteMedicine(id) {
    patientRecord = getPatientRecord(currentEmail);
    const medicines = patientRecord?.medicines || [];
    const medicine = medicines.find((item) => item.id === id);
    if (!medicine || !window.confirm(`Delete ${medicine.name}?`)) return;

    patientRecord.medicines = medicines.filter((item) => item.id !== id);
    savePatientRecord(currentEmail, patientRecord);
    window.dispatchEvent(new CustomEvent('medialert:medicines-updated'));

    logPatientActivity(currentEmail, {
      icon: '💊',
      title: 'Medicine Removed',
      detail: `${medicine.name} removed from regimen`,
      actor: 'Patient / Guardian'
    });

    if (listStatus) listStatus.textContent = `${medicine.name} was removed.`;
    renderMedicines(medicineSearch?.value || '');
  }

  medicineSearch?.addEventListener('input', (event) => renderMedicines(event.target.value));
  medicineList?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-id]');
    if (deleteButton) {
      deleteMedicine(deleteButton.dataset.deleteId);
      return;
    }
    const takeButton = event.target.closest('[data-action="take-dose"]');
    if (takeButton) {
      handleTakeDose(takeButton.dataset.id, takeButton.dataset.name, takeButton.dataset.time);
    }
  });

  window.addEventListener('medialert:medicines-updated', () => {
    loadProfileIdentity();
    renderMedicines(medicineSearch?.value || '');
  });

  document.querySelector('#mobile-menu')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('is-open');
  });

  loadProfileIdentity();
  renderMedicines();

  // Periodic check so Missed tags show automatically as 5-min threshold passes
  setInterval(() => {
    renderMedicines(medicineSearch?.value || '');
  }, 5000);
});
