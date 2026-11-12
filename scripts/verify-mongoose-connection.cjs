// Exercise the production connector in isolated VMs; never contacts MongoDB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/mongoose.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function fixture(connect, globals = {}) {
  const mongoose = { connect };
  const context = { exports: {}, process: { env: { MONGODB_URI: 'mongodb://unused-fixture' } },
    require(name) { assert.equal(name, 'mongoose'); return mongoose; }, ...globals };
  vm.runInNewContext(source, context);
  return context.exports.connectDB;
}
async function main() {
  const connection = { fixture: true };
  let attempts = 0, resolve;
  const connect = fixture((uri, options) => {
    attempts++; assert.equal(uri, 'mongodb://unused-fixture'); assert.equal(options.bufferCommands, false);
    return new Promise(done => { resolve = done; });
  });
  const pending = [connect(), connect(), connect()];
  assert.equal(attempts, 1); resolve(connection);
  for (const value of await Promise.all(pending)) assert.equal(value, connection);
  assert.equal(await connect(), connection); assert.equal(attempts, 1);

  attempts = 0;
  const failure = new Error('temporary connection failure');
  const retry = fixture(() => { attempts++; return attempts === 1 ? Promise.reject(failure) : Promise.resolve(connection); });
  await Promise.all([assert.rejects(retry(), error => error === failure), assert.rejects(retry(), error => error === failure)]);
  for (const value of await Promise.all([retry(), retry()])) assert.equal(value, connection);
  assert.equal(attempts, 2, 'A rejected shared attempt must permit exactly one new connection attempt');

  attempts = 0;
  const syncRetry = fixture(() => { if (++attempts === 1) throw failure; return Promise.resolve(connection); });
  await assert.rejects(syncRetry(), error => error === failure);
  assert.equal(await syncRetry(), connection); assert.equal(attempts, 2);

  const reused = fixture(() => { throw Error('Existing connection should be reused'); }, { mongooseCache: { conn: connection, promise: null } });
  assert.equal(await reused(), connection);
  const legacy = fixture(() => { throw Error('Legacy cache should be reused'); }, { mongoose: { conn: connection, promise: null } });
  assert.equal(await legacy(), connection);
  console.log('PASS: shared concurrent connection, successful cache reuse, failed-attempt retry, synchronous failure, original error identity, and legacy cache compatibility; no live database.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
