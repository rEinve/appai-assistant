import type {
  Instruction,
  VendorOffer,
  Operation,
  InboxItem,
  BudgetState,
  ProviderConnection,
  PrivateSupplier,
  AuthorityMode,
  MutationResult,
  EligibilityResult,
  AgreementSnapshot,
} from "../types/appai"

export type ScenarioPreset = "HAPPY_PATH" | "POLICY_BLOCK" | "STALE_OFFER" | "REAUTH_REQUIRED"

export interface DiagnosticLog {
  id: string
  timestamp: string
  action: string
  idempotencyKey: string
  details: string
}

export interface SavedConversationData {
  messages: any[]
  draftText?: string
}

export interface AppaiState {
  scenarioEpoch: number
  activeScenario: ScenarioPreset
  instructions: Instruction[]
  offers: VendorOffer[]
  operations: Operation[]
  inboxItems: InboxItem[]
  budget: BudgetState
  providers: ProviderConnection[]
  privateSuppliers: PrivateSupplier[]
  savedConversations: Record<string, SavedConversationData>
  diagnostics: DiagnosticLog[]
}

export function getInitialInstructions(): Instruction[] {
  return [
    {
      id: "inst-chair",
      title: "Find an ergonomic desk chair",
      category: "Home Office",
      categoryIcon: "storefront",
      status: "ACTIVE",
      authority: "REVIEW_REQUIRED",
      priceCeiling: 450.0,
      currency: "USD",
      criteria: "Black or charcoal · Adjustable lumbar support · Up to $450",
      nextRun: "Today, 2:00 PM",
      lastCheck: "Today, 9:12 AM",
      currentOperation: "Comparing providers · 1 vendor offer ready",
      stopRule: "Cease when approved or after 30 days",
      assistantNote:
        "WorkForm confirmed an in-stock model meeting your exact lumbar requirements at $417.20 total.",
      timeline: [
        { title: "Need confirmed", subtitle: "Today, 9:12 AM", state: "done" },
        {
          title: "Comparing providers",
          subtitle: "4 sources checked",
          state: "done",
        },
        {
          title: "Offer received",
          subtitle: "WorkForm ($417.20)",
          state: "current",
        },
        {
          title: "Awaiting your review",
          subtitle: "Expires in 2h 45m",
          state: "pending",
        },
      ],
      agreementVersion: 1,
      historicalAgreements: [
        {
          version: 1,
          criteria:
            "Black or charcoal · Adjustable lumbar support · Up to $450",
          priceCeiling: 450.0,
          authority: "REVIEW_REQUIRED",
          currency: "USD",
          stopRule: "Cease when approved or after 30 days",
          amendedAt: "Today, 9:12 AM",
        },
      ],
    },
    {
      id: "inst-coffee",
      title: "Monthly coffee delivery",
      category: "Kitchen & Pantry",
      categoryIcon: "shopping_bag",
      status: "ACTIVE",
      authority: "PRE_APPROVED",
      priceCeiling: 45.0,
      currency: "USD",
      criteria: "Northline Roasters · 2 bags whole bean · Under $45/mo",
      nextRun: "June 12",
      calendarDate: "2026-06-12",
      lastCheck: "8 minutes ago",
      currentOperation: "Awaiting delivery address confirmation",
      stopRule: "Cease if monthly price exceeds $45",
      assistantNote:
        "Executing under pre-approval up to $45/mo. Vendor needs shipping address confirmed before packaging.",
      timeline: [
        {
          title: "Scheduled order triggered",
          subtitle: "Today, 9:30 AM",
          state: "done",
        },
        {
          title: "Price check verified ($38.00)",
          subtitle: "Within $45 limit",
          state: "done",
        },
        {
          title: "Address confirmation",
          subtitle: "Action required",
          state: "current",
        },
        {
          title: "Dispatch & charge",
          subtitle: "Scheduled for June 12",
          state: "pending",
        },
      ],
      agreementVersion: 1,
      historicalAgreements: [
        {
          version: 1,
          criteria: "Northline Roasters · 2 bags whole bean · Under $45/mo",
          priceCeiling: 45.0,
          authority: "PRE_APPROVED",
          currency: "USD",
          stopRule: "Cease if monthly price exceeds $45",
          amendedAt: "Today, 9:30 AM",
        },
      ],
    },
    {
      id: "inst-headphones",
      title: "Track noise-cancelling headphones",
      category: "Electronics",
      categoryIcon: "notifications",
      status: "PAUSED",
      authority: "NOTIFY_ONLY",
      priceCeiling: 280.0,
      currency: "USD",
      criteria: "Sony WH-1000XM5 or Bose QC Ultra · Black · Target $280",
      nextRun: "Undated (Continuous alert feed)",
      lastCheck: "June 4",
      currentOperation: "Monitoring paused by Leah Morgan",
      stopRule: "Cease on price alert notification",
      assistantNote:
        "Monitoring paused. Resume anytime to restart price tracking across 3 vendors.",
      timeline: [
        { title: "Tracking initialized", subtitle: "June 1", state: "done" },
        {
          title: "Price alert received ($319)",
          subtitle: "Exceeded $280 limit",
          state: "done",
        },
        { title: "Paused by member", subtitle: "June 4", state: "current" },
      ],
      agreementVersion: 1,
      historicalAgreements: [
        {
          version: 1,
          criteria: "Sony WH-1000XM5 or Bose QC Ultra · Black · Target $280",
          priceCeiling: 280.0,
          authority: "NOTIFY_ONLY",
          currency: "USD",
          stopRule: "Cease on price alert notification",
          amendedAt: "June 1",
        },
      ],
    },
    {
      id: "inst-hosting",
      title: "Developer Cloud Infrastructure Hosting",
      category: "Cloud Services",
      categoryIcon: "bolt",
      status: "ACTIVE",
      authority: "REVIEW_REQUIRED",
      priceCeiling: 30.0,
      currency: "USD",
      criteria:
        "HostNet Cloud · $24/mo renewal · Renews June 10 · Warning: Service cutoff on non-payment",
      nextRun: "June 10",
      calendarDate: "2026-06-10",
      lastCheck: "12 minutes ago",
      currentOperation:
        "Renewal invoice awaiting authorization · Risk of service termination",
      stopRule: "Cease if monthly price exceeds $30",
      assistantNote:
        "HostNet Cloud renews on June 10. Authorize single payment or activate pre-approved schedule to prevent service cutoff.",
      timeline: [
        {
          title: "May billing reconciled",
          subtitle: "May 10 ($24.00)",
          state: "done",
        },
        {
          title: "June invoice issued",
          subtitle: "HostNet ($24.00)",
          state: "done",
        },
        {
          title: "Renewal due June 10",
          subtitle: "Awaiting member action",
          state: "current",
        },
        {
          title: "Next automated cycle",
          subtitle: "July 10",
          state: "pending",
        },
      ],
      agreementVersion: 1,
      historicalAgreements: [
        {
          version: 1,
          criteria:
            "HostNet Cloud · $24/mo renewal · Renews June 10 · Warning: Service cutoff on non-payment",
          priceCeiling: 30.0,
          authority: "REVIEW_REQUIRED",
          currency: "USD",
          stopRule: "Cease if monthly price exceeds $30",
          amendedAt: "May 10",
        },
      ],
    },
  ]
}

export function getInitialOffers(): VendorOffer[] {
  return [
    {
      id: "offer-chair-workform",
      obligationId: "ob-chair-workform-cycle1",
      instructionId: "inst-chair",
      instructionTitle: "Find an ergonomic desk chair",
      vendor: "WorkForm Direct",
      providerId: "prov-1",
      itemTitle: "WorkForm Pro Ergonomic Task Chair",
      specs: [
        "Charcoal grey breathable mesh back",
        "4D multidirectional adjustable armrests",
        "Integrated pneumatic lumbar support",
        "Class 4 gas lift with smooth 360° swivel",
      ],
      itemPrice: 390.0,
      shippingCost: 0.0,
      taxAmount: 27.2,
      payableTotal: 417.2,
      currency: "USD",
      deliveryWindow: "June 14 – June 16, 2026",
      returnPolicy: "30-day free returns with prepaid return label",
      cancellationTerms:
        "Free cancellation until vendor carrier dispatch scan (approx. 12h)",
      expiresIn: "2 hrs 45 mins",
      status: "PENDING_REVIEW",
      sourceUrl: "https://workform.example.com/products/pro-ergonomic",
      agreementVersion: 1,
      billingCycle: "2026-06",
    },
    {
      id: "offer-hosting-renewal",
      obligationId: "ob-hosting-renewal-cycle-2026-06",
      instructionId: "inst-hosting",
      instructionTitle: "Developer Cloud Infrastructure Hosting",
      vendor: "HostNet Cloud",
      providerId: "prov-4",
      itemTitle: "Pro Cloud Workspace & Hosting (Monthly Subscription)",
      specs: [
        "4 vCPU / 16GB RAM production cluster",
        "Automated daily off-site backups & monitoring",
        "Continuous uptime guarantee (Renews June 10)",
        "Uninterrupted developer workspace access",
      ],
      itemPrice: 24.0,
      shippingCost: 0.0,
      taxAmount: 0.0,
      payableTotal: 24.0,
      currency: "USD",
      deliveryWindow: "Immediate service extension (June 10 – July 10)",
      returnPolicy: "Cancel anytime before monthly renewal cycle",
      cancellationTerms:
        "No cancellation penalties · Pre-approved schedule grants uninterrupted service",
      expiresIn: "Renews June 10 (4 days left)",
      status: "PENDING_REVIEW",
      sourceUrl: "https://hostnet.example.com",
      agreementVersion: 1,
      billingCycle: "2026-06",
    },
  ]
}

export function getInitialOperations(): Operation[] {
  return [
    {
      id: "op-coffee-1",
      obligationId: "ob-coffee-cycle-2026-06",
      instructionId: "inst-coffee",
      vendor: "Northline Roasters",
      providerId: "prov-2",
      itemTitle: "Northline Signature Single-Origin Whole Bean (2 Bags)",
      payableTotal: 38.0,
      currency: "USD",
      orderNumber: "NL-2026-8812",
      status: "ACTION_REQUIRED",
      refundStatus: "NONE",
      createdAt: "Today, 9:30 AM",
      actionRequiredNotice:
        "Northline Roasters requires delivery address verification for June 2026 dispatch.",
      actionRequiredType: "SHIPPING_CONFIRMATION",
      deliveryAddress: "742 Evergreen Terrace, Apt 4B, New York, NY 10001",
      budgetImpactRecorded: false,
      agreementVersion: 1,
      billingCycle: "2026-06",
      historicalAgreement: {
        version: 1,
        criteria: "Northline Roasters · 2 bags whole bean · Under $45/mo",
        priceCeiling: 45.0,
        authority: "PRE_APPROVED",
        currency: "USD",
        stopRule: "Cease if monthly price exceeds $45",
        amendedAt: "Today, 9:30 AM",
      },
    },
  ]
}

export function getInitialInbox(): InboxItem[] {
  return [
    {
      id: "inbox-hosting",
      title: "Hosting renewal due June 10 — Service Cutoff Risk",
      summary:
        "HostNet Cloud · $24.00 due June 10 · Pay once or activate pre-approved schedule to prevent termination.",
      type: "REVIEW_REQUIRED",
      urgency: "high",
      timeAgo: "1h ago",
      expiresIn: "Renews in 4 days",
      targetView: "Payment",
      targetId: "offer-hosting-renewal",
    },
    {
      id: "inbox-1",
      title: "Chair offer confirmed — Review required",
      summary: "WorkForm · $417.20 payable total · Free returns within 30 days",
      type: "REVIEW_REQUIRED",
      urgency: "high",
      timeAgo: "15m ago",
      expiresIn: "Expires in 2h 45m",
      targetView: "OfferReview",
      targetId: "offer-chair-workform",
    },
    {
      id: "inbox-2",
      title: "Confirm delivery details — Action required",
      summary:
        "Northline Roasters needs shipping address confirmation for pre-approved coffee order.",
      type: "ACTION_REQUIRED",
      urgency: "high",
      timeAgo: "42m ago",
      targetView: "PreApproved",
      targetId: "op-coffee-1",
    },
    {
      id: "inbox-3",
      title: "Price change declined — Resolved",
      summary:
        "External price surge on headphones ($319.00 vs $280.00 limit). Original instruction remains active.",
      type: "RESOLVED",
      urgency: "resolved",
      timeAgo: "June 4",
      targetView: "DecisionRecord",
      targetId: "record-headphones-surge",
      isResolved: true,
    },
  ]
}

export function getInitialBudget(): BudgetState {
  return {
    monthlyAllocation: 1200.0,
    committedSpend: 310.0,
    currency: "USD",
    timezone: "America/New_York",
    railStatus: "PayPal Sandbox Rail (Purchasing consent connected)",
    version: "2026.06.1",
    lastUpdated: "June 1, 2026",
    approvalThreshold: 150.0,
    notificationPreferences: {
      offerDecisions: true,
      dispatchAlerts: true,
    },
  }
}

export function getInitialProviders(): ProviderConnection[] {
  return [
    {
      id: "prov-1",
      name: "WorkForm Direct",
      status: "HEALTHY",
      type: "SANDBOX",
      lastChecked: "8m ago",
    },
    {
      id: "prov-2",
      name: "Northline Roasters",
      status: "HEALTHY",
      type: "SANDBOX",
      lastChecked: "12m ago",
    },
    {
      id: "prov-3",
      name: "TechSupply Retail Bridge",
      status: "HEALTHY",
      type: "SANDBOX",
      lastChecked: "1h ago",
    },
    {
      id: "prov-4",
      name: "HostNet Cloud",
      status: "HEALTHY",
      type: "SANDBOX",
      lastChecked: "15m ago",
    },
  ]
}

export function getInitialPrivateSuppliers(): PrivateSupplier[] {
  return [
    {
      id: "supp-1",
      name: "Apex Ergonomic Assembly",
      serviceCategories: ["Furniture Assembly", "White-Glove Setup"],
      serviceArea: "New York Metro (Manhattan, Brooklyn)",
      notes:
        "Preferred technician for standing desk & ergonomic seating installation.",
    },
    {
      id: "supp-2",
      name: "Hudson Valley Roastery",
      serviceCategories: ["Artisanal Coffee", "Pantry Supply"],
      serviceArea: "Tri-State Area",
      notes: "Direct micro-lot trade single-origin beans.",
    },
  ]
}

export function getInitialState(): AppaiState {
  return {
    scenarioEpoch: 1,
    activeScenario: "HAPPY_PATH",
    instructions: getInitialInstructions(),
    offers: getInitialOffers(),
    operations: getInitialOperations(),
    inboxItems: getInitialInbox(),
    budget: getInitialBudget(),
    providers: getInitialProviders(),
    privateSuppliers: getInitialPrivateSuppliers(),
    savedConversations: {},
    diagnostics: [
      {
        id: "diag-init",
        timestamp: "10:35:00",
        action: "WORKSPACE_INITIALIZED",
        idempotencyKey: "idemp_init_998124",
        details:
          "Fixture workspace initialized with 4 instructions, 2 pending offers, 1 pending operation",
      },
    ],
  }
}

// Pure centralized payment eligibility evaluation
export function checkEligibility(
  state: AppaiState,
  offerId: string,
): EligibilityResult {
  const offer = state.offers.find((o) => o.id === offerId)
  if (!offer) {
    return { eligible: false, blockedReason: `Offer "${offerId}" not found` }
  }

  // Finite positive numbers check (E11)
  if (!Number.isFinite(offer.payableTotal) || offer.payableTotal <= 0) {
    return { eligible: false, blockedReason: "Invalid payable amount" }
  }

  // Currency mismatch check (E12)
  if (offer.currency !== state.budget.currency) {
    return {
      eligible: false,
      blockedReason: `Currency mismatch: offer in ${offer.currency} vs budget in ${state.budget.currency}`,
    }
  }

  const linkedInst = state.instructions.find(
    (i) => i.id === offer.instructionId,
  )
  if (!linkedInst) {
    return {
      eligible: false,
      blockedReason: `Linked instruction "${offer.instructionId}" not found`,
    }
  }

  if (offer.currency !== linkedInst.currency) {
    return {
      eligible: false,
      blockedReason: `Currency mismatch: offer in ${offer.currency} vs instruction in ${linkedInst.currency}`,
    }
  }

  // 1. Linked instruction status check (E02, E05)
  if (linkedInst.status === "PAUSED") {
    return {
      eligible: false,
      blockedReason: `Instruction "${linkedInst.title}" is paused by member`,
    }
  }
  if (linkedInst.status === "REVOKED") {
    return {
      eligible: false,
      blockedReason: `Instruction "${linkedInst.title}" authority is revoked`,
    }
  }

  // 2. Explicit authority check
  if (linkedInst.authority === "NOTIFY_ONLY") {
    return {
      eligible: false,
      blockedReason:
        "Instruction authority is Notify Only. Purchase authorization is disabled until explicit authority is granted.",
    }
  }

  // 3. Agreement version check (stale approval protection)
  if (offer.agreementVersion !== linkedInst.agreementVersion) {
    return {
      eligible: false,
      blockedReason: `Offer was evaluated under agreement v${offer.agreementVersion}, but current agreement is v${linkedInst.agreementVersion}. Terms must be re-quoted.`,
    }
  }

  // 4. Price ceiling check (E11)
  if (
    !Number.isFinite(linkedInst.priceCeiling) ||
    linkedInst.priceCeiling <= 0
  ) {
    return {
      eligible: false,
      blockedReason: "Instruction price ceiling is invalid",
    }
  }
  if (offer.payableTotal > linkedInst.priceCeiling) {
    return {
      eligible: false,
      blockedReason: `Payable total ($${offer.payableTotal.toFixed(2)}) exceeds agreed ceiling ($${linkedInst.priceCeiling.toFixed(2)}).`,
    }
  }

  // 5. Quote status check
  if (offer.status === "EXPIRED") {
    return {
      eligible: false,
      blockedReason: "Vendor price hold expired. Request a fresh quote.",
    }
  }
  if (offer.status === "REJECTED") {
    return {
      eligible: false,
      blockedReason: "Vendor offer was declined by member.",
    }
  }

  // 6. Provider status check
  const provider = state.providers.find(
    (p) =>
      p.id === offer.providerId ||
      p.name === offer.vendor ||
      offer.vendor.startsWith(p.name.split(" ")[0]),
  )
  if (!provider) {
    return {
      eligible: false,
      blockedReason: `Provider connection not found for vendor ${offer.vendor}.`,
    }
  }
  if (provider.status === "REAUTH_REQUIRED") {
    return {
      eligible: false,
      blockedReason: `Provider connection token expired. Re-authentication required in Settings.`,
    }
  }

  // 7. Obligation-level replay protection (survives CONFIRMED and CANCELLATION_PENDING) (E01, AC-02)
  const existingOp = state.operations.find(
    (op) =>
      (op.obligationId === offer.obligationId || op.offerId === offer.id) &&
      op.status !== "CANCELLED",
  )
  if (existingOp) {
    return {
      eligible: false,
      isReplay: true,
      existingOperation: existingOp,
      blockedReason: `Obligation already authorized under order #${existingOp.orderNumber}.`,
    }
  }

  // 8. Budget capacity check
  const availableCapacity =
    state.budget.monthlyAllocation - state.budget.committedSpend
  if (offer.payableTotal > availableCapacity) {
    return {
      eligible: false,
      blockedReason: `Payment ($${offer.payableTotal.toFixed(2)}) exceeds remaining monthly capacity ($${availableCapacity.toFixed(2)}). Hard-cap policy blocks transaction.`,
    }
  }

  return { eligible: true }
}

export interface ExecutePaymentCommand {
  type: "EXECUTE_PAYMENT"
  offerId: string
  activateSchedule?: boolean
  expectedEpoch?: number
}

export interface ConfirmShippingAddressCommand {
  type: "CONFIRM_SHIPPING_ADDRESS"
  operationId: string
  address: string
  expectedEpoch?: number
}

export interface ApproveOfferCommand {
  type: "APPROVE_OFFER"
  offerId: string
}

export interface RejectOfferCommand {
  type: "REJECT_OFFER"
  offerId: string
  reason: string
}

export interface RequestCancellationCommand {
  type: "REQUEST_CANCELLATION"
  operationId: string
}

export interface UpdateInstructionCommand {
  type: "UPDATE_INSTRUCTION"
  id: string
  updates: Partial<Instruction>
}

export interface TogglePauseInstructionCommand {
  type: "TOGGLE_PAUSE_INSTRUCTION"
  id: string
}

export interface RevokeInstructionCommand {
  type: "REVOKE_INSTRUCTION"
  id: string
}

export interface CreateInstructionCommand {
  type: "CREATE_INSTRUCTION"
  payload: {
    title: string
    category: string
    criteria: string
    authority: AuthorityMode
    priceCeiling: number
    stopRule?: string
    timing?: string
  }
}

export interface RequestFreshQuoteCommand {
  type: "REQUEST_FRESH_QUOTE"
  offerId: string
}

export interface ReconnectProviderCommand {
  type: "RECONNECT_PROVIDER"
  providerId: string
}

export interface UpdateBudgetLimitCommand {
  type: "UPDATE_BUDGET_LIMIT"
  newLimit: number
}

export interface UpdatePreferencesCommand {
  type: "UPDATE_PREFERENCES"
  currency: string
  timezone: string
  notificationPreferences?: {
    offerDecisions: boolean
    dispatchAlerts: boolean
  }
}

export interface AddPrivateSupplierCommand {
  type: "ADD_PRIVATE_SUPPLIER"
  supplier: Omit<PrivateSupplier, "id">
}

export interface UpdatePrivateSupplierCommand {
  type: "UPDATE_PRIVATE_SUPPLIER"
  id: string
  updates: Partial<PrivateSupplier>
}

export interface RemovePrivateSupplierCommand {
  type: "REMOVE_PRIVATE_SUPPLIER"
  id: string
}

export interface LoadScenarioCommand {
  type: "LOAD_SCENARIO"
  scenario: ScenarioPreset
}

export interface SaveConversationCommand {
  type: "SAVE_CONVERSATION"
  key: string
  data: SavedConversationData
}

export interface HydrateInstructionsCommand {
  type: "HYDRATE_INSTRUCTIONS"
  instructions: Instruction[]
}

export interface HydrateBudgetCommand {
  type: "HYDRATE_BUDGET"
  budget: Partial<BudgetState>
}

export interface UpsertInstructionCommand {
  type: "UPSERT_INSTRUCTION"
  instruction: Instruction
}

export type DomainCommand =
  | ExecutePaymentCommand
  | ConfirmShippingAddressCommand
  | ApproveOfferCommand
  | RejectOfferCommand
  | RequestCancellationCommand
  | UpdateInstructionCommand
  | TogglePauseInstructionCommand
  | RevokeInstructionCommand
  | CreateInstructionCommand
  | RequestFreshQuoteCommand
  | ReconnectProviderCommand
  | UpdateBudgetLimitCommand
  | UpdatePreferencesCommand
  | AddPrivateSupplierCommand
  | UpdatePrivateSupplierCommand
  | RemovePrivateSupplierCommand
  | LoadScenarioCommand
  | SaveConversationCommand
  | HydrateInstructionsCommand
  | HydrateBudgetCommand
  | UpsertInstructionCommand

export interface TransitionOutcome {
  nextState: AppaiState
  result: MutationResult<any>
}

// Helper for diagnostics
function addDiag(
  state: AppaiState,
  action: string,
  details: string,
): DiagnosticLog[] {
  const key = `idemp_${action.toLowerCase()}_${Math.random().toString(36).substring(2, 9)}`
  const now = new Date().toLocaleTimeString()
  return [
    { id: key, timestamp: now, action, idempotencyKey: key, details },
    ...state.diagnostics,
  ]
}

// Pure synchronous transactional reducer / state transition function
export function transition(
  state: AppaiState,
  command: DomainCommand,
  options?: {
    generateOrderNumber?: () => string
    timestamp?: string
  },
): TransitionOutcome {
  switch (command.type) {
    case "EXECUTE_PAYMENT": {
      // 1. Scenario epoch validation (E07)
      if (
        command.expectedEpoch !== undefined &&
        command.expectedEpoch !== state.scenarioEpoch
      ) {
        return {
          nextState: {
            ...state,
            diagnostics: addDiag(
              state,
              "PAYMENT_STALE_EPOCH",
              "Action was initiated in a prior scenario session.",
            ),
          },
          result: {
            success: false,
            blockedReason:
              "Action was initiated in a prior scenario session. Current scenario state preserved.",
          },
        }
      }

      // 2. Centralized eligibility check
      const el = checkEligibility(state, command.offerId)

      // Replay idempotency: if already paid or cancellation pending, return existing operation without re-debiting (E01)
      if (el.isReplay && el.existingOperation) {
        return {
          nextState: {
            ...state,
            diagnostics: addDiag(
              state,
              "PAYMENT_REPLAY_IDEMPOTENT",
              `Replay detected for obligation ${command.offerId}. Returned existing order #${el.existingOperation.orderNumber}. Committed spend unchanged.`,
            ),
          },
          result: {
            success: true,
            isReplay: true,
            data: el.existingOperation,
          },
        }
      }

      if (!el.eligible) {
        return {
          nextState: {
            ...state,
            diagnostics: addDiag(
              state,
              "PAYMENT_BLOCKED",
              `Payment blocked: ${el.blockedReason}`,
            ),
          },
          result: {
            success: false,
            blockedReason: el.blockedReason,
          },
        }
      }

      const offer = state.offers.find((o) => o.id === command.offerId)!
      const orderNumber =
        options?.generateOrderNumber?.() ||
        `WF-${Math.floor(10000 + Math.random() * 90000)}`
      const linkedInst = state.instructions.find(
        (i) => i.id === offer.instructionId,
      )

      const newOperation: Operation = {
        id: `op-${orderNumber.toLowerCase()}`,
        obligationId: offer.obligationId,
        instructionId: offer.instructionId,
        offerId: offer.id,
        vendor: offer.vendor,
        providerId: offer.providerId,
        itemTitle: offer.itemTitle,
        payableTotal: offer.payableTotal,
        currency: offer.currency,
        orderNumber,
        status: "CONFIRMED",
        refundStatus: "NONE",
        createdAt: options?.timestamp || "Just now",
        budgetImpactRecorded: true,
        agreementVersion: offer.agreementVersion,
        billingCycle: offer.billingCycle,
        scenarioEpoch: state.scenarioEpoch,
        historicalAgreement: linkedInst?.historicalAgreements?.[0] || {
          version: offer.agreementVersion,
          criteria: linkedInst?.criteria || "",
          priceCeiling: linkedInst?.priceCeiling || offer.payableTotal,
          authority: linkedInst?.authority || "REVIEW_REQUIRED",
          currency: offer.currency,
          stopRule: linkedInst?.stopRule || "",
          amendedAt: "Today",
        },
      }

      const nextOperations = [newOperation, ...state.operations]
      const nextCommittedSpend =
        state.budget.committedSpend + offer.payableTotal
      const nextOffers = state.offers.map((o) =>
        o.id === command.offerId ? { ...o, status: "APPROVED" as const } : o,
      )
      const nextInbox = state.inboxItems.map((item) =>
        item.targetId === command.offerId
          ? {
              ...item,
              title: `Order #${orderNumber} Confirmed — Paid`,
              type: "RESOLVED" as const,
              urgency: "resolved" as const,
              isResolved: true,
              targetView: "Receipt" as const,
              targetId: newOperation.id,
            }
          : item,
      )

      let nextInstructions = state.instructions.map((inst) => {
        if (inst.id === offer.instructionId) {
          const updatedInst: Instruction = {
            ...inst,
            currentOperation: `Order #${orderNumber} confirmed with ${offer.vendor}`,
            timeline: [
              ...inst.timeline.slice(0, 2),
              {
                title: "Offer approved by member",
                subtitle: "Just now",
                state: "done",
              },
              {
                title: `Order #${orderNumber} confirmed`,
                subtitle: `$${offer.payableTotal.toFixed(2)} recorded`,
                state: "done",
              },
            ],
          }
          if (command.activateSchedule) {
            updatedInst.authority = "PRE_APPROVED"
            updatedInst.currentOperation =
              "Autonomous recurring schedule active · Future renewals guaranteed within budget"
            updatedInst.assistantNote =
              "Pre-approved schedule activated. Future invoices will settle automatically without service cutoff risk."
          }
          return updatedInst
        }
        return inst
      })

      const nextState: AppaiState = {
        ...state,
        operations: nextOperations,
        budget: {
          ...state.budget,
          committedSpend: nextCommittedSpend,
          lastUpdated: "Just now",
        },
        offers: nextOffers,
        inboxItems: nextInbox,
        instructions: nextInstructions,
        diagnostics: addDiag(
          state,
          "PAYMENT_EXECUTED",
          `Order ${orderNumber} authorized for $${offer.payableTotal.toFixed(2)} on PayPal Sandbox Rail (Spend: $${nextCommittedSpend.toFixed(2)})`,
        ),
      }

      return { nextState, result: { success: true, data: newOperation } }
    }

    case "CONFIRM_SHIPPING_ADDRESS": {
      // 1. Scenario epoch validation (E07)
      if (
        command.expectedEpoch !== undefined &&
        command.expectedEpoch !== state.scenarioEpoch
      ) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: "Action was initiated in a prior scenario session.",
          },
        }
      }

      const op = state.operations.find((o) => o.id === command.operationId)
      if (!op) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Operation "${command.operationId}" not found`,
          },
        }
      }

      // Cancellation pending cannot confirm shipping address (E10)
      if (op.status === "CANCELLATION_PENDING") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason:
              "Operation has cancellation pending. Delivery address cannot be confirmed.",
          },
        }
      }

      const linkedInst = state.instructions.find(
        (i) => i.id === op.instructionId,
      )
      if (!linkedInst) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Linked instruction "${op.instructionId}" not found`,
          },
        }
      }

      // Instruction status checks
      if (linkedInst.status === "PAUSED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Instruction "${linkedInst.title}" is paused by member`,
          },
        }
      }
      if (linkedInst.status === "REVOKED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Instruction "${linkedInst.title}" authority is revoked`,
          },
        }
      }

      // Pre-approved authority check
      if (linkedInst.authority !== "PRE_APPROVED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Instruction authority is "${linkedInst.authority}". Autonomous pre-approved dispatch requires PRE_APPROVED authority.`,
          },
        }
      }

      // Agreement version matching (E04)
      if (
        op.agreementVersion !== undefined &&
        linkedInst.agreementVersion !== undefined &&
        op.agreementVersion !== linkedInst.agreementVersion
      ) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Operation was prepared under agreement v${op.agreementVersion}, but instruction is now at v${linkedInst.agreementVersion}. Scope must be re-evaluated.`,
          },
        }
      }

      // Ceiling check
      if (op.payableTotal > linkedInst.priceCeiling) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Order total ($${op.payableTotal.toFixed(2)}) exceeds pre-approved ceiling ($${linkedInst.priceCeiling.toFixed(2)}).`,
          },
        }
      }

      // Provider connection check
      const provider = state.providers.find(
        (p) =>
          p.id === op.providerId ||
          p.name === op.vendor ||
          op.vendor.startsWith(p.name.split(" ")[0]),
      )
      if (!provider) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Provider connection not found for vendor ${op.vendor}.`,
          },
        }
      }
      if (provider.status === "REAUTH_REQUIRED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Provider connection token expired. Re-authenticate in Settings before dispatching.`,
          },
        }
      }

      // Capacity check if not already recorded
      const alreadyRecorded = op.budgetImpactRecorded
      const cost = op.payableTotal
      const availableCapacity =
        state.budget.monthlyAllocation - state.budget.committedSpend

      if (!alreadyRecorded && cost > availableCapacity) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Dispatch ($${cost.toFixed(2)}) exceeds remaining monthly allocation ($${availableCapacity.toFixed(2)}).`,
          },
        }
      }

      // Idempotent check (E03)
      if (
        op.status === "CONFIRMED" &&
        alreadyRecorded &&
        op.deliveryAddress === command.address
      ) {
        return {
          nextState: {
            ...state,
            diagnostics: addDiag(
              state,
              "ADDRESS_CONFIRMED_REPLAY",
              `Address confirmation replay for ${command.operationId}. Spend unchanged.`,
            ),
          },
          result: { success: true, isReplay: true, data: op },
        }
      }

      const updatedOp: Operation = {
        ...op,
        status: "CONFIRMED",
        deliveryAddress: command.address,
        actionRequiredNotice: undefined,
        budgetImpactRecorded: true,
      }

      const nextOperations = state.operations.map((item) =>
        item.id === command.operationId ? updatedOp : item,
      )
      const nextSpend = alreadyRecorded
        ? state.budget.committedSpend
        : state.budget.committedSpend + cost
      const nextInbox = state.inboxItems.map((item) =>
        item.targetId === command.operationId
          ? {
              ...item,
              isResolved: true,
              type: "RESOLVED" as const,
              urgency: "resolved" as const,
              title: "Coffee delivery confirmed & dispatched",
            }
          : item,
      )

      const nextState: AppaiState = {
        ...state,
        operations: nextOperations,
        budget: {
          ...state.budget,
          committedSpend: nextSpend,
          lastUpdated: "Just now",
        },
        inboxItems: nextInbox,
        diagnostics: addDiag(
          state,
          "ADDRESS_CONFIRMED",
          `Address confirmed for ${command.operationId}. Dispatched under pre-approval ($${cost.toFixed(2)} recorded; Total: $${nextSpend.toFixed(2)}).`,
        ),
      }

      return { nextState, result: { success: true, data: updatedOp } }
    }

    case "APPROVE_OFFER": {
      const offer = state.offers.find((o) => o.id === command.offerId)
      if (!offer) {
        return {
          nextState: state,
          result: { success: false, blockedReason: "Offer not found" },
        }
      }

      // Full policy validation (E05)
      const linkedInst = state.instructions.find(
        (i) => i.id === offer.instructionId,
      )
      if (linkedInst) {
        if (linkedInst.status === "PAUSED") {
          return {
            nextState: state,
            result: {
              success: false,
              blockedReason: `Instruction "${linkedInst.title}" is paused by member`,
            },
          }
        }
        if (linkedInst.status === "REVOKED") {
          return {
            nextState: state,
            result: {
              success: false,
              blockedReason: `Instruction "${linkedInst.title}" authority is revoked`,
            },
          }
        }
        if (linkedInst.authority === "NOTIFY_ONLY") {
          return {
            nextState: state,
            result: {
              success: false,
              blockedReason:
                "Instruction authority is Notify Only. Approval disabled.",
            },
          }
        }
        if (offer.payableTotal > linkedInst.priceCeiling) {
          return {
            nextState: state,
            result: {
              success: false,
              blockedReason: "Offer payable total exceeds instruction ceiling.",
            },
          }
        }
        if (offer.agreementVersion !== linkedInst.agreementVersion) {
          return {
            nextState: state,
            result: {
              success: false,
              blockedReason: `Offer agreement v${offer.agreementVersion} does not match current agreement v${linkedInst.agreementVersion}.`,
            },
          }
        }
      }

      if (offer.status === "EXPIRED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: "Expired offers cannot be approved",
          },
        }
      }
      if (offer.status === "REJECTED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: "Rejected offers cannot be approved",
          },
        }
      }

      const updatedOffer: VendorOffer = { ...offer, status: "APPROVED" }
      const nextOffers = state.offers.map((off) =>
        off.id === command.offerId ? updatedOffer : off,
      )

      const nextState: AppaiState = {
        ...state,
        offers: nextOffers,
        diagnostics: addDiag(
          state,
          "OFFER_APPROVED",
          `Offer ${command.offerId} approved for payment authorization`,
        ),
      }

      return { nextState, result: { success: true, data: updatedOffer } }
    }

    case "REJECT_OFFER": {
      const nextOffers = state.offers.map((off) =>
        off.id === command.offerId
          ? { ...off, status: "REJECTED" as const }
          : off,
      )
      const nextInbox = state.inboxItems.map((item) =>
        item.targetId === command.offerId
          ? {
              ...item,
              isResolved: true,
              type: "RESOLVED" as const,
              urgency: "resolved" as const,
            }
          : item,
      )

      const nextState: AppaiState = {
        ...state,
        offers: nextOffers,
        inboxItems: nextInbox,
        diagnostics: addDiag(
          state,
          "OFFER_REJECTED",
          `Offer ${command.offerId} rejected. Reason: ${command.reason}`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "REQUEST_CANCELLATION": {
      const nextOperations = state.operations.map((op) =>
        op.id === command.operationId
          ? { ...op, status: "CANCELLATION_PENDING" as const }
          : op,
      )

      const nextState: AppaiState = {
        ...state,
        operations: nextOperations,
        diagnostics: addDiag(
          state,
          "CANCELLATION_REQUESTED",
          `Cancellation pending vendor carrier confirmation for operation ${command.operationId}. Obligation remains protected.`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "UPDATE_INSTRUCTION": {
      const inst = state.instructions.find((i) => i.id === command.id)
      if (!inst) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: `Instruction "${command.id}" not found`,
          },
        }
      }

      // Numeric validation for ceiling: reject NaN, <=0, Infinity (E11)
      if (command.updates.priceCeiling !== undefined) {
        const val = command.updates.priceCeiling
        if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) {
          return {
            nextState: state,
            result: {
              success: false,
              blockedReason: "Price ceiling must be a valid positive number",
            },
          }
        }
      }

      const nextVersion = (inst.agreementVersion || 1) + 1
      const snapshot: AgreementSnapshot = {
        version: inst.agreementVersion || 1,
        criteria: inst.criteria,
        priceCeiling: inst.priceCeiling,
        authority: inst.authority,
        currency: inst.currency,
        stopRule: inst.stopRule,
        amendedAt: new Date().toLocaleDateString(),
      }

      const updatedInst: Instruction = {
        ...inst,
        ...command.updates,
        agreementVersion: nextVersion,
        historicalAgreements: [snapshot, ...(inst.historicalAgreements || [])],
        lastCheck: "Just now",
        timeline: [
          ...inst.timeline,
          {
            title: `Agreement amended to v${nextVersion}`,
            subtitle: `Ceiling $${(command.updates.priceCeiling ?? inst.priceCeiling).toFixed(2)} · ${command.updates.authority ?? inst.authority}`,
            state: "done",
          },
        ],
      }

      const nextInstructions = state.instructions.map((i) =>
        i.id === command.id ? updatedInst : i,
      )

      // Invalidate affected active quotes and unused approvals (AC-20)
      const nextOffers = state.offers.map((off) => {
        if (off.instructionId === command.id) {
          const hasExecutedOp = state.operations.some(
            (op) =>
              (op.offerId === off.id ||
                op.obligationId === off.obligationId) &&
              op.status !== "CANCELLED",
          )
          // Material change invalidates unused approvals and active quotes
          if (!hasExecutedOp) {
            return {
              ...off,
              status: "EXPIRED" as const,
              expiresIn:
                off.status === "APPROVED"
                  ? "Unused approval invalidated by amendment"
                  : "Invalidated by amendment",
            }
          }
        }
        return off
      })

      // Invalidate associated inbox reviews
      const nextInbox = state.inboxItems.map((item) => {
        const linkedOffer = state.offers.find(
          (o) => o.id === item.targetId && o.instructionId === command.id,
        )
        if (linkedOffer && item.type === "REVIEW_REQUIRED") {
          return {
            ...item,
            title: `${item.title.split("—")[0].trim()} — Agreement Amended`,
            summary: `Prior quote invalidated by agreement changes. Request fresh quote matching updated criteria.`,
            urgency: "normal" as const,
          }
        }
        return item
      })

      const nextState: AppaiState = {
        ...state,
        instructions: nextInstructions,
        offers: nextOffers,
        inboxItems: nextInbox,
        diagnostics: addDiag(
          state,
          "INSTRUCTION_AMENDED",
          `Instruction ${command.id} amended to v${nextVersion}. Inactive quotes invalidated.`,
        ),
      }

      return { nextState, result: { success: true, data: updatedInst } }
    }

    case "TOGGLE_PAUSE_INSTRUCTION": {
      const inst = state.instructions.find((i) => i.id === command.id)
      if (!inst) {
        return {
          nextState: state,
          result: { success: false, blockedReason: "Instruction not found" },
        }
      }

      // Revocation cannot be reinstated by toggle (E06)
      if (inst.status === "REVOKED") {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason:
              "Revoked instruction cannot be resumed with pause/resume toggle.",
          },
        }
      }

      const nextStatus: "ACTIVE" | "PAUSED" =
        inst.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
      const nextInstructions = state.instructions.map((i) =>
        i.id === command.id
          ? {
              ...i,
              status: nextStatus,
              currentOperation:
                nextStatus === "PAUSED"
                  ? "Paused by member"
                  : "Resumed · Checking providers",
            }
          : i,
      )

      const nextState: AppaiState = {
        ...state,
        instructions: nextInstructions,
        diagnostics: addDiag(
          state,
          "INSTRUCTION_STATUS_TOGGLED",
          `Toggled status for instruction ${command.id} to ${nextStatus}`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "REVOKE_INSTRUCTION": {
      const nextInstructions = state.instructions.map((inst) =>
        inst.id === command.id
          ? {
              ...inst,
              status: "REVOKED" as const,
              currentOperation: "Revoked by member",
            }
          : inst,
      )

      const nextState: AppaiState = {
        ...state,
        instructions: nextInstructions,
        diagnostics: addDiag(
          state,
          "INSTRUCTION_REVOKED",
          `Revoked authority for instruction ${command.id}`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "CREATE_INSTRUCTION": {
      const {
        title,
        category,
        criteria,
        authority,
        priceCeiling,
        stopRule,
        timing,
      } = command.payload

      if (!Number.isFinite(priceCeiling) || priceCeiling <= 0) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: "Price ceiling must be positive number",
          },
        }
      }

      const id = `inst-${Math.random().toString(36).substring(2, 7)}`
      const agreedStopRule = stopRule || "Cease when completed or after 30 days"
      // Explicit unknown timing remains Undated across all authorities (E08)
      const nextRunSchedule = timing || "Undated (Continuous alert feed)"

      const newInst: Instruction = {
        id,
        title,
        category,
        categoryIcon:
          authority === "PRE_APPROVED"
            ? "bolt"
            : authority === "NOTIFY_ONLY"
              ? "notifications"
              : "storefront",
        status: "ACTIVE",
        authority,
        priceCeiling,
        currency: state.budget.currency || "USD",
        criteria,
        nextRun: nextRunSchedule,
        lastCheck: "Just now",
        currentOperation: "Researching providers and comparing options",
        stopRule: agreedStopRule,
        assistantNote:
          "Instruction confirmed with your explicit authority. Researching matching vendors now.",
        timeline: [
          { title: "Agreement confirmed", subtitle: "Just now", state: "done" },
          {
            title: "Researching providers",
            subtitle: "Active",
            state: "current",
          },
          { title: "Next check", subtitle: nextRunSchedule, state: "pending" },
        ],
        agreementVersion: 1,
        historicalAgreements: [
          {
            version: 1,
            criteria,
            priceCeiling,
            authority,
            currency: state.budget.currency || "USD",
            stopRule: agreedStopRule,
            amendedAt: "Just now",
          },
        ],
      }

      const nextState: AppaiState = {
        ...state,
        instructions: [newInst, ...state.instructions],
        diagnostics: addDiag(
          state,
          "INSTRUCTION_CREATED",
          `New instruction "${title}" confirmed under explicit ${authority} authority (v1, ${nextRunSchedule})`,
        ),
      }

      return { nextState, result: { success: true, data: newInst } }
    }

    case "REQUEST_FRESH_QUOTE": {
      const offer = state.offers.find((o) => o.id === command.offerId)
      if (!offer) {
        return {
          nextState: state,
          result: { success: false, blockedReason: "Offer not found" },
        }
      }

      const linkedInst = state.instructions.find(
        (i) => i.id === offer.instructionId,
      )
      const currentVer = linkedInst ? linkedInst.agreementVersion : 1

      // Criteria compatibility check (E13)
      if (
        linkedInst &&
        (linkedInst.criteria.toLowerCase().includes("solid wood") ||
          linkedInst.criteria.toLowerCase().includes("exclude mesh"))
      ) {
        if (offer.vendor === "WorkForm Direct") {
          const expiredOffer: VendorOffer = {
            ...offer,
            status: "EXPIRED",
            expiresIn:
              "Cannot quote: WorkForm catalog supplies mesh seating only. Criteria specifies solid wood.",
            agreementVersion: currentVer,
          }
          const nextOffers = state.offers.map((o) =>
            o.id === command.offerId ? expiredOffer : o,
          )
          const nextState: AppaiState = {
            ...state,
            offers: nextOffers,
            diagnostics: addDiag(
              state,
              "FRESH_QUOTE_UNSUPPORTED",
              `Vendor ${offer.vendor} cannot quote updated criteria.`,
            ),
          }
          return {
            nextState,
            result: {
              success: false,
              blockedReason: "Vendor cannot quote changed scope.",
            },
          }
        }
      }

      // Offer-specific pricing (E09)
      let itemPrice = 388.0
      let shippingCost = 0.0
      let taxAmount = 27.2
      let payableTotal = 415.2
      let itemTitle = offer.itemTitle
      let expiresIn = "2 hrs 59 mins"

      if (offer.instructionId === "inst-hosting") {
        itemPrice = 24.0
        shippingCost = 0.0
        taxAmount = 0.0
        payableTotal = 24.0
        expiresIn = "Renews in 30 days"
      }

      const updatedOffer: VendorOffer = {
        ...offer,
        status: "PENDING_REVIEW",
        expiresIn,
        itemPrice,
        shippingCost,
        taxAmount,
        payableTotal,
        agreementVersion: currentVer,
      }

      const nextOffers = state.offers.map((o) =>
        o.id === command.offerId ? updatedOffer : o,
      )
      const nextInbox = state.inboxItems.map((i) =>
        i.targetId === command.offerId
          ? {
              ...i,
              title: `${offer.instructionTitle} — Fresh quote received`,
              summary: `${offer.vendor} · $${payableTotal.toFixed(2)} updated total · Valid under agreement v${currentVer}`,
              expiresIn: `Expires in 3 hours`,
              isResolved: false,
              type: "REVIEW_REQUIRED" as const,
              urgency: "high" as const,
            }
          : i,
      )

      const nextState: AppaiState = {
        ...state,
        offers: nextOffers,
        inboxItems: nextInbox,
        diagnostics: addDiag(
          state,
          "FRESH_QUOTE_RECEIVED",
          `Vendor ${command.offerId} refreshed price quote at $${payableTotal.toFixed(2)} under agreement v${currentVer}.`,
        ),
      }

      return { nextState, result: { success: true, data: updatedOffer } }
    }

    case "RECONNECT_PROVIDER": {
      const nextProviders = state.providers.map((p) =>
        p.id === command.providerId
          ? { ...p, status: "HEALTHY" as const, lastChecked: "Just now" }
          : p,
      )
      const nextInbox = state.inboxItems.map((i) =>
        i.title.includes("Re-authentication")
          ? {
              ...i,
              isResolved: true,
              type: "RESOLVED" as const,
              urgency: "resolved" as const,
              title: "Provider Re-authenticated",
            }
          : i,
      )

      const nextState: AppaiState = {
        ...state,
        providers: nextProviders,
        inboxItems: nextInbox,
        diagnostics: addDiag(
          state,
          "PROVIDER_REAUTHENTICATED",
          `Provider ${command.providerId} re-authenticated successfully.`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "UPDATE_BUDGET_LIMIT": {
      if (!Number.isFinite(command.newLimit) || command.newLimit <= 0) {
        return {
          nextState: state,
          result: {
            success: false,
            blockedReason: "Budget limit must be a positive number",
          },
        }
      }

      const nextBudget: BudgetState = {
        ...state.budget,
        monthlyAllocation: command.newLimit,
        lastUpdated: "Just now",
        version: `2026.06.${parseInt(state.budget.version.split(".")[2] || "1") + 1}`,
      }

      const nextState: AppaiState = {
        ...state,
        budget: nextBudget,
        diagnostics: addDiag(
          state,
          "BUDGET_LIMIT_UPDATED",
          `Monthly allocation updated to $${command.newLimit.toFixed(2)}`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "UPDATE_PREFERENCES": {
      // Denomination protection: ledger remains USD (E12)
      if (command.currency !== "USD") {
        return {
          nextState: {
            ...state,
            diagnostics: addDiag(
              state,
              "PREFERENCES_REJECTED",
              "Multi-currency unsupported. Ledger baseline is USD.",
            ),
          },
          result: {
            success: false,
            blockedReason:
              "Multi-currency is not supported in this prototype; ledger baseline remains USD.",
          },
        }
      }

      const nextBudget: BudgetState = {
        ...state.budget,
        currency: "USD",
        timezone: command.timezone,
        notificationPreferences:
          command.notificationPreferences ||
          state.budget.notificationPreferences,
        lastUpdated: "Just now",
      }

      const nextState: AppaiState = {
        ...state,
        budget: nextBudget,
        diagnostics: addDiag(
          state,
          "PREFERENCES_UPDATED",
          `Updated preferences (USD baseline retained)`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "ADD_PRIVATE_SUPPLIER": {
      const id = `supp-${Date.now().toString(36)}`
      const newSupp: PrivateSupplier = { id, ...command.supplier }

      const nextState: AppaiState = {
        ...state,
        privateSuppliers: [...state.privateSuppliers, newSupp],
        diagnostics: addDiag(
          state,
          "PRIVATE_SUPPLIER_ADDED",
          `Added private supplier "${command.supplier.name}"`,
        ),
      }

      return { nextState, result: { success: true, data: newSupp } }
    }

    case "UPDATE_PRIVATE_SUPPLIER": {
      const nextSupps = state.privateSuppliers.map((s) =>
        s.id === command.id ? { ...s, ...command.updates } : s,
      )

      const nextState: AppaiState = {
        ...state,
        privateSuppliers: nextSupps,
        diagnostics: addDiag(
          state,
          "PRIVATE_SUPPLIER_UPDATED",
          `Updated private supplier "${command.id}"`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "REMOVE_PRIVATE_SUPPLIER": {
      const nextSupps = state.privateSuppliers.filter(
        (s) => s.id !== command.id,
      )

      const nextState: AppaiState = {
        ...state,
        privateSuppliers: nextSupps,
        diagnostics: addDiag(
          state,
          "PRIVATE_SUPPLIER_REMOVED",
          `Removed private supplier ${command.id}`,
        ),
      }

      return { nextState, result: { success: true } }
    }

    case "SAVE_CONVERSATION": {
      const existing = state.savedConversations[command.key]
      if (
        existing &&
        JSON.stringify(existing) === JSON.stringify(command.data)
      ) {
        return { nextState: state, result: { success: true } }
      }

      const nextConversations = {
        ...state.savedConversations,
        [command.key]: command.data,
      }

      const nextState: AppaiState = {
        ...state,
        savedConversations: nextConversations,
      }

      return { nextState, result: { success: true } }
    }

    case "HYDRATE_INSTRUCTIONS": {
      if (!command.instructions || command.instructions.length === 0) {
        return { nextState: state, result: { success: true, data: state.instructions } }
      }
      const backendMap = new Map(command.instructions.map((i) => [i.id, i]))
      const merged = [
        ...command.instructions,
        ...state.instructions.filter((i) => !backendMap.has(i.id)),
      ]
      const nextState: AppaiState = {
        ...state,
        instructions: merged,
      }
      return { nextState, result: { success: true, data: merged } }
    }

    case "HYDRATE_BUDGET": {
      const nextState: AppaiState = {
        ...state,
        budget: {
          ...state.budget,
          ...command.budget,
        },
      }
      return { nextState, result: { success: true, data: nextState.budget } }
    }

    case "UPSERT_INSTRUCTION": {
      const existsIndex = state.instructions.findIndex((i) => i.id === command.instruction.id)
      let nextInstructions: Instruction[]
      if (existsIndex >= 0) {
        nextInstructions = [...state.instructions]
        nextInstructions[existsIndex] = command.instruction
      } else {
        nextInstructions = [command.instruction, ...state.instructions]
      }
      const nextState: AppaiState = {
        ...state,
        instructions: nextInstructions,
      }
      return { nextState, result: { success: true, data: command.instruction } }
    }

    case "LOAD_SCENARIO": {
      const nextEpoch = state.scenarioEpoch + 1
      const scenario = command.scenario

      if (scenario === "HAPPY_PATH") {
        return {
          nextState: {
            ...getInitialState(),
            scenarioEpoch: nextEpoch,
            activeScenario: "HAPPY_PATH",
            diagnostics: addDiag(
              state,
              "SCENARIO_SWITCHED",
              `Loaded Scenario A: Standard Happy Path (Epoch ${nextEpoch})`,
            ),
          },
          result: { success: true },
        }
      }

      if (scenario === "POLICY_BLOCK") {
        const initBudget = getInitialBudget()
        const nextState: AppaiState = {
          scenarioEpoch: nextEpoch,
          activeScenario: "POLICY_BLOCK",
          instructions: getInitialInstructions().map((inst) =>
            inst.id === "inst-chair"
              ? {
                  ...inst,
                  currentOperation:
                    "Offer held · Exceeds remaining monthly allocation ($150.00)",
                  assistantNote:
                    "The WorkForm offer ($417.20) exceeds your available $150 budget capacity. Limit increase required in Settings.",
                }
              : inst,
          ),
          offers: getInitialOffers(),
          operations: getInitialOperations(),
          providers: getInitialProviders(),
          privateSuppliers: getInitialPrivateSuppliers(),
          savedConversations: {},
          budget: {
            ...initBudget,
            committedSpend: 1050.0,
            lastUpdated: "Just now",
          },
          inboxItems: [
            {
              id: "inbox-policy-1",
              title:
                "Offer blocked by budget cap — Action required in Settings",
              summary:
                "WorkForm chair ($417.20) exceeds your remaining $150.00 monthly allocation. Inline overrides prohibited.",
              type: "ACTION_REQUIRED",
              urgency: "high",
              timeAgo: "Just now",
              targetView: "Unsupported",
              targetId: "policy-block",
            },
            ...getInitialInbox().filter((i) => i.targetId !== "policy-block"),
          ],
          diagnostics: addDiag(
            state,
            "SCENARIO_SWITCHED",
            `Loaded Scenario B: Budget Hard Cap Policy Block (Epoch ${nextEpoch})`,
          ),
        }
        return { nextState, result: { success: true } }
      }

      if (scenario === "STALE_OFFER") {
        const allOffers = getInitialOffers()
        const nextState: AppaiState = {
          scenarioEpoch: nextEpoch,
          activeScenario: "STALE_OFFER",
          instructions: getInitialInstructions(),
          operations: getInitialOperations(),
          providers: getInitialProviders(),
          privateSuppliers: getInitialPrivateSuppliers(),
          savedConversations: {},
          budget: getInitialBudget(),
          offers: [
            {
              ...allOffers[0],
              status: "EXPIRED",
              expiresIn: "Expired 15 mins ago · Price hold lapsed",
            },
            allOffers[1],
          ],
          inboxItems: [
            {
              id: "inbox-stale-1",
              title: "Chair offer expired — Stale pricing",
              summary:
                "WorkForm price hold of $417.20 elapsed after 3 hours. Request a fresh quote.",
              type: "ACTION_REQUIRED",
              urgency: "normal",
              timeAgo: "15m ago",
              targetView: "OfferReview",
              targetId: "offer-chair-workform",
            },
            ...getInitialInbox().filter((i) => i.id !== "inbox-1"),
          ],
          diagnostics: addDiag(
            state,
            "SCENARIO_SWITCHED",
            `Loaded Scenario C: Stale / Expired Vendor Offer (Epoch ${nextEpoch})`,
          ),
        }
        return { nextState, result: { success: true } }
      }

      if (scenario === "REAUTH_REQUIRED") {
        const allProviders = getInitialProviders()
        const nextState: AppaiState = {
          scenarioEpoch: nextEpoch,
          activeScenario: "REAUTH_REQUIRED",
          instructions: getInitialInstructions(),
          offers: getInitialOffers(),
          operations: getInitialOperations(),
          privateSuppliers: getInitialPrivateSuppliers(),
          savedConversations: {},
          budget: getInitialBudget(),
          providers: [
            {
              id: "prov-1",
              name: "WorkForm Direct",
              status: "REAUTH_REQUIRED",
              type: "SANDBOX",
              lastChecked: "1h ago (Token expired)",
            },
            allProviders[1],
            allProviders[2],
            allProviders[3],
          ],
          inboxItems: [
            {
              id: "inbox-reauth-1",
              title: "Provider re-authentication required — WorkForm Direct",
              summary:
                "Catalog connection token expired. Re-authenticate in Settings to refresh real-time inventory.",
              type: "ACTION_REQUIRED",
              urgency: "high",
              timeAgo: "Just now",
              targetView: "Unsupported",
              targetId: "reauth-required",
            },
            ...getInitialInbox(),
          ],
          diagnostics: addDiag(
            state,
            "SCENARIO_SWITCHED",
            `Loaded Scenario D: Provider Re-authentication Required (Epoch ${nextEpoch})`,
          ),
        }
        return { nextState, result: { success: true } }
      }

      return {
        nextState: state,
        result: { success: false, blockedReason: "Unknown scenario" },
      }
    }
  }
}
