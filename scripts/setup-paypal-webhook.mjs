import { readFile, writeFile } from 'node:fs/promises';
import { paypalConfigFromEnv } from '../dist/api/packages/adapters/paypal-sandbox/src/index.js';

const config = paypalConfigFromEnv(process.env);
const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
const webhookUrl = 'https://appai.themeshak.com/api/demo/paypal/webhooks';

console.log('1. Authenticating with PayPal Sandbox API…');
const tokenRes = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'grant_type=client_credentials'
});

if (!tokenRes.ok) {
  const err = await tokenRes.text();
  throw new Error(`Failed to obtain PayPal access token: ${tokenRes.status} ${err}`);
}

const tokenData = await tokenRes.json();
const token = tokenData.access_token;
console.log('✔ PayPal OAuth token obtained.');

console.log('2. Checking existing webhooks…');
const listRes = await fetch('https://api-m.sandbox.paypal.com/v1/notifications/webhooks', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const listData = await listRes.json();
let existingWebhook = listData.webhooks?.find(w => w.url === webhookUrl);
let webhookId = existingWebhook?.id;

if (webhookId) {
  console.log(`✔ Webhook already registered with ID: ${webhookId}`);
} else {
  console.log(`3. Registering webhook for ${webhookUrl}…`);
  const createRes = await fetch('https://api-m.sandbox.paypal.com/v1/notifications/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: webhookUrl,
      event_types: [
        { name: 'CHECKOUT.ORDER.APPROVED' },
        { name: 'PAYMENT.CAPTURE.COMPLETED' },
        { name: 'PAYMENT.CAPTURE.DENIED' },
        { name: 'PAYMENT.CAPTURE.REFUNDED' }
      ]
    })
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create webhook: ${createRes.status} ${err}`);
  }

  const createdData = await createRes.json();
  webhookId = createdData.id;
  console.log(`✔ Successfully created webhook with ID: ${webhookId}`);
}

console.log(`4. Updating .env with PAYPAL_WEBHOOK_ID=${webhookId}…`);
const envPath = `${process.cwd()}/.env`;
let envContent = await readFile(envPath, 'utf8');

if (envContent.includes('PAYPAL_WEBHOOK_ID=')) {
  envContent = envContent.replace(/^PAYPAL_WEBHOOK_ID=.*$/m, `PAYPAL_WEBHOOK_ID=${webhookId}`);
} else {
  envContent += `\nPAYPAL_WEBHOOK_ID=${webhookId}\n`;
}

await writeFile(envPath, envContent, 'utf8');
console.log('✔ .env updated successfully.');
console.log(`\nWebhook Setup Complete!\nID: ${webhookId}\nURL: ${webhookUrl}\n`);
