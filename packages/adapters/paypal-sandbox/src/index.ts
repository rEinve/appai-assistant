export type PayPalDemoMode = 'fixture' | 'sandbox';

export interface PayPalSandboxConfig {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  currency: string;
  currencyScale: number;
  baseUrl: string;
}

export interface CreatePayPalOrderInput {
  operationId: string;
  amountMinor: string;
  description: string;
  reference: string;
  payee?: {
    merchantId?: string;
    emailAddress?: string;
  };
}

export interface PayPalOrderResult {
  id: string;
  status: string;
  approvalUrl?: string;
  roles?: {
    buyerRole: string;
    callerRole: string;
    payeeRole: string;
  };
  raw: unknown;
}

export const PAYPAL_M0_CAPABILITY = {
  adapterKey: 'paypal-sandbox',
  adapterVersion: '2.0.0',
  paymentRail: 'PAYPAL',
  buyerRole: 'AUTHENTICATED_MEMBER_PAYPAL_BUYER',
  callerRole: 'APPAI_OAUTH_CLIENT_CREDENTIALS',
  payeeRole: 'VERIFIED_SANDBOX_MERCHANT',
  reviewExecutionSupported: true,
  unattendedExecutionSupported: false,
  statusLookupSupported: true,
  webhookVerificationSupported: true,
  reservationSupported: false,
  deferredHoldCaptureSupported: false,
  biddingSupported: false,
} as const;

export class PayPalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayPalConfigurationError';
  }
}

export class PayPalUnsupportedCapabilityError extends Error {
  public readonly code = 'CAPABILITY_UNSUPPORTED';
  constructor(public readonly operation: string, message: string) {
    super(message);
    this.name = 'PayPalUnsupportedCapabilityError';
  }
}

export function assertPayPalOperationSupported(operation: string): void {
  const unsupported = new Set(['HOLD', 'AUTHORIZE', 'CAPTURE_HOLD', 'VOID_HOLD', 'DEPOSIT', 'BID', 'ESCROW']);
  if (unsupported.has(operation.toUpperCase())) {
    throw new PayPalUnsupportedCapabilityError(
      operation,
      `MVP cannot invoke unimplemented ${operation} workflow; reservation and deferred hold/capture are disabled (AC-17).`,
    );
  }
}

export class PayPalApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'PayPalApiError';
  }
}

export function paypalConfigFromEnv(env: Record<string, string | undefined>): PayPalSandboxConfig {
  const clientId = env['PAYPAL_CLIENT_ID'];
  const clientSecret = env['PAYPAL_CLIENT_SECRET'];
  const currency = env['PAYPAL_CURRENCY'] ?? 'USD';
  const currencyScale = Number(env['PAYPAL_CURRENCY_SCALE'] ?? '2');
  if (!clientId || !clientSecret) throw new PayPalConfigurationError('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for sandbox mode.');
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isInteger(currencyScale) || currencyScale < 0 || currencyScale > 9) throw new PayPalConfigurationError('PAYPAL_CURRENCY and PAYPAL_CURRENCY_SCALE are invalid.');
  return { clientId, clientSecret, webhookId: env['PAYPAL_WEBHOOK_ID'], currency, currencyScale, baseUrl: 'https://api-m.sandbox.paypal.com' };
}

export function formatMinorUnits(amountMinor: string, scale: number): string {
  if (!/^\d+$/.test(amountMinor) || !Number.isInteger(scale) || scale < 0) throw new PayPalConfigurationError('Amount must be a non-negative decimal minor-unit string.');
  if (scale === 0) return amountMinor;
  const padded = amountMinor.padStart(scale + 1, '0');
  const split = padded.length - scale;
  return `${padded.slice(0, split)}.${padded.slice(split)}`;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PayPalSandboxClient {
  private accessToken?: string;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: PayPalSandboxConfig, private readonly fetchImpl: FetchLike = fetch) {}

  private async accessTokenValue(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;
    const basic = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string') throw new PayPalApiError(response.status, 'PayPal OAuth token request failed.', body);
    const token = body.access_token as string;
    this.accessToken = token;
    this.accessTokenExpiresAt = Date.now() + Math.max(30, Number(body.expires_in ?? 300) - 60) * 1000;
    return token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.accessTokenValue();
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new PayPalApiError(response.status, `PayPal request failed with HTTP ${response.status}.`, body);
    return body as T;
  }

  async createOrder(input: CreatePayPalOrderInput): Promise<PayPalOrderResult> {
    assertPayPalOperationSupported('CREATE_ORDER');
    const payeeUnit = input.payee && (input.payee.merchantId || input.payee.emailAddress)
      ? { payee: { ...(input.payee.merchantId ? { merchant_id: input.payee.merchantId } : {}), ...(input.payee.emailAddress ? { email_address: input.payee.emailAddress } : {}) } }
      : {};
    const body = await this.request<{ id: string; status: string; links?: Array<{ rel: string; href: string }> }>('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': input.operationId },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: input.reference,
          custom_id: input.operationId,
          description: input.description,
          amount: { currency_code: this.config.currency, value: formatMinorUnits(input.amountMinor, this.config.currencyScale) },
          ...payeeUnit,
        }],
      }),
    });
    return {
      id: body.id,
      status: body.status,
      approvalUrl: body.links?.find((link) => link.rel === 'approve')?.href,
      roles: {
        buyerRole: PAYPAL_M0_CAPABILITY.buyerRole,
        callerRole: PAYPAL_M0_CAPABILITY.callerRole,
        payeeRole: PAYPAL_M0_CAPABILITY.payeeRole,
      },
      raw: body,
    };
  }

  async captureOrder(orderId: string, operationId: string): Promise<PayPalOrderResult> {
    assertPayPalOperationSupported('CAPTURE_ORDER');
    const body = await this.request<{ id: string; status: string }>('/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', { method: 'POST', headers: { 'PayPal-Request-Id': operationId }, body: JSON.stringify({}) });
    return {
      id: body.id,
      status: body.status,
      roles: {
        buyerRole: PAYPAL_M0_CAPABILITY.buyerRole,
        callerRole: PAYPAL_M0_CAPABILITY.callerRole,
        payeeRole: PAYPAL_M0_CAPABILITY.payeeRole,
      },
      raw: body,
    };
  }

  async getOrder(orderId: string): Promise<PayPalOrderResult> {
    assertPayPalOperationSupported('GET_ORDER');
    const body = await this.request<{ id: string; status: string }>('/v2/checkout/orders/' + encodeURIComponent(orderId));
    return {
      id: body.id,
      status: body.status,
      roles: {
        buyerRole: PAYPAL_M0_CAPABILITY.buyerRole,
        callerRole: PAYPAL_M0_CAPABILITY.callerRole,
        payeeRole: PAYPAL_M0_CAPABILITY.payeeRole,
      },
      raw: body,
    };
  }

  async verifyWebhook(headers: { transmissionId: string; transmissionTime: string; certUrl: string; authAlgo: string; transmissionSig: string }, event: unknown): Promise<boolean> {
    if (!this.config.webhookId) throw new PayPalConfigurationError('PAYPAL_WEBHOOK_ID is required for webhook verification.');
    const body = await this.request<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', { method: 'POST', body: JSON.stringify({ auth_algo: headers.authAlgo, cert_url: headers.certUrl, transmission_id: headers.transmissionId, transmission_sig: headers.transmissionSig, transmission_time: headers.transmissionTime, webhook_id: this.config.webhookId, webhook_event: event }) });
    return body.verification_status === 'SUCCESS';
  }
}
