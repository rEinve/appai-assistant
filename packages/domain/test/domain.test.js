const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveObligationKey,
  stableExecutionKey,
  transitionOperation,
  validateInstruction,
  validateQuoteAmounts,
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
