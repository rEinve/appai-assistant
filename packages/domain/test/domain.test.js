const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveObligationKey,
  stableExecutionKey,
  transitionOperation,
  validateInstruction,
  validateQuoteAmounts,
  validateProductCriteria,
  validateBillCriteria,
  validateAccommodationCriteria,
  reconcileQuoteTotals,
  computeQuoteHash,
} = require('../dist/index.js');
const { REVIEW_REQUIRED_ACCOMMODATION } = require('../dist/fixture.js');

test('accepts a complete fixture accommodation instruction for activation', () => {
  const result = validateInstruction(REVIEW_REQUIRED_ACCOMMODATION, true);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('blocks incomplete authority and category details', () => {
  const result = validateInstruction({ ...REVIEW_REQUIRED_ACCOMMODATION, mode: 'PRE_APPROVED', fundingMandateId: undefined, constraints: { guests: 0 } }, true);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === 'MISSING_AUTHORITY'));
  assert.ok(result.issues.some((entry) => entry.code === 'MISSING_CONSTRAINT'));
});

test('derives stable obligation identities for recurring bills and watches', () => {
  assert.equal(deriveObligationKey('RECURRING_BILL', 'BILL', { accountRef: 'acct-1', invoiceOrCycleRef: '2027-06' }), 'BILL:acct-1:2027-06');
  assert.equal(deriveObligationKey('WATCH', 'ACCOMMODATION', {}, 'stay-1'), 'WATCH:ACCOMMODATION:stay-1');
});

test('rejects quote totals that do not reconcile', () => {
  const result = validateQuoteAmounts({ subtotalMinor: '90000000', taxMinor: '0', feesMinor: '0', shippingMinor: '0', discountMinor: '0', totalMinor: '98000000', currency: 'TZS', quantity: 1 });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === 'MONEY_MISMATCH'));
});

test('permits only declared operation transitions', () => {
  assert.equal(transitionOperation('READY', 'RESERVED'), 'RESERVED');
  assert.throws(() => transitionOperation('READY', 'SUCCEEDED'), { code: 'INVALID_OPERATION_TRANSITION' });
});

test('execution identity is stable and quote-bound', () => {
  assert.equal(stableExecutionKey('7e3d9b4e-47d0-4e46-8f83-2b1b5e0ce041', 'sha256:fixture-quote-v1', 3), 'operation:7e3d9b4e-47d0-4e46-8f83-2b1b5e0ce041:quote:sha256:fixture-quote-v1:permission:3');
});

test('validates category criteria and blocks already paid bills and invalid stays', () => {
  assert.equal(validateProductCriteria({ variant: 'blue / medium', quantity: 2, deliveryWindow: '2027-06', returnPolicy: '30 days' }).valid, true);
  assert.equal(validateProductCriteria({ variant: '', quantity: 0 }).valid, false);
  assert.equal(validateBillCriteria({ payeeName: 'Power Co', accountRef: 'a-1', invoiceRef: 'i-1', billingCycle: '2027-06', unpaidStatus: 'PAID' }).valid, false);
  assert.equal(validateAccommodationCriteria({ destination: 'Arusha', checkIn: '2027-06-12', checkOut: '2027-06-10', guests: 1, rooms: 1, rateType: 'standard', cancellationTerms: 'free cancellation' }).valid, false);
});

test('quote contract reconciles exact minor units, currency, and canonical hash', () => {
  const quote = { sourceQuoteKey: 'supplier-1:offer-1', subtotalMinor: '10000', taxMinor: '1000', shippingMinor: '500', feesMinor: '0', discountMinor: '500', totalMinor: '11000', currency: 'USD', payee: 'Supplier', terms: { return: '30 days', cancellation: 'none' } };
  assert.equal(reconcileQuoteTotals(quote, 'USD').valid, true);
  assert.ok(reconcileQuoteTotals({ ...quote, totalMinor: '10999' }, 'USD').issues.some(issue => issue.code === 'UNRECONCILED_QUOTE_ARITHMETIC'));
  assert.ok(reconcileQuoteTotals(quote, 'TZS').issues.some(issue => issue.code === 'CURRENCY_MISMATCH'));
  assert.equal(computeQuoteHash(quote), computeQuoteHash({ ...quote, terms: { cancellation: 'none', return: '30 days' } }));
  assert.notEqual(computeQuoteHash(quote), computeQuoteHash({ ...quote, taxMinor: '999' }));
});
