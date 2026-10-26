/* Matched, isolated Next dev/start fixture. It never loads the application's .env. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = path.join(root, '.artifacts/email-memory/next-fixture', process.argv[2] || 'development');
const output = path.join(root, '.artifacts/email-memory');
fs.mkdirSync(path.join(fixture, 'app/api/benchmark'), { recursive: true });
fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ private: true, name: 'isolated-email-memory-fixture', version: '1.0.0' }));
fs.writeFileSync(path.join(fixture, 'next.config.mjs'), 'export default { devIndicators: false };\n');
fs.writeFileSync(path.join(fixture, 'app/layout.js'), 'export default function Layout({children}) { return <html><body>{children}</body></html>; }\n');
fs.writeFileSync(path.join(fixture, 'app/api/benchmark/route.js'), `
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  if (!process.env.EMAIL_MEMORY_BENCH_ROOT) return new Response(null, {status:404});
  const nativeRequire = process.getBuiltinModule('module').createRequire(process.env.EMAIL_MEMORY_BENCH_ROOT + '/package.json');
  const {run} = nativeRequire(process.env.EMAIL_MEMORY_BENCH_ROOT + '/scripts/benchmark-email-memory.cjs');
  return Response.json(await run(await request.json()));
}
export async function GET() { return Response.json({ready:true}); }
`);
const next = path.join(root, 'node_modules/next/dist/bin/next');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function command(args, logName) {
  const log = fs.openSync(path.join(output, logName), 'w');
  const child = spawn(process.execPath, args, { cwd: fixture, env: { ...process.env, EMAIL_MEMORY_BENCH_ROOT: root, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', log, log], windowsHide: true });
  fs.closeSync(log);
  return child;
}
async function main() {
  const mode = process.argv[2];
  if (!['development', 'production'].includes(mode)) throw Error('Use development or production');
  if (mode === 'production') {
    const build = await command([next, 'build', fixture], 'next-build.log');
    const code = await new Promise(resolve => build.on('exit', resolve));
    if (code) throw Error('Isolated Next production build failed: see next-build.log');
  }
  const port = mode === 'development' ? 3327 : 3328;
  const results = [];
  for (const variant of ['before', 'after']) {
  const server = await command(['--expose-gc', next, mode === 'development' ? 'dev' : 'start', fixture, '--hostname', '127.0.0.1', '--port', String(port)], `next-${mode}-${variant}.log`);
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/benchmark`)).ok) { ready = true; break; } } catch {}
      if (server.exitCode != null) throw Error('Next server exited: see fixture log');
      await wait(500);
    }
    if (!ready) throw Error('Next fixture did not become ready');
    // Exclude first-route compilation and module loading from steady campaign peaks.
    const warmup = await fetch(`http://127.0.0.1:${port}/api/benchmark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant, count: 1, sizeMiB: 0.25 }) });
    if (!warmup.ok) throw Error('Warmup failed: ' + await warmup.text());
    await warmup.arrayBuffer();
    for (const sizeMiB of [0.25, 2, 8]) for (const count of [1, 5, 15]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/benchmark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant, count, sizeMiB }) });
      if (!response.ok) throw Error('Next benchmark failed: ' + await response.text());
      const result = await response.json(); results.push(result);
      fs.writeFileSync(path.join(output, `next-${mode}-results.json`), JSON.stringify(results, null, 2));
      console.log(`${mode} ${variant} ${count} x ${sizeMiB} MiB: heap ${(result.peak.heapUsed / 1048576).toFixed(1)}, RSS ${(result.peak.rss / 1048576).toFixed(1)}, external ${(result.peak.external / 1048576).toFixed(1)}, arrays ${(result.peak.arrayBuffers / 1048576).toFixed(1)} MiB`);
    }
  } finally {
    // taskkill targets only this fixture's spawned process tree (Next dev forks a child).
    if (server.exitCode == null) await new Promise(resolve => {
      const stop = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); stop.on('exit', resolve);
    });
  }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
