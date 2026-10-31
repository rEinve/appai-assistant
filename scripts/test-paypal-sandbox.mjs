import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PayPalSandboxClient, paypalConfigFromEnv } from '../dist/api/packages/adapters/paypal-sandbox/src/index.js';

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the private .env before running the PayPal sandbox smoke test.');
}

const client = new PayPalSandboxClient(paypalConfigFromEnv(process.env));
const operationId = `appai-sandbox-${randomUUID()}`;
const order = await client.createOrder({ operationId, amountMinor: '100', description: 'A-P-P-A-I Developer sandbox smoke test', reference: operationId });
assert.ok(order.id, 'sandbox order must return an external order ID');
assert.equal(order.status, 'CREATED', 'sandbox order should start in CREATED state');
assert.match(order.approvalUrl ?? '', /^https:\/\/(www\.)?sandbox\.paypal\.com\//, 'sandbox order must return a PayPal approval URL');
const fetched = await client.getOrder(order.id);
assert.equal(fetched.id, order.id, 'sandbox status lookup must return the same order');
assert.equal(fetched.status, 'CREATED', 'unapproved sandbox order must remain CREATED');
console.log(`PASS: PayPal sandbox order ${order.id} created and read back as CREATED.`);
console.log('Approval and capture were intentionally not performed by this smoke test.');
