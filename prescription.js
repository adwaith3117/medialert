/**
 * MediAlert - Prescription Controller
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

function readPrescriptions() {
  const { record } = getActivePatientRecord();
  return Array.isArray(record?.prescriptions) ? record.prescriptions : [];
}

function writePrescriptions(prescriptions) {
  const { email, record } = getActivePatientRecord();
  record.prescriptions = prescriptions;
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
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

document.addEventListener('DOMContentLoaded', () => {
  const prescriptionForm = document.querySelector('#prescription-form');
  if (prescriptionForm) {
    const formStatus = document.querySelector('#form-status');
    const fields = {
      doctorName: document.querySelector('#doctor-name'),
      diagnosis: document.querySelector('#diagnosis'),
      prescriptionDate: document.querySelector('#prescription-date'),
      medicinesPrescribed: document.querySelector('#medicines-prescribed'),
      duration: document.querySelector('#duration'),
      notes: document.querySelector('#notes')
    };

    const editingId = new URLSearchParams(window.location.search).get('edit');
    if (editingId) {
      const rx = readPrescriptions().find(item => item.id === editingId);
      if (rx) {
        if (fields.doctorName) fields.doctorName.value = rx.doctorName || '';
        if (fields.diagnosis) fields.diagnosis.value = rx.diagnosis || '';
        if (fields.prescriptionDate) fields.prescriptionDate.value = rx.date || rx.prescriptionDate || '';
        if (fields.medicinesPrescribed) fields.medicinesPrescribed.value = Array.isArray(rx.medicinesPrescribed) ? rx.medicinesPrescribed.join('\n') : rx.medicinesText || rx.medicinesPrescribed || '';
        if (fields.duration) fields.duration.value = rx.duration || '';
        if (fields.notes) fields.notes.value = rx.notes || rx.adviceNotes || '';
      }
    }

    prescriptionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const prescriptions = readPrescriptions();
      const { email, record } = getActivePatientRecord();

      const rxData = {
        id: editingId || `rx_${Date.now()}`,
        doctorName: fields.doctorName?.value.trim() || 'Attending Physician',
        diagnosis: fields.diagnosis?.value.trim() || '',
        date: fields.prescriptionDate?.value || new Date().toISOString().slice(0, 10),
        prescriptionDate: fields.prescriptionDate?.value || new Date().toISOString().slice(0, 10),
        medicinesText: fields.medicinesPrescribed?.value.trim() || '',
        medicinesPrescribed: fields.medicinesPrescribed?.value.trim() || '',
        duration: fields.duration?.value.trim() || '',
        notes: fields.notes?.value.trim() || '',
        prescribedBy: fields.doctorName?.value.trim() || 'Doctor'
      };

      if (editingId) {
        const idx = prescriptions.findIndex(item => item.id === editingId);
        if (idx !== -1) prescriptions[idx] = { ...prescriptions[idx], ...rxData };
      } else {
        prescriptions.unshift(rxData);
        logPatientActivity(email, {
          icon: '📋',
          title: 'Prescription Added',
          detail: rxData.diagnosis,
          actor: 'Patient / Guardian'
        });
      }

      record.prescriptions = prescriptions;
      savePatientRecord(email, record);

      window.setTimeout(() => {
        window.location.href = 'prescriptions.html';
      }, 400);
    });

    document.querySelector('#cancel-button')?.addEventListener('click', () => {
      window.location.href = 'prescriptions.html';
    });
  }

  const prescriptionList = document.querySelector('#prescription-list');
  if (prescriptionList) {
    const search = document.querySelector('#prescription-search');
    const count = document.querySelector('#prescription-count');
    const status = document.querySelector('#list-status');

    const render = (query = '') => {
      const prescriptions = readPrescriptions();
      const normalized = query.trim().toLowerCase();
      const visible = prescriptions.filter((item) =>
        `${item.doctorName || ''} ${item.diagnosis || ''}`.toLowerCase().includes(normalized)
      );

      if (count) {
        count.textContent = `${visible.length} ${visible.length === 1 ? 'prescription' : 'prescriptions'} shown`;
      }

      if (!visible.length) {
        prescriptionList.innerHTML = `
          <div class="directory-empty">
            <span class="directory-empty__mark" aria-hidden="true">📋</span>
            <h2>${normalized ? 'No matching prescriptions' : 'No prescriptions available'}</h2>
            <p>Save digital records of doctor prescriptions here.</p>
            <a href="add-prescription.html">Add or upload a prescription</a>
          </div>
        `;
        return;
      }

      prescriptionList.innerHTML = visible.map(item => {
        const medText = item.medicinesText || (Array.isArray(item.medicinesPrescribed) ? item.medicinesPrescribed.join('\n') : item.medicinesPrescribed) || 'No medicines listed.';
        return `
          <article class="prescription-card">
            <div class="prescription-card__top">
              <span class="prescription-card__icon" aria-hidden="true">Rx</span>
              <div class="prescription-card__title">
                <h2>${escapeHtml(item.doctorName || 'Doctor')}</h2>
                <p>${escapeHtml(item.diagnosis || 'Clinical Diagnosis')}</p>
              </div>
            </div>
            <div class="prescription-card__details">
              <div class="prescription-detail"><span>Date</span><strong>${escapeHtml(formatDate(item.date || item.prescriptionDate))}</strong></div>
              <div class="prescription-detail"><span>Doctor</span><strong>${escapeHtml(item.doctorName || 'Dr. Sarah Lee')}</strong></div>
            </div>
            <p class="medicine-lines">${escapeHtml(medText)}</p>
            ${item.notes ? `<p class="prescription-notes">${escapeHtml(item.notes)}</p>` : ''}
            <div class="prescription-actions">
              <a class="prescription-action prescription-action--edit" href="add-prescription.html?edit=${encodeURIComponent(item.id)}">Edit</a>
              <button class="prescription-action prescription-action--delete" type="button" data-delete-id="${escapeHtml(item.id)}">Delete</button>
            </div>
          </article>
        `;
      }).join('');
    };

    search?.addEventListener('input', (e) => render(e.target.value));

    prescriptionList.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        const id = delBtn.dataset.deleteId;
        const prescriptions = readPrescriptions();
        const rx = prescriptions.find(item => item.id === id);
        if (rx && confirm(`Delete prescription from ${rx.doctorName}?`)) {
          const remaining = prescriptions.filter(item => item.id !== id);
          writePrescriptions(remaining);
          if (status) status.textContent = 'Prescription deleted.';
          render(search?.value || '');
        }
      }
    });

    render();
  }

  document.querySelector('#mobile-menu')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('is-open');
  });
});
