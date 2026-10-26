/**
 * MediAlert - Health Records & Vitals Controller
 */

function getActivePatientRecord() {
  const session = readActiveSession();
  const currentEmail = session?.email?.toLowerCase() || 'guardian@medialert.com';
  let record = getPatientRecord(currentEmail);
  if (!record) {
    initializeEmptyPatientData(currentEmail);
    record = getPatientRecord(currentEmail);
  }
  return { email: currentEmail, record };
}

function readRecords() {
  const { record } = getActivePatientRecord();
  return Array.isArray(record?.vitals) ? record.vitals : [];
}

function writeRecords(records) {
  const { email, record } = getActivePatientRecord();
  record.vitals = records;
  return savePatientRecord(email, record);
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

function formatDate(value) {
  if (!value) return 'Date not set';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

document.addEventListener('DOMContentLoaded', () => {
  const recordList = document.querySelector('#record-list');
  if (recordList) {
    const search = document.querySelector('#record-search');
    const count = document.querySelector('#record-count');
    const status = document.querySelector('#list-status');

    const render = (dateFilter = '') => {
      const records = readRecords();
      const visible = records.filter(r => {
        if (!dateFilter) return true;
        return (r.recordedAt || r.timestamp || '').startsWith(dateFilter);
      });

      if (count) {
        count.textContent = `${visible.length} ${visible.length === 1 ? 'record' : 'records'} logged`;
      }

      if (!visible.length) {
        recordList.innerHTML = `
          <div class="directory-empty">
            <span class="directory-empty__mark" aria-hidden="true">❤️</span>
            <h2>No health records found</h2>
            <p>Log your vital signs and biometric measurements regularly.</p>
            <a href="add-health-record.html">Add record</a>
          </div>
        `;
        return;
      }

      recordList.innerHTML = visible.map(r => {
        const val = `${r.primaryValue}${r.secondaryValue ? `/${r.secondaryValue}` : ''} ${r.unit || ''}`;
        return `
          <article class="record-card">
            <div class="record-card__top">
              <span class="record-card__icon">❤️</span>
              <div class="record-card__title">
                <h2>${escapeHtml(r.type || r.recordType || 'Health Reading')}</h2>
                <p>${escapeHtml(formatDate(r.recordedAt || r.timestamp))}</p>
              </div>
            </div>
            <div class="record-card__details">
              <div class="record-detail"><span>Measurement</span><strong>${escapeHtml(val)}</strong></div>
              <div class="record-detail"><span>Status / Evaluation</span><strong>${escapeHtml(r.statusTag || 'Logged')}</strong></div>
            </div>
            ${r.notes ? `<p class="record-card__notes">${escapeHtml(r.notes)}</p>` : ''}
            <div class="record-card__actions">
              <button class="record-action record-action--delete" type="button" data-delete-id="${escapeHtml(r.id)}">Delete</button>
            </div>
          </article>
        `;
      }).join('');
    };

    search?.addEventListener('change', (e) => render(e.target.value));

    recordList.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        const id = delBtn.dataset.deleteId;
        const records = readRecords();
        const item = records.find(r => r.id === id);
        if (item && confirm(`Delete ${item.type || 'vital reading'}?`)) {
          const remaining = records.filter(r => r.id !== id);
          writeRecords(remaining);
          if (status) status.textContent = 'Record deleted.';
          render(search?.value || '');
        }
      }
    });

    render();
  }

  // Handle Add Health Record form
  const healthForm = document.querySelector('#health-record-form');
  if (healthForm) {
    const fields = {
      recordDate: document.querySelector('#record-date'),
      bloodPressure: document.querySelector('#blood-pressure'),
      bloodSugar: document.querySelector('#blood-sugar'),
      heartRate: document.querySelector('#heart-rate'),
      weight: document.querySelector('#weight'),
      oxygenLevel: document.querySelector('#oxygen-level'),
      notes: document.querySelector('#record-notes')
    };

    if (fields.recordDate && !fields.recordDate.value) {
      fields.recordDate.value = new Date().toISOString().slice(0, 10);
    }

    healthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const records = readRecords();
      const { email, record } = getActivePatientRecord();
      const now = new Date().toISOString();

      if (fields.bloodPressure?.value.trim()) {
        const [sys, dia] = fields.bloodPressure.value.split('/');
        records.unshift({
          id: `vit_${Date.now()}_bp`,
          type: 'Blood Pressure',
          primaryValue: sys?.trim() || '120',
          secondaryValue: dia?.trim() || '80',
          unit: 'mmHg',
          statusTag: Number(sys) < 120 ? 'Optimal' : 'Elevated',
          notes: fields.notes?.value.trim() || '',
          recordedAt: now,
          recordedBy: 'Patient / Guardian'
        });
      }

      if (fields.bloodSugar?.value.trim()) {
        records.unshift({
          id: `vit_${Date.now()}_sugar`,
          type: 'Blood Sugar',
          primaryValue: fields.bloodSugar.value.trim(),
          secondaryValue: '',
          unit: 'mg/dL',
          statusTag: 'Logged',
          notes: fields.notes?.value.trim() || '',
          recordedAt: now,
          recordedBy: 'Patient / Guardian'
        });
      }

      if (fields.heartRate?.value.trim()) {
        records.unshift({
          id: `vit_${Date.now()}_hr`,
          type: 'Heart Rate',
          primaryValue: fields.heartRate.value.trim(),
          secondaryValue: '',
          unit: 'BPM',
          statusTag: 'Normal',
          notes: fields.notes?.value.trim() || '',
          recordedAt: now,
          recordedBy: 'Patient / Guardian'
        });
      }

      if (fields.weight?.value.trim()) {
        records.unshift({
          id: `vit_${Date.now()}_wt`,
          type: 'Body Weight',
          primaryValue: fields.weight.value.trim(),
          secondaryValue: '',
          unit: 'kg',
          statusTag: 'Logged',
          notes: fields.notes?.value.trim() || '',
          recordedAt: now,
          recordedBy: 'Patient / Guardian'
        });
      }

      if (fields.oxygenLevel?.value.trim()) {
        records.unshift({
          id: `vit_${Date.now()}_spo2`,
          type: 'Oxygen Level',
          primaryValue: fields.oxygenLevel.value.trim(),
          secondaryValue: '',
          unit: '%',
          statusTag: 'Optimal SpO2',
          notes: fields.notes?.value.trim() || '',
          recordedAt: now,
          recordedBy: 'Patient / Guardian'
        });
      }

      logPatientActivity(email, {
        icon: '❤️',
        title: 'Health Vitals Logged',
        detail: 'New vital measurements recorded',
        actor: 'Patient / Guardian'
      });

      record.vitals = records;
      savePatientRecord(email, record);

      window.setTimeout(() => {
        window.location.href = 'health-records.html';
      }, 400);
    });

    document.querySelector('#cancel-button')?.addEventListener('click', () => {
      window.location.href = 'health-records.html';
    });
  }

  document.querySelector('#mobile-menu')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('is-open');
  });
});
