// Isolated regression suites only; live database checks and maintenance tools are opt-in.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const core = [
  'mongoose-connection', 'maintenance-billing', 'annual-return-reconciliation', 'currency-format', 'account-security', 'billing-report', 'billing-analysis', 'excel-exports', 'client-form',
  'financial-year-preference', 'financial-year', 'fy-target-coverage', 'fy-target-coverage-routes',
  'quotation-additional-items', 'report-builder', 'report-custom-fields', 'report-interactions', 'report-metrics', 'report-security',
  'search-architecture', 'search-routes', 'tracker-configuration', 'tracker-sync', 'tracker-editing-routes',
  'tracker-linked-data', 'tracker-attachments', 'scenario-analysis', 'scenario-clarity', 'scenario-drafts',
  'workflow-messages', 'workflow-save', 'workflow-style-navigation', 'email-context',
  'email-delivery-security', 'email-browser-delivery', 'email-delivery-lifecycle', 'email-memory', 'email-smtp', 'email-production-isolation',
];
const browser = [
  'account-security-ui', 'billing-report-ui', 'report-builder-ui', 'financial-year-ui', 'tracker-responsive',
  'tracker-navigation', 'document-attachment-upload', 'email-delivery-activity-ui', 'quotation-pdf',
];
const suites = process.argv.includes('--browser') ? browser : core;
if (process.argv.includes('--list')) { console.log(suites.join('\n')); process.exit(0); }
const results = [];
for (const name of suites) {
  const start = Date.now();
  console.log(`\nRunning ${name}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, `verify-${name}.cjs`)], {
    cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true,
  });
  results.push({ name, exitCode: result.status ?? 1, seconds: (Date.now() - start) / 1000 });
  if (result.error) console.error(result.error.message);
}
const failures = results.filter(result => result.exitCode !== 0);
console.log(`\n${results.length - failures.length}/${results.length} suites passed.`);
if (failures.length) { console.error(JSON.stringify(failures)); process.exitCode = 1; }
