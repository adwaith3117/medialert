/**
 * MediAlert - Centralized Medicine Reminder, Notification & Alarm Engine
 *
 * Automatically triggers:
 * 1. 5-minute advance early reminder (In-App Top-Right Toast + Windows/Browser Notification + Gentle Chime)
 * 2. Exact-time Due Now alert (In-App Top-Right Panel + Windows/Browser Notification + Repeating Audio Alarm)
 * 3. Interactive actions: "Mark Taken", "Remind Me Later" (10m snooze), "Stop Alarm", "Dismiss"
 * 4. Dynamic rescheduling on medicine edits / additions / deletions without page refresh
 * 5. Persistent single source of truth in localStorage (medialert_patient_v3)
 */

(function () {
  'use strict';

  if (window.medialertNotifier) return;

  function MediAlertNotificationEngine() {
    var self = this;

    this.audioCtx = null;
    this.audioUnlocked = false;
    this.alarmIntervalId = null;
    this.alarmTimeoutId = null;
    this.monitorIntervalId = null;
    this.isAlarmPlaying = false;
    this.snoozedReminders = {}; // key -> timestamp ms

    // ==========================================
    // 1. AUDIO SYNTHESIS ENGINE
    // ==========================================

    this.initAudio = function () {
      var unlock = function () {
        try {
          var AudioClass = window.AudioContext || window.webkitAudioContext;
          if (!self.audioCtx && AudioClass) {
            self.audioCtx = new AudioClass();
          }
          if (self.audioCtx && self.audioCtx.state === 'suspended') {
            self.audioCtx.resume().then(function () {
              self.audioUnlocked = true;
            });
          } else if (self.audioCtx && self.audioCtx.state === 'running') {
            self.audioUnlocked = true;
          }
        } catch (e) {}
      };

      ['click', 'keydown', 'touchstart', 'pointerdown', 'focus'].forEach(function (evt) {
        document.addEventListener(evt, unlock, { passive: true });
      });
    };

    this.ensureAudio = function () {
      try {
        var AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!self.audioCtx && AudioClass) {
          self.audioCtx = new AudioClass();
        }
        if (self.audioCtx && self.audioCtx.state === 'suspended') {
          self.audioCtx.resume();
        }
      } catch (e) {}
    };

    /** Soft gentle 2-tone melodic chime for 5-minute advance warning */
    this.playGentleChime = function () {
      try {
        self.ensureAudio();
        if (!self.audioCtx) return;

        var now = self.audioCtx.currentTime;
        var notes = [
          { freq: 523.25, time: 0, dur: 0.25 }, // C5
          { freq: 783.99, time: 0.22, dur: 0.50 } // G5
        ];

        notes.forEach(function (n) {
          var osc = self.audioCtx.createOscillator();
          var gain = self.audioCtx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.time);

          gain.gain.setValueAtTime(0.001, now + n.time);
          gain.gain.linearRampToValueAtTime(0.3, now + n.time + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

          osc.connect(gain);
          gain.connect(self.audioCtx.destination);

          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur);
        });

        self.audioUnlocked = true;
      } catch (err) {}
    };

    /** Plays a single 5-note melodic alarm pulse */
    this.playAlarmPulse = function () {
      try {
        self.ensureAudio();
        if (!self.audioCtx) return;

        var now = self.audioCtx.currentTime;
        // Distinct 5-note medical alarm pulse (E5 -> G#5 -> B5 -> E6 -> B5)
        var notes = [
          { freq: 659.25, time: 0.00, dur: 0.18 },
          { freq: 830.61, time: 0.18, dur: 0.18 },
          { freq: 987.77, time: 0.36, dur: 0.32 },
          { freq: 1318.51, time: 0.65, dur: 0.20 },
          { freq: 987.77, time: 0.85, dur: 0.45 }
        ];

        notes.forEach(function (n) {
          var osc = self.audioCtx.createOscillator();
          var gain = self.audioCtx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.freq, now + n.time);

          gain.gain.setValueAtTime(0.001, now + n.time);
          gain.gain.linearRampToValueAtTime(0.4, now + n.time + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

          osc.connect(gain);
          gain.connect(self.audioCtx.destination);

          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur);
        });

        self.audioUnlocked = true;
      } catch (err) {}
    };

    /** Starts continuous repeating alarm audio loop */
    this.startAlarmSound = function () {
      self.stopAlarmSound();
      self.isAlarmPlaying = true;
      self.playAlarmPulse();

      self.alarmIntervalId = setInterval(function () {
        if (self.isAlarmPlaying) {
          self.playAlarmPulse();
        }
      }, 2800);

      // Auto safety stop after 60s timeout
      self.alarmTimeoutId = setTimeout(function () {
        if (self.isAlarmPlaying) {
          self.stopAlarmSound();
        }
      }, 60000);
    };

    /** Stops repeating alarm sound */
    this.stopAlarmSound = function () {
      self.isAlarmPlaying = false;
      if (self.alarmIntervalId) {
        clearInterval(self.alarmIntervalId);
        self.alarmIntervalId = null;
      }
      if (self.alarmTimeoutId) {
        clearTimeout(self.alarmTimeoutId);
        self.alarmTimeoutId = null;
      }
    };

    // ==========================================
    // 2. WINDOWS / BROWSER NOTIFICATION API
    // ==========================================

    this.requestNotificationPermission = function () {
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          Notification.requestPermission();
        } catch (e) {}
      }
    };

    this.sendBrowserNotification = function (title, body) {
      if (!('Notification' in window)) return false;

      if (Notification.permission === 'default') {
        Notification.requestPermission().then(function (perm) {
          if (perm === 'granted') {
            self.sendBrowserNotification(title, body);
          }
        }).catch(function () {});
        return false;
      }

      if (Notification.permission === 'granted') {
        try {
          var notif = new Notification(title, {
            body: body,
            icon: 'favicon.ico',
            tag: 'medialert-medicine-reminder',
            renotify: true
          });
          notif.onclick = function () {
            window.focus();
            notif.close();
          };
          return true;
        } catch (err) {
          return false;
        }
      }

      return false;
    };

    // ==========================================
    // 3. PERSISTENT OCCURRENCE TRACKING
    // ==========================================

    this.getAlertState = function () {
      try {
        var raw = localStorage.getItem(getNotificationStateKey());
        return raw ? JSON.parse(raw) : { warned5Min: [], alertedDue: [], dismissed: [] };
      } catch (e) {
        return { warned5Min: [], alertedDue: [], dismissed: [] };
      }
    };

    this.saveAlertState = function (state) {
      try {
        if (state.warned5Min.length > 200) state.warned5Min = state.warned5Min.slice(-200);
        if (state.alertedDue.length > 200) state.alertedDue = state.alertedDue.slice(-200);
        if (state.dismissed.length > 200) state.dismissed = state.dismissed.slice(-200);
        localStorage.setItem(getNotificationStateKey(), JSON.stringify(state));
      } catch (e) {}
    };

    this.isTriggered = function (type, key) {
      var state = self.getAlertState();
      if (type === '5min') return (state.warned5Min || []).indexOf(key) !== -1;
      if (type === 'due') return (state.alertedDue || []).indexOf(key) !== -1;
      if (type === 'dismissed') return (state.dismissed || []).indexOf(key) !== -1;
      return false;
    };

    this.markTriggered = function (type, key) {
      var state = self.getAlertState();
      if (!state.warned5Min) state.warned5Min = [];
      if (!state.alertedDue) state.alertedDue = [];
      if (!state.dismissed) state.dismissed = [];

      if (type === '5min' && state.warned5Min.indexOf(key) === -1) state.warned5Min.push(key);
      if (type === 'due' && state.alertedDue.indexOf(key) === -1) state.alertedDue.push(key);
      if (type === 'dismissed' && state.dismissed.indexOf(key) === -1) state.dismissed.push(key);
      self.saveAlertState(state);
    };

    // ==========================================
    // 4. TOP-RIGHT IN-APP NOTIFICATION CONTAINER
    // ==========================================

    this.initDOM = function () {
      if (document.querySelector('#medialert-toast-root')) return;

      var style = document.createElement('style');
      style.textContent = [
        '.medialert-toast-stack { position: fixed; top: 20px; right: 20px; z-index: 9999999; display: flex; flex-direction: column; gap: 12px; max-width: 440px; width: calc(100% - 40px); pointer-events: none; font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
        '.medialert-toast { pointer-events: auto; padding: 18px 20px; border-radius: 16px; background: #ffffff; border: 1px solid #e1daf7; box-shadow: 0 16px 48px rgba(36, 24, 79, 0.32); display: flex; align-items: flex-start; gap: 14px; animation: medSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1); position: relative; }',
        '.medialert-toast--warning { border-left: 6px solid #f39c12; background: #fffdfa; }',
        '.medialert-toast--due { border-left: 6px solid #7448ee; background: #ffffff; box-shadow: 0 20px 50px rgba(116, 72, 238, 0.38), 0 0 0 1px #7448ee33; }',
        '.medialert-toast--missed { border-left: 6px solid #dc2626; background: #fff8f8; box-shadow: 0 20px 50px rgba(220, 38, 38, 0.32), 0 0 0 1px #dc262633; }',
        '.medialert-toast__icon { width: 48px; height: 48px; flex: 0 0 48px; border-radius: 14px; display: grid; place-items: center; font-size: 24px; background: #f0ebff; color: #7448ee; }',
        '.medialert-toast--warning .medialert-toast__icon { background: #fff5e6; color: #d97706; }',
        '.medialert-toast--due .medialert-toast__icon { background: #7448ee; color: #ffffff; animation: medPulse 1.4s infinite ease-in-out; }',
        '.medialert-toast__content { flex: 1; min-width: 0; }',
        '.medialert-toast__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }',
        '.medialert-toast__title { font-size: 15px; font-weight: 800; color: #24184f; margin: 0; }',
        '.medialert-toast__badge { font-size: 11px; font-weight: 700; color: #7448ee; background: #f0ebff; padding: 3px 8px; border-radius: 6px; }',
        '.medialert-toast__msg { font-size: 13px; color: #554877; margin: 4px 0 12px; line-height: 1.45; }',
        '.medialert-toast__med { font-size: 15px; font-weight: 800; color: #24184f; display: block; margin-bottom: 2px; }',
        '.medialert-toast__actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }',
        '.med-btn { padding: 8px 14px; border-radius: 9px; font-size: 12px; font-weight: 700; cursor: pointer; border: 0; transition: all 120ms ease; display: inline-flex; align-items: center; gap: 5px; text-decoration: none; line-height: 1; }',
        '.med-btn:active { transform: scale(0.97); }',
        '.med-btn--primary { background: #7448ee; color: #ffffff; }',
        '.med-btn--primary:hover { background: #5a2fd6; }',
        '.med-btn--secondary { background: #f0ebff; color: #35216f; }',
        '.med-btn--secondary:hover { background: #e2d6ff; }',
        '.med-btn--stop { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }',
        '.med-btn--stop:hover { background: #fecaca; }',
        '.med-close { position: absolute; top: 10px; right: 12px; border: 0; background: transparent; color: #968bab; cursor: pointer; font-size: 18px; padding: 2px 4px; line-height: 1; }',
        '.med-close:hover { color: #24184f; }',
        '@keyframes medSlideIn { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }',
        '@keyframes medPulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }'
      ].join('\n');
      document.head.appendChild(style);

      var stack = document.createElement('div');
      stack.className = 'medialert-toast-stack';
      stack.id = 'medialert-toast-root';
      document.body.appendChild(stack);
    };

    // ==========================================
    // 5. CENTRALIZED REMINDER TRIGGER
    // ==========================================

    this.triggerMedicineReminder = function (medicine, is5MinWarning) {
      var root = document.querySelector('#medialert-toast-root');
      if (!root) self.initDOM();
      root = document.querySelector('#medialert-toast-root');

      var rawTime = medicine.reminderTime || (medicine.scheduledTimes ? medicine.scheduledTimes[0] : '');
      var formattedTime = self.formatTime(rawTime);
      var toastId = 'toast_' + (is5MinWarning ? 'warn_' : 'due_') + medicine.id + '_' + Date.now();
      var toast = document.createElement('div');
      toast.className = 'medialert-toast ' + (is5MinWarning ? 'medialert-toast--warning' : 'medialert-toast--due');
      toast.id = toastId;

      if (is5MinWarning) {
        // 5-MINUTE EARLY REMINDER
        toast.innerHTML = [
          '<button class="med-close" type="button" aria-label="Close">&times;</button>',
          '<div class="medialert-toast__icon">💊</div>',
          '<div class="medialert-toast__content">',
          '  <div class="medialert-toast__header">',
          '    <h3 class="medialert-toast__title">💊 MEDICINE DUE SOON</h3>',
          '    <span class="medialert-toast__badge">Scheduled: ' + formattedTime + '</span>',
          '  </div>',
          '  <div class="medialert-toast__msg">',
          '    <span class="medialert-toast__med">' + self.escape(medicine.name) + ' ' + self.escape(medicine.dosage || '') + '</span>',
          '    Your medicine is due in 5 minutes.',
          '  </div>',
          '  <div class="medialert-toast__actions">',
          '    <a class="med-btn med-btn--primary" href="medicines.html">View Regimen</a>',
          '    <button class="med-btn med-btn--secondary" type="button" id="btn-gotit-' + toastId + '">Got it</button>',
          '  </div>',
          '</div>'
        ].join('\n');

        self.playGentleChime();
        self.sendBrowserNotification(
          '💊 Medicine Due Soon',
          (medicine.name || 'Medicine') + ' ' + (medicine.dosage || '') + ' is due in 5 minutes (Scheduled: ' + formattedTime + ').'
        );
      } else {
        // EXACT-TIME DUE REMINDER
        toast.innerHTML = [
          '<button class="med-close" type="button" aria-label="Close">&times;</button>',
          '<div class="medialert-toast__icon">🔔</div>',
          '<div class="medialert-toast__content">',
          '  <div class="medialert-toast__header">',
          '    <h3 class="medialert-toast__title" style="color:#7448ee;">🔔 MEDICINE DUE NOW</h3>',
          '    <span class="medialert-toast__badge">Scheduled: ' + formattedTime + '</span>',
          '  </div>',
          '  <div class="medialert-toast__msg">',
          '    <span class="medialert-toast__med">' + self.escape(medicine.name) + ' ' + self.escape(medicine.dosage || '') + '</span>',
          '    It is time to take your scheduled medicine.',
          '  </div>',
          '  <div class="medialert-toast__actions">',
          '    <button class="med-btn med-btn--primary" type="button" id="btn-take-' + toastId + '">✓ Mark Taken</button>',
          '    <button class="med-btn med-btn--secondary" type="button" id="btn-snooze-' + toastId + '">⏰ Remind Me Later</button>',
          '    <button class="med-btn med-btn--stop" type="button" id="btn-stop-' + toastId + '">🔕 Stop Alarm</button>',
          '  </div>',
          '</div>'
        ].join('\n');

        self.startAlarmSound();
        self.sendBrowserNotification(
          '🔔 Medicine Due Now',
          (medicine.name || 'Medicine') + ' ' + (medicine.dosage || '') + ' - It is time to take your scheduled medicine.'
        );
      }

      root.appendChild(toast);

      var missedTimeoutId = null;

      var closeToast = function () {
        if (missedTimeoutId) clearTimeout(missedTimeoutId);
        if (!is5MinWarning) self.stopAlarmSound();
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 200ms ease';
        setTimeout(function () { toast.remove(); }, 200);
      };

      toast.querySelector('.med-close')?.addEventListener('click', function () {
        if (missedTimeoutId) clearTimeout(missedTimeoutId);
        if (!is5MinWarning) {
          self.markTriggered('dismissed', medicine.id + '_' + formattedTime);
        }
        closeToast();
      });

      toast.querySelector('#btn-gotit-' + toastId)?.addEventListener('click', closeToast);

      toast.querySelector('#btn-take-' + toastId)?.addEventListener('click', function () {
        if (missedTimeoutId) clearTimeout(missedTimeoutId);
        self.markMedicineTaken(medicine.id, medicine.name, formattedTime);
        closeToast();
      });

      toast.querySelector('#btn-snooze-' + toastId)?.addEventListener('click', function () {
        if (missedTimeoutId) clearTimeout(missedTimeoutId);
        self.snoozeReminder(medicine, 10);
        closeToast();
      });

      toast.querySelector('#btn-stop-' + toastId)?.addEventListener('click', function (e) {
        self.stopAlarmSound();
        e.target.style.display = 'none';
      });

      if (is5MinWarning) {
        setTimeout(function () {
          if (document.querySelector('#' + toastId)) closeToast();
        }, 25000);
      } else {
        // IF NOT MARKED AS TAKEN WITHIN 5 MINUTES AFTER ALARM -> SHOW MISSED
        missedTimeoutId = setTimeout(function () {
          if (document.querySelector('#' + toastId)) {
            self.stopAlarmSound();
            self.markMedicineMissed(medicine.id, medicine.name, formattedTime, 'Not taken within 5 mins');
            toast.className = 'medialert-toast medialert-toast--missed';
            toast.innerHTML = [
              '<button class="med-close" type="button" aria-label="Close">&times;</button>',
              '<div class="medialert-toast__icon" style="background:#fee2e2;color:#dc2626;">⚠️</div>',
              '<div class="medialert-toast__content">',
              '  <div class="medialert-toast__header">',
              '    <h3 class="medialert-toast__title" style="color:#dc2626;">⚠️ MEDICINE MISSED</h3>',
              '    <span class="medialert-toast__badge" style="background:#fee2e2;color:#dc2626;">Scheduled: ' + formattedTime + '</span>',
              '  </div>',
              '  <div class="medialert-toast__msg">',
              '    <span class="medialert-toast__med">' + self.escape(medicine.name) + ' ' + self.escape(medicine.dosage || '') + '</span>',
              '    Dose was not marked as taken within 5 minutes of alarm.',
              '  </div>',
              '  <div class="medialert-toast__actions">',
              '    <button class="med-btn med-btn--primary" type="button" id="btn-take-late-' + toastId + '">Mark Taken Late</button>',
              '    <button class="med-btn med-btn--secondary" type="button" id="btn-dismiss-missed-' + toastId + '">Dismiss</button>',
              '  </div>',
              '</div>'
            ].join('\n');
            toast.querySelector('.med-close')?.addEventListener('click', closeToast);
            toast.querySelector('#btn-dismiss-missed-' + toastId)?.addEventListener('click', closeToast);
            toast.querySelector('#btn-take-late-' + toastId)?.addEventListener('click', function () {
              self.markMedicineTaken(medicine.id, medicine.name, formattedTime);
              closeToast();
            });
            setTimeout(function () {
              if (document.querySelector('#' + toastId)) closeToast();
            }, 15000);
          }
        }, 5 * 60 * 1000); // 5 minutes
      }
    };

    // ==========================================
    // 6. SNOOZE, MARK TAKEN & MARK MISSED
    // ==========================================

    this.snoozeReminder = function (medicine, minutes) {
      minutes = minutes || 10;
      var fireTime = Date.now() + (minutes * 60 * 1000);
      self.snoozedReminders[medicine.id] = fireTime;

      var root = document.querySelector('#medialert-toast-root');
      if (root) {
        var toastId = 'toast_snooze_' + Date.now();
        var toast = document.createElement('div');
        toast.className = 'medialert-toast';
        toast.id = toastId;
        toast.innerHTML = [
          '<button class="med-close" type="button" onclick="document.querySelector(\'#' + toastId + '\')?.remove()">&times;</button>',
          '<div class="medialert-toast__icon">⏰</div>',
          '<div class="medialert-toast__content">',
          '  <h3 class="medialert-toast__title">Reminder Snoozed</h3>',
          '  <div class="medialert-toast__msg">' + self.escape(medicine.name) + ' snoozed. You will be alerted again in ' + minutes + ' minutes.</div>',
          '</div>'
        ].join('\n');
        root.appendChild(toast);
        setTimeout(function () { if (document.querySelector('#' + toastId)) toast.remove(); }, 6000);
      }
    };

    this.markMedicineTaken = function (medicineId, medicineName, scheduledTime) {
      var session = typeof readActiveSession === 'function' ? readActiveSession() : null;
      var email = (session?.email || 'guardian@medialert.com').toLowerCase();
      var record = self.getActivePatientRecord();
      if (!record) return;

      var todayStr = self.getLocalDateString(new Date());
      if (!Array.isArray(record.doseLogs)) record.doseLogs = [];

      var existingIdx = -1;
      for (var i = 0; i < record.doseLogs.length; i++) {
        if (record.doseLogs[i].medicineId === medicineId && record.doseLogs[i].scheduledDate === todayStr) {
          existingIdx = i;
          break;
        }
      }

      if (existingIdx !== -1) {
        record.doseLogs[existingIdx].status = 'Taken';
        record.doseLogs[existingIdx].actionTimestamp = new Date().toISOString();
      } else {
        record.doseLogs.push({
          id: 'dose_' + Date.now(),
          medicineId: medicineId,
          medicineName: medicineName,
          scheduledDate: todayStr,
          scheduledTime: scheduledTime,
          status: 'Taken',
          actionTimestamp: new Date().toISOString(),
          actionBy: 'Patient / Guardian'
        });
      }

      var userName = record?.profile?.name || session?.name || 'Patient';
      var currentTimeFormatted = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      if (typeof logPatientActivity === 'function') {
        logPatientActivity(email, {
          icon: '💊',
          title: 'Medicine Marked as Taken',
          detail: medicineName + ' marked as taken by ' + userName + ' at ' + currentTimeFormatted,
          actor: 'Patient / Guardian'
        });
      }

      if (typeof savePatientRecord === 'function') {
        savePatientRecord(email, record);
      }

      window.dispatchEvent(new CustomEvent('medialert:medicines-updated'));
      window.dispatchEvent(new CustomEvent('medialert:patient-updated'));
    };

    this.markMedicineMissed = function (medicineId, medicineName, scheduledTime, reason) {
      var session = typeof readActiveSession === 'function' ? readActiveSession() : null;
      var email = (session?.email || 'guardian@medialert.com').toLowerCase();
      var record = self.getActivePatientRecord();
      if (!record) return;

      var todayStr = self.getLocalDateString(new Date());
      if (!Array.isArray(record.doseLogs)) record.doseLogs = [];

      var existingIdx = -1;
      for (var i = 0; i < record.doseLogs.length; i++) {
        if (record.doseLogs[i].medicineId === medicineId && record.doseLogs[i].scheduledDate === todayStr) {
          existingIdx = i;
          break;
        }
      }

      // Do not overwrite if already taken
      if (existingIdx !== -1 && record.doseLogs[existingIdx].status === 'Taken') return;

      if (existingIdx !== -1) {
        if (record.doseLogs[existingIdx].status === 'Missed') return; // already marked missed
        record.doseLogs[existingIdx].status = 'Missed';
        record.doseLogs[existingIdx].actionTimestamp = new Date().toISOString();
      } else {
        record.doseLogs.push({
          id: 'dose_miss_' + Date.now(),
          medicineId: medicineId,
          medicineName: medicineName,
          scheduledDate: todayStr,
          scheduledTime: scheduledTime,
          status: 'Missed',
          actionTimestamp: new Date().toISOString(),
          actionBy: reason || 'System (Not taken within 5 mins)'
        });
      }

      var currentTimeFormatted = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      if (typeof logPatientActivity === 'function') {
        logPatientActivity(email, {
          icon: '⚠️',
          title: 'Medicine Dose Missed',
          detail: medicineName + ' was not taken within 5 minutes of scheduled time (' + (scheduledTime || currentTimeFormatted) + ')',
          actor: 'System Auto-Tracker'
        });
      }

      if (typeof savePatientRecord === 'function') {
        savePatientRecord(email, record);
      }

      window.dispatchEvent(new CustomEvent('medialert:medicines-updated'));
      window.dispatchEvent(new CustomEvent('medialert:patient-updated'));
    };

    // ==========================================
    // 7. TIME CONVERSIONS & MONITORING
    // ==========================================

    this.getActivePatientRecord = function () {
      var session = typeof readActiveSession === 'function' ? readActiveSession() : null;
      var email = (session?.email || 'guardian@medialert.com').toLowerCase();
      var record = typeof getPatientRecord === 'function' ? getPatientRecord(email) : null;
      if (!record && typeof initializeDemoPatientData === 'function') {
        initializeEmptyPatientData(email);
        record = getPatientRecord(email);
      }
      return record;
    };

    this.getLocalDateString = function (dateObj) {
      var year = dateObj.getFullYear();
      var month = String(dateObj.getMonth() + 1).padStart(2, '0');
      var day = String(dateObj.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    };

    this.parseTimeToMinutes = function (timeStr) {
      if (!timeStr) return null;
      var clean = String(timeStr).trim();
      var isPM = /pm/i.test(clean);
      var isAM = /am/i.test(clean);
      clean = clean.replace(/[^\d:]/g, '');
      var parts = clean.split(':').map(Number);
      if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
      var h = parts[0];
      var m = parts[1];
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return { hours: h, minutes: m, totalMinutes: h * 60 + m };
    };

    this.formatTime = function (val) {
      if (!val) return '';
      var parsed = self.parseTimeToMinutes(val);
      if (!parsed) return val;
      var d = new Date(2000, 0, 1, parsed.hours, parsed.minutes);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    this.escape = function (val) {
      return String(val || '').replace(/[&<>'"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
      });
    };

    this.startMonitoring = function () {
      if (self.monitorIntervalId) clearInterval(self.monitorIntervalId);
      // Check every 1 second for razor-sharp precision
      self.monitorIntervalId = setInterval(function () {
        self.checkSchedule();
      }, 1000);
      setTimeout(function () { self.checkSchedule(); }, 200);
    };

    this.checkSchedule = function () {
      var record = self.getActivePatientRecord();
      if (!record || !Array.isArray(record.medicines)) return;

      var now = new Date();
      var todayDateStr = self.getLocalDateString(now);
      var currentTotalMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
      var doseLogs = record.doseLogs || [];

      record.medicines.forEach(function (med) {
        if (med.startDate && med.startDate > todayDateStr) return;
        if (med.endDate && med.endDate < todayDateStr) return;

        var scheduledTimes = med.scheduledTimes || (med.reminderTime ? [med.reminderTime] : []);

        scheduledTimes.forEach(function (timeRaw) {
          if (!timeRaw) return;
          var parsed = self.parseTimeToMinutes(timeRaw);
          if (!parsed) return;

          var timeKey = String(parsed.hours).padStart(2, '0') + ':' + String(parsed.minutes).padStart(2, '0');
          var formattedDisplayTime = self.formatTime(parsed.hours + ':' + parsed.minutes);

          // Check if dose taken today
          var isTaken = false;
          for (var i = 0; i < doseLogs.length; i++) {
            if (doseLogs[i].medicineId === med.id && doseLogs[i].scheduledDate === todayDateStr && doseLogs[i].status === 'Taken') {
              isTaken = true;
              break;
            }
          }
          if (isTaken) return;

          var diffMinutes = parsed.totalMinutes - currentTotalMinutes; // >0 future, <0 past
          var key5Min = med.id + '_' + todayDateStr + '_' + timeKey + '_5min';
          var keyDue = med.id + '_' + todayDateStr + '_' + timeKey + '_due';

          // A. SNOOZE CHECK
          if (self.snoozedReminders[med.id]) {
            if (Date.now() >= self.snoozedReminders[med.id]) {
              delete self.snoozedReminders[med.id];
              self.triggerMedicineReminder(med, false);
              return;
            }
          }

          // B. 5-MINUTE ADVANCE WARNING (Between 0.8 and 5.2 minutes before scheduled time)
          if (diffMinutes > 0.8 && diffMinutes <= 5.2 && !self.isTriggered('5min', key5Min)) {
            self.markTriggered('5min', key5Min);
            self.triggerMedicineReminder(med, true);
          }

          // C. EXACT-TIME DUE REMINDER (Between 0.8 min before and 5 min past scheduled time)
          if (diffMinutes <= 0.8 && diffMinutes >= -5 && !self.isTriggered('due', keyDue) && !self.isTriggered('dismissed', med.id + '_' + formattedDisplayTime)) {
            self.markTriggered('due', keyDue);
            self.triggerMedicineReminder(med, false);
          }

          // D. 5-MINUTE ELAPSED AUTO-MISSED RECORDING
          // If more than 5 minutes have elapsed since alarm time and dose is not taken:
          if (diffMinutes < -5) {
            var isLogged = false;
            for (var d = 0; d < doseLogs.length; d++) {
              if (doseLogs[d].medicineId === med.id && doseLogs[d].scheduledDate === todayDateStr) {
                isLogged = true;
                break;
              }
            }
            if (!isLogged) {
              self.markMedicineMissed(med.id, med.name, formattedDisplayTime, 'Not taken within 5 mins');
            }
          }
        });
      });

      self.updateBellBadge(record.medicines, doseLogs, todayDateStr, currentTotalMinutes);
    };

    // ==========================================
    // 8. NOTIFICATION BELL & DROPDOWN PANEL
    // ==========================================

    this.updateBellBadge = function (medicines, doseLogs, todayDateStr, currentTotalMinutes) {
      var badge = document.getElementById('notification-count');
      if (!badge) return;

      var pending = 0;
      medicines.forEach(function (med) {
        if (med.startDate && med.startDate > todayDateStr) return;
        if (med.endDate && med.endDate < todayDateStr) return;

        var isTaken = false;
        for (var i = 0; i < doseLogs.length; i++) {
          if (doseLogs[i].medicineId === med.id && doseLogs[i].scheduledDate === todayDateStr && doseLogs[i].status === 'Taken') {
            isTaken = true;
            break;
          }
        }
        if (isTaken) return;

        var times = med.scheduledTimes || (med.reminderTime ? [med.reminderTime] : []);
        times.forEach(function (t) {
          var parsed = self.parseTimeToMinutes(t);
          if (!parsed) return;
          var diff = parsed.totalMinutes - currentTotalMinutes;
          if (diff <= 60 && diff >= -30) pending++;
        });
      });

      if (pending > 0) {
        badge.textContent = pending > 9 ? '9+' : String(pending);
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    };

    this.bindNotificationBell = function () {
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('#notification-button');
        if (!btn) return;
        e.stopPropagation();
        self.toggleNotificationDropdown(btn);
      });
    };

    this.toggleNotificationDropdown = function (buttonEl) {
      var panel = document.querySelector('#medialert-universal-notif-panel');
      if (panel) {
        panel.remove();
        return;
      }

      var record = self.getActivePatientRecord();
      var medicines = record?.medicines || [];
      var doseLogs = record?.doseLogs || [];
      var todayStr = self.getLocalDateString(new Date());
      var now = new Date();
      var currentMinutes = now.getHours() * 60 + now.getMinutes();

      var items = [];
      medicines.forEach(function (med) {
        if (med.startDate && med.startDate > todayStr) return;
        if (med.endDate && med.endDate < todayStr) return;

        var isTaken = false;
        for (var i = 0; i < doseLogs.length; i++) {
          if (doseLogs[i].medicineId === med.id && doseLogs[i].scheduledDate === todayStr && doseLogs[i].status === 'Taken') {
            isTaken = true;
            break;
          }
        }

        var times = med.scheduledTimes || (med.reminderTime ? [med.reminderTime] : []);
        times.forEach(function (t) {
          var parsed = self.parseTimeToMinutes(t);
          var formatted = self.formatTime(t);
          if (isTaken) {
            items.push({
              icon: '✅',
              title: med.name + ' ' + (med.dosage || ''),
              desc: 'Taken today (' + formatted + ')',
              link: 'medicines.html',
              status: 'taken'
            });
          } else {
            var diff = parsed ? parsed.totalMinutes - currentMinutes : 0;
            var statusText = 'Scheduled for ' + formatted;
            if (diff < -5) statusText = 'Overdue (' + formatted + ')';
            else if (diff <= 5 && diff >= -5) statusText = 'Due Now (' + formatted + ')';
            else if (diff <= 60) statusText = 'Due in ' + Math.round(diff) + ' min (' + formatted + ')';

            items.push({
              icon: '💊',
              title: med.name + ' ' + (med.dosage || ''),
              desc: statusText,
              link: 'medicines.html',
              status: diff < -5 ? 'overdue' : (diff <= 5 ? 'due' : 'upcoming')
            });
          }
        });
      });

      var rect = buttonEl.getBoundingClientRect();
      panel = document.createElement('div');
      panel.id = 'medialert-universal-notif-panel';
      panel.style.cssText = [
        'position: fixed;',
        'top: ' + (rect.bottom + 10) + 'px;',
        'right: ' + Math.max(16, window.innerWidth - rect.right) + 'px;',
        'width: 360px;',
        'max-width: calc(100vw - 32px);',
        'max-height: 480px;',
        'background: #ffffff;',
        'border: 1px solid #e1daf7;',
        'border-radius: 16px;',
        'box-shadow: 0 16px 40px rgba(36, 24, 79, 0.22);',
        'z-index: 100000;',
        'display: flex;',
        'flex-direction: column;',
        'font-family: "DM Sans", sans-serif;',
        'overflow: hidden;'
      ].join(' ');

      panel.innerHTML = [
        '<div style="padding: 14px 18px; border-bottom: 1px solid #f0ebff; display: flex; align-items: center; justify-content: space-between; background: #faf8ff;">',
        '  <div>',
        '    <strong style="font-size: 14px; color: #24184f;">Notifications</strong>',
        '    <small style="display: block; color: #6e638d; font-size: 11px;">' + items.length + ' schedule items</small>',
        '  </div>',
        '  <a href="medicines.html" style="color: #7448ee; font-size: 11px; font-weight: 700; text-decoration: none;">View Regimen &gt;</a>',
        '</div>',
        '<div style="flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">',
        items.length === 0 ? '<div style="padding: 36px 12px; text-align: center; color: #6e638d;"><div style="font-size: 28px; margin-bottom: 6px;">✨</div><strong style="font-size: 13px; color: #24184f; display: block;">No Reminders Scheduled</strong></div>' :
        items.map(function (n) {
          return [
            '<a href="' + n.link + '" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px; text-decoration: none; background: #fdfcff; border: 1px solid #f2edf9;">',
            '  <span style="font-size: 18px; line-height: 1; margin-top: 2px;">' + n.icon + '</span>',
            '  <div style="flex: 1; min-width: 0;">',
            '    <strong style="display: block; font-size: 12px; color: #24184f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + self.escape(n.title) + '</strong>',
            '    <span style="display: block; font-size: 11px; color: ' + (n.status === 'due' ? '#7448ee' : (n.status === 'overdue' ? '#dc2626' : '#6e638d')) + '; margin-top: 2px; font-weight: ' + (n.status === 'due' || n.status === 'overdue' ? '700' : '400') + ';">' + self.escape(n.desc) + '</span>',
            '  </div>',
            '</a>'
          ].join('\n');
        }).join(''),
        '</div>'
      ].join('\n');

      document.body.appendChild(panel);

      var closeListener = function (e) {
        if (!panel.contains(e.target) && !buttonEl.contains(e.target)) {
          panel.remove();
          document.removeEventListener('click', closeListener);
        }
      };
      setTimeout(function () { document.addEventListener('click', closeListener); }, 10);
    };

    // ==========================================
    // 9. EVENTS & VISIBILITY LISTENERS
    // ==========================================

    this.bindEvents = function () {
      window.addEventListener('storage', function (e) {
        if (e.key && (e.key.indexOf('medialert_patient_v3') !== -1 || e.key.indexOf('medialert_notif_state_v3:') === 0)) {
          self.checkSchedule();
        }
      });

      window.addEventListener('medialert:medicines-updated', function () {
        self.checkSchedule();
      });

      window.addEventListener('medialert:patient-updated', function () {
        self.checkSchedule();
      });

      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          self.checkSchedule();
        }
      });
    };

    this.init = function () {
      self.initAudio();
      self.requestNotificationPermission();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          self.initDOM();
          self.bindEvents();
          self.bindNotificationBell();
          self.startMonitoring();
        });
      } else {
        self.initDOM();
        self.bindEvents();
        self.bindNotificationBell();
        self.startMonitoring();
      }
    };
  }

  // Create singleton instance globally
  window.medialertNotifier = new MediAlertNotificationEngine();
  window.medialertNotifier.init();
})();
