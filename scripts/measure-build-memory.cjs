// Samples the actual Next CLI and its Node child processes. No heap snapshots.
const fs = require('node:fs');
const path = require('node:path');
const v8 = require('node:v8');
const { isMainThread } = require('node:worker_threads');

if (process.env.ALIGN_BUILD_MEMORY_DIR && isMainThread) {
  const file = path.join(process.env.ALIGN_BUILD_MEMORY_DIR, `process-${process.pid}.ndjson`);
  function sample(event = 'sample') {
    fs.appendFileSync(file, JSON.stringify({ t: Date.now(), pid: process.pid, ppid: process.ppid,
      event, ...process.memoryUsage(), heapLimit: v8.getHeapStatistics().heap_size_limit }) + '\n');
  }
  sample('start');
  setInterval(sample, 250).unref();
  process.on('exit', () => sample('exit'));
} else if (require.main === module) {
  const { spawn } = require('node:child_process');
  const root = path.resolve(__dirname, '..');
  const label = process.argv[2];
  const heap = Number(process.argv[3] || 2048);
  const coldCache = !process.argv.includes('--warm-cache');
  if (!label || !/^[a-z0-9-]+$/.test(label) || ![2048, 4096].includes(heap)) {
    throw Error('Usage: node scripts/measure-build-memory.cjs <unique-label> [2048|4096] [--warm-cache]');
  }
  const dir = path.join(root, '.artifacts', 'build-memory', label);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'build.log'))) throw Error('Choose a fresh label');
  // Every comparison starts without the previous build's cache; preserve it.
  const cache = path.join(root, '.next/cache');
  const cachePresentBeforeRun = fs.existsSync(cache);
  if (coldCache && cachePresentBeforeRun) fs.renameSync(cache, path.join(dir, 'previous-cache'));
  const started = Date.now(), phases = [{ t: started, phase: 'startup' }];
  let log = '';
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ALIGN_BUILD_MEMORY_DIR: dir,
      NODE_OPTIONS: `--max-old-space-size=${heap} --require="${__filename.replaceAll('\\', '/')}"` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sampler = spawn('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'measure-build-rss.ps1'), dir, String(child.pid)], {
    windowsHide: true, stdio: 'ignore',
  });
  sampler.on('error', error => console.error('OS RSS sampler:', error.message));
  fs.writeFileSync(path.join(dir, 'configuration.json'), JSON.stringify({
    nextConfig: fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8'),
    tsconfig: fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'),
    cachePresentBeforeRun, coldCache,
  }, null, 2));
  function output(data) {
    const str = data.toString(); log += str; process.stdout.write(str);
    fs.appendFileSync(path.join(dir, 'build.log'), str);
    for (const [pattern, phase] of [
      [/Creating an optimized/, 'webpack'], [/Linting and checking/, 'validation'],
      [/Collecting page data/, 'page-data'], [/Generating static pages/, 'prerender'],
      [/Collecting build traces/, 'tracing'], [/Finalizing page optimization/, 'finalize'],
    ]) if (pattern.test(str)) phases.push({ t: Date.now(), phase });
  }
  child.stdout.on('data', output); child.stderr.on('data', output);
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('close', code => {
    const processes = fs.readdirSync(dir).filter(f => /^process-.*ndjson$/.test(f)).map(file => {
      const samples = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').map(JSON.parse);
      const peak = key => Math.max(...samples.map(s => s[key]));
      return { pid: samples[0].pid, ppid: samples[0].ppid, heapLimit: samples[0].heapLimit,
        peakHeap: peak('heapUsed'), peakRss: peak('rss'), peakExternal: peak('external'),
        peakArrayBuffers: peak('arrayBuffers'), samples };
    });
    const events = processes.flatMap(p => p.samples).sort((a, b) => a.t - b.t);
    const active = new Map(); let peakTotalRss = 0, peakTotalHeap = 0, peakConcurrent = 0;
    const phasePeaks = {};
    for (const s of events) {
      active.set(s.pid, s);
      for (const [pid, last] of active) if (s.t - last.t > 1500) active.delete(pid);
      const rss = [...active.values()].reduce((n, a) => n + a.rss, 0);
      const heapUsed = [...active.values()].reduce((n, a) => n + a.heapUsed, 0);
      const phase = phases.filter(p => p.t <= s.t).at(-1).phase;
      const prior = phasePeaks[phase] || { rss: 0, heap: 0, perProcessHeap: 0 };
      phasePeaks[phase] = { rss: Math.max(prior.rss, rss), heap: Math.max(prior.heap, heapUsed), perProcessHeap: Math.max(prior.perProcessHeap, s.heapUsed) };
      peakTotalRss = Math.max(peakTotalRss, rss); peakTotalHeap = Math.max(peakTotalHeap, heapUsed);
      peakConcurrent = Math.max(peakConcurrent, active.size);
      if (s.event === 'exit') active.delete(s.pid);
    }
    function treeSize(folder) {
      if (!fs.existsSync(folder)) return 0;
      return fs.readdirSync(folder, { withFileTypes: true }).reduce((n, e) => {
        const f = path.join(folder, e.name); return n + (e.isDirectory() ? treeSize(f) : fs.statSync(f).size);
      }, 0);
    }
    const result = { label, node: process.version, next: require('next/package.json').version,
      command: `node --max-old-space-size=${heap} next/dist/bin/next build`, heapMiB: heap,
      exitCode: code, durationSeconds: (Date.now() - started) / 1000, mainPid: child.pid,
      peakTotalRss, peakTotalHeap, peakConcurrent, phasePeaks,
      processes: processes.map(({ samples, ...p }) => p),
      clientBytes: treeSize(path.join(root, '.next/static')), serverBytes: treeSize(path.join(root, '.next/server')),
      phases, note: '250ms process samples; aggregate RSS is sampled and excludes non-Node native processes. V8 heapLimit includes young space beyond the configured old-space cap.' };
    const osFile = path.join(dir, 'os-memory.ndjson');
    if (fs.existsSync(osFile)) {
      const samples = fs.readFileSync(osFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
      result.osPeakTotalRss = Math.max(0, ...samples.map(s => s.processes.reduce((n, p) => n + p.rss, 0)));
      result.osPeakConcurrent = Math.max(0, ...samples.map(s => s.processes.length));
      result.osPeakPerProcessRss = Object.fromEntries(result.processes.map(p => [p.pid,
        Math.max(0, ...samples.flatMap(s => s.processes.filter(v => v.pid === p.pid).map(v => v.peakRss)))]));
    }
    if (code === 0) {
      for (const name of ['app-path-routes-manifest.json', 'routes-manifest.json', 'build-manifest.json']) {
        const source = path.join(root, '.next', name);
        if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dir, name));
      }
      const hashes = {};
      const crypto = require('node:crypto');
      function hashFiles(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          const file = path.join(folder, entry.name);
          if (entry.isDirectory()) hashFiles(file);
          else if (/\.(js|css)$/.test(file)) hashes[path.relative(path.join(root, '.next/static'), file)] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        }
      }
      hashFiles(path.join(root, '.next/static'));
      fs.writeFileSync(path.join(dir, 'client-hashes.json'), JSON.stringify(hashes, null, 2));
    }
    fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(result, null, 2));
    console.log('\nMETRICS ' + JSON.stringify(result)); process.exitCode = code ?? 1;
  });
}
