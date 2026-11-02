import { createHash } from 'node:crypto';

export type PermissionMode = 'PRE_APPROVED' | 'REVIEW_REQUIRED' | 'NOTIFY_ONLY';
export type InstructionKind = 'ONE_TIME' | 'SCHEDULED' | 'RECURRING_BILL' | 'WATCH';
export type Category = 'PRODUCT' | 'BILL' | 'ACCOMMODATION';
export type InstructionState = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
export type OperationState =
  | 'DISCOVERING' | 'QUOTED' | 'AWAITING_APPROVAL' | 'READY' | 'RESERVED'
  | 'SUBMITTING' | 'RECONCILING' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED'
  | 'EXPIRED' | 'CANCELLED' | 'CANCEL_REQUESTED';

export interface InstructionConstraints {
  [key: string]: unknown;
}

export interface InstructionDraft {
  id?: string;
  ownerId?: string;
  kind: InstructionKind;
  category: Category;
  mode: PermissionMode;
  constraints: InstructionConstraints;
  allowedPayees?: string[];
  maxTotalMinor?: string;
  currency?: string;
  budgetId?: string;
  fundingMandateId?: string;
  validFrom?: string;
  validUntil?: string;
  timezone?: string;
  completionLimit?: number;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface QuoteAmounts {
  subtotalMinor: string;
  taxMinor: string;
  feesMinor: string;
  shippingMinor: string;
  discountMinor: string;
  totalMinor: string;
  currency: string;
  quantity: number;
}

export interface CategoryValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export interface ProductDetails { variant: string; quantity: number; deliveryWindow: string; returnPolicy: string; sellerReputation?: string }
export interface BillDetails { payeeName: string; accountRef: string; invoiceRef: string; billingCycle: string; unpaidStatus: 'UNPAID' }
export interface AccommodationDetails { destination: string; checkIn: string; checkOut: string; guests: number; rooms: number; rateType: string; cancellationTerms: string }

function validateRecord<T>(details: unknown, fields: Record<string, (value: unknown) => boolean>, makeValue: (record: Record<string, unknown>) => T): CategoryValidationResult<T> {
  const record = details && typeof details === 'object' && !Array.isArray(details) ? details as Record<string, unknown> : {};
  const issues = Object.entries(fields).flatMap(([field, check]) => check(record[field]) ? [] : [issue('INVALID_CATEGORY_DETAILS', field, `${field} is missing or invalid.`)]);
  return issues.length ? { valid: false, issues } : { valid: true, value: makeValue(record), issues };
}

const text = (value: unknown): value is string => nonEmpty(value);
const count = (value: unknown): value is number => positiveInteger(value);
const isoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateProductCriteria(details: unknown): CategoryValidationResult<ProductDetails> {
  return validateRecord(details, { variant: text, quantity: count, deliveryWindow: text, returnPolicy: text }, r => ({ variant: String(r['variant']).trim(), quantity: r['quantity'] as number, deliveryWindow: String(r['deliveryWindow']).trim(), returnPolicy: String(r['returnPolicy']).trim(), ...(text(r['sellerReputation']) ? { sellerReputation: r['sellerReputation'].trim() } : {}) }));
}
export function validateBillCriteria(details: unknown): CategoryValidationResult<BillDetails> {
  return validateRecord(details, { payeeName: text, accountRef: text, invoiceRef: text, billingCycle: v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v), unpaidStatus: v => v === 'UNPAID' }, r => ({ payeeName: String(r['payeeName']).trim(), accountRef: String(r['accountRef']).trim(), invoiceRef: String(r['invoiceRef']).trim(), billingCycle: String(r['billingCycle']), unpaidStatus: 'UNPAID' }));
}
export function validateAccommodationCriteria(details: unknown): CategoryValidationResult<AccommodationDetails> {
  const result = validateRecord(details, { destination: text, checkIn: isoDate, checkOut: isoDate, guests: count, rooms: count, rateType: text, cancellationTerms: text }, r => ({ destination: String(r['destination']).trim(), checkIn: String(r['checkIn']), checkOut: String(r['checkOut']), guests: r['guests'] as number, rooms: r['rooms'] as number, rateType: String(r['rateType']).trim(), cancellationTerms: String(r['cancellationTerms']).trim() }));
  if (result.valid && result.value && result.value.checkOut <= result.value.checkIn) return { valid: false, issues: [issue('INVALID_DATE_RANGE', 'checkOut', 'Check-out must be after check-in.')] };
  return result;
}

export interface CanonicalQuoteInput { sourceQuoteKey: string; subtotalMinor: string; taxMinor: string; shippingMinor: string; feesMinor: string; discountMinor: string; totalMinor: string; currency: string; payee: string; terms: unknown }
export function reconcileQuoteTotals(quote: CanonicalQuoteInput, expectedCurrency?: string): ValidationResult {
  const amounts: QuoteAmounts = { subtotalMinor: quote.subtotalMinor, taxMinor: quote.taxMinor, shippingMinor: quote.shippingMinor, feesMinor: quote.feesMinor, discountMinor: quote.discountMinor, totalMinor: quote.totalMinor, currency: quote.currency, quantity: 1 };
  const issues = validateQuoteAmounts(amounts).issues.map(i => ({ ...i, code: i.code === 'MONEY_MISMATCH' ? 'UNRECONCILED_QUOTE_ARITHMETIC' : i.code }));
  if (expectedCurrency && quote.currency !== expectedCurrency) issues.push(issue('CURRENCY_MISMATCH', 'currency', 'Quote currency must match the instruction and budget.'));
  return { valid: issues.length === 0, issues };
}

export interface SpendingPolicyEvaluationInput {
  quoteCurrency: string;
  instructionCurrency: string;
  budgetCurrency: string;
  policyCurrency: string;
  totalMinor: string;
  unitPriceMinor: string;
  quantity: number;
  instructionMaxTotalMinor: string;
  perOrderHardLimitMinor: string;
  unitLimitMinor?: string | null;
  availableBudgetMinor: string;
  availableDailyMinor: string;
  /** Informational only; approval never changes hard-cap evaluation. */
  approvalStatus?: string;
}

const MAX_MINOR = 9_223_372_036_854_775_807n;

export function evaluateSpendingPolicy(input: SpendingPolicyEvaluationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const currencies = [input.quoteCurrency, input.instructionCurrency, input.budgetCurrency, input.policyCurrency];
  if (currencies.some(currency => !CURRENCY.test(currency)) || currencies.some(currency => currency !== currencies[0])) {
    issues.push(issue('CURRENCY_MISMATCH', 'currency', 'Quote, instruction, budget, and policy currencies must match.'));
  }
  const moneyFields: Array<[string, string]> = [
    ['totalMinor', input.totalMinor], ['unitPriceMinor', input.unitPriceMinor],
    ['instructionMaxTotalMinor', input.instructionMaxTotalMinor], ['perOrderHardLimitMinor', input.perOrderHardLimitMinor],
    ['availableBudgetMinor', input.availableBudgetMinor], ['availableDailyMinor', input.availableDailyMinor],
    ...(input.unitLimitMinor == null ? [] : [['unitLimitMinor', input.unitLimitMinor] as [string, string]]),
  ];
  const amounts = new Map<string, bigint>();
  for (const [field, value] of moneyFields) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      issues.push(issue('INVALID_MONEY', field, `${field} must be a non-negative minor-unit string.`));
      continue;
    }
    const amount = BigInt(value);
    if (amount > MAX_MINOR) issues.push(issue('INVALID_MONEY', field, `${field} exceeds the supported PostgreSQL bigint range.`));
    else amounts.set(field, amount);
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) issues.push(issue('INVALID_QUANTITY', 'quantity', 'Quantity must be a positive safe integer.'));

  const total = amounts.get('totalMinor');
  const unit = amounts.get('unitPriceMinor');
  const perOrder = amounts.get('perOrderHardLimitMinor');
  const instructionMax = amounts.get('instructionMaxTotalMinor');
  const availableBudget = amounts.get('availableBudgetMinor');
  const availableDaily = amounts.get('availableDailyMinor');
  const unitLimit = amounts.get('unitLimitMinor');
  if (total !== undefined && total <= 0n) issues.push(issue('INVALID_MONEY', 'totalMinor', 'Payable total must be greater than zero.'));
  if (unit !== undefined && unit <= 0n) issues.push(issue('INVALID_MONEY', 'unitPriceMinor', 'Unit price must be greater than zero.'));
  if (perOrder !== undefined && perOrder <= 0n) issues.push(issue('INVALID_MONEY', 'perOrderHardLimitMinor', 'Per-order limit must be greater than zero.'));
  if (instructionMax !== undefined && instructionMax <= 0n) issues.push(issue('INVALID_MONEY', 'instructionMaxTotalMinor', 'Instruction ceiling must be greater than zero.'));
  if (unit !== undefined && unitLimit !== undefined && unit > unitLimit) issues.push(issue('UNIT_CAP_EXCEEDED', 'unitPriceMinor', 'Unit price exceeds the policy unit limit.'));
  if (total !== undefined && perOrder !== undefined && total > perOrder) issues.push(issue('ORDER_HARD_CAP_EXCEEDED', 'totalMinor', 'Payable total exceeds the per-order hard limit.'));
  if (total !== undefined && instructionMax !== undefined && total > instructionMax) issues.push(issue('INSTRUCTION_CAP_EXCEEDED', 'totalMinor', 'Payable total exceeds the instruction ceiling.'));
  if (total !== undefined && availableBudget !== undefined && total > availableBudget) issues.push(issue('INSUFFICIENT_BUDGET_CAPACITY', 'totalMinor', 'Payable total exceeds available shared budget capacity.'));
  if (total !== undefined && availableDaily !== undefined && total > availableDaily) issues.push(issue('DAILY_LIMIT_EXCEEDED', 'totalMinor', 'Payable total exceeds available daily capacity.'));
  return { valid: issues.length === 0, issues };
}

export function stableCancellationKey(operationId: string, permissionVersion: number): string {
  return createHash('sha256').update(`cancel:${operationId}:${permissionVersion}`).digest('hex');
}

export function inspectUntrustedMerchantContent(input: unknown): {
  safe: boolean; issues: ValidationIssue[]; sanitizedText: string;
} {
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  const issues: ValidationIssue[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, 'PROMPT_INJECTION'],
    [/(override|raise|increase|change)\s+(the\s+)?(budget|price|payee|recipient|spending)/i, 'AUTHORITY_ESCALATION'],
    [/(system\s+prompt|pre[_ -]?approved|send\s+payment\s+to)/i, 'AUTHORITY_ESCALATION'],
  ];
  for (const [pattern, code] of patterns) if (pattern.test(text)) issues.push({ code, field: 'merchantContent', message: 'Untrusted merchant content contains an instruction or authority override.' });
  const urls = text.match(/(?:https?|javascript|data|file|fixture):[^\s"'<>)}]+/gi) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      const privateHost = host === 'localhost' || host === '::1' || host === '127.0.0.1'
        || /^10\./.test(host) || /^192\.168\./.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '169.254.169.254';
      if (url.protocol === 'fixture:') continue;
      if (url.protocol !== 'https:' || privateHost) issues.push({ code: 'UNSAFE_MERCHANT_URL', field: 'merchantContent', message: 'Untrusted merchant content contains an unsafe URL.' });
    } catch { issues.push({ code: 'UNSAFE_MERCHANT_URL', field: 'merchantContent', message: 'Untrusted merchant content contains an invalid URL.' }); }
  }
  return { safe: issues.length === 0, issues, sanitizedText: text.slice(0, 4000) };
}

export function redactSensitivePayload<T>(payload: T): T {
  const secretKey = /(access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|cookie|password|raw[_-]?card|cvv|bearer|credential)/i;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
      [key, secretKey.test(key) ? '[REDACTED]' : visit(item)]));
  };
  return visit(payload) as T;
}

export function computeQuoteHash(quote: CanonicalQuoteInput): string {
  const canonicalize = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)])) : value;
  const canonical = JSON.stringify(canonicalize({ sourceQuoteKey: quote.sourceQuoteKey, subtotalMinor: quote.subtotalMinor, taxMinor: quote.taxMinor, shippingMinor: quote.shippingMinor, feesMinor: quote.feesMinor, discountMinor: quote.discountMinor, totalMinor: quote.totalMinor, currency: quote.currency, payee: quote.payee, terms: quote.terms }));
  return createHash('sha256').update(canonical).digest('hex');
}
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

function issue(code: string, field: string, message: string): ValidationIssue {
  return { code, field, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false;
  return value > 0;
}

function positiveMinor(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
  try { return BigInt(value) > 0n; } catch { return false; }
}

function stringField(constraints: InstructionConstraints, field: string): boolean {
  return nonEmpty(constraints[field]);
}

function hasAccommodationConstraints(constraints: InstructionConstraints): ValidationIssue[] {
  const required = ['propertyRef', 'roomRef', 'rateRef', 'checkIn', 'checkOut', 'cancellationTerms'];
  const issues = required.filter((field) => !stringField(constraints, field)).map((field) => issue('MISSING_CONSTRAINT', `constraints.${field}`, `${field} is required for accommodation.`));
  if (!positiveInteger(constraints['guests'])) issues.push(issue('INVALID_CONSTRAINT', 'constraints.guests', 'At least one guest is required.'));
  if (!positiveInteger(constraints['rooms'])) issues.push(issue('INVALID_CONSTRAINT', 'constraints.rooms', 'At least one room is required.'));
  const checkIn = constraints['checkIn'];
  const checkOut = constraints['checkOut'];
  if (typeof checkIn === 'string' && typeof checkOut === 'string' && checkOut <= checkIn) {
    issues.push(issue('INVALID_DATE_RANGE', 'constraints.checkOut', 'Check-out must be after check-in.'));
  }
  return issues;
}

function categoryIssues(category: Category, constraints: InstructionConstraints): ValidationIssue[] {
  if (category === 'PRODUCT') {
    const issues = ['sku', 'variantRef', 'destinationRef', 'deliveryWindow'].filter((field) => !stringField(constraints, field)).map((field) => issue('MISSING_CONSTRAINT', `constraints.${field}`, `${field} is required for a product.`));
    if (!positiveInteger(constraints['quantity'])) issues.push(issue('INVALID_CONSTRAINT', 'constraints.quantity', 'Quantity must be a positive integer.'));
    return issues;
  }
  if (category === 'BILL') {
    return ['accountRef', 'invoiceOrCycleRef', 'dueAt'].filter((field) => !stringField(constraints, field)).map((field) => issue('MISSING_CONSTRAINT', `constraints.${field}`, `${field} is required for a bill.`)).concat(constraints['unpaidStatus'] === 'UNPAID' ? [] : [issue('UNVERIFIED_BILL', 'constraints.unpaidStatus', 'The vendor must confirm that this bill is unpaid.')]);
  }
  return hasAccommodationConstraints(constraints);
}

export function validateInstruction(draft: InstructionDraft, forActivation = false): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (draft.ownerId && !UUID.test(draft.ownerId)) issues.push(issue('INVALID_ID', 'ownerId', 'Owner ID must be a UUID.'));
  if (!draft.kind) issues.push(issue('MISSING_FIELD', 'kind', 'Instruction kind is required.'));
  if (!draft.category) issues.push(issue('MISSING_FIELD', 'category', 'Category is required.'));
  if (!draft.mode) issues.push(issue('MISSING_FIELD', 'mode', 'Permission mode is required.'));
  if (!nonEmpty(draft.currency) || !CURRENCY.test(draft.currency)) issues.push(issue('INVALID_CURRENCY', 'currency', 'Currency must be an uppercase ISO 4217 code.'));
  if (!positiveMinor(draft.maxTotalMinor)) issues.push(issue('INVALID_MONEY', 'maxTotalMinor', 'Maximum total must be a positive decimal minor-unit string.'));
  if (!draft.budgetId || !UUID.test(draft.budgetId)) issues.push(issue('MISSING_BUDGET', 'budgetId', 'An explicit owned budget is required.'));
  if (!draft.timezone || !nonEmpty(draft.timezone)) issues.push(issue('MISSING_TIMEZONE', 'timezone', 'An IANA schedule timezone is required.'));
  if (!draft.allowedPayees?.length) issues.push(issue('MISSING_PAYEE', 'allowedPayees', 'At least one allowed payee is required.'));
  if (draft.validFrom && Number.isNaN(Date.parse(draft.validFrom))) issues.push(issue('INVALID_DATE', 'validFrom', 'validFrom must be an RFC 3339 instant.'));
  if (draft.validUntil && Number.isNaN(Date.parse(draft.validUntil))) issues.push(issue('INVALID_DATE', 'validUntil', 'validUntil must be an RFC 3339 instant.'));
  if (draft.validFrom && draft.validUntil && Date.parse(draft.validUntil) <= Date.parse(draft.validFrom)) issues.push(issue('INVALID_DATE_RANGE', 'validUntil', 'validUntil must be after validFrom.'));
  if (draft.completionLimit !== undefined && (!Number.isSafeInteger(draft.completionLimit) || draft.completionLimit < 1)) issues.push(issue('INVALID_COMPLETION_LIMIT', 'completionLimit', 'Completion limit must be a positive integer.'));
  if (forActivation) {
    issues.push(...categoryIssues(draft.category, draft.constraints));
    if (draft.mode !== 'NOTIFY_ONLY' && (!draft.fundingMandateId || !UUID.test(draft.fundingMandateId))) issues.push(issue('MISSING_AUTHORITY', 'fundingMandateId', 'Purchasing modes require a supported funding authority.'));
  }
  return { valid: issues.length === 0, issues };
}

export function deriveObligationKey(kind: InstructionKind, category: Category, constraints: InstructionConstraints, occurrenceKey?: string): string {
  if (kind === 'RECURRING_BILL') {
    const account = String(constraints['accountRef'] ?? 'unknown-account');
    const cycle = String(constraints['invoiceOrCycleRef'] ?? occurrenceKey ?? 'unknown-cycle');
    return `BILL:${account}:${cycle}`;
  }
  if (kind === 'WATCH') return `WATCH:${category}:${occurrenceKey ?? 'default'}`;
  return `${kind}:${category}:${occurrenceKey ?? 'default'}`;
}

export function validateQuoteAmounts(amounts: QuoteAmounts): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fields: Array<keyof QuoteAmounts> = ['subtotalMinor', 'taxMinor', 'feesMinor', 'shippingMinor', 'discountMinor', 'totalMinor'];
  const values = new Map<string, bigint>();
  for (const field of fields) {
    const value = amounts[field];
    if (typeof value !== 'string' || !/^\d+$/.test(value)) issues.push(issue('INVALID_MONEY', field, `${field} must be a non-negative minor-unit string.`));
    else values.set(field, BigInt(value));
  }
  if (!CURRENCY.test(amounts.currency)) issues.push(issue('INVALID_CURRENCY', 'currency', 'Quote currency must be an uppercase ISO code.'));
  if (!Number.isSafeInteger(amounts.quantity) || amounts.quantity < 1) issues.push(issue('INVALID_QUANTITY', 'quantity', 'Quote quantity must be positive.'));
  if (values.size === fields.length && values.get('subtotalMinor')! + values.get('taxMinor')! + values.get('feesMinor')! + values.get('shippingMinor')! - values.get('discountMinor')! !== values.get('totalMinor')) issues.push(issue('MONEY_MISMATCH', 'totalMinor', 'Quote components must equal the payable total.'));
  return { valid: issues.length === 0, issues };
}

const OPERATION_TRANSITIONS: Record<OperationState, OperationState[]> = {
  DISCOVERING: ['QUOTED', 'BLOCKED', 'FAILED', 'CANCELLED'], QUOTED: ['AWAITING_APPROVAL', 'READY', 'BLOCKED', 'EXPIRED', 'CANCELLED'],
  AWAITING_APPROVAL: ['READY', 'QUOTED', 'EXPIRED', 'CANCELLED'], READY: ['RESERVED', 'QUOTED', 'BLOCKED', 'CANCELLED'],
  RESERVED: ['SUBMITTING', 'BLOCKED', 'CANCEL_REQUESTED'], SUBMITTING: ['RECONCILING', 'SUCCEEDED', 'FAILED'],
  RECONCILING: ['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCEL_REQUESTED'], CANCEL_REQUESTED: ['CANCELLED', 'RECONCILING', 'BLOCKED'],
  SUCCEEDED: [], FAILED: [], BLOCKED: [], EXPIRED: [], CANCELLED: [],
};

export function transitionOperation(current: OperationState, next: OperationState): OperationState {
  if (!OPERATION_TRANSITIONS[current]?.includes(next)) throw new DomainError('INVALID_OPERATION_TRANSITION', `${current} cannot transition to ${next}.`);
  return next;
}

export function stableExecutionKey(operationId: string, quoteHash: string, permissionVersion: number): string {
  if (!UUID.test(operationId) || !nonEmpty(quoteHash) || !Number.isSafeInteger(permissionVersion) || permissionVersion < 1) throw new DomainError('INVALID_EXECUTION_IDENTITY', 'Execution identity requires an operation UUID, quote hash and positive permission version.');
  return `operation:${operationId}:quote:${quoteHash}:permission:${permissionVersion}`;
}
