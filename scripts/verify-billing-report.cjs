/* Production financial calculations, report services, API/export and annotation tests.
 * Isolated fixtures only. Database writes are prohibited except the annotation stub. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { NextRequest } = require('next/server');
const createLoader = require('./search-test-loader.cjs');
const { fy, ids, bills, payments, clients, line } = require('./fixtures/billing-report-data.cjs');
const baseline = JSON.stringify({ bills, payments });
const metadata = [];
const same = (value, wanted) => wanted && typeof wanted === 'object' && '$in' in wanted ? wanted.$in.includes(value) : value === wanted;
function match(row, query) { return Object.entries(query).every(([key, value]) => key === '$or' ? value.some(clause => match(row, clause)) : same(row[key], value)); }
function model(rows) {
  const query = values => ({ sort() { return this; }, select() { return this; }, lean: async () => structuredClone(values) });
  return { find: filter => query(rows.filter(row => match(row, filter || {}))), findById: value => query(rows.find(row => String(row._id) === value) || null), countDocuments: async filter => rows.filter(row => match(row, filter)).length };
}
const mocks = {
  '@/lib/server/report-studio-fields': { loadReportStudioCustomFields: async () => [] },
  '@/lib/server/billing-report-category-store': { readBillingCategories: async () => metadata, writeBillingCategory: async entry => { metadata.push(entry); } },
  '@/lib/mongoose': { connectDB: async () => {} },
  'next-auth': { getServerSession: async () => ({ user: { id: 'actor' } }) },
  '@/lib/auth': { authOptions: {} },
  '@/lib/route-utils': { requireSession: async () => ({ response: null, session: { user: { id: 'actor' } }, actor: { id: 'actor' } }), errorResponse: (e, _fallback, status) => Response.json({ error: e.message }, { status }) },
};
for (const name of ['Client', 'FinancialYear', 'CreditTransaction', 'Quotation', 'QuotationRevision', 'Billing', 'Payment', 'Invoice', 'AnnualReturn', 'UploadRecord', 'Document', 'ClientWorkItem', 'ActivityEvent', 'ClientContact', 'Person']) mocks[`@/models/${name}`] = model(name === 'Client' ? clients : name === 'Billing' ? bills : name === 'Payment' ? payments : []);
const load = createLoader(mocks);
const core = load('lib/billing-report.ts');
const { billingReportOptionsSchema: schema, executeBillingReport, assignBillingCategory } = load('lib/server/billing-report-service.ts');
const options = extra => schema.parse({ financialYear: fy, ...extra });
const report = (extra = {}, bs = bills, ps = payments, cs = clients) => core.buildBillingReport(bs, ps, cs, options(extra), metadata, true);
function eq(actual, expected, label) { assert.equal(actual, expected, label); }
async function main() {
  let r = report();
  eq(r.summary.billCount, 3); eq(r.summary.companyCount, 2); eq(r.summary.billed, 23000); eq(r.summary.paid, 6000); eq(r.summary.outstanding, 17000); eq(r.summary.advance, 8000);
  eq(r.summary.unresolvedPayments, 100000); eq(r.companies[0].bills.length, 2);
  eq(r.summary.allComponentGross, 23000); eq(r.summary.discrepancyBills, 0);
  eq(r.summary.unclassifiedGross, 13000);
  eq(report({ view: 'component', category: 'epr_target' }).summary.componentGross, 10000, 'Target report uses only target charges, never whole invoice');
  eq(report({ view: 'component', category: 'registration_migration' }).components.length, 0, 'No keyword guesses from descriptions');
  assert(report({ view: 'bill' }).bills.some(b => b.clientId === 'B'), 'General-only bills survive missing FY/AR/targets');
  eq(report({}, bills, [...payments, { _id: 'legacy', clientId: 'A', financialYear: fy, amountPaid: 1000 }]).summary.paid, 7000);
  const duplicateAnnual = { ...bills[0], _id: '444444444444444444444444' };
  const ambiguous = report({}, [...bills, duplicateAnnual], [{ _id: 'legacy', clientId: 'A', financialYear: fy, amountPaid: 1000 }]);
  eq(ambiguous.summary.paid, 0); eq(ambiguous.issues.length, 1);
  eq(report({}, bills, [{ _id: 'bad-client', clientId: 'B', financialYear: fy, billingId: ids.annual, amountPaid: 10 }]).issues.length, 1);
  eq(report({}, bills, [{ _id: 'bad-fy', clientId: 'A', financialYear: '2024-25', billingId: ids.annual, amountPaid: 10 }]).issues.length, 1);
  const overpay = report({}, bills, [{ _id: 'over', clientId: 'A', financialYear: fy, billingId: ids.annual, amountPaid: 20000 }]);
  eq(overpay.summary.outstanding, 5000); eq(overpay.summary.overpayment, 2000, 'Overpaid bill cannot hide another unpaid bill');
  eq(report({ paymentStatus: 'unpaid' }).summary.billCount, 1);
  eq(report({ invoiceState: 'not-created' }).summary.billCount, 2);
  eq(report({ dateFrom: '2025-04-01', dateTo: '2025-06-30' }).summary.billCount, 1);
  eq(report({ dateFrom: '2025-04-01', includeUndated: true }).summary.billCount, 3);
  eq(report({ dateBasis: 'billDate', dateFrom: '2025-06-01', dateTo: '2025-06-01' }).summary.billCount, 1);
  assert.throws(() => options({ dateFrom: '2025-02-31' }));
  assert.throws(() => options({ dateFrom: '2025-12-01', dateTo: '2025-01-01' }));
  const orphan = report({}, bills, payments, clients.slice(0, 1));
  eq(orphan.summary.billed, 23000); assert(orphan.companies.some(c => c.companyName.includes('unavailable')));
  const otherFY = { ...bills[1], _id: '555555555555555555555555', financialYear: '2024-25' };
  eq(report({}, [...bills, otherFY]).summary.billCount, 3);
  eq(report({ view: 'component' }).components.filter(c => c.key === 'fixed:targetCharges').length, 1, 'Target breakdown is not added twice');
  eq(report({ view: 'component' }).components.find(c => c.key === 'fixed:consultancyCharges').taxKnown, false);
  const mismatch = report({}, [{ ...bills[0], totalAmount: 19000 }]);
  eq(mismatch.summary.discrepancyBills, 1);
  const single = report({}, [bills[2]], [{ _id: 'paid', clientId: 'B', financialYear: fy, billingId: ids.other, amountPaid: 3000 }]);
  eq(single.companies[0].bills[0].paymentStatus, 'paid'); eq(single.summary.outstanding, 0);
  for (const view of ['company', 'bill', 'component']) {
    const full = await executeBillingReport({ financialYear: fy, view }, true);
    eq(full.summary.billed, 23000); eq(full.summary.paid, 6000); eq(full.summary.outstanding, 17000);
    const paged = await executeBillingReport({ financialYear: fy, view, pageSize: 1 });
    eq(paged.summary.billed, full.summary.billed); eq((view === 'company' ? paged.companies : view === 'bill' ? paged.bills : paged.components).length, 1);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await load('lib/server/billing-report-excel.ts').billingReportWorkbook(full));
    const sheet = workbook.getWorksheet(view === 'company' ? 'Companies' : view === 'bill' ? 'Bills' : 'Components');
    eq(sheet.actualRowCount - 1, full.pagination.totalRows);
    const header = view === 'company' ? 'Billed gross' : view === 'bill' ? 'Billed gross' : 'Billed gross';
    const column = sheet.getRow(1).values.indexOf(header);
    let total = 0; sheet.eachRow((row, index) => { if (index > 1) total += row.getCell(column).value; });
    eq(total, 23000, `${view} export matches full summary`);
    assert(workbook.getWorksheet('Payment Review'));
  }
  const studio = await load('lib/server/report-studio-service.ts').executeReportStudio({ name: 'Billing', source: 'billing', financialYear: fy, columns: ['client.companyName', 'billing.total', 'payment.received', 'billing.outstanding', 'payment.advance'], metrics: ['billing.total', 'payment.received', 'billing.outstanding'], filters: { id: 'root', kind: 'group', logic: 'and', children: [] }, groupBy: [], sort: [] }, { exportAll: true });
  eq(studio.rows.length, 2); eq(studio.summary.metrics.find(m => m.field === 'billing.total').value, 23000); eq(studio.summary.metrics.find(m => m.field === 'billing.outstanding').value, 17000);
  const generalClient = (await load('lib/server/reporting-service.ts').buildReport(load('lib/reporting.ts').createReportQuery(fy, 'billing'), { exportAll: true })).rows.find(r => r.clientId === 'B');
  eq(generalClient.billingCreated, true); eq(generalClient.annualBillingCreated, false, 'General billing must not satisfy Annual Return prerequisite');
  const c = core.billingComponents(bills[2])[0];
  await assignBillingCategory({ billingId: ids.other, componentKey: c.key, category: 'registration_migration' }, 'actor');
  eq(report({ category: 'registration_migration', view: 'component' }).summary.componentGross, 3000);
  eq(JSON.stringify({ bills, payments }), baseline, 'Classification and reporting never mutate source financial records');
  await assert.rejects(assignBillingCategory({ billingId: ids.other, componentKey: c.key + 'stale', category: 'other' }, 'actor'));
  await assert.rejects(assignBillingCategory({ billingId: ids.other, componentKey: c.key, category: 'guessed' }, 'actor'));
  const route = load('app/api/reports/studio/route.ts');
  const http = await route.POST(new NextRequest('http://localhost:3000/api/reports/studio', { method: 'POST', body: JSON.stringify({ mode: 'billing-report', report: { financialYear: fy } }), headers: { 'Content-Type': 'application/json' } }));
  eq(http.status, 200); eq((await http.json()).summary.billed, 23000);
  const denied = await route.POST(new NextRequest('http://localhost:3000/api/reports/studio', { method: 'POST', body: JSON.stringify({ mode: 'billing-category', assignment: {} }), headers: { origin: 'https://wrong.example', 'Content-Type': 'application/json' } }));
  eq(denied.status, 403);
  const invalid = await route.POST(new NextRequest('http://localhost:3000/api/reports/studio', { method: 'POST', body: JSON.stringify({ mode: 'billing-report', report: { financialYear: fy, pageSize: 0 } }) }));
  eq(invalid.status, 400);
  const exportRoute = load('app/api/reports/studio/export/route.ts');
  const download = await exportRoute.POST(new NextRequest('http://localhost:3000/api/reports/studio/export', { method: 'POST', body: JSON.stringify({ mode: 'billing-report', report: { financialYear: fy, view: 'bill', pageSize: 1 } }) }));
  eq(download.status, 200);
  const downloaded = new ExcelJS.Workbook(); await downloaded.xlsx.load(Buffer.from(await download.arrayBuffer()));
  eq(downloaded.getWorksheet('Bills').actualRowCount - 1, 3, 'HTTP export ignores display pagination');
  const quick = await load('app/api/reports/export/route.ts').GET(new NextRequest(`http://localhost:3000/api/reports/export?type=payments&fy=${fy}`));
  eq(quick.status, 200);
  const legacy = new ExcelJS.Workbook(); await legacy.xlsx.load(Buffer.from(await quick.arrayBuffer()));
  const summary = legacy.getWorksheet('Payment Summary');
  const totalFor = header => { const col = summary.getRow(1).values.indexOf(header); let total = 0; summary.eachRow((row, i) => { if (i > 1) total += Number(row.getCell(col).value) || 0; }); return total; };
  eq(totalFor('Total Billed'), 23000); eq(totalFor('Billing Payments'), 6000); eq(totalFor('Pending'), 17000); eq(totalFor('Advance Payments'), 8000);
  const customSource = fs.readFileSync(require('node:path').join(__dirname, '../lib/server/custom-client-export.ts'), 'utf8');
  const customLoader = createLoader({ ...mocks, '@/models/EmailLog': model([]), '@/models/ClientCustomField': model([]), '@/lib/server/client-credentials': {}, '@/lib/server/client-contact-service': {} }, { 'lib/server/custom-client-export.ts': customSource + '\nexport { buildPaymentSummary };' });
  const custom = customLoader('lib/server/custom-client-export.ts').buildPaymentSummary(bills, payments);
  eq(custom.fyBillingTotal, 23000); eq(custom.fyBillingPaid, 6000); eq(custom.fyPendingAmount, 17000);
  for (const view of ['company', 'bill', 'component']) {
    const selected = await executeBillingReport({ financialYear: fy, view, category: 'epr_target' }, true);
    eq(selected.summary.componentGross, 10000);
    if (view === 'company') eq(selected.companies.reduce((s,c) => s+c.selectedGross, 0), 10000);
    if (view === 'bill') eq(selected.bills.reduce((s,b) => s+b.selectedGross, 0), 10000);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await load('lib/server/billing-report-excel.ts').billingReportWorkbook(selected));
    const sheet = wb.getWorksheet(view === 'company' ? 'Companies' : view === 'bill' ? 'Bills' : 'Components');
    const col = sheet.getRow(1).values.indexOf(view === 'component' ? 'Billed gross' : 'Selected category gross');
    let total = 0; sheet.eachRow((row, index) => { if (index > 1) total += Number(row.getCell(col).value); });
    eq(total, 10000, 'Category exports never report the whole mixed bill as target fees');
  }
  console.log('PASS: missing/general bills, optional EPR context, multi-bill companies, allocation/legacy rules, broken links, advances, partial/full/overpayments, component tax/categories, dates, filters, pagination, all-view Excel reconciliation, Studio compatibility, immutable source records and category API protection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
