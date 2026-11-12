const assert = require('node:assert/strict');
const load = require('./search-test-loader.cjs')();
const { formatCurrency } = load('lib/utils.ts');
for (const value of [0, -0, 0.001, -0.001, 1, 1.2, 1.255, -1.255, 100000, 999999999.99, Number.NaN, Infinity, -Infinity]) {
  const expected = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  assert.equal(formatCurrency(value), expected);
}
console.log('PASS: unchanged INR grouping, precision, rounding, negative zero, non-finite and large-value display.');
