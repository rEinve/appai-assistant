import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PayPalSandboxClient, paypalConfigFromEnv } from '../dist/api/packages/adapters/paypal-sandbox/src/index.js';

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the private .env before running the PayPal sandbox smoke test.');
}

const client = new PayPalSandboxClient(paypalConfigFromEnv(process.env));
const orderArgument = process.argv.slice(2).find((arg) => arg.startsWith('--order='))?.slice('--order='.length);
const captureArgument = process.argv.slice(2).find((arg) => arg.startsWith('--capture='))?.slice('--capture='.length);
if (orderArgument && captureArgument) throw new Error('Use either --order=ID or --capture=ID, not both.');

if (captureArgument) {
  const captured = await client.captureOrder(captureArgument, `appai-sandbox-capture-${randomUUID()}`);
  assert.equal(captured.status, 'COMPLETED', 'approved sandbox order should capture as COMPLETED');
  console.log(`PASS: PayPal sandbox order ${captured.id} captured as COMPLETED.`);
  console.log('This is a sandbox transaction only; no live money moved.');
} else {
  const operationId = `appai-sandbox-${randomUUID()}`;
  const order = orderArgument
    ? await client.getOrder(orderArgument)
    : await client.createOrder({ operationId, amountMinor: '100', description: 'A-P-P-A-I Developer sandbox smoke test', reference: operationId });
  assert.ok(order.id, 'sandbox order must return an external order ID');
  assert.equal(order.status, 'CREATED', 'sandbox order should remain unapproved before buyer approval');
  assert.match(order.approvalUrl ?? '', /^https:\/\/(www\.)?sandbox\.paypal\.com\//, 'sandbox order must return a PayPal approval URL');
  console.log(`PASS: PayPal sandbox order ${order.id} is CREATED and ready for buyer approval.`);
  console.log(`Approve with the PayPal Developer sandbox Personal buyer: ${order.approvalUrl}`);
  console.log(`After buyer approval, capture explicitly with: npm run test:paypal:sandbox -- --capture=${order.id}`);
}
