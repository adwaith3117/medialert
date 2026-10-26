class Doctor extends Person {
  #specialization;
  #hospitalClinic;
  #consultationFee;

  constructor({ id, name, contact = '', email = '', specialization = '', hospitalClinic = '', consultationFee = 0 } = {}) {
    super({ id, name, contact, email });
    this.#specialization = String(specialization || '').trim();
    this.#hospitalClinic = String(hospitalClinic || '').trim();
    this.#consultationFee = Number(consultationFee) || 0;
  }

  getDetails() { return `${this.name} - ${this.#specialization}${this.#hospitalClinic ? ` at ${this.#hospitalClinic}` : ''}`; }
  toJSON() { return { id: this.id, name: this.name, contact: this.contact, email: this.email, specialization: this.#specialization, hospitalClinic: this.#hospitalClinic, consultationFee: this.#consultationFee }; }
}
