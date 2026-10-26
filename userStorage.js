/**
 * MediAlert - Core Storage, Authentication & Data Service
 * Single Source of Truth for Patient / Guardian & Doctor Accounts
 */

const MEDIALERT_CONFIG = {
  accountsKey: 'medialert_accounts_v3',
  sessionKey: 'medialert_session_v3',
  patientDataPrefix: 'medialert_patient_v3',
  pinAttemptsKey: 'medialert_pin_attempts_v3',
  maxPinAttempts: 5,
  pinLockoutMinutes: 15
};

// Roles
const ROLES = {
  PATIENT_GUARDIAN: 'patient_guardian',
  DOCTOR: 'doctor'
};

// ==========================================
// CRYPTO & HASHING HELPERS
// ==========================================

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function decodeBase64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial,
    256
  );
  return { salt: encodeBase64(salt), hash: encodeBase64(bits) };
}

async function verifyPassword(password, storedHash) {
  if (!storedHash?.salt || !storedHash?.hash) return false;
  try {
    const salt = decodeBase64(storedHash.salt);
    const candidate = await hashPassword(password, salt);
    return candidate.hash === storedHash.hash;
  } catch (e) {
    return false;
  }
}

async function hashPin(pin, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(`PIN_SALT_${pin}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 50000 },
    keyMaterial,
    256
  );
  return { salt: encodeBase64(salt), hash: encodeBase64(bits) };
}

async function verifyPin(pin, storedPinHash) {
  if (!storedPinHash?.salt || !storedPinHash?.hash) return false;
  try {
    const salt = decodeBase64(storedPinHash.salt);
    const candidate = await hashPin(pin, salt);
    return candidate.hash === storedPinHash.hash;
  } catch (e) {
    return false;
  }
}

// ==========================================
// SAMPLE BASE64 PDF GENERATOR
// Produces genuine, viewable & downloadable minimal PDF
// ==========================================

function createSamplePdfBase64(title, subtitle, details) {
  const textContent = `
MediAlert Digital Health Record
-------------------------------------------
Report Title: ${title}
Category: ${subtitle}
Date: ${new Date().toLocaleDateString()}
Status: Verified & Signed
-------------------------------------------
Summary & Clinical Findings:
${details}
-------------------------------------------
This is an authentic digitized document stored securely within the MediAlert healthcare platform.
`;

  // Standard minimal PDF 1.4 stream
  const escapedText = textContent
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .split('\n')
    .filter(line => line.trim())
    .map((line, idx) => `1 0 0 1 50 ${720 - idx * 24} Tm (${line}) Tj`)
    .join('\n');

  const stream = `BT /F1 12 Tf ${escapedText} ET`;
  const streamLength = stream.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${stream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000228 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
385
%%EOF`;

  return 'data:application/pdf;base64,' + btoa(pdf);
}

// ==========================================
// ACCOUNT STORAGE & SEEDING
// ==========================================

function readAccounts() {
  try {
    const raw = localStorage.getItem(MEDIALERT_CONFIG.accountsKey);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(MEDIALERT_CONFIG.accountsKey, JSON.stringify(accounts));
}

function createUniqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function createUniqueAccountId(accounts, role) {
  const prefix = role === ROLES.DOCTOR ? 'doc_' : 'pat_';
  let id;
  do {
    id = `${prefix}${createUniqueToken()}`;
  } while (accounts.some(account => account.id === id));
  return id;
}

function assignPublicAccountId(accounts, account, role) {
  const prefix = role === ROLES.DOCTOR ? 'MED-DR' : 'MED-PT';
  const property = role === ROLES.DOCTOR ? 'doctorAccountId' : 'patientId';
  const currentId = String(account[property] || '').trim();
  const existingIds = new Set(
    accounts
      .filter(candidate => candidate !== account && candidate.role === role)
      .map(candidate => String(candidate[property] || '').trim())
      .filter(Boolean)
  );

  const validPublicId = new RegExp(`^${prefix}-\\d{4}(?:-[A-F0-9]{32})?$`);
  if (validPublicId.test(currentId) && !existingIds.has(currentId)) return;

  const counterKey = `medialert_${role}_id_counter_v1`;
  const storedCounter = Number.parseInt(localStorage.getItem(counterKey) || '0', 10);
  const highestExistingCounter = accounts.reduce((highest, candidate) => {
    if (candidate.role !== role) return highest;
    const match = String(candidate[property] || '').match(new RegExp(`^${prefix}-(\\d+)`));
    return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest;
  }, 0);
  const nextCounter = Math.max(Number.isFinite(storedCounter) ? storedCounter : 0, highestExistingCounter) + 1;
  let publicId;
  const lockSupported = Boolean(globalThis.navigator?.locks?.request);
  do {
    const fallbackSuffix = lockSupported ? '' : `-${createUniqueToken()}`;
    publicId = `${prefix}-${String(nextCounter).padStart(4, '0')}${fallbackSuffix}`;
  } while (existingIds.has(publicId));
  localStorage.setItem(counterKey, String(nextCounter));

  if (currentId && currentId !== publicId) account.legacyAccountId = account.legacyAccountId || currentId;
  account[property] = publicId;
}

async function withAccountWriteLock(callback) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request('medialert-account-write', callback);
  }
  return callback();
}

function ensureAccountIdsAndRelationshipsUnlocked() {
  const accounts = readAccounts();
  const patientAccounts = accounts.filter(account => account.role === ROLES.PATIENT_GUARDIAN);
  const doctorAccounts = accounts.filter(account => account.role === ROLES.DOCTOR);
  const accountIds = new Set();

  [...patientAccounts, ...doctorAccounts].forEach(account => {
    if (!account.id || accountIds.has(account.id)) {
      account.id = createUniqueAccountId(accounts, account.role);
    }
    accountIds.add(account.id);
    assignPublicAccountId(accounts, account, account.role);
  });

  const patientsById = new Map(patientAccounts.map(patient => [patient.id, patient]));
  const patientsByEmail = new Map(patientAccounts.map(patient => [patient.email.toLowerCase(), patient]));
  accounts
    .filter(account => account.role === ROLES.DOCTOR)
    .forEach(doctor => {
      const linkedPatients = new Map();
      (Array.isArray(doctor.patientIds) ? doctor.patientIds : []).forEach(id => {
        const patient = patientsById.get(id);
        if (patient) linkedPatients.set(patient.id, patient);
      });
      (Array.isArray(doctor.patientEmails) ? doctor.patientEmails : []).forEach(email => {
        const patient = patientsByEmail.get(String(email).toLowerCase());
        if (patient) linkedPatients.set(patient.id, patient);
      });
      doctor.patientIds = [...linkedPatients.keys()];
      doctor.patientEmails = [...linkedPatients.values()].map(patient => patient.email.toLowerCase());
    });

  saveAccounts(accounts);
}

async function ensureAccountIdsAndRelationships() {
  return withAccountWriteLock(ensureAccountIdsAndRelationshipsUnlocked);
}

// Initialize pre-seeded Doctor & Patient/Guardian accounts
async function initializePreSeededAccountsUnlocked() {
  const accounts = readAccounts();

  // 1. Doctor: doctor@medialert.com / MediAlert@2026
  let doctorAccount = accounts.find(a => a.email.toLowerCase() === 'doctor@medialert.com');
  if (!doctorAccount) {
    const passwordHash = await hashPassword('MediAlert@2026');
    doctorAccount = {
      id: 'doc_sarah_lee',
      email: 'doctor@medialert.com',
      name: 'Dr. Sarah Lee',
      role: ROLES.DOCTOR,
      specialization: 'Internal Medicine & Cardiology',
      hospitalClinic: 'Metro General Hospital & Heart Center',
      contact: '+1 (555) 234-5678',
      passwordHash,
      createdAt: new Date().toISOString()
    };
    accounts.push(doctorAccount);
  }
  if (!Array.isArray(doctorAccount.patientEmails)) {
    doctorAccount.patientEmails = ['guardian@medialert.com', 'ananya@medialert.com'];
  }

  // 2. Patient / Guardian: guardian@medialert.com / MediAlert@2026
  let guardianAccount = accounts.find(a => a.email.toLowerCase() === 'guardian@medialert.com');
  if (!guardianAccount) {
    const passwordHash = await hashPassword('MediAlert@2026');
    const pinHash = await hashPin('1234');
    guardianAccount = {
      id: 'pat_guardian_demo',
      email: 'guardian@medialert.com',
      name: 'Demo Patient',
      role: ROLES.PATIENT_GUARDIAN,
      passwordHash,
      pinHash,
      pinEnabled: true,
      profile: {
        id: 'pat_guardian_demo',
        name: 'Demo Patient',
        email: 'guardian@medialert.com',
        age: 42,
        gender: 'Male',
        bloodGroup: 'O+',
        emergencyContact: 'Emergency Contact (+1 555-0192)',
        primaryDoctor: 'Dr. Rahul Menon',
        address: '742 Evergreen Terrace, Springfield',
        medicalConditions: 'Hypertension, Mild Asthmatic Allergy',
        allergies: 'Penicillin, Sulfa drugs'
      },
      createdAt: new Date().toISOString()
    };
    accounts.push(guardianAccount);
  }

  // 3. Patient: ananya@medialert.com / MediAlert@2026
  let ananyaAccount = accounts.find(a => a.email.toLowerCase() === 'ananya@medialert.com');
  if (!ananyaAccount) {
    const passwordHash = await hashPassword('MediAlert@2026');
    const pinHash = await hashPin('1234');
    ananyaAccount = {
      id: 'pat_ananya_demo',
      email: 'ananya@medialert.com',
      name: 'Ananya',
      role: ROLES.PATIENT_GUARDIAN,
      passwordHash,
      pinHash,
      pinEnabled: true,
      profile: {
        id: 'pat_ananya_demo',
        name: 'Ananya',
        email: 'ananya@medialert.com',
        age: 28,
        gender: 'Female',
        bloodGroup: 'B+',
        emergencyContact: 'Emergency Contact (+1 555-0192)',
        primaryDoctor: 'Dr. Rahul Menon',
        address: 'MG Road, Bangalore',
        medicalConditions: 'Seasonal Allergies, Hypertension',
        allergies: 'Penicillin'
      },
      createdAt: new Date().toISOString()
    };
    accounts.push(ananyaAccount);
  }

  saveAccounts(accounts);
  ensureAccountIdsAndRelationshipsUnlocked();

  // Initialize Demo Patient Data if empty
  initializeDemoPatientData('guardian@medialert.com');
  initializeDemoPatientData('ananya@medialert.com');
}

async function initializePreSeededAccounts() {
  return withAccountWriteLock(initializePreSeededAccountsUnlocked);
}

// ==========================================
// SHARED PATIENT DATA (SINGLE SOURCE OF TRUTH)
// ==========================================

function getPatientDataKey(patientEmail) {
  return `${MEDIALERT_CONFIG.patientDataPrefix}:${patientEmail.trim().toLowerCase()}`;
}

function getNotificationStateKey(patientEmail = readActiveSession()?.email) {
  const normalizedEmail = String(patientEmail || '').trim().toLowerCase();
  return `medialert_notif_state_v3:${encodeURIComponent(normalizedEmail || 'anonymous')}`;
}

function getPatientRecord(patientEmail) {
  const normalized = (patientEmail || '').trim().toLowerCase();
  if (!normalized) return null;
  const key = getPatientDataKey(normalized);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading patient record:', e);
  }
  return null;
}

function savePatientRecord(patientEmail, data) {
  const normalized = (patientEmail || '').trim().toLowerCase();
  if (!normalized) return false;
  const key = getPatientDataKey(normalized);
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Error saving patient record:', e);
    return false;
  }
}

// Initialize realistic demo data for the shared patient record
function initializeDemoPatientData(patientEmail, profileName = 'Demo Patient') {
  const existing = getPatientRecord(patientEmail);
  if (existing) return;
  const normalizedEmail = (patientEmail || '').trim().toLowerCase();
  if (!['guardian@medialert.com', 'ananya@medialert.com'].includes(normalizedEmail)) {
    initializeEmptyPatientData(normalizedEmail);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const samplePdf1 = createSamplePdfBase64(
    'Complete Blood Count (CBC) & Lipid Profile',
    'Blood Test',
    'Hemoglobin: 14.8 g/dL (Normal)\nWBC Count: 6,800 /mcL (Normal)\nTotal Cholesterol: 188 mg/dL\nHDL: 52 mg/dL | LDL: 110 mg/dL\nTriglycerides: 130 mg/dL\nConclusion: Well managed with current diet and statin regimen.'
  );

  const samplePdf2 = createSamplePdfBase64(
    'Chest X-Ray Digital Diagnostic Scan',
    'Scan / Imaging',
    'Indication: Routine cardiopulmonary check.\nFindings: Lungs are clear without focal consolidation or pneumothorax. Cardiothoracic ratio is normal.\nImpression: Normal cardiopulmonary study.'
  );

  const initialRecord = {
    patientEmail: normalizedEmail,
    profile: {
      name: profileName,
      email: normalizedEmail,
      age: 42,
      gender: 'Male',
      bloodGroup: 'O+',
      emergencyContact: 'Emergency Contact (+1 555-0192)',
      primaryDoctor: 'Dr. Sarah Lee',
      address: '742 Evergreen Terrace, Springfield',
      medicalConditions: 'Hypertension, Mild Asthmatic Allergy',
      allergies: 'Penicillin, Sulfa drugs'
    },
    vitals: [
      { id: 'vit_1', type: 'Blood Pressure', primaryValue: '120', secondaryValue: '80', unit: 'mmHg', statusTag: 'Optimal', recordedAt: new Date(Date.now() - 3600000 * 4).toISOString(), recordedBy: 'Patient / Guardian' },
      { id: 'vit_2', type: 'Blood Sugar', primaryValue: '95', secondaryValue: '', unit: 'mg/dL', statusTag: 'Fasting Normal', recordedAt: new Date(Date.now() - 3600000 * 8).toISOString(), recordedBy: 'Patient / Guardian' },
      { id: 'vit_3', type: 'Heart Rate', primaryValue: '72', secondaryValue: '', unit: 'BPM', statusTag: 'Resting Normal', recordedAt: new Date(Date.now() - 3600000 * 12).toISOString(), recordedBy: 'Patient / Guardian' },
      { id: 'vit_4', type: 'Body Weight', primaryValue: '68.5', secondaryValue: '', unit: 'kg', statusTag: 'Stable', recordedAt: new Date(Date.now() - 86400000 * 2).toISOString(), recordedBy: 'Patient / Guardian' },
      { id: 'vit_5', type: 'Oxygen Level', primaryValue: '99', secondaryValue: '', unit: '%', statusTag: 'Normal SpO2', recordedAt: new Date(Date.now() - 3600000 * 4).toISOString(), recordedBy: 'Patient / Guardian' }
    ],
    medicines: [
      {
        id: 'med_1',
        name: 'Metformin',
        form: 'Tablet',
        dosage: '500 mg',
        frequency: 'Daily',
        scheduledTimes: ['08:00'],
        startDate: '2026-08-01',
        endDate: '2026-12-31',
        instructions: 'Take with morning meal',
        prescribedBy: 'Dr. Sarah Lee',
        createdAt: '2026-08-01T08:00:00Z'
      },
      {
        id: 'med_2',
        name: 'Lisinopril',
        form: 'Tablet',
        dosage: '10 mg',
        frequency: 'Daily',
        scheduledTimes: ['20:00'],
        startDate: '2026-07-15',
        endDate: '2026-12-31',
        instructions: 'Take after dinner with water',
        prescribedBy: 'Dr. Sarah Lee',
        createdAt: '2026-07-15T08:00:00Z'
      },
      {
        id: 'med_3',
        name: 'Atorvastatin',
        form: 'Capsule',
        dosage: '20 mg',
        frequency: 'Daily',
        scheduledTimes: ['21:00'],
        startDate: '2026-08-10',
        endDate: '2026-12-31',
        instructions: 'Take before bedtime',
        prescribedBy: 'Dr. Sarah Lee',
        createdAt: '2026-08-10T08:00:00Z'
      },
      {
        id: 'med_4',
        name: 'Vitamin D3',
        form: 'Softgel',
        dosage: '1000 IU',
        frequency: 'Daily',
        scheduledTimes: ['09:00'],
        startDate: '2026-09-01',
        endDate: '2026-12-31',
        instructions: 'Take with breakfast',
        prescribedBy: 'Dr. Sarah Lee',
        createdAt: '2026-09-01T08:00:00Z'
      }
    ],
    doseLogs: [
      {
        id: 'dose_1',
        medicineId: 'med_1',
        medicineName: 'Metformin 500 mg',
        scheduledDate: today,
        scheduledTime: '08:00',
        status: 'Taken',
        actionTimestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        actionBy: 'Patient / Guardian'
      },
      {
        id: 'dose_4',
        medicineId: 'med_4',
        medicineName: 'Vitamin D3 1000 IU',
        scheduledDate: today,
        scheduledTime: '09:00',
        status: 'Taken',
        actionTimestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        actionBy: 'Patient / Guardian'
      }
    ],
    calendarEvents: [
      {
        id: 'evt_1',
        type: 'doctor_appointment',
        title: 'Cardiology Follow-up with Dr. Sarah Lee',
        date: '2026-10-03',
        time: '10:30',
        location: 'Metro General Hospital · Room 304',
        doctor: 'Dr. Sarah Lee',
        notes: 'Bring latest BP and fasting blood sugar logs.',
        createdByRole: 'doctor',
        createdByName: 'Dr. Sarah Lee',
        createdAt: '2026-09-21T09:00:00Z'
      },
      {
        id: 'evt_2',
        type: 'blood_test',
        title: 'Quarterly Fasting Lipid & Glucose Panel',
        date: '2026-10-07',
        time: '08:00',
        location: 'Metro Diagnostics Laboratory',
        doctor: 'Dr. Sarah Lee',
        notes: '12 hours fasting required prior to blood draw.',
        createdByRole: 'doctor',
        createdByName: 'Dr. Sarah Lee',
        createdAt: '2026-09-22T10:00:00Z'
      },
      {
        id: 'evt_3',
        type: 'vaccination',
        title: 'Seasonal Influenza Booster Dose',
        date: '2026-10-15',
        time: '14:00',
        location: 'Springfield Community Care Clinic',
        doctor: 'Dr. Sarah Lee',
        notes: 'Annual preventative flu vaccination.',
        createdByRole: 'patient_guardian',
        createdByName: 'Patient / Guardian',
        createdAt: '2026-09-24T11:00:00Z'
      },
      {
        id: 'evt_4',
        type: 'health_checkup',
        title: 'Annual Comprehensive Physical Checkup',
        date: '2026-11-05',
        time: '09:30',
        location: 'Metro Wellness Pavilion',
        doctor: 'Dr. Sarah Lee',
        notes: 'Routine full-body vital and biometric evaluation.',
        createdByRole: 'doctor',
        createdByName: 'Dr. Sarah Lee',
        createdAt: '2026-09-25T14:30:00Z'
      }
    ],
    appointments: [
      {
        id: 'apt_1',
        doctorName: 'Dr. Sarah Lee',
        specialization: 'Internal Medicine & Cardiology',
        appointmentDate: '2026-10-03',
        appointmentTime: '10:30',
        location: 'Metro General Hospital · Room 304',
        notes: 'Follow-up on blood pressure regulation and medication tolerance.',
        status: 'Confirmed',
        createdBy: 'Dr. Sarah Lee'
      }
    ],
    medicalTests: [
      {
        id: 'test_1',
        testName: 'Lipid Profile & HbA1c Panel',
        doctorName: 'Dr. Sarah Lee',
        facility: 'Metro Diagnostics Laboratory',
        dueDate: '2026-10-07',
        priority: 'High',
        status: 'Pending',
        isCompleted: false,
        notes: 'Requires 12h fasting.'
      }
    ],
    prescriptions: [
      {
        id: 'rx_1',
        doctorName: 'Dr. Sarah Lee',
        diagnosis: 'Stage 1 Primary Hypertension & Dyslipidemia',
        date: '2026-08-10',
        medicinesText: '1. Lisinopril 10mg — 1 tablet daily at night\n2. Atorvastatin 20mg — 1 capsule daily before bed\n3. Metformin 500mg — 1 tablet with breakfast',
        notes: 'Maintain low-sodium diet and minimum 30 mins aerobic walking.',
        prescribedBy: 'Dr. Sarah Lee'
      }
    ],
    medicalReports: [
      {
        id: 'rep_1',
        name: 'Complete Blood Count (CBC) & Lipid Panel - Sep 2026',
        type: 'Blood Test',
        date: '2026-09-20',
        hospital: 'Metro Diagnostics Laboratory',
        notes: 'All biometric markers within normal physiological limits.',
        pdfData: samplePdf1,
        fileName: 'CBC_Lipid_Panel_Sep2026.pdf',
        fileSize: '42 KB',
        uploadedBy: 'Patient / Guardian',
        uploadedAt: '2026-09-20T11:20:00Z'
      },
      {
        id: 'rep_2',
        name: 'Chest X-Ray Digital Diagnostic Scan',
        type: 'Scan',
        date: '2026-08-15',
        hospital: 'City Hospital Imaging Center',
        notes: 'Clear bilateral lung fields, normal cardiac silhouette.',
        pdfData: samplePdf2,
        fileName: 'Chest_XRay_Aug2026.pdf',
        fileSize: '58 KB',
        uploadedBy: 'Patient / Guardian',
        uploadedAt: '2026-08-15T16:45:00Z'
      }
    ],
    clinicalNotes: [
      {
        id: 'cn_1',
        doctorName: 'Dr. Sarah Lee',
        date: '2026-09-21',
        title: 'Hypertension Clinical Review',
        content: 'Patient demonstrates solid compliance with daily Lisinopril 10mg. Blood pressure readings average 122/82 mmHg over last 3 weeks. Recommended continued aerobic regimen.',
        treatmentPlan: 'Maintain current therapy. Scheduled repeat lipid check on Oct 07, 2026.'
      }
    ],
    recentActivities: [
      {
        id: 'act_1',
        icon: '🩺',
        title: 'Follow-up appointment scheduled',
        detail: 'Scheduled with Dr. Sarah Lee for Oct 03, 2026',
        actor: 'Dr. Sarah Lee (Doctor)',
        timestamp: new Date(Date.now() - 3600000 * 3).toISOString()
      },
      {
        id: 'act_2',
        icon: '📄',
        title: 'Blood test report uploaded',
        detail: 'CBC & Lipid Panel - Sep 2026 uploaded',
        actor: 'Patient / Guardian',
        timestamp: new Date(Date.now() - 86400000 * 1).toISOString()
      },
      {
        id: 'act_3',
        icon: '💊',
        title: 'Medicine marked as Taken',
        detail: 'Metformin 500 mg taken with morning meal',
        actor: 'Patient / Guardian',
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString()
      },
      {
        id: 'act_4',
        icon: '📋',
        title: 'Clinical review note added',
        detail: 'Hypertension evaluation and therapy confirmation',
        actor: 'Dr. Sarah Lee (Doctor)',
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString()
      }
    ]
  };

  savePatientRecord(normalizedEmail, initialRecord);
}

function initializeEmptyPatientData(patientEmail, profile = {}) {
  if (getPatientRecord(patientEmail)) return;

  const normalizedEmail = (patientEmail || '').trim().toLowerCase();
  const account = readAccounts().find(item => item.email.toLowerCase() === normalizedEmail);
  const name = String(profile.name || account?.name || '').trim();
  savePatientRecord(normalizedEmail, {
    patientEmail: normalizedEmail,
    profile: {
      name,
      email: normalizedEmail,
      age: '',
      gender: '',
      bloodGroup: '',
      emergencyContact: '',
      primaryDoctor: '',
      address: '',
      medicalConditions: '',
      allergies: ''
    },
    doctors: [],
    vitals: [],
    medicines: [],
    doseLogs: [],
    calendarEvents: [],
    appointments: [],
    medicalTests: [],
    prescriptions: [],
    medicalReports: [],
    clinicalNotes: [],
    recentActivities: []
  });
}

// ==========================================
// SESSION MANAGEMENT & PIN RATE LIMITING
// ==========================================

function readActiveSession() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(MEDIALERT_CONFIG.sessionKey);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (session?.email && Number(session.expiresAt) > Date.now()) {
        return session;
      }
      storage.removeItem(MEDIALERT_CONFIG.sessionKey);
    } catch (e) {
      storage.removeItem(MEDIALERT_CONFIG.sessionKey);
    }
  }
  return null;
}

function setActiveSession(user, remember = false) {
  const targetStorage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;
  otherStorage.removeItem(MEDIALERT_CONFIG.sessionKey);

  const sessionData = {
    id: user.id,
    email: user.email.toLowerCase(),
    name: user.name,
    role: user.role,
    expiresAt: Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000
  };

  targetStorage.setItem(MEDIALERT_CONFIG.sessionKey, JSON.stringify(sessionData));
}

function clearActiveSession() {
  localStorage.removeItem(MEDIALERT_CONFIG.sessionKey);
  sessionStorage.removeItem(MEDIALERT_CONFIG.sessionKey);
}

function getActiveAccount() {
  const session = readActiveSession();
  if (!session?.email) return null;
  const accounts = readAccounts();
  return accounts.find(a => a.email.toLowerCase() === session.email.toLowerCase()) || null;
}

// PIN Rate Limiting & Lockout
function getPinAttempts() {
  try {
    const raw = localStorage.getItem(MEDIALERT_CONFIG.pinAttemptsKey);
    if (!raw) return { count: 0, lockedUntil: 0 };
    return JSON.parse(raw);
  } catch (e) {
    return { count: 0, lockedUntil: 0 };
  }
}

function recordFailedPinAttempt() {
  const attempts = getPinAttempts();
  attempts.count += 1;
  if (attempts.count >= MEDIALERT_CONFIG.maxPinAttempts) {
    attempts.lockedUntil = Date.now() + MEDIALERT_CONFIG.pinLockoutMinutes * 60 * 1000;
  }
  localStorage.setItem(MEDIALERT_CONFIG.pinAttemptsKey, JSON.stringify(attempts));
  return attempts;
}

function resetPinAttempts() {
  localStorage.removeItem(MEDIALERT_CONFIG.pinAttemptsKey);
}

function isPinLocked() {
  const attempts = getPinAttempts();
  if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
    const remainingMins = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
    return { locked: true, remainingMinutes: remainingMins };
  }
  if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
    resetPinAttempts();
  }
  return { locked: false, remainingMinutes: 0 };
}

// ==========================================
// AUTHENTICATION FLOWS
// ==========================================

// Option 1: Normal Login (Email + Password)
async function authenticateWithPassword(email, password) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const accounts = readAccounts();
  const account = accounts.find(a => a.email.toLowerCase() === normalizedEmail);
  if (!account) return { ok: false, message: 'No account found with this email.' };

  const isMatch = await verifyPassword(password, account.passwordHash);
  if (!isMatch) {
    return { ok: false, message: 'Incorrect email or password.' };
  }

  // If successful patient login, reset any PIN lockout
  resetPinAttempts();
  return { ok: true, account };
}

// Option 2: Quick PIN Login (4-6 digits, Patient/Guardian ONLY)
async function authenticateWithPin(pin) {
  const lockStatus = isPinLocked();
  if (lockStatus.locked) {
    return {
      ok: false,
      message: `Too many failed PIN attempts. PIN login is locked for ${lockStatus.remainingMinutes} minute(s). Please use your email and password.`
    };
  }

  const cleanPin = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(cleanPin)) {
    return { ok: false, message: 'Quick PIN must be 4 to 6 digits.' };
  }

  const accounts = readAccounts();
  // Doctor accounts MUST NOT use Quick PIN. Filter only patient_guardian accounts with PIN enabled
  const candidateAccounts = accounts.filter(a => a.role === ROLES.PATIENT_GUARDIAN && a.pinEnabled && a.pinHash);

  if (!candidateAccounts.length) {
    return { ok: false, message: 'No Quick PIN is configured on any patient account. Please log in with email and password.' };
  }

  for (const account of candidateAccounts) {
    const isMatch = await verifyPin(cleanPin, account.pinHash);
    if (isMatch) {
      resetPinAttempts();
      return { ok: true, account };
    }
  }

  const attemptStatus = recordFailedPinAttempt();
  const remainingTries = MEDIALERT_CONFIG.maxPinAttempts - attemptStatus.count;
  if (remainingTries <= 0) {
    return {
      ok: false,
      message: `Too many failed attempts. Quick PIN is locked for ${MEDIALERT_CONFIG.pinLockoutMinutes} minutes. Please sign in using your password.`
    };
  }
  return {
    ok: false,
    message: `Incorrect Quick PIN. (${remainingTries} attempt${remainingTries === 1 ? '' : 's'} remaining)`
  };
}

// Create new Patient Account (Role is always patient_guardian)
async function registerPatientAccount({ name, email, password, pin = null }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (readAccounts().some(a => a.email.toLowerCase() === normalizedEmail)) {
    return { ok: false, message: 'An account already exists with this email address.' };
  }

  const passwordHash = await hashPassword(password);
  let pinHash = null;
  let pinEnabled = false;

  if (pin && /^\d{4,6}$/.test(pin.trim())) {
    pinHash = await hashPin(pin.trim());
    pinEnabled = true;
  }

  const result = await withAccountWriteLock(() => {
    const accounts = readAccounts();
    if (accounts.some(a => a.email.toLowerCase() === normalizedEmail)) {
      return { ok: false, message: 'An account already exists with this email address.' };
    }
    const accountId = createUniqueAccountId(accounts, ROLES.PATIENT_GUARDIAN);
    const newAccount = {
      id: accountId,
      patientId: '',
      email: normalizedEmail,
      name: name.trim(),
      role: ROLES.PATIENT_GUARDIAN,
      passwordHash,
      pinHash,
      pinEnabled,
      profile: {
        id: accountId,
        name: name.trim(),
        email: normalizedEmail,
        age: '',
        gender: '',
        bloodGroup: '',
        emergencyContact: '',
        primaryDoctor: '',
        address: '',
        medicalConditions: '',
        allergies: ''
      },
      createdAt: new Date().toISOString()
    };
    assignPublicAccountId(accounts, newAccount, ROLES.PATIENT_GUARDIAN);
    newAccount.profile.patientId = newAccount.patientId;
    accounts.push(newAccount);
    saveAccounts(accounts);
    return { ok: true, account: newAccount };
  });

  if (!result.ok) return result;
  // Initialize fresh patient data store
  initializeEmptyPatientData(normalizedEmail, result.account.profile);

  return result;
}

async function registerDoctorAccount({ name, email, password }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (readAccounts().some(a => a.email.toLowerCase() === normalizedEmail)) {
    return { ok: false, message: 'An account already exists with this email address.' };
  }

  const passwordHash = await hashPassword(password);
  return withAccountWriteLock(() => {
    const accounts = readAccounts();
    if (accounts.some(a => a.email.toLowerCase() === normalizedEmail)) {
      return { ok: false, message: 'An account already exists with this email address.' };
    }
    const account = {
      id: createUniqueAccountId(accounts, ROLES.DOCTOR),
      doctorAccountId: '',
      email: normalizedEmail,
      name: name.trim(),
      role: ROLES.DOCTOR,
      patientIds: [],
      patientEmails: [],
      passwordHash,
      createdAt: new Date().toISOString()
    };
    assignPublicAccountId(accounts, account, ROLES.DOCTOR);
    accounts.push(account);
    saveAccounts(accounts);
    return { ok: true, account };
  });
}

// Quick PIN Management in Profile/Settings
async function setAccountPin(email, newPin) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const accounts = readAccounts();
  const index = accounts.findIndex(a => a.email.toLowerCase() === normalizedEmail);
  if (index === -1) return { ok: false, message: 'Account not found.' };

  if (accounts[index].role !== ROLES.PATIENT_GUARDIAN) {
    return { ok: false, message: 'Quick PIN is available only for Patient / Guardian accounts.' };
  }

  if (!/^\d{4,6}$/.test(newPin)) {
    return { ok: false, message: 'PIN must be 4 to 6 digits.' };
  }

  accounts[index].pinHash = await hashPin(newPin);
  accounts[index].pinEnabled = true;
  saveAccounts(accounts);
  return { ok: true, message: 'Quick PIN updated successfully.' };
}

function disableAccountPin(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const accounts = readAccounts();
  const index = accounts.findIndex(a => a.email.toLowerCase() === normalizedEmail);
  if (index === -1) return { ok: false, message: 'Account not found.' };

  accounts[index].pinEnabled = false;
  saveAccounts(accounts);
  return { ok: true, message: 'Quick PIN disabled.' };
}

// ==========================================
// ACTIVITY LOGGING HELPER
// ==========================================

function logPatientActivity(patientEmail, { icon = '🩺', title, detail, actor }) {
  const record = getPatientRecord(patientEmail);
  if (!record) return;

  if (!Array.isArray(record.recentActivities)) {
    record.recentActivities = [];
  }

  record.recentActivities.unshift({
    id: `act_${Date.now()}`,
    icon: icon || '🩺',
    title: title || 'Healthcare update',
    detail: detail || '',
    actor: actor || 'Care Provider',
    timestamp: new Date().toISOString()
  });

  // Keep most recent 25 activities
  if (record.recentActivities.length > 25) {
    record.recentActivities = record.recentActivities.slice(0, 25);
  }

  savePatientRecord(patientEmail, record);
}

// ==========================================
// PATIENT DIRECTORY & DISCOVERY (FOR DOCTOR)
// ==========================================

// ==========================================
// PATIENT DIRECTORY & DISCOVERY (FOR DOCTOR)
// ==========================================

function getDoctorLinkedPatientIds(doctor, accounts) {
  const patientsByEmail = new Map(
    accounts
      .filter(account => account.role === ROLES.PATIENT_GUARDIAN)
      .map(patient => [patient.email.toLowerCase(), patient])
  );
  const linkedIds = new Set(
    (Array.isArray(doctor.patientIds) ? doctor.patientIds : [])
      .filter(id => accounts.some(account => account.role === ROLES.PATIENT_GUARDIAN && account.id === id))
  );
  (Array.isArray(doctor.patientEmails) ? doctor.patientEmails : []).forEach(email => {
    const patient = patientsByEmail.get(String(email).toLowerCase());
    if (patient) linkedIds.add(patient.id);
  });
  return linkedIds;
}

function getConnectedDoctorsForPatient(patientEmail) {
  const normalizedEmail = String(patientEmail || '').trim().toLowerCase();
  if (!normalizedEmail) return [];

  const accounts = readAccounts();
  const patient = accounts.find(account =>
    account.role === ROLES.PATIENT_GUARDIAN &&
    account.email.toLowerCase() === normalizedEmail
  );
  if (!patient) return [];

  return accounts
    .filter(account => account.role === ROLES.DOCTOR && account.id && getDoctorLinkedPatientIds(account, accounts).has(patient.id))
    .map(doctor => ({
      id: doctor.id,
      name: doctor.name || '--',
      email: doctor.email || '--',
      specialization: doctor.specialization || '--',
      qualification: doctor.qualification || '--',
      hospitalClinic: doctor.hospitalClinic || '--',
      phone: doctor.contact || doctor.phone || '--',
      department: doctor.department || '--',
      doctorId: doctor.doctorId || '--',
      doctorAccountId: doctor.doctorAccountId || '--',
      medicalRegistrationNumber: doctor.medicalRegistrationNumber || '--',
      yearsExperience: doctor.yearsExperience || '--',
      professionalBio: doctor.professionalBio || ''
    }));
}

function getAllPatientAccounts() {
  const session = readActiveSession();
  const doctorEmail = session?.role === ROLES.DOCTOR ? session.email : '';
  const accounts = readAccounts();
  const doctor = accounts.find(a =>
    a.role === ROLES.DOCTOR &&
    a.email.toLowerCase() === String(doctorEmail || '').toLowerCase()
  );
  if (!doctor) return [];

  const linkedPatientIds = getDoctorLinkedPatientIds(doctor, accounts);
  return accounts
    .filter(a => a.role === ROLES.PATIENT_GUARDIAN && linkedPatientIds.has(a.id))
    .map(a => {
      const record = getPatientRecord(a.email);
      const prof = record?.profile || {};
      return {
        id: a.id,
        patientId: a.patientId,
        email: a.email,
        name: prof.name || a.name || 'Patient',
        age: prof.age || a.age || 'N/A',
        gender: prof.gender || a.gender || 'N/A',
        phone: prof.phone || a.phone || prof.emergencyContact || 'N/A',
        bloodGroup: prof.bloodGroup || 'N/A',
        address: prof.address || 'N/A',
        emergencyContact: prof.emergencyContact || 'N/A',
        conditions: prof.medicalConditions || 'None recorded',
        allergies: prof.allergies || 'None known',
        lastUpdated: record?.recentActivities?.[0]?.timestamp || a.createdAt || new Date().toISOString()
      };
    });
}

function verifyPatientAccountById(patientId) {
  const session = readActiveSession();
  if (!session || session.role !== ROLES.DOCTOR) {
    return { ok: false, message: 'A doctor must be logged in to verify a patient.' };
  }
  const exactPatientId = String(patientId || '').trim();
  if (!exactPatientId) return { ok: false, message: 'Enter a Patient ID to verify.' };

  const patient = readAccounts().find(account =>
    account.role === ROLES.PATIENT_GUARDIAN &&
    account.patientId === exactPatientId
  );
  if (!patient) return { ok: false, message: 'No patient account was found with that Patient ID.' };

  const doctor = readAccounts().find(account =>
    account.role === ROLES.DOCTOR &&
    account.email.toLowerCase() === session.email.toLowerCase()
  );
  if (!doctor) return { ok: false, message: 'The doctor account could not be found.' };
  return {
    ok: true,
    patient: { id: patient.id, patientId: patient.patientId, name: patient.name || 'Patient' },
    alreadyLinked: getDoctorLinkedPatientIds(doctor, readAccounts()).has(patient.id)
  };
}

async function addPatientAccountByDoctor(data) {
  if (!data || !data.patientId) return { ok: false, message: 'Patient ID is required.' };
  const session = readActiveSession();
  if (!session || session.role !== ROLES.DOCTOR) {
    return { ok: false, message: 'A doctor must be logged in to add a patient.' };
  }

  return withAccountWriteLock(() => {
    const accounts = readAccounts();
    const doctor = accounts.find(a =>
      a.role === ROLES.DOCTOR &&
      a.email.toLowerCase() === session.email.toLowerCase()
    );
    if (!doctor) return { ok: false, message: 'The doctor account could not be found.' };

    const patient = accounts.find(account =>
      account.role === ROLES.PATIENT_GUARDIAN &&
      account.patientId === String(data.patientId).trim()
    );
    if (!patient) return { ok: false, message: 'No patient account was found with that Patient ID.' };
    if (data.expectedPatientAccountId && patient.id !== data.expectedPatientAccountId) {
      return { ok: false, message: 'The verified Patient ID no longer matches this account. Verify it again.' };
    }

    doctor.patientIds = [...getDoctorLinkedPatientIds(doctor, accounts)];
    if (!Array.isArray(doctor.patientEmails)) doctor.patientEmails = [];
    const alreadyLinked = doctor.patientIds.includes(patient.id);
    if (!alreadyLinked) doctor.patientIds.push(patient.id);
    if (!doctor.patientEmails.some(email => String(email).toLowerCase() === patient.email.toLowerCase())) {
      doctor.patientEmails.push(patient.email.toLowerCase());
    }
    saveAccounts(accounts);

    window.dispatchEvent(new CustomEvent('medialert:patients-updated', { detail: { email: patient.email.toLowerCase() } }));
    return { ok: true, patient, alreadyLinked };
  });
}

async function removePatientAccountByDoctor(patientAccountId) {
  const session = readActiveSession();
  if (!patientAccountId || !session || session.role !== ROLES.DOCTOR) return false;
  return withAccountWriteLock(() => {
    const accounts = readAccounts();
    const doctor = accounts.find(a =>
      a.role === ROLES.DOCTOR &&
      a.email.toLowerCase() === session.email.toLowerCase()
    );
    const patient = accounts.find(a =>
      a.role === ROLES.PATIENT_GUARDIAN &&
      a.id === patientAccountId
    );
    if (!doctor || !patient) return false;

    doctor.patientIds = [...getDoctorLinkedPatientIds(doctor, accounts)];
    const previousLength = doctor.patientIds.length;
    doctor.patientIds = doctor.patientIds.filter(id => id !== patient.id);
    if (doctor.patientIds.length === previousLength) return false;
    doctor.patientEmails = (Array.isArray(doctor.patientEmails) ? doctor.patientEmails : [])
      .filter(email => String(email).toLowerCase() !== patient.email.toLowerCase());
    saveAccounts(accounts);

    window.dispatchEvent(new CustomEvent('medialert:patients-updated', { detail: { removedEmail: patient.email.toLowerCase() } }));
    return true;
  });
}

function updateDoctorProfile(docData) {
  if (!docData) return false;
  const session = readActiveSession();
  if (!session || session.role !== ROLES.DOCTOR) return false;

  const email = session.email.toLowerCase();
  const accounts = readAccounts();
  const idx = accounts.findIndex(a => a.email.toLowerCase() === email);
  if (idx === -1) return false;

  const current = accounts[idx];
  const updatedName = String(docData.name ?? current.name ?? '').trim();
  const updatedEmail = String(docData.email ?? current.email ?? '').trim().toLowerCase();
  const updatedSpecialization = String(docData.specialization ?? current.specialization ?? '').trim();
  const updatedQualification = String(docData.qualification ?? current.qualification ?? '').trim();
  const updatedPhone = String(docData.phone ?? docData.contact ?? current.contact ?? current.phone ?? '').trim();
  const updatedHospital = String(docData.hospitalClinic ?? current.hospitalClinic ?? '').trim();
  const updatedDepartment = String(docData.department ?? current.department ?? '').trim();
  if (!updatedName || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(updatedEmail)) return false;
  if (accounts.some((account, accountIndex) => accountIndex !== idx && account.email.toLowerCase() === updatedEmail)) return false;

  accounts[idx] = {
    ...current,
    name: updatedName,
    email: updatedEmail,
    specialization: updatedSpecialization,
    qualification: updatedQualification,
    hospitalClinic: updatedHospital,
    department: updatedDepartment,
    contact: updatedPhone,
    phone: updatedPhone,
    doctorId: String(docData.doctorId ?? current.doctorId ?? '').trim(),
    medicalRegistrationNumber: String(docData.medicalRegistrationNumber ?? current.medicalRegistrationNumber ?? '').trim(),
    yearsExperience: String(docData.yearsExperience ?? current.yearsExperience ?? '').trim(),
    professionalBio: String(docData.professionalBio ?? current.professionalBio ?? '').trim()
  };

  saveAccounts(accounts);

  // Update active session
  session.name = updatedName;
  session.email = updatedEmail;
  session.specialization = updatedSpecialization;
  session.hospitalClinic = accounts[idx].hospitalClinic;
  const remember = localStorage.getItem(MEDIALERT_CONFIG.sessionKey) !== null;
  setActiveSession(session, remember);

  syncActiveUserProfileUI();
  window.dispatchEvent(new CustomEvent('medialert:profile-updated', { detail: accounts[idx] }));
  return true;
}

// Legacy key wrapper for compatibility with older sub-modules
function getUserStorageKey(key) {
  const session = readActiveSession();
  const email = session?.email || 'guardian@medialert.com';
  return `medialert_compat:${encodeURIComponent(email)}:${key}`;
}

// ==========================================
// ACCESS ENFORCEMENT & ROUTING
// ==========================================

function getDashboardUrl(role) {
  if (role === ROLES.DOCTOR) return 'doctor-dashboard.html';
  return 'dashboard.html'; // Patient / Guardian
}

function enforcePageAccess() {
  const path = location.pathname.replace(/\/+$/, '').split('/').pop() || 'index.html';
  const page = path.replace(/\.html$/i, '').toLowerCase();
  const isPublic = ['index', 'signup', 'login'].includes(page);
  const session = readActiveSession();
  const activeAccount = session && readAccounts().find(a => a.email.toLowerCase() === session.email.toLowerCase());
  const validRoles = [ROLES.DOCTOR, ROLES.PATIENT_GUARDIAN];

  if (!activeAccount || !validRoles.includes(session.role) || activeAccount.role !== session.role) {
    clearActiveSession();
    if (!isPublic) {
      location.replace('index.html');
    }
    return;
  }

  // Already logged in, trying to access public login/signup
  if (isPublic) {
    location.replace(getDashboardUrl(activeAccount.role));
    return;
  }

  // Role based screen access protection
  if (activeAccount.role === ROLES.DOCTOR) {
    // Doctor can access doctor-dashboard.html and profile.html
    const isAllowed = page === 'doctor-dashboard' || page === 'profile';
    if (!isAllowed) {
      location.replace('doctor-dashboard.html');
      return;
    }
  } else if (activeAccount.role === ROLES.PATIENT_GUARDIAN) {
    // Patient / Guardian cannot access doctor-dashboard.html
    if (page === 'doctor-dashboard') {
      location.replace('dashboard.html');
      return;
    }
  }

  // Attach global logout button if present
  attachGlobalLogoutHandler();
}

function attachGlobalLogoutHandler() {
  document.querySelectorAll('[data-action="logout"], .logout-link, #logout-button').forEach(el => {
    if (el.dataset.boundLogout) return;
    el.dataset.boundLogout = 'true';
    el.addEventListener('click', e => {
      e.preventDefault();
      clearActiveSession();
      location.replace('index.html');
    });
  });
}

function computeUserInitials(name) {
  if (!name) return '👤';
  const clean = name.trim().replace(/^dr\.?\s+/i, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '👤';
  if (parts.length === 1) {
    return parts[0].length >= 2 ? parts[0].slice(0, 2).toUpperCase() : parts[0][0].toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getSystemFormattedDate(date = new Date()) {
  try {
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (e) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
}

function syncActiveUserProfileUI() {
  const session = readActiveSession();
  if (!session) return;
  const isDoctor = session.role === ROLES.DOCTOR;
  const accounts = readAccounts();
  const currentAccount = accounts.find(a => a.email.toLowerCase() === session.email.toLowerCase());
  const record = !isDoctor ? getPatientRecord(session.email) : null;
  
  const rawName = (!isDoctor ? (record?.profile?.name || currentAccount?.name || session.name) : (currentAccount?.name || session.name)) || 'User';
  const name = rawName.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const initials = computeUserInitials(name);
  const specialization = currentAccount?.specialization || 'Complete your profile';

  // Update name in sidebar and profile headers
  document.querySelectorAll(
    '#sidebar-name, .profile-mini strong, .profile-identity h2, #profile-name-display'
  ).forEach(el => { el.textContent = name; });

  // Update role label cleanly without redundant repetitions
  document.querySelectorAll('#profile-role-display').forEach(el => {
    el.textContent = isDoctor ? 'Doctor / Clinical Care Account' : 'Patient / Guardian Account';
  });

  document.querySelectorAll(
    '#sidebar-role-label, .profile-mini small:not(#sidebar-specialization)'
  ).forEach(el => {
    el.textContent = isDoctor ? 'Doctor' : 'Patient / Guardian';
  });

  // Update doctor specialization if on doctor portal
  if (isDoctor) {
    document.querySelectorAll('#sidebar-specialization').forEach(el => {
      el.textContent = specialization;
    });
    document.querySelectorAll('#doctor-display-badge, #doctor-topbar-title, .doctor-badge-title').forEach(el => {
      el.textContent = `${name} · ${specialization}`;
    });
  }

  // Update ALL avatar initials: sidebar mini, topbar avatar, profile page, etc.
  document.querySelectorAll(
    '#sidebar-avatar, .profile-mini .avatar, #header-avatar, .avatar, .profile-avatar, .profile-avatar-big'
  ).forEach(el => { el.textContent = initials; });

  // Update dynamic date element if present
  document.querySelectorAll('#current-date, .topbar__date[data-date="dynamic"], .js-dynamic-date').forEach(el => {
    el.textContent = getSystemFormattedDate();
  });

  // Update welcome greeting if on patient dashboard
  if (!isDoctor) {
    const welcomeTitle = document.querySelector('#welcome-title');
    if (welcomeTitle) {
      const firstName = name.split(' ')[0] || 'Patient';
      welcomeTitle.innerHTML = `Good morning, ${firstName}<span>.</span>`;
    }
  }
}

function loadNotificationMonitor() {
  const session = readActiveSession();
  if (!session || session.role !== ROLES.PATIENT_GUARDIAN) return;
  if (document.querySelector('script[src*="notificationService.js"]')) return;
  const script = document.createElement('script');
  script.src = 'notificationService.js';
  script.defer = true;
  const parent = document.body || document.head || document.documentElement;
  if (parent) {
    parent.appendChild(script);
  }
}

// Global listener for cross-tab and in-page updates
window.addEventListener('storage', e => {
  if (e.key === MEDIALERT_CONFIG.sessionKey || e.key === MEDIALERT_CONFIG.accountsKey || (e.key && e.key.startsWith(MEDIALERT_CONFIG.patientDataPrefix))) {
    syncActiveUserProfileUI();
  }
});

window.addEventListener('medialert:profile-updated', () => {
  syncActiveUserProfileUI();
});

// Self-initialize accounts before account-dependent page controllers run.
const medialertReady = initializePreSeededAccounts().then(() => {
  enforcePageAccess();
  syncActiveUserProfileUI();
  loadNotificationMonitor();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    syncActiveUserProfileUI();
    loadNotificationMonitor();
  });
} else {
  syncActiveUserProfileUI();
  loadNotificationMonitor();
}
