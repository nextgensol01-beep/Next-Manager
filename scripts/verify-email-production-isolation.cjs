const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), cp = require('node:child_process'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json'), lock = require('../package-lock.json');
assert(!['dependencies', 'devDependencies', 'optionalDependencies'].some(key => pkg[key]?.inngest));
assert(!JSON.stringify(lock).toLowerCase().includes('inngest'), 'Main lockfile must not install the SDK or CLI');
assert(!fs.existsSync(path.join(root, 'app/api/inngest/route.ts')));
for (const dir of ['app', 'lib', 'components', 'models']) {
  const visit = folder => { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.[cm]?[jt]sx?$/.test(file)) assert(!/inngest|local-inngest|INNGEST_/i.test(fs.readFileSync(file, 'utf8')), 'Experimental import/reference in ' + file);
  } }; visit(path.join(root, dir));
}
assert(require('../tsconfig.json').exclude.includes('local-inngest'));
assert(fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').includes('local-inngest/'));
const temporary = fs.mkdtempSync(path.join(root, 'tmp/ignore-check-'));
fs.copyFileSync(path.join(root, '.gitignore'), path.join(temporary, '.gitignore'));
cp.execFileSync('git', ['init', '--quiet', temporary], { stdio: 'pipe' });
const ignored = cp.execFileSync('git', ['-C', temporary, 'check-ignore', '--no-index', 'local-inngest/package.json', 'local-inngest/archive/route.ts.txt', '.env.inngest.local', '.inngest/dev.db', 'inngest.json', 'inngest-dev.log'], { encoding: 'utf8' });
assert.equal(ignored.trim().split(/\r?\n/).length, 6);
if (process.argv.includes('--built')) {
  const manifest = require('../.next/server/app-paths-manifest.json');
  assert(!Object.keys(manifest).some(key => key.includes('/api/inngest')));
  const visit = folder => { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name); if (entry.isDirectory()) visit(file);
    else if (/\.nft\.json$/.test(file)) assert(!JSON.parse(fs.readFileSync(file, 'utf8')).files.some(value => /node_modules[\\/]inngest|local-inngest/.test(value)), 'Experimental code in production trace: ' + file);
    else if (file.endsWith('client-reference-manifest.js')) {
      const sandbox = { globalThis: {} }; vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { timeout: 1000 });
      for (const manifest of Object.values(sandbox.globalThis.__RSC_MANIFEST || {}))
        assert(!Object.keys(manifest.clientModules || {}).some(value => /[\\/](?:lib[\\/]server|models)[\\/]/.test(value)), 'Server modules in client import graph: ' + file);
    }
  } }; visit(path.join(root, '.next/server'));
  const visitClient = folder => { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name); if (entry.isDirectory()) visitClient(file);
    // The Gmail setup UI intentionally displays environment-variable names as
    // instructions. Check executable env access and server functions, not labels.
    else if (file.endsWith('.js')) assert(!/process\.env\.(?:GMAIL_OAUTH_CLIENT_SECRET|EMAIL_SEND_PIN_PEPPER)|materializeTrackerEmailAttachments|processBrowserDeliveryBatch|node_modules.inngest/.test(fs.readFileSync(file, 'utf8')), 'Server delivery code in client chunk: ' + file);
  } }; visitClient(path.join(root, '.next/static'));
}
console.log('PASS: main manifest/lockfile and production source have no Inngest, no public workflow route, TypeScript/Vercel isolation and Git ignore behavior' + (process.argv.includes('--built') ? ', plus production route/trace isolation.' : '.'));
