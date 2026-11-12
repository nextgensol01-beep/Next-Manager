const fy = '2025-26';
const ids = { annual: '111111111111111111111111', general: '222222222222222222222222', other: '333333333333333333333333', missing: '999999999999999999999999' };
const line = (description, totalAmount) => ({ description, quantity: 1, rate: totalAmount, taxableAmount: totalAmount, gstPercent: 0, gstAmount: 0, totalAmount });
const clients = [{ clientId: 'A', companyName: 'Alpha Packaging', category: 'Producer', state: 'Delhi' }, { clientId: 'B', companyName: 'Beta Consultancy', category: 'Importer', state: 'Delhi' }];
const bills = [
  { _id: ids.annual, clientId: 'A', financialYear: fy, billType: 'annual_return', billTitle: 'Annual Return Filing', consultancyCharges: 5000, targetCharges: 10000, otherCharges: 0, govtCharges: 0, totalAmount: 18000, lineItems: [line('Additional service', 3000)], targetBreakdown: [{ quantity: 10, taxableAmount: 10000, gstAmount: 0, totalAmount: 10000 }], invoiceNumber: 'INV-001', invoiceCreated: true, invoiceDate: '2025-06-01', billDate: '2025-05-01' },
  { _id: ids.general, clientId: 'A', financialYear: fy, billType: 'general', billTitle: 'General work', totalAmount: 2000, lineItems: [line('Consultancy', 2000)], invoiceCreated: false, billDate: '2025-06-01' },
  { _id: ids.other, clientId: 'B', financialYear: fy, billType: 'general', billTitle: 'Other work', totalAmount: 3000, lineItems: [line('Target registration annual return consultancy', 3000)], invoiceCreated: false },
];
const payments = [
  { _id: 'p1', clientId: 'A', financialYear: fy, billingId: ids.annual, paymentType: 'billing', amountPaid: 2000 },
  { _id: 'p2', clientId: 'A', financialYear: fy, billingId: ids.annual, paymentType: 'billing', amountPaid: 3000 },
  { _id: 'p3', clientId: 'A', financialYear: fy, billingId: ids.general, paymentType: 'billing', amountPaid: 1000, source: 'advance_application' },
  { _id: 'advance', clientId: 'A', financialYear: '2024-25', paymentType: 'advance', amountPaid: 8000 },
  { _id: 'broken', clientId: 'A', financialYear: fy, billingId: ids.missing, paymentType: 'billing', amountPaid: 100000 },
];
module.exports = { fy, ids, bills, payments, clients, line };
