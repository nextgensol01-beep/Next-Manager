const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { NextRequest } = require('next/server');
const createLoader = require('./search-test-loader.cjs');
const { fy, ids, clients, line } = require('./fixtures/billing-report-data.cjs');

const previousYear = '2024-25';
const extraAnnualId = '444444444444444444444444';
const priorBillId = '555555555555555555555555';
const bills = [
  { _id: ids.annual, clientId: 'A', financialYear: fy, billType: 'annual_return', invoiceNumber: 'AR-1', billDate: '2025-04-04',
    dueDate: '2025-04-30', invoiceDate: '2025-04-06', totalAmount: 35000, targetCharges: 20000, consultancyCharges: 4500, govtCharges: 10000, otherCharges: 500,
    targetBreakdown: [
      { ...line('Target', 12000), categoryId: '1', type: 'RECYCLING', quantity: 10, rate: 1000, taxableAmount: 10000, gstPercent: 20, gstAmount: 2000 },
      { ...line('Target', 8000), categoryId: '1', type: 'EOL' },
    ] },
  { _id: ids.general, clientId: 'A', financialYear: fy, billType: 'general', invoiceNumber: 'G-1', totalAmount: 6000,
    lineItems: [line('Verified target work', 4000), line('Migration', 2000)] },
  { _id: ids.other, clientId: 'B', financialYear: fy, billType: 'general', invoiceNumber: 'G-2', totalAmount: 3000, lineItems: [line('Unclassified consultancy', 3000)] },
  { _id: extraAnnualId, clientId: 'A', financialYear: fy, totalAmount: 1000, targetCharges: 1000 },
  { _id: priorBillId, clientId: 'A', financialYear: previousYear, billType: 'general', totalAmount: 1700, lineItems: [line('Prior work', 1700)] },
];
const payments = [
  { _id: 'partial', clientId: 'A', financialYear: fy, billingId: ids.annual, paymentType: 'billing', amountPaid: 15000 },
  { _id: 'applied', clientId: 'A', financialYear: fy, billingId: ids.general, paymentType: 'billing', source: 'advance_application', amountPaid: 1000 },
  { _id: 'overpaid', clientId: 'B', financialYear: fy, billingId: ids.other, paymentType: 'billing', amountPaid: 4000 },
  { _id: 'ambiguous', clientId: 'A', financialYear: fy, amountPaid: 2500 },
  { _id: 'unapplied', clientId: 'C', financialYear: fy, paymentType: 'advance', amountPaid: 7000 },
];
const fixtureClients = [...clients, { clientId: 'C', companyName: 'Advance only' }];
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$and') return value.every(group => match(row, group));
  if (key === '$or') return value.some(group => match(row, group));
  if (value && typeof value === 'object') {
    if ('$in' in value) return value.$in.includes(row[key] ?? null);
    if ('$ne' in value) return row[key] !== value.$ne;
    if ('$type' in value) return typeof row[key] === value.$type;
    if ('$gte' in value || '$lt' in value) return row[key] instanceof Date &&
      (!value.$gte || row[key] >= value.$gte) && (!value.$lt || row[key] < value.$lt);
  }
  return row[key] === value;
});
const queries = [];
const model = (name, records) => ({ find(filter) {
  queries.push({ name, filter });
  const rows = records.filter(record => match(record, filter));
  return { select() { return this; }, limit() { return this; }, lean: async () => structuredClone(rows) };
} });
const annotations = [];
const load = createLoader({
  '@/models/Billing': model('Billing', bills), '@/models/Payment': model('Payment', payments), '@/models/Client': model('Client', fixtureClients),
  '@/lib/server/billing-report-category-store': { readBillingCategories: async () => annotations },
  '@/lib/server/report-studio-fields': { loadReportStudioCustomFields: async () => [] },
  '@/lib/mongoose': { connectDB: async () => {} }, '@/lib/authUsers': { isAdminSession: async () => true },
  '@/lib/route-utils': { requireSession: async () => ({ response: null, session: {}, actor: { id: 'fixture' } }),
    errorResponse: (error, _message, status) => Response.json({ error: error.message }, { status }) },
});
const { billingComponents } = load('lib/billing-report.ts');
const { billingOutputFields } = load('lib/report-billing-fields.ts');
const { billingReportDrilldown } = load('lib/report-billing-view.ts');
const { executeReportStudio } = load('lib/server/report-studio-service.ts');
const { POST } = load('app/api/reports/studio/export/route.ts');
const condition = (field, operator, value, secondValue) => ({ id: field, kind: 'condition', field, operator, value, secondValue });
const eq = (field, value) => condition(field, 'eq', value);
const group = (logic, ...children) => ({ id: logic, kind: 'group', logic, children });
const config = (source, scope = group('and'), patch = {}) => ({
  source, financialYear: fy, name: 'Billing analysis', version: 2, billingScope: { filters: scope }, filters: group('and'),
  columns: ['client.companyName', 'financialYear.year', source === 'billing-charges' ? 'charge.gross' : 'charge.selectedGross'],
  ...patch,
});
const metric = (report, field) => report.summary.metrics.find(item => item.field === field)?.value;
const idsOf = report => report.rows.map(row => row.id).sort();

async function checkWorkbook(report) {
  const excel = await POST(new NextRequest('http://localhost/api/reports/studio/export', { method: 'POST', body: JSON.stringify(report.config) }));
  assert.equal(excel.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
  const sheet = workbook.getWorksheet('Report Results');
  assert.equal(sheet.actualRowCount, report.rows.length + 1);
  report.rows.forEach((row, index) => assert.deepEqual(sheet.getRow(index + 2).values.slice(1), report.columns.map(column => {
    const value = row.values[column.id];
    return typeof value === 'boolean' ? value ? 'Yes' : 'No' : Array.isArray(value) ? value.join(', ') : value ?? 'No Record';
  })));
}

async function main() {
  const modelModule = require('../node_modules/mongoose');
  const schemaLoad = createLoader();
  const Billing = schemaLoad('models/Billing.ts').default;
  for (const bill of bills) assert.equal(new Billing(bill).validateSync(), undefined);
  assert.equal(modelModule.connection.readyState, 0);
  const lines = billingComponents(bills[1]);
  annotations.push({ billingId: ids.general, componentKey: lines[0].key, category: 'epr_target' }, { billingId: ids.general, componentKey: lines[1].key, category: 'registration_migration' });
  annotations.push({ billingId: ids.annual, componentKey: 'fixed:consultancyCharges', category: 'other' });
  for (const source of ['billing-bills', 'billing-companies', 'billing-charges']) {
    const keys = billingOutputFields(source).map(field => field.id);
    assert.equal(new Set(keys).size, keys.length);
  }
  const snapshot = JSON.stringify({ bills, payments });
  const run = async (source, ...clauses) => executeReportStudio(config(source, group('and', ...clauses)));
  const general = await run('billing-bills', eq('bill.type', 'General'));
  const annual = await run('billing-bills', eq('bill.type', 'Annual Return'));
  assert.deepEqual(idsOf(general), [ids.general, ids.other]);
  assert.deepEqual(idsOf(annual), [ids.annual, extraAnnualId]);
  const epr = eq('charge.classification', 'EPR Targets');
  const generalEpr = await run('billing-bills', eq('bill.type', 'General'), epr);
  assert.deepEqual(idsOf(generalEpr), [ids.general]);
  assert.equal(generalEpr.rows[0].values['charge.selectedGross'], 4000);
  assert.equal(generalEpr.rows[0].values['bill.gross'], 6000);
  assert.equal(generalEpr.rows[0].values['bill.outstanding'], 5000);
  const eprBills = await run('billing-bills', epr);
  assert.equal(eprBills.rows.reduce((sum, row) => sum + row.values['charge.selectedGross'], 0), 25000);
  const government = await run('billing-bills', eq('charge.kind', 'Government'));
  assert.equal(government.rows[0].values['charge.selectedGross'], 10000);
  assert.equal(government.rows[0].values['charge.selectedGst'], null);
  assert.equal(government.rows[0].values['bill.paid'], 15000);
  const combinedScope = group('and',
    { ...eq('bill.chargeTypes', 'Government'), id: 'has-government' },
    { ...eq('bill.chargeTypes', 'Consultancy'), id: 'has-consultancy' },
    eq('charge.kind', 'Government'));
  const combined = await executeReportStudio(config('billing-bills', combinedScope, {
    columns: ['bill.chargeTypes', 'charge.selectedGross', 'bill.gross', 'bill.paid'],
  }));
  assert.deepEqual(idsOf(combined), [ids.annual]);
  assert.deepEqual(combined.rows[0].values['bill.chargeTypes'], ['Consultancy', 'EPR target', 'Government', 'Other fixed charge']);
  assert.equal(combined.rows[0].values['charge.selectedGross'], 10000);
  assert.equal(combined.rows[0].values['bill.gross'], 35000);
  const combinedCharges = await executeReportStudio(billingReportDrilldown(combined.config, combined.rows[0]));
  assert.deepEqual(combinedCharges.rows.map(row => row.values['charge.gross']), [10000]);
  const combinedClasses = await run('billing-bills',
    { ...eq('bill.classifications', 'EPR Targets'), id: 'has-targets' },
    { ...eq('bill.classifications', 'Registration / Migration'), id: 'has-registration' },
    epr);
  assert.deepEqual(idsOf(combinedClasses), [ids.general]);
  assert.equal(combinedClasses.rows[0].values['charge.selectedGross'], 4000);
  const multiClass = await run('billing-bills', condition('bill.classificationCount', 'gt', 1));
  const unclassified = await run('billing-bills', eq('charge.classification', 'Unclassified'));
  const outstanding = await run('billing-bills', eq('bill.type', 'General'), condition('bill.outstanding', 'gt', 0));
  const undated = await run('billing-bills', eq('bill.type', 'General'), condition('bill.date', 'empty'));
  const invoiceDate = await run('billing-bills', condition('bill.invoiceDate', 'between', '2025-04-06', '2025-04-06'), eq('bill.paymentStatus', 'Partial'));
  assert.equal(multiClass.rows.length, 2);
  assert(unclassified.rows.some(row => row.id === ids.other));
  assert.deepEqual(idsOf(outstanding), [ids.general]);
  assert.deepEqual(idsOf(undated), [ids.general, ids.other]);
  assert.deepEqual(idsOf(invoiceDate), [ids.annual]);
  const annualOnly = await executeReportStudio(config('billing-bills', group('and', eq('bill.id', ids.annual)), {
    columns: ['charge.breakdown.other', 'charge.breakdown.otherFixed'],
    metrics: ['charge.breakdown.other', 'charge.breakdown.otherFixed'],
  }));
  assert.equal(annualOnly.rows[0].values['bill.paid'], 15000, 'An excluded sibling keeps legacy allocation ambiguous');
  assert.equal(metric(annualOnly, 'charge.breakdown.other'), 4500);
  assert.equal(metric(annualOnly, 'charge.breakdown.otherFixed'), 500);
  assert(annualOnly.quality.messages.some(message => message.includes('allocation review')));
  assert(queries.some(({ name, filter }) => name === 'Billing' && filter.$and?.some(clause => clause.billType === 'general')));
  assert(queries.some(({ name, filter }) => name === 'Payment' && filter.$or?.[0].billingId.$in.includes(ids.annual)));
  const exact = group('and', eq('charge.targetCategory', 'CAT-I'), eq('charge.creditType', 'Recycling'), condition('charge.rate', 'gte', 1000));
  const company = await executeReportStudio(config('billing-companies', exact, { metrics: ['charge.selectedGross', 'bill.gross'] }));
  assert.equal(company.rows.length, 1);
  assert.equal(metric(company, 'charge.selectedGross'), 12000);
  assert.equal(metric(company, 'bill.gross'), 35000);
  assert.equal(company.rows[0].values['charge.cat1.recycling.quantity'], 10);
  const byBill = await executeReportStudio(billingReportDrilldown(company.config, company.rows[0]));
  assert.deepEqual(idsOf(byBill), [ids.annual]);
  const byChargeConfig = billingReportDrilldown(byBill.config, byBill.rows[0]);
  const beforeCharge = queries.length;
  const charge = await executeReportStudio(byChargeConfig);
  assert(!queries.slice(beforeCharge).some(query => query.name === 'Payment'));
  assert.equal(charge.rows.length, 1);
  assert.equal(charge.rows[0].values['charge.gross'], 12000);
  assert.equal(charge.rows[0].values['charge.gst'], 2000);
  assert.equal(Object.hasOwn(charge.rows[0].values, 'bill.paid'), false);
  const outstandingCharge = await run('billing-charges', eq('bill.type', 'General'), epr, condition('bill.outstanding', 'gt', 0));
  assert.deepEqual(outstandingCharge.rows.map(row => row.values['charge.gross']), [4000]);
  await assert.rejects(executeReportStudio({ ...byChargeConfig, columns: ['bill.outstanding'] }), /not available/);
  const multiple = await executeReportStudio(config('billing-charges', group('or', group('and', eq('bill.type', 'General'), epr), eq('charge.kind', 'Government'))));
  assert.deepEqual(multiple.rows.map(row => row.values['charge.gross']).sort((a, b) => a - b), [4000, 10000]);
  const comparison = await executeReportStudio(config('billing-companies', undefined, {
    billingScope: { years: [previousYear] }, metrics: ['bill.gross'], groupBy: ['financialYear.year'],
  }));
  assert.deepEqual(Object.fromEntries(comparison.rows.map(row => [row.values['financialYear.year'], row.values['bill.gross']])), { [fy]: 45000, [previousYear]: 1700 });
  const allCompanies = await executeReportStudio(config('billing-companies', undefined, {
    columns: ['client.companyName', 'charge.cat1.recycling.quantity', 'bill.overdueCount'],
    metrics: ['charge.cat1.recycling.quantity', 'bill.overdueCount'],
  }));
  assert.equal(allCompanies.rows.some(row => row.clientIds.includes('C')), false, 'An advance does not create a bill');
  assert.equal(allCompanies.rows.find(row => row.clientIds.includes('A')).values['bill.outstanding'], 26000);
  assert.equal(allCompanies.rows.find(row => row.clientIds.includes('B')).values['bill.overpayment'], 1000);
  assert.equal(metric(allCompanies, 'charge.cat1.recycling.quantity'), null, 'An unreconciled company quantity stays unknown in the total');
  assert.equal(metric(allCompanies, 'bill.overdueCount'), null, 'Bills with missing due dates stay unknown in the total');
  for (const report of [general, annual, generalEpr, eprBills, government, combined, combinedCharges, combinedClasses, multiClass, unclassified, outstanding, undated, invoiceDate,
    annualOnly, company, byBill, charge, multiple, comparison, allCompanies]) await checkWorkbook(report);
  assert.equal(JSON.stringify({ bills, payments }), snapshot);
  console.log('PASS: billing scope, company/bill/charge grains, reconciliation, legacy/unknown, fiscal comparison, exact drilldown, Excel and immutable financial records.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
