const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../lib/quotationRules.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const {
  calculateQuotationItems,
  calculateQuotationAdditionalItems,
  calculateQuotationGrandTotal,
} = loaded.exports;

const billingFilename = path.resolve(__dirname, '../lib/billing-utils.ts');
const loadedBilling = new Module(billingFilename, module);
loadedBilling.filename = billingFilename;
loadedBilling.paths = Module._nodeModulePaths(path.dirname(billingFilename));
loadedBilling._compile(ts.transpileModule(fs.readFileSync(billingFilename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, billingFilename);
const { normalizeBillingBody } = loadedBilling.exports;

const targets = calculateQuotationItems([
  { description: 'CAT-I Recycling', category: 'CAT-I', type: 'Recycling', quantity: 10, rate: 12.5, gstPercent: 18 },
]);
const additional = calculateQuotationAdditionalItems([
  { lineId: 'line-1', description: 'Registration support', quantity: 2, rate: 1000.005, gstPercent: 18 },
  { lineId: 'line-2', description: 'Travel', quantity: 1, rate: 500, gstPercent: 0 },
]);
const totals = calculateQuotationGrandTotal({
  itemsSubtotal: targets.itemsSubtotal,
  itemsGst: targets.itemsGst,
  additionalItemsSubtotal: additional.additionalItemsSubtotal,
  additionalItemsGst: additional.additionalItemsGst,
  consultationCharges: 1500,
  consultationGstPercent: 18,
  governmentFees: 750,
});

assert.equal(targets.calculatedItems[0].totalAmount, 147.5);
assert.equal(additional.calculatedAdditionalItems[0].subtotal, 2000.01, 'Money is rounded at line level');
assert.equal(additional.additionalItemsTotal, 2860.01);
assert.equal(totals.consultationGstAmount, 270);
assert.equal(totals.grandTotal, 5527.51);
assert.equal(calculateQuotationGrandTotal({
  itemsSubtotal: 100,
  itemsGst: 18,
  consultationCharges: 0,
  consultationGstPercent: 18,
  governmentFees: 0,
}).grandTotal, 118, 'Legacy quotations remain compatible when additional totals are absent');

const annualBilling = normalizeBillingBody({
  clientId: 'CL-1',
  financialYear: '2025-26',
  billType: 'annual_return',
  govtCharges: 750,
  consultancyCharges: 1770,
  targetCharges: 147.5,
  otherCharges: 0,
  lineItems: additional.calculatedAdditionalItems,
});
assert.equal(annualBilling.lineItems.length, 2, 'Annual bills retain additional line items');
assert.equal(annualBilling.totalAmount, totals.grandTotal, 'Converted billing total matches the quotation total');

const generalBilling = normalizeBillingBody({
  clientId: 'CL-1',
  financialYear: '2025-26',
  billType: 'general',
  billTitle: 'General work',
  govtCharges: 999,
  lineItems: [{ description: 'Service', quantity: 1, rate: 100, gstPercent: 18 }],
});
assert.equal(generalBilling.totalAmount, 118, 'General billing remains line-item based');
assert.equal(generalBilling.govtCharges, 0, 'General billing does not inherit annual charge buckets');

console.log('Quotation additional-item regression checks passed.');
