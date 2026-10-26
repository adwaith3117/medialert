class Person {
  #id;
  #name;
  #contact;
  #email;

  constructor({ id, name, contact = '', email = '' } = {}) {
    if (new.target === Person) throw new TypeError('Person is an abstract class.');
    this.#id = id || `person_${Date.now()}`;
    this.#name = String(name || '').trim();
    this.#contact = String(contact || '').trim();
    this.#email = String(email || '').trim();
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get contact() { return this.#contact; }
  get email() { return this.#email; }
  getDetails() { throw new Error('getDetails() must be implemented by a subclass.'); }
}
