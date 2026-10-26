class Reminder {
  #id;
  #scheduledTime;
  #status;

  constructor({ id, scheduledTime, status = 'Pending' } = {}) {
    if (new.target === Reminder) throw new TypeError('Reminder is an abstract class.');
    this.#id = id || `reminder_${Date.now()}`;
    this.#scheduledTime = scheduledTime;
    this.#status = status;
  }

  get id() { return this.#id; }
  get scheduledTime() { return this.#scheduledTime; }
  get status() { return this.#status; }
  set status(value) { this.#status = value; }
  trigger() { throw new Error('trigger() must be implemented by a subclass.'); }
  dismiss() { this.#status = 'Dismissed'; }
}
