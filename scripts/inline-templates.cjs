// Keep serverless email templates reproducible without runtime filesystem reads.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sources = { PAYMENT_REMINDER: 'payment-reminder', ANNUAL_RETURN_CONFIRMATION: 'annual-return-confirmation' };
const values = Object.fromEntries(Object.entries(sources).map(([name, file]) => [name, fs.readFileSync(path.join(root, 'templates', file + '.html'), 'utf8').replaceAll('\r\n', '\n')]));
const target = path.join(root, 'lib/templates.ts');
if (process.argv.includes('--check')) {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(target, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  for (const [name, value] of Object.entries(values)) {
    if (context.exports[name] !== value) throw Error(`${name} is out of date; run npm run templates:build and review the output.`);
  }
  console.log('PASS: inlined email HTML exactly matches template source bytes after newline normalization.');
} else {
  const literal = value => '`' + value.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${') + '`';
  fs.writeFileSync(target, '// Auto-generated: HTML templates inlined for serverless execution.\n// Edit templates/*.html, then run npm run templates:build.\n\n' + Object.entries(values).map(([name, value]) => `export const ${name} = ${literal(value)};\n`).join('\n'));
  console.log('Updated lib/templates.ts; review and verify email outputs before committing.');
}
