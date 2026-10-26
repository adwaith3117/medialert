class MedicineReminder extends Reminder {
  #medicineId;
  #medicineName;
  #dosage;
  #mealRelation;

  constructor({ id, scheduledTime, status, medicineId, medicineName, dosage, mealRelation } = {}) {
    super({ id, scheduledTime, status });
    this.#medicineId = medicineId;
    this.#medicineName = medicineName || 'Medicine';
    this.#dosage = dosage || 'Dose';
    this.#mealRelation = mealRelation || '';
  }

  trigger() { return `Medicine reminder: Take ${this.#dosage} of ${this.#medicineName}${this.#mealRelation ? ` (${this.#mealRelation})` : ''}.`; }
  snooze(minutes = 5) { this.status = 'Snoozed'; return { reminderId: this.id, minutes }; }
}
