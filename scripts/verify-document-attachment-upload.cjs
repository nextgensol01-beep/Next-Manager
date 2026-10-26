/* Actual uploader and FormData, isolated HTTP persistence. Never uploads to live Drive. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const puppeteer = require('puppeteer-core'), webpack = require('next/dist/compiled/webpack/webpack');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'tmp/document-attachment-upload-tests'), uploads = [];
async function main() {
  fs.mkdirSync(output, { recursive: true }); webpack.init();
  await new Promise((resolve, reject) => {
    const compiler = webpack.webpack({ mode: 'development', devtool: false, context: root, entry: path.join(__dirname, 'fixtures/document-attachment-upload.tsx'),
      output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': root } },
      module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'fixtures/workflow-editor-loader.cjs') }] } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').replace(/^@import .+$/gm, ''), { from: path.join(root, 'app/globals.css') })).css
    + fs.readFileSync(path.join(root, 'app/client-profile-premium.css'), 'utf8') + 'body{margin:0;font-family:Inter,Arial,sans-serif}';
  fs.writeFileSync(path.join(output, 'Certificate.pdf'), '%PDF isolated certificate');
  fs.writeFileSync(path.join(output, 'Target.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGNsAAAAASUVORK5CYII=', 'base64'));
  const server = http.createServer(async (req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(fs.readFileSync(path.join(output, 'fixture.js'))); return; }
    if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return; }
    if (req.url === '/api/documents/upload') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const form = await new Request('http://localhost/upload', { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData();
      const row = { _id: 'D' + (uploads.length + 1), clientId: form.get('clientId'), documentName: form.get('file').name,
        category: form.get('category'), documentKind: form.get('documentKind'), ...(form.get('financialYear') ? { financialYear: form.get('financialYear') } : {}),
        storageType: 'google-drive', driveFileId: 'isolated-reference', driveLink: 'https://example.com/isolated', fileSize: form.get('file').size };
      uploads.push(row); res.statusCode = 201; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(row)); return;
    }
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: fs.mkdtempSync(path.join(output, 'profile-')), args: ['--no-sandbox', '--disable-gpu'] });
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 }); await page.goto('http://127.0.0.1:' + server.address().port);
    const click = async text => { for (const button of await page.$$('button')) if ((await button.evaluate(el => el.textContent)).trim() === text) { await require('./fixtures/wait-for-stable-control.cjs')(button); await button.click(); return; } throw Error('Missing button: ' + text); };
    const open = async text => { await click(text); await page.waitForSelector('[role=dialog]'); await page.waitForFunction(() => document.querySelector('[role=dialog]')?.getBoundingClientRect().width > 600); };
    const close = async () => { await click('Done'); await page.waitForSelector('[role=dialog]', { hidden: true }); };
    const upload = async name => { await (await page.$('input[type=file]')).uploadFile(path.join(output, name)); await page.waitForSelector('.document-upload-footer button'); await click('Upload to Drive'); await page.waitForSelector('.document-upload-success'); };
    const field = '[aria-label="Document financial year"]';
    await open('Regular upload'); assert.equal(await page.$eval(field, el => el.value), '');
    await page.screenshot({ path: path.join(output, 'regular-light.png') }); await upload('Certificate.pdf'); assert.equal(uploads[0].financialYear, undefined); assert.equal(uploads[0].clientId, 'CLIENT-A'); await close();
    await open('Upload in FY context'); assert.equal(await page.$eval(field, el => el.value), '2025-26');
    await page.select(field, '2024-25'); await page.evaluate(() => document.documentElement.classList.add('dark')); await page.screenshot({ path: path.join(output, 'context-dark.png') });
    await upload('Certificate.pdf'); assert.equal(uploads[1].financialYear, '2024-25'); assert.equal(await page.$eval(field, el => el.disabled), true); await close();
    await open('Upload in FY context'); assert.equal(await page.$eval(field, el => el.value), '2025-26', 'Reopen restores the current context, not the last upload');
    await upload('Certificate.pdf'); assert.equal(uploads[2].financialYear, '2025-26'); await close();
    await open('Target screenshot'); assert.equal(await page.$(field), null); await upload('Target.png'); assert.equal(uploads[3].documentKind, 'target-screenshot'); assert.equal(uploads[3].financialYear, '2025-26'); await close();
    await open('Regular upload'); assert.equal(await page.$eval(field, el => el.value), '');
    await page.setViewport({ width: 390, height: 844 }); await page.waitForFunction(() => document.querySelector('[role=dialog]').scrollWidth <= document.querySelector('[role=dialog]').clientWidth);
    await page.screenshot({ path: path.join(output, 'regular-mobile-dark.png') });
    const saved = await page.$eval('#saved-documents', el => JSON.parse(el.textContent)); assert.equal(saved.length, 4); assert.equal(saved[2].financialYear, '2025-26'); assert.deepEqual(errors, []);
    console.log('PASS: actual uploader optional FY, context prefill/change/reset, multipart client/FY persistence, target screenshot compatibility, light/dark/mobile geometry; isolated transport only.');
    console.log('Visual captures: ' + output);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
