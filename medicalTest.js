/**
 * MediAlert - Medical Tests Controller
 */

class MedicalTest {
  #id;
  #testName;
  #doctorName;
  #dueDate;
  #priority;
  #status;
  #resultNotes;

  constructor({ id, testName, doctorName, dueDate, priority, status, resultNotes }) {
    this.#id = id || `test_${Date.now()}`;
    this.#testName = (testName || '').trim();
    this.#doctorName = (doctorName || '').trim();
    this.#dueDate = dueDate;
    this.#priority = priority || 'Medium';
    this.#status = status || 'Pending';
    this.#resultNotes = (resultNotes || '').trim();
  }

  toJSON() {
    return {
      id: this.#id,
      testName: this.#testName,
      doctorName: this.#doctorName,
      dueDate: this.#dueDate,
      priority: this.#priority,
      status: this.#status,
      isCompleted: this.#status === 'Completed',
      resultNotes: this.#resultNotes
    };
  }
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

function readTests() {
  const { record } = getActivePatientRecord();
  return Array.isArray(record?.medicalTests) ? record.medicalTests : [];
}

function writeTests(tests) {
  const { email, record } = getActivePatientRecord();
  record.medicalTests = tests;
  return savePatientRecord(email, record);
}

function formatDate(value) {
  if (!value) return 'Date not set';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function priorityClass(priority) {
  const normalized = String(priority || '').toLowerCase();
  return normalized === 'high' ? 'test-badge--high' : normalized === 'low' ? 'test-badge--low' : 'test-badge--medium';
}

function renderTestList(query = '') {
  const testList = document.querySelector('#test-list');
  const testCount = document.querySelector('#test-count');
  if (!testList) return;

  const tests = readTests();
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTests = tests.filter((test) => `${test.testName || ''} ${test.doctorName || ''}`.toLowerCase().includes(normalizedQuery));

  if (testCount) {
    testCount.textContent = `${visibleTests.length} ${visibleTests.length === 1 ? 'test' : 'tests'} shown`;
  }

  if (!visibleTests.length) {
    testList.innerHTML = `<div class="directory-empty"><span class="directory-empty__mark">🧪</span><h2>No diagnostic tests found</h2><p>Record medical tests to maintain clinical tracking.</p><a href="add-test.html">Add test</a></div>`;
    return;
  }

  testList.innerHTML = visibleTests.map((test) => {
    const isCompleted = test.isCompleted || test.status === 'Completed';
    return `
      <article class="test-card">
        <div class="test-card__top">
          <span class="test-card__icon">🧪</span>
          <div class="test-card__title">
            <h2 title="${escapeHtml(test.testName)}">${escapeHtml(test.testName)}</h2>
            <p>${escapeHtml(test.doctorName || 'Doctor not set')}</p>
          </div>
        </div>
        <div class="test-badges">
          <span class="test-badge ${priorityClass(test.priority)}">${escapeHtml(test.priority || 'Medium')} Priority</span>
          <span class="test-badge ${isCompleted ? 'test-badge--completed' : 'test-badge--pending'}">${isCompleted ? 'Completed' : 'Pending'}</span>
        </div>
        <div class="test-card__details">
          <div class="test-detail"><span>Due date</span><strong>${escapeHtml(formatDate(test.dueDate))}</strong></div>
          <div class="test-detail"><span>Status</span><strong>${escapeHtml(test.status || 'Pending')}</strong></div>
        </div>
        <div class="test-card__actions">
          <a class="test-action test-action--edit" href="add-test.html?edit=${encodeURIComponent(test.id)}">Edit</a>
          <button class="test-action test-action--delete" type="button" data-delete-id="${escapeHtml(test.id)}">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderTestList();

  const search = document.querySelector('#test-search');
  search?.addEventListener('input', (e) => renderTestList(e.target.value));

  document.querySelector('#test-list')?.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) {
      const id = delBtn.dataset.deleteId;
      const tests = readTests();
      const test = tests.find(t => t.id === id);
      if (!test || !confirm(`Delete test ${test.testName}?`)) return;

      const remaining = tests.filter(t => t.id !== id);
      writeTests(remaining);

      const { email } = getActivePatientRecord();
      logPatientActivity(email, {
        icon: '🧪',
        title: 'Diagnostic Test Removed',
        detail: `${test.testName} removed from checklist`,
        actor: 'Patient / Guardian'
      });

      renderTestList(search?.value || '');
    }
  });

  // Handle add/edit test form if on add-test.html
  const testForm = document.querySelector('#test-form');
  if (testForm) {
    const fields = {
      testName: document.querySelector('#test-name'),
      doctorName: document.querySelector('#doctor-name'),
      dueDate: document.querySelector('#due-date'),
      priority: document.querySelector('#test-priority'),
      status: document.querySelector('#test-status'),
      notes: document.querySelector('#result-notes')
    };

    const editingId = new URLSearchParams(window.location.search).get('edit');
    if (editingId) {
      const test = readTests().find(t => t.id === editingId);
      if (test) {
        if (fields.testName) fields.testName.value = test.testName || '';
        if (fields.doctorName) fields.doctorName.value = test.doctorName || '';
        if (fields.dueDate) fields.dueDate.value = test.dueDate || '';
        if (fields.priority) fields.priority.value = test.priority || 'Medium';
        if (fields.status) fields.status.value = test.status || 'Pending';
        if (fields.notes) fields.notes.value = test.resultNotes || test.notes || '';
      }
    }

    testForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const tests = readTests();
      const { email, record } = getActivePatientRecord();

      const testData = {
        id: editingId || `test_${Date.now()}`,
        testName: fields.testName?.value.trim() || '',
        doctorName: fields.doctorName?.value.trim() || '',
        dueDate: fields.dueDate?.value || '',
        priority: fields.priority?.value || 'Medium',
        status: fields.status?.value || 'Pending',
        isCompleted: fields.status?.value === 'Completed',
        resultNotes: fields.notes?.value.trim() || ''
      };

      if (editingId) {
        const idx = tests.findIndex(t => t.id === editingId);
        if (idx !== -1) tests[idx] = { ...tests[idx], ...testData };
      } else {
        tests.unshift(testData);

        // Also add to Health Calendar
        if (!Array.isArray(record.calendarEvents)) record.calendarEvents = [];
        record.calendarEvents.push({
          id: `evt_${testData.id}`,
          type: 'blood_test',
          title: `Lab Test: ${testData.testName}`,
          date: testData.dueDate,
          doctor: testData.doctorName,
          notes: testData.resultNotes,
          createdByRole: 'patient_guardian',
          createdByName: 'Patient / Guardian',
          createdAt: new Date().toISOString()
        });

        logPatientActivity(email, {
          icon: '🧪',
          title: 'Diagnostic Test Added',
          detail: `${testData.testName} scheduled for ${testData.dueDate}`,
          actor: 'Patient / Guardian'
        });
      }

      record.medicalTests = tests;
      savePatientRecord(email, record);

      window.setTimeout(() => {
        window.location.href = 'tests.html';
      }, 400);
    });
  }
});
