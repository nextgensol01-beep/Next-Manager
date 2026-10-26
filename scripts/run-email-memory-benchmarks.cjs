const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const results = [];
for (const sizeMiB of [0.25, 2, 8]) for (const count of [1, 5, 15]) for (const variant of ['before', 'after']) {
  const result = spawnSync(process.execPath, ['--expose-gc', 'scripts/benchmark-email-memory.cjs', variant, String(count), String(sizeMiB)], { cwd: root, encoding: 'utf8', timeout: 180000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  const row = JSON.parse(result.stdout.trim().split('\n').at(-1));
  results.push(row);
  fs.writeFileSync(path.join(root, '.artifacts/email-memory/standalone-results.json'), JSON.stringify(results, null, 2));
  console.log(`${variant} ${count} x ${sizeMiB} MiB: heap ${(row.peak.heapUsed / 1048576).toFixed(1)}, RSS ${(row.peak.rss / 1048576).toFixed(1)}, external ${(row.peak.external / 1048576).toFixed(1)}, arrays ${(row.peak.arrayBuffers / 1048576).toFixed(1)} MiB`);
}
