const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { NextRequest } = require('next/server');
const createLoader = require('./search-test-loader.cjs');

const financialYear = '2025-26';
const billA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const billB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const unpaidBillB = 'cccccccccccccccccccccccc';
const fieldId = '777777777777777777777777';
const ruleId = 'rule.11111111-1111-4111-8111-111111111111';
const values = [];
const definitions = [];
let admin = true;
const matches = (row, filter = {}) => Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some(clause => matches(row, clause));
  if (key === '$and') return value.every(clause => matches(row, clause));
  if (!value || typeof value !== 'object') return row[key] === value;
  if (value instanceof RegExp) return value.test(String(row[key] ?? ''));
  if ('$in' in value) return value.$in.includes(row[key] ?? null);
  if ('$ne' in value) return row[key] !== value.$ne;
  if ('$type' in value) return typeof row[key] === value.$type;
  return row[key] instanceof Date && (!value.$gte || row[key] >= value.$gte)
    && (!value.$lt || row[key] < value.$lt) && (!value.$lte || row[key] <= value.$lte);
});
const query = (data) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => structuredClone(data) });
const model = (rows) => ({
  find: filter => query(rows.filter(row => matches(row, filter))),
  findOne: filter => query(rows.find(row => matches(row, filter)) || null),
  exists: async filter => rows.some(row => matches(row, filter)),
  countDocuments: async filter => rows.filter(row => matches(row, filter)).length,
});
const clients = [
  { clientId: 'A', category: 'Producer', companyName: 'Alpha Packaging', createdAt: '2025-04-30T16:00:00Z' },
  { clientId: 'B', category: 'Producer', companyName: 'Beta Packaging' },
  { clientId: 'C', category: 'Producer', companyName: 'Charlie Packaging' },
];
const quotes = [
  { _id: 'q1', clientId: 'A', financialYear, quotationNumber: 'Q1', status: 'Accepted', currentRevisionNumber: 1, createdAt: new Date('2025-04-30T16:00:00Z') },
  { _id: 'q2', clientId: 'A', financialYear, quotationNumber: 'Q2', status: 'Draft', currentRevisionNumber: 0 },
  { _id: 'q3', clientId: 'B', financialYear, quotationNumber: 'Q3', status: 'Accepted', currentRevisionNumber: 0 },
  { _id: 'q4', clientName: 'Unlinked Ltd', financialYear, quotationNumber: 'Q4', status: 'Draft', currentRevisionNumber: 0, createdAt: '2025-04-01T16:00:00Z' },
];
const revisions = [
  { quotationId: 'q1', revisionNumber: 0, grandTotal: 100 },
  { quotationId: 'q1', revisionNumber: 1, grandTotal: 200, consultationCharges: 40, consultationGstAmount: 0, governmentFees: 20,
    items: [{ description: 'Target credits', quantity: 10, rate: 10, subtotal: 90, gstAmount: 10, totalAmount: 100 }],
    additionalItems: [{ description: 'Other', subtotal: 40, gstAmount: 0, totalAmount: 40 }] },
  { quotationId: 'q4', revisionNumber: 0, grandTotal: 300 },
];
const fixtures = {
  Client: clients, Quotation: quotes, QuotationRevision: revisions,
  FinancialYear: [
    { clientId: 'A', financialYear, targets: [{ categoryId: '2', type: 'RECYCLING', value: 17 }, { categoryId: '2', type: 'EOL', value: 26 }] },
    { clientId: 'B', financialYear, cat2Target: 43 },
  ],
  CreditTransaction: [{ _id: 'credit1', fromClientId: 'PWP', toClientId: 'A', financialYear, creditType: 'EOL', cat2Qty: 200, rateCat2: 2, totalAmount: 400 }],
  Billing: [{ _id: billA, clientId: 'A', financialYear, billType: 'general', invoiceCreated: true, billDate: '2025-05-04', invoiceNumber: 'INV-A', totalAmount: 100 },
    { _id: billB, clientId: 'B', financialYear, billType: 'general', billDate: '2025-05-07', totalAmount: 100, sourceQuotationIds: ['q3'] },
    { _id: unpaidBillB, clientId: 'B', financialYear, billType: 'general', billDate: '2025-06-07', totalAmount: 30 }],
  Payment: [
    { _id: 'direct', clientId: 'A', financialYear, billingId: billA, paymentType: 'billing', amountPaid: 25.10, paymentDate: '2025-06-02' },
    { _id: 'later', clientId: 'A', financialYear: '2026-27', billingId: billA, paymentType: 'billing', amountPaid: 15, paymentDate: '2026-04-04' },
    { _id: 'later-stored-old-fy', clientId: 'A', financialYear, billingId: billA, paymentType: 'billing', amountPaid: 4.35, paymentDate: new Date('2026-04-01T00:00:00Z') },
    { _id: 'application', clientId: 'A', financialYear, billingId: billA, paymentType: 'billing', source: 'advance_application', amountPaid: 10, paymentDate: '2025-06-03' },
    { _id: 'legacy-mode', clientId: 'A', financialYear, billingId: billA, paymentType: 'billing', paymentMode: 'Advance Applied', amountPaid: 9, paymentDate: '2025-06-04' },
    { _id: 'legacy-note', clientId: 'A', financialYear, billingId: billA, paymentType: 'billing', notes: 'Adjustment: applied from advance', amountPaid: 6, paymentDate: '2025-06-04' },
    { _id: 'overpayment', clientId: 'B', financialYear, billingId: billB, paymentType: 'billing', amountPaid: 120.05, paymentDate: '2025-06-05' },
    { _id: 'unlinked', clientId: 'A', financialYear, paymentType: 'billing', amountPaid: 7.20, paymentDate: '2025-06-06' },
    { _id: 'advance', clientId: 'C', financialYear, paymentType: 'advance', amountPaid: 50, paymentDate: '2025-04-03' },
  ],
  Invoice: [
    { _id: 'i1', clientId: 'A', financialYear, invoiceType: 'sale', status: 'Received', fromDate: '2025-04-01', toDate: '2025-04-30', updatedAt: '2025-05-01T20:00:00Z' },
    { _id: 'i2', clientId: 'A', financialYear, invoiceType: 'sale', status: 'Pending', fromDate: '2025-04-01', toDate: '2025-04-30', updatedAt: '2025-05-01T10:00:00Z' },
    ...['Received', 'Nil / No Invoice', 'Partial / Issue', undefined].map((status, i) => ({
      _id: `purchase-${i}`, clientId: 'A', financialYear, invoiceType: 'purchase', status, fromDate: `2025-0${4 + i}-01`, toDate: `2025-0${4 + i}-28`,
    })),
  ],
};
const mocks = {
  '@/lib/server/billing-report-category-store': { readBillingCategories: async () => [] },
  '@/lib/server/report-studio-fields': { loadReportStudioCustomFields: async (manual) => manual ? definitions.map(field => studio.reportManualDefinition({ ...field, id: field._id })) : [] },
  '@/lib/mongoose': { connectDB: async () => {} },
  '@/lib/authUsers': { isAdminSession: async () => admin },
  '@/lib/route-utils': { requireSession: async () => ({ response: null, session: {}, actor: { id: 'operator' } }),
    errorResponse: (error, _message, status) => Response.json({ error: error.message }, { status }) },
  '@/models/ReportManualData': {
    ReportManualFieldModel: { ...model(definitions), findById: id => query(definitions.find(row => row._id === id)), create: async input => {
      const row = { ...input, _id: fieldId }; definitions.push(row); return { toObject: () => row };
    } },
    ReportManualValueModel: { ...model(values), init: async () => {}, updateOne: async (filter, update) => {
      const row = values.find(record => matches(record, filter));
      if (row) Object.assign(row, update.$set); else values.push({ ...filter, ...update.$set });
    } },
  },
};
for (const name of ['Client', 'Quotation', 'QuotationRevision', 'Billing', 'Payment', 'FinancialYear', 'CreditTransaction', 'Invoice', 'AnnualReturn', 'UploadRecord', 'Document', 'ClientWorkItem', 'ActivityEvent', 'ClientContact', 'Person']) {
  mocks[`@/models/${name}`] = model(fixtures[name] || []);
}
const load = createLoader(mocks);
const studio = load('lib/report-studio.ts');
const { executeReportStudio } = load('lib/server/report-studio-service.ts');
const manual = load('app/api/reports/studio/manual/route.ts');
const preview = load('app/api/reports/studio/route.ts');
const xlsx = load('app/api/reports/studio/export/route.ts');
const group = (...children) => ({ id: 'root', kind: 'group', logic: 'and', children });
const condition = (field, operator, value, secondValue) => ({ id: field, kind: 'condition', field, operator, value, secondValue });
const config = (source, columns, extra = {}) => ({ version: 2, financialYear, source, columns, name: 'Fixture', filters: group(), ...extra });
const request = (body, method = 'POST', path = '', origin = 'http://localhost') => new NextRequest(`http://localhost/api/reports/studio${path}`, {
  method, headers: { 'content-type': 'application/json', origin }, ...(body ? { body: JSON.stringify(body) } : {}),
});

async function main() {
  const field = { label: 'Confirmed', type: 'boolean', scope: 'financial-year', options: [] };
  const manualField = `manual.${fieldId}`;
  const key = { fieldId, clientId: 'A', financialYear };
  admin = false;
  assert.equal((await manual.POST(request(field))).status, 403);
  assert.equal((await preview.POST(request({ source: 'campaigns' }))).status, 403);
  assert.equal((await xlsx.POST(request({ source: 'email-activity' }))).status, 403);
  admin = true;
  assert.equal((await manual.POST(request(field, 'POST', '', 'https://wrong.invalid'))).status, 403);
  assert.equal((await manual.POST(request(field))).status, 201);
  assert.equal((await manual.PATCH(request({ ...key, value: 'true' }, 'PATCH'))).status, 400);
  assert.equal((await manual.PATCH(request({ ...key, value: false }, 'PATCH'))).status, 200);
  const get = async (selected) => (await manual.GET(request(null, 'GET', `/manual?${new URLSearchParams({ ...key, financialYear: selected })}`))).json();
  assert.equal((await get(financialYear)).value, false);
  assert.equal((await get('2024-25')).value, null);

  const columns = ['client.companyName', 'calculated.unbilled', manualField, ruleId, 'calculated.saleComplete', 'calculated.purchaseComplete'];
  const clientConfig = config('clients', columns, { calculatedColumns: [{ id: ruleId, label: 'Confirmed?', condition: group(condition(manualField, 'eq', true)) }] });
  const result = await executeReportStudio(clientConfig);
  const byId = Object.fromEntries(result.rows.map(row => [row.id, row.values]));
  assert.equal(byId.A['calculated.unbilled'], 'Yes', 'Unrelated invoices cannot satisfy quotation lineage');
  assert.equal(byId.B['calculated.unbilled'], 'No');
  assert.equal(byId.A[ruleId], 'No');
  assert.equal(byId.B[ruleId], 'Unknown');
  assert.equal(byId.A['calculated.saleComplete'], 'Partial');
  assert.equal(byId.A['calculated.purchaseComplete'], 'Partial');
  assert.equal(byId.B['calculated.saleComplete'], 'Unknown');
  await assert.rejects(executeReportStudio({ ...clientConfig, calculatedColumns: [{ ...clientConfig.calculatedColumns[0], condition: group(condition(manualField, 'eq', '')) }] }), /valid value/);

  const target = await executeReportStudio(config('pibo-targets', ['client.companyName', 'target.overall.progress', 'target.overall.remaining'], {
    metrics: ['target.overall.target', 'target.overall.progress'],
  }));
  assert.equal(target.rows.find(row => row.id === 'A').values['target.overall.remaining'], 17);
  assert.equal(target.rows.find(row => row.id === 'B').values['target.overall.progress'], null);
  assert.equal(target.summary.targetCoverage['target.overall'], 26 / 43 * 100);
  assert.equal(target.summary.metrics.find(metric => metric.field === 'target.overall.progress').value, 26 / 43 * 100);

  const status = 'quotation.statuses';
  const grouped = await executeReportStudio(config('clients', [status], { groupBy: [status], metrics: ['client.count'] }));
  const multi = grouped.rows.find(row => row.values[status]?.length === 2);
  const detail = await executeReportStudio(config('clients', ['client.companyName'], { filters: group(...multi.drilldownFilters) }));
  assert.deepEqual(detail.rows.map(row => row.id), multi.clientIds);

  const amount = 'record.amount';
  const register = config('quotation-register', ['record.reference', amount], {
    metrics: [amount], analysis: { field: amount }, filters: group(condition('record.date', 'between', '2025-04-01', '2025-04-30')),
  });
  const table = await executeReportStudio(register);
  assert.deepEqual(table.rows.map(row => row.id), ['q1', 'q4']);
  assert.equal(table.summary.matchedClients, 1);
  assert.equal(table.summary.metrics[0].value, 500);
  const download = await xlsx.POST(request(register));
  assert.equal(download.status, 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await download.arrayBuffer()));
  const sheet = book.getWorksheet('Report Results');
  assert.deepEqual(sheet.getColumn(2).values.slice(2), [200, 300]);
  assert.equal(book.getWorksheet('Configuration & Summary').getColumn(2).values.at(-1), 500);
  const missing = await executeReportStudio({ ...register, filters: group(condition(amount, 'lte', 0)) });
  assert.equal(missing.rows.length, 0);
  assert.equal(missing.summary.metrics[0].value, null);

  const financeMeasures = ['finance.billed', 'finance.billAllocated', 'finance.outstanding', 'finance.cash', 'finance.availableAdvance'];
  const financeConfig = config('finance-activity', ['client.companyName', ...financeMeasures], { groupBy: ['client.companyName'], metrics: financeMeasures });
  const financeResponse = await preview.POST(request(financeConfig));
  assert.equal(financeResponse.status, 200);
  const financial = await financeResponse.json();
  const company = financial.rows.find(row => row.clientIds.includes('A'));
  assert.deepEqual(financeMeasures.map(field => company.values[field]), [100, 69.45, 30.55, 32.30, 0]);
  const overpaidCompany = financial.rows.find(row => row.clientIds.includes('B'));
  assert.deepEqual(financeMeasures.map(field => overpaidCompany.values[field]), [130, 120.05, 30, 120.05, 0], 'An overpayment cannot settle a different bill for the same client');
  assert.equal(financial.rows.find(row => row.clientIds.includes('C')).values['finance.availableAdvance'], 50);
  assert.deepEqual(financial.summary.metrics.map(metric => metric.value), [230, 189.50, 60.55, 152.35, 50]);
  const billFields = ['bill.gross', 'bill.paid', 'bill.outstanding'];
  const bills = await executeReportStudio(config('billing-bills', [...billFields, 'bill.overpayment', 'bill.paymentStatus'], { metrics: billFields }));
  assert.deepEqual(bills.summary.metrics.map(metric => metric.value), financial.summary.metrics.slice(0, 3).map(metric => metric.value));
  assert.deepEqual(Object.fromEntries(bills.rows.map(row => [row.id, [row.values['bill.paymentStatus'], row.values['bill.overpayment']]])), {
    [billA]: ['Partial', 0], [billB]: ['Paid', 20.05], [unpaidBillB]: ['Unpaid', 0],
  });
  const financeExport = await xlsx.POST(request(financeConfig));
  assert.equal(financeExport.status, 200);
  const financeBook = new ExcelJS.Workbook();
  await financeBook.xlsx.load(Buffer.from(await financeExport.arrayBuffer()));
  assert.deepEqual(financeBook.getWorksheet('Report Results').getRow(2).values.slice(1), ['Alpha Packaging', 100, 69.45, 30.55, 32.30, 0]);
  const exportedSummary = new Map(financeBook.getWorksheet('Configuration & Summary').getRows(2, 30).map(row => [row.getCell(1).value, row.getCell(2).value]));
  for (const metric of financial.summary.metrics) assert.equal(exportedSummary.get(metric.label), metric.value);
  const monthly = await executeReportStudio({ ...financeConfig, groupBy: ['record.month'] });
  assert.equal(monthly.rows.find(row => row.values['record.month'] === '2025-05').values['finance.outstanding'], 30.55);
  assert.equal(monthly.rows.find(row => row.values['record.month'] === '2025-06').values['finance.cash'], 152.35);
  const paymentFields = ['finance.cash', 'finance.allocated', 'finance.unallocated'];
  const nextFYConfig = config('payment-register', ['finance.billReference', ...paymentFields], { financialYear: '2026-27', metrics: paymentFields });
  const nextFY = await executeReportStudio(nextFYConfig);
  assert.equal(nextFY.rows.find(row => row.id === 'later').values['finance.billFY'], financialYear);
  assert.equal(nextFY.rows.find(row => row.id === 'later').values['finance.allocated'], 15);
  assert(!nextFY.rows.some(row => row.id === 'later-stored-old-fy'));
  const receiptFY = await executeReportStudio({ ...nextFYConfig, paymentPeriod: 'receipt' });
  assert.equal(receiptFY.rows.find(row => row.id === 'later-stored-old-fy').values['finance.billFY'], financialYear);
  assert.deepEqual(receiptFY.summary.metrics.map(metric => metric.value), [19.35, 19.35, 0]);
  const currentReceipts = await executeReportStudio(config('payment-register', paymentFields, { paymentPeriod: 'receipt' }));
  assert.equal(currentReceipts.rows.find(row => row.id === 'unlinked').values['finance.unallocated'], 7.20);
  assert.equal(currentReceipts.rows.find(row => row.id === 'legacy-mode').values['finance.cash'], 0);
  assert.equal(currentReceipts.rows.find(row => row.id === 'legacy-note').values['finance.cash'], 0);
  const advances = await executeReportStudio(config('advance-register', ['finance.availableAdvance', 'finance.appliedAdvance']));
  assert.deepEqual(advances.rows.map(row => [row.id, row.values['finance.availableAdvance'], row.values['finance.appliedAdvance']]),
    [['application', 0, 10], ['legacy-mode', 0, 9], ['legacy-note', 0, 6], ['advance', 50, 0]]);

  const coverage = await executeReportStudio(config('invoice-coverage', ['invoice.received', 'invoice.covered', 'invoice.missing', 'invoice.partial', 'invoice.nil', 'invoice.unknown', 'invoice.month.2'],
    { filters: group(condition('client.clientId', 'eq', 'A'), condition('record.direction', 'eq', 'Purchase'), condition('invoice.missing', 'gt', 0)) }));
  assert.equal(coverage.rows.length, 1);
  assert.deepEqual(['received', 'covered', 'missing', 'partial', 'nil', 'unknown', 'month.2'].map(field => coverage.rows[0].values[`invoice.${field}`]), [1, 2, 8, 1, 1, 1, 'NIL']);
  const charges = await executeReportStudio(config('quotation-charges', ['record.chargeType', 'record.amount'], { filters: group(condition('record.reference', 'eq', 'Q1')), metrics: ['record.amount'] }));
  assert.deepEqual(charges.rows.map(row => row.values['record.chargeType']).sort(), ['Consultancy', 'EPR target', 'Government', 'Other fee']);
  assert.equal(charges.summary.metrics[0].value, 200);
  const credit = await executeReportStudio(config('credit-perspectives', ['record.category', 'credit.purchaseValue', 'credit.saleValue'],
    { groupBy: ['client.companyName', 'record.direction', 'record.category'], metrics: ['credit.purchaseValue', 'credit.saleValue'] }));
  assert.deepEqual(credit.summary.metrics.map(metric => metric.value), [400, 400]);
  assert.equal(credit.summary.subtotals.length, 2);
  assert.equal(credit.summary.subtotals[0].rows.length, 2);
  const breakdown = await executeReportStudio(config('target-breakdown', ['coverage.target', 'coverage.covered', 'coverage.pending', 'coverage.excess'],
    { filters: group(condition('client.clientId', 'eq', 'A'), condition('record.category', 'eq', 'CAT-II')), metrics: ['coverage.pending', 'coverage.percent'] }));
  assert.deepEqual(breakdown.summary.metrics.map(metric => metric.value), [17, 26 / 43 * 100]);
  const subtotalExport = await xlsx.POST(request(credit.config));
  const subtotalBook = new ExcelJS.Workbook();
  await subtotalBook.xlsx.load(Buffer.from(await subtotalExport.arrayBuffer()));
  assert.equal(subtotalBook.getWorksheet('Subtotals Level 2').rowCount, 3);
  console.log('PASS: report scope, permissions, cross-year allocations, cash and advances, invoice coverage, quotation charges, credit perspectives, target coverage and Excel subtotals.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
