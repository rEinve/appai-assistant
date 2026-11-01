const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PayPalSandboxClient,
  PAYPAL_M0_CAPABILITY,
  assertPayPalOperationSupported,
  formatMinorUnits,
} = require('../../../../dist/api/packages/adapters/paypal-sandbox/src/index.js');

test('formats exact minor units for the PayPal amount contract', () => {
  assert.equal(formatMinorUnits('9800', 2), '98.00');
  assert.equal(formatMinorUnits('1200000', 0), '1200000');
});

test('uses OAuth, binds buyer/caller/payee roles, and creates an idempotent sandbox order request', async () => {
  const calls = [];
  const responses = [
    { access_token: 'sandbox-token', expires_in: 3600 },
    { id: '5O190127TN364715T', status: 'CREATED', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T' }] },
  ];
  const fetchStub = async (input, init = {}) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = new PayPalSandboxClient({ clientId: 'client-id', clientSecret: 'client-secret', currency: 'USD', currencyScale: 2, baseUrl: 'https://api-m.sandbox.paypal.com' }, fetchStub);
  const order = await client.createOrder({
    operationId: 'operation-001',
    amountMinor: '9800',
    description: 'Demo stay',
    reference: 'fixture-kibo-house',
    payee: { merchantId: 'MERCHANT123' },
  });
  assert.equal(order.id, '5O190127TN364715T');
  assert.equal(order.approvalUrl, 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T');
  assert.deepEqual(order.roles, {
    buyerRole: PAYPAL_M0_CAPABILITY.buyerRole,
    callerRole: PAYPAL_M0_CAPABILITY.callerRole,
    payeeRole: PAYPAL_M0_CAPABILITY.payeeRole,
  });
  assert.equal(calls[0].input, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
  assert.equal(calls[1].input, 'https://api-m.sandbox.paypal.com/v2/checkout/orders');
  assert.equal(calls[1].init.headers['PayPal-Request-Id'], 'operation-001');
  const parsedBody = JSON.parse(calls[1].init.body);
  assert.deepEqual(parsedBody.purchase_units[0].amount, { currency_code: 'USD', value: '98.00' });
  assert.deepEqual(parsedBody.purchase_units[0].payee, { merchant_id: 'MERCHANT123' });
});

test('AC-17 blocks unimplemented hold, deposit, and bid capabilities in MVP', () => {
  assert.equal(PAYPAL_M0_CAPABILITY.reservationSupported, false);
  assert.equal(PAYPAL_M0_CAPABILITY.deferredHoldCaptureSupported, false);
  for (const op of ['HOLD', 'AUTHORIZE', 'CAPTURE_HOLD', 'DEPOSIT', 'BID']) {
    assert.throws(() => assertPayPalOperationSupported(op), { code: 'CAPABILITY_UNSUPPORTED' });
  }
});
