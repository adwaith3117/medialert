class Patient extends Person {
  #age;
  #gender;
  #bloodGroup;
  #emergencyContact;
  #address;
  #primaryDoctor;
  #medicalConditions;
  #allergies;

  constructor({ id, name, contact = '', email = '', age = '', gender = '', bloodGroup = '', emergencyContact = '', address = '', primaryDoctor = '', medicalConditions = '', allergies = '', ...rest } = {}) {
    super({ id, name, contact, email });
    this.#age = age === '' || age === undefined ? '' : Number(age);
    this.#gender = String(gender || '').trim();
    this.#bloodGroup = String(bloodGroup || '').trim();
    this.#emergencyContact = String(emergencyContact || '').trim();
    this.#address = String(address || '').trim();
    this.#primaryDoctor = String(primaryDoctor || '').trim();
    this.#medicalConditions = String(medicalConditions || '').trim();
    this.#allergies = String(allergies || '').trim();
    this.rest = rest;
  }

  getDetails() { return `${this.name}${this.#age ? `, age ${this.#age}` : ''}${this.#bloodGroup ? `, blood group ${this.#bloodGroup}` : ''}`; }
  toJSON() { return { ...this.rest, id: this.id, name: this.name, contact: this.contact, email: this.email, age: this.#age, gender: this.#gender, bloodGroup: this.#bloodGroup, emergencyContact: this.#emergencyContact, address: this.#address, primaryDoctor: this.#primaryDoctor, medicalConditions: this.#medicalConditions, allergies: this.#allergies }; }
}
