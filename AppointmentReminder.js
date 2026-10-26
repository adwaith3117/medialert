class AppointmentReminder extends Reminder {
  #appointmentId;
  #doctorName;
  #location;

  constructor({ id, scheduledTime, status, appointmentId, doctorName, location } = {}) {
    super({ id, scheduledTime, status });
    this.#appointmentId = appointmentId;
    this.#doctorName = doctorName || 'Doctor visit';
    this.#location = location || '';
  }

  trigger() { return `Appointment reminder: Visit ${this.#doctorName}${this.#location ? ` at ${this.#location}` : ''}.`; }
  snooze(minutes = 5) { this.status = 'Snoozed'; return { reminderId: this.id, minutes }; }
}
