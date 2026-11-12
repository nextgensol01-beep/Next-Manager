/* Read-only live reconciliation. No write routes or Mongoose models are loaded. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { MongoClient } = require('mongodb');
const ExcelJS = require('exceljs');
const createLoader = require('./search-test-loader.cjs');
const root = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const FY = '2025-26';
const fingerprint = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const same = (a, b) => String(a) === String(b);
function matches(row, query = {}) { return Object.entries(query).every(([key, value]) => key === '$or' ? value.some(q => matches(row, q)) : value && typeof value === 'object' && '$in' in value ? value.$in.some(v => same(row[key], v)) : same(row[key], value)); }
function readonlyModel(rows) {
  const chain = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
  return { find: filter => chain(rows.filter(r => matches(r, filter))), findById: id => chain(rows.find(r => same(r._id, id)) || null), countDocuments: async filter => rows.filter(r => matches(r, filter)).length };
}
async function main() {
  const connection = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/nextgen-erp', { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  try {
    await connection.connect(); const db = connection.db();
    const [bills, payments, clients, annotations] = await Promise.all([
      db.collection('billings').find({}).sort({ _id: 1 }).toArray(), db.collection('payments').find({}).sort({ _id: 1 }).toArray(),
      db.collection('clients').find({}, { projection: { clientId: 1, companyName: 1, category: 1, state: 1, createdAt: 1 } }).toArray(),
      db.collection('billingreportcategories').find({}).toArray(),
    ]);
    const before = { bills: fingerprint(bills), payments: fingerprint(payments) };
    const mocks = {
      '@/lib/server/report-studio-fields': { loadReportStudioCustomFields: async () => [] },
      '@/lib/server/billing-report-category-store': { readBillingCategories: async () => annotations, writeBillingCategory: async () => { throw Error('Read-only audit'); } },
    };
    for (const name of ['Client', 'FinancialYear', 'CreditTransaction', 'Quotation', 'QuotationRevision', 'Billing', 'Payment', 'Invoice', 'AnnualReturn', 'UploadRecord', 'Document', 'ClientWorkItem', 'ActivityEvent', 'ClientContact', 'Person']) mocks[`@/models/${name}`] = readonlyModel(name === 'Client' ? clients : name === 'Billing' ? bills : name === 'Payment' ? payments : []);
    const load = createLoader(mocks);
    const { executeBillingReport } = load('lib/server/billing-report-service.ts');
    const workbookFor = load('lib/server/billing-report-excel.ts').billingReportWorkbook;
    const results = [];
    let first;
    const output = path.join(root, 'outputs/billing-report-verification'); fs.mkdirSync(output, { recursive: true });
    for (const view of ['company', 'bill', 'component']) {
      const report = await executeBillingReport({ financialYear: FY, view }, true);
      first ||= report;
      const buffer = await workbookFor(report), workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet(view === 'company' ? 'Companies' : view === 'bill' ? 'Bills' : 'Components');
      const column = sheet.getRow(1).values.indexOf('Billed gross');
      let exported = 0; sheet.eachRow((row, index) => { if (index > 1) exported += Math.round(Number(row.getCell(column).value) * 100); });
      const rowCount = sheet.actualRowCount - 1;
      assert.equal(rowCount, report.pagination.totalRows);
      assert.equal(exported / 100, report.summary.billed);
      const paged = await executeBillingReport({ financialYear: FY, view, pageSize: 10 });
      assert.equal(paged.summary.billed, report.summary.billed);
      fs.writeFileSync(path.join(output, `billing-${view}-${FY}.xlsx`), buffer);
      results.push({ view, rows: rowCount, ...report.summary, exportedGross: exported / 100 });
    }
    const studio = await load('lib/server/report-studio-service.ts').executeReportStudio({ name: 'FY reconciliation', source: 'billing', financialYear: FY, columns: ['client.companyName', 'billing.total', 'payment.received', 'billing.outstanding'], metrics: ['billing.total', 'payment.received', 'billing.outstanding'], filters: { id: 'root', kind: 'group', logic: 'and', children: [] }, groupBy: [], sort: [] }, { exportAll: true });
    const billIds = new Set(bills.map(b => String(b._id)));
    const missingPayments = payments.filter(p => p.paymentType !== 'advance' && p.billingId && !billIds.has(String(p.billingId)));
    const missingIds = missingPayments.map(p => String(p.billingId));
    const archived = missingIds.length ? await db.collection('deletedrecords').find({ recordType: 'billing', recordId: { $in: missingIds } }, { projection: { recordId: 1, deletedAt: 1, 'data.clientId': 1, 'data.totalAmount': 1, 'data.financialYear': 1, 'data.invoiceNumber': 1, 'data.billType': 1 } }).toArray() : [];
    const activity = missingIds.length ? await db.collection('activityevents').find({ $or: [{ entityId: { $in: missingIds } }, { relatedEntityIds: { $in: missingIds } }] }, { projection: { type: 1, occurredAt: 1, entityId: 1, clientId: 1 } }).sort({ occurredAt: -1 }).limit(30).toArray() : [];
    const missingBillReview = missingPayments.map(p => ({ paymentId: String(p._id), billingId: String(p.billingId), clientId: p.clientId,
      company: clients.find(c => c.clientId === p.clientId)?.companyName || p.clientId, amount: p.amountPaid, financialYear: p.financialYear,
      paymentDate: p.paymentDate, source: p.source || 'legacy/direct',
      archives: archived.filter(a => a.recordId === p.billingId).map(a => ({ deletedAt: a.deletedAt, billType: a.data?.billType, totalAmount: a.data?.totalAmount, financialYear: a.data?.financialYear, invoiceNumber: a.data?.invoiceNumber || '' })),
      relatedActivity: activity.filter(a => a.entityId === p.billingId).map(a => ({ type: a.type, occurredAt: a.occurredAt })),
      action: 'Review required. No reassignment, deletion, restoration or balance adjustment performed.',
    }));
    const after = { bills: fingerprint(await db.collection('billings').find({}).sort({ _id: 1 }).toArray()), payments: fingerprint(await db.collection('payments').find({}).sort({ _id: 1 }).toArray()) };
    const baseline = { bills: 113, billed: 7015912 };
    const differences = { bills: first.summary.billCount - baseline.bills, billed: Math.round((first.summary.billed - baseline.billed) * 100) / 100 };
    const priorAudit = JSON.parse(fs.readFileSync(path.join(root, 'tmp/billing-report-data-audit.json'), 'utf8'));
    const since = new Date(priorAudit.observedAt);
    const createdSinceBaseline = bills.filter(b => b.financialYear === FY && new Date(b.createdAt) > since).map(b => ({ billingId: String(b._id), clientId: b.clientId, billType: b.billType, totalAmount: b.totalAmount, createdAt: b.createdAt, updatedAt: b.updatedAt }));
    const modifiedExistingSinceBaseline = bills.filter(b => b.financialYear === FY && new Date(b.createdAt) <= since && new Date(b.updatedAt) > since).map(b => ({ billingId: String(b._id), clientId: b.clientId, totalAmount: b.totalAmount, updatedAt: b.updatedAt }));
    let originalCohort = null;
    if (!modifiedExistingSinceBaseline.length) {
      const originalBills = bills.filter(b => b.financialYear === FY && new Date(b.createdAt) <= since);
      const originalIds = new Set(originalBills.map(b => String(b._id)));
      const originalPayments = payments.filter(p => (p.financialYear === FY || p.paymentType === 'advance' || originalIds.has(String(p.billingId))) && (!p.billingId || originalIds.has(String(p.billingId)) || !billIds.has(String(p.billingId))));
      originalCohort = [];
      for (const view of ['company', 'bill', 'component']) {
        const report = load('lib/billing-report.ts').buildBillingReport(originalBills, originalPayments, clients, { ...first.options, view }, annotations, true);
        const buffer = await workbookFor(report), wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
        const sheet = wb.getWorksheet(view === 'company' ? 'Companies' : view === 'bill' ? 'Bills' : 'Components');
        const col = sheet.getRow(1).values.indexOf('Billed gross'); let total = 0;
        sheet.eachRow((row, index) => { if (index > 1) total += Math.round(Number(row.getCell(col).value) * 100); });
        assert.equal(total / 100, baseline.billed); assert.equal(report.summary.billCount, baseline.bills);
        fs.writeFileSync(path.join(output, `original-113-${view}-${FY}.xlsx`), buffer);
        originalCohort.push({ view, bills: report.summary.billCount, companies: report.summary.companyCount, billed: report.summary.billed, componentGross: report.summary.componentGross, exportedGross: total / 100 });
      }
    }
    const evidence = { observedAt: new Date().toISOString(), readOnly: true, financialYear: FY, baseline, differences,
      baselineMatched: differences.bills === 0 && differences.billed === 0,
      sourceChanges: { since: since.toISOString(), createdSinceBaseline, createdGross: createdSinceBaseline.reduce((s, b) => s + Number(b.totalAmount || 0), 0), modifiedExistingSinceBaseline }, originalCohort,
      financialDocumentsUnchanged: before.bills === after.bills && before.payments === after.payments,
      views: results, customStudio: { companies: studio.summary.matchedClients, metrics: studio.summary.metrics }, missingBillReview };
    fs.writeFileSync(path.join(output, 'reconciliation.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    assert.equal(evidence.financialDocumentsUnchanged, true, 'Financial records changed during audit; inspect possible concurrent edits');
    // A changed live cohort is reported, never forced back to an old baseline.
    // Cross-view/export equality above remains mandatory.
  } catch (error) {
    if (error.name?.includes('Mongo')) console.error(JSON.stringify({ errorType: error.name, code: error.code || null, databaseAccessible: false }));
    else console.error(error);
    process.exitCode = 1;
  } finally { await connection.close(); }
}
main();
