// Verify a production build without sharing .next with a running development app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'align-client-build-'));
for (const directory of ['app', 'components', 'lib', 'models', 'types', 'utils', 'vendor', 'templates', 'public']) {
  const source = path.join(root, directory);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(target, directory), { recursive: true });
}
for (const item of fs.readdirSync(root, { withFileTypes: true })) {
  if (item.isFile() && /\.(?:json|[cm]?js|tsx?)$/.test(item.name)) {
    fs.copyFileSync(path.join(root, item.name), path.join(target, item.name));
  }
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(target, 'node_modules'), 'junction');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
console.log(`Isolated build directory: ${target}`);
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
  cwd: target,
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
