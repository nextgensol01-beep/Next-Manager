const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Isolated model doubles: no application database or real credentials are used.
const root = path.resolve(__dirname, '..');
let db = {};
let nextId = 1;
let failContactWrite = false;
let transactions = 0;
const copy = value => structuredClone(value);
const matches = (record, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(item => matches(record, item));
  const actual = record[key];
  if (value && typeof value === 'object') {
    if ('$in' in value) return (Array.isArray(actual) ? actual : [actual]).some(item => value.$in.includes(item));
    if ('$regex' in value) return new RegExp(value.$regex, value.$options).test(actual);
    if ('$ne' in value) return actual !== value.$ne;
  }
  return actual === value;
});
function model(name) {
  const rows = () => db[name] ||= [];
  const document = row => row == null ? null : Object.assign(copy(row), {
    toObject() { const { save, toObject, ...data } = this; return copy(data); },
    async save() { Object.assign(rows().find(item => item._id === this._id), this.toObject()); return this; },
  });
  function query(run) {
    let lean = false;
    return {
      select() { return this; }, sort() { return this; }, limit() { return this; },
      lean() { lean = true; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        const result = run();
        if (lean) return copy(result);
        return Array.isArray(result) ? result.map(document) : document(result);
      }).then(resolve, reject); },
    };
  }
  return {
    find: (filter = {}) => query(() => rows().filter(row => matches(row, filter))),
    findOne: filter => query(() => rows().find(row => matches(row, filter)) || null),
    findById: id => query(() => rows().find(row => row._id === id) || null),
    async create(input) {
      const row = { _id: `${name}-${nextId++}`, ...copy(input) };
      rows().push(row);
      return document(row);
    },
    async deleteMany(filter) { db[name] = rows().filter(row => !matches(row, filter)); },
    async findOneAndUpdate(filter, update, options = {}) {
      if (name === 'ClientContact' && failContactWrite) throw new Error('Injected contact write failure');
      let row = rows().find(row => matches(row, filter));
      if (!row && !options.upsert) return null;
      if (!row) { row = { _id: `${name}-${nextId++}`, ...copy(filter), ...copy(update.$setOnInsert || {}) }; rows().push(row); }
      if (Object.keys(update).some(key => key.startsWith('$'))) {
        Object.assign(row, copy(update.$set || {}));
        for (const [key, value] of Object.entries(update.$max || {})) row[key] = Math.max(row[key] || 0, value);
        for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
      } else Object.assign(row, copy(update));
      return document(row);
    },
    async findByIdAndUpdate(id, update, options) { return this.findOneAndUpdate({ _id: id }, update, options); },
  };
}
const models = {};
const cache = {};
const mongoose = {
  set(key, value) { assert.equal(key, 'transactionAsyncLocalStorage'); assert.equal(value, true); },
  connection: { async transaction(fn) {
    transactions++;
    const before = copy(db);
    try { return await fn(); } catch (error) { db = before; throw error; }
  } },
};
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache[filename]) return cache[filename].exports;
  const loaded = new Module(filename, module);
  cache[filename] = loaded;
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = request => {
    if (request === 'mongoose') return mongoose;
    if (request.startsWith('@/models/')) return models[request] ||= model(request.slice('@/models/'.length));
    if (request.startsWith('@/')) return load(request.slice(2) + '.ts');
    return require(request);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return loaded.exports;
}

async function main() {
  process.env.CLIENT_CREDENTIALS_SECRET = 'isolated-client-form-regression-test';
  const { parsePastedContacts } = load('lib/parsePastedContacts.ts');
  assert.deepEqual(parsePastedContacts('Name\tPhone\tEmail\nAsha\t9876543210\tasha@example.com'), [
    { name: 'Asha', designation: '', phone: '9876543210', email: 'asha@example.com' },
  ]);
  assert.equal(parsePastedContacts('Asha\t9876543210\tasha@example.com')[0].email, 'asha@example.com');
  assert.equal(parsePastedContacts('\tManager\t9876543210\temail@example.com').length, 0, 'Blank names must not shift columns');
  assert.equal(parsePastedContacts('"Smith, ""John""",Director,9876543210,john@example.com')[0].name, 'Smith, "John"');
  assert.equal(parsePastedContacts('Name,Designation,Phone,Email\n"Asha\nPatel",Manager,9876543210,a@example.com')[0].name, 'Asha\nPatel');
  console.log('PASS: paste headers, three columns, blank cells, quoted commas/quotes/newlines');

  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { PersonEntryCard, emptyPersonEntry } = load('app/dashboard/clients/[clientId]/ClientProfileSupport.tsx');
  const markup = renderToStaticMarkup(React.createElement(PersonEntryCard, {
    entry: { ...emptyPersonEntry(), name: '   ' }, index: 0, total: 1,
    onChange() {}, onRemove() {}, onSetPrimary() {},
  }));
  assert.ok(markup.includes('aria-label="Remove contact"'), 'The last contact has a remove action');
  console.log('PASS: whitespace-only name renders safely; last-contact remove action exists');

  const security = load('lib/server/client-credentials.ts');
  const plaintext = '  secret password  ';
  const encrypted = security.encryptClientSecret(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.notEqual(security.encryptClientSecret(plaintext), encrypted);
  assert.equal(security.decryptClientSecret(encrypted), plaintext);
  assert.equal(security.decryptClientSecret('legacy'), 'legacy');
  const corrupted = Buffer.from(encrypted.split(':').at(-1), 'base64');
  corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => security.decryptClientSecret('client-secret:v1:' + corrupted.toString('base64')));
  db.ClientCustomField = [
    { key: 'secret', type: 'password', active: true, required: true },
    { key: 'portalCode', type: 'text', groupId: 'portal', active: true },
    { key: 'quantity', type: 'number', active: true },
  ];
  db.ClientCustomFieldGroup = [{ _id: 'portal', formTab: 'portal' }];
  const admin = await security.clientCredentialAccess({ user: { role: 'admin' } });
  const user = await security.clientCredentialAccess({ user: { role: 'user' } });
  const rawClient = { cpcbPassword: encrypted, cpcbLoginId: 'login', otpMobileNumber: '123', customFields: { secret: encrypted, portalCode: 'code', quantity: '0' } };
  assert.equal(admin.read(rawClient).cpcbPassword, plaintext);
  assert.deepEqual(user.read(rawClient), { customFields: { quantity: '0' } });
  assert.throws(() => user.write({ cpcbPassword: 'new' }), /Admin access/);
  assert.throws(() => user.write({ customFields: { secret: 'new' } }), /Admin access/);
  assert.deepEqual(user.write({ cpcbPassword: '', customFields: { quantity: '0' } }), { customFields: { quantity: '0' } });
  console.log('PASS: encrypted round trip, tamper rejection, legacy read, admin/non-admin access');

  const service = load('lib/server/client-contact-service.ts');
  const input = { category: 'PWP', companyName: 'Test', state: 'Gujarat', cpcbPassword: plaintext, customFields: { secret: plaintext, quantity: '0' }, persons: [
    { name: 'Asha', phoneNumbers: ['1111111111', '2222222222'], emails: [], selectedPhones: ['1111111111'], selectedEmails: [], isPrimaryContact: true },
  ] };
  const saved = await service.createClientRecord(input);
  assert.equal(saved.contacts.length, 1, 'Create response includes contacts');
  assert.notEqual(db.Client[0].cpcbPassword, plaintext);
  assert.equal(admin.read(saved).customFields.secret, plaintext);
  const clientId = saved.clientId;
  const personId = saved.contacts[0].personId;
  await service.updateClientRecord(clientId, { companyName: 'Edited', persons: [{ ...input.persons[0], personId, name: 'Asha Patel', phoneNumbers: ['2222222222'], selectedPhones: ['2222222222'] }] });
  assert.equal(db.Person.length, 1, 'Renaming preserves identity');
  assert.equal(db.Person[0].name, 'Asha Patel');
  assert.deepEqual(db.Person[0].phoneNumbers, ['2222222222'], 'Removed phones stay removed');
  assert.equal(db.Client[0].customFields.quantity, '0', 'Omitted custom values are preserved');
  assert.equal(security.decryptClientSecret(db.Client[0].cpcbPassword), plaintext, 'Ordinary updates preserve credentials');
  const beforeFailure = copy(db);
  failContactWrite = true;
  await assert.rejects(service.updateClientRecord(clientId, { companyName: 'Must roll back', persons: [{ ...input.persons[0], personId, name: 'Must roll back' }] }), /Injected/);
  assert.deepEqual(db, beforeFailure, 'Failed edit rolls back company and shared person changes');
  await assert.rejects(service.createClientRecord(input), /Injected/);
  assert.deepEqual(db, beforeFailure, 'Failed add rolls back client, counter, and contacts');
  failContactWrite = false;
  await assert.rejects(service.updateClientRecord(clientId, { persons: [{ ...input.persons[0], personId }, { ...input.persons[0], personId }] }), /linked only once/);
  assert.deepEqual(db, beforeFailure, 'Duplicate contact rejection leaves the saved state intact');
  await service.updateClientRecord(clientId, { persons: [], removedPersonIds: [personId] });
  assert.equal(db.ClientContact.length, 0, 'Last contact can be unlinked');
  assert.equal(db.Person.length, 1, 'Unlinking does not delete the shared person');
  assert.ok(transactions >= 6);
  console.log('PASS: create/edit, identity, phone removal, credential preservation, rollback fault injection, duplicate rejection, last unlink');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
