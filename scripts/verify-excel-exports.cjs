const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const createLoader = require('./search-test-loader.cjs');

async function readWorkbook(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /\.xlsx"$/);
  assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  return workbook;
}

async function main() {
  const session = { user: { id: 'fixture-admin' } };
  const clientName = 'Fixture Packaging & Recycling';
  const load = createLoader({
    'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { authOptions: {} }, '@/lib/authUsers': { isAdminSession: async () => true },
    '@/lib/mongoose': { connectDB: async () => {} },
    '@/lib/route-utils': { requireSession: async () => ({}), errorResponse: error => { throw error; } },
    '@/lib/server/custom-client-export': { buildCustomClientExportData: async () => ({
      fields: ['companyName', 'total'], fieldConfigs: { companyName: { label: 'Company' }, total: { label: 'Total' } },
      rows: [{ companyName: clientName, total: 1234.5 }], fy: '2025-26',
    }) },
    '@/lib/server/report-studio-service': { executeReportStudio: async (_body, options) => {
      assert.deepEqual(options, { exportAll: true });
      return {
        config: { name: 'Fixture report', source: 'clients', financialYear: '2025-26', filters: [], groupBy: [] },
        columns: [{ id: 'name', label: 'Company', type: 'text' }, { id: 'amount', label: 'Billed', type: 'currency' }],
        rows: [{ values: { name: clientName, amount: 1234.5 } }],
        summary: { matchedClients: 1, metrics: [], businessResults: [], columnResults: [] }, quality: { messages: [] },
      };
    } },
    '@/models/ClientTracker': { findById: () => ({ select: () => ({ lean: async () => ({ name: 'Fixture tracker' }) }) }) },
    '@/models/EmailLog': { find: () => ({ sort: () => ({ lean: async () => [{
      sentAt: new Date('2026-01-01T00:00:00Z'), clientName, clientId: 'CLIENT', status: 'sent',
      to: ['client@example.invalid'], subject: 'Fixture message', attachments: [{ filename: 'statement.pdf' }],
    }] }) }) },
  });
  const post = new Request('https://fixture.invalid', { method: 'POST', body: '{}' });
  const custom = await readWorkbook(await load('app/api/reports/custom-export/route.ts').POST(post.clone()));
  const customSheet = custom.getWorksheet('Custom Client Export');
  assert.equal(customSheet.getCell('A1').value, 'Company');
  assert.equal(customSheet.getCell('A2').value, clientName);
  assert.equal(customSheet.getCell('B2').value, 1234.5);
  assert.equal(customSheet.views[0].xSplit, 1);

  const studio = await readWorkbook(await load('app/api/reports/studio/export/route.ts').POST(post));
  const results = studio.getWorksheet('Report Results');
  assert.equal(results.getCell('A2').value, clientName);
  assert.equal(results.getCell('B2').value, 1234.5);
  assert(results.getCell('B2').numFmt);
  assert(studio.getWorksheet('Configuration & Summary'));

  const history = await readWorkbook(await load('app/api/client-trackers/[id]/email/export/route.ts').GET(
    new Request('https://fixture.invalid'), { params: Promise.resolve({ id: 'fixture' }) },
  ));
  const sheet = history.getWorksheet('Email history');
  assert.equal(sheet.getCell('A2').value.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(sheet.getCell('B2').value, clientName);
  assert.equal(sheet.getCell('K2').value, 'statement.pdf');
  assert.equal(sheet.views[0].xSplit, 3);
  console.log('PASS: custom-client, general Report Studio and tracker email-history XLSX responses reload with expected data and formats.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
