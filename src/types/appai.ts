export type AuthorityMode = "REVIEW_REQUIRED" | "PRE_APPROVED" | "NOTIFY_ONLY"

export type InstructionStatus = "ACTIVE" | "PAUSED" | "REVOKED"

export interface InstructionTimelineStep {
  title: string
  subtitle: string
  state: "done" | "current" | "pending"
}

export interface AgreementSnapshot {
  version: number
  criteria: string
  priceCeiling: number
  authority: AuthorityMode
  currency: string
  stopRule: string
  amendedAt: string
}

export interface Instruction {
  id: string
  title: string
  category: string
  categoryIcon: string
  status: InstructionStatus
  authority: AuthorityMode
  priceCeiling: number
  currency: string
  criteria: string
  nextRun: string
  lastCheck: string
  currentOperation: string
  stopRule: string
  assistantNote: string
  timeline: InstructionTimelineStep[]
  agreementVersion: number
  historicalAgreements?: AgreementSnapshot[]
}

export interface VendorOffer {
  id: string
  obligationId: string
  instructionId: string
  instructionTitle: string
  vendor: string
  providerId?: string
  itemTitle: string
  specs: string[]
  itemPrice: number
  shippingCost: number
  taxAmount: number
  payableTotal: number
  currency: string
  deliveryWindow: string
  returnPolicy: string
  cancellationTerms: string
  expiresIn: string
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED"
  sourceUrl: string
  agreementVersion: number
  billingCycle?: string
}

export interface Operation {
  id: string
  obligationId?: string
  instructionId: string
  offerId?: string
  vendor: string
  providerId?: string
  itemTitle: string
  payableTotal: number
  currency: string
  orderNumber: string
  status: "EXECUTING" | "ACTION_REQUIRED" | "CONFIRMED" | "CANCELLATION_PENDING" | "CANCELLED"
  refundStatus: "NONE" | "PENDING" | "ISSUED"
  createdAt: string
  actionRequiredNotice?: string
  actionRequiredType?: "SHIPPING_CONFIRMATION" | "REAUTH"
  deliveryAddress?: string
  budgetImpactRecorded: boolean
  agreementVersion?: number
  billingCycle?: string
  scenarioEpoch?: number
  historicalAgreement?: AgreementSnapshot
}

export interface AgreementProposal {
  id: string
  need: string
  category: string
  criteria: string
  priceCeiling: number
  authority: AuthorityMode
  stopRule: string
  isSuperseded?: boolean
}

export interface ConversationSession {
  messages: any[]
  draftText?: string
}

export interface InboxItem {
  id: string
  title: string
  summary: string
  type: "REVIEW_REQUIRED" | "ACTION_REQUIRED" | "RESOLVED"
  urgency: "high" | "normal" | "resolved"
  timeAgo: string
  expiresIn?: string
  targetView: "OfferReview" | "PreApproved" | "Receipt" | "Unsupported" | "Payment" | "DecisionRecord"
  targetId: string
  isResolved?: boolean
}

export interface BudgetState {
  monthlyAllocation: number
  committedSpend: number
  currency: string
  timezone: string
  railStatus: string
  version: string
  lastUpdated: string
  approvalThreshold: number
  notificationPreferences?: {
    offerDecisions: boolean
    dispatchAlerts: boolean
  }
}

export interface ProviderConnection {
  id: string
  name: string
  status: "HEALTHY" | "REAUTH_REQUIRED"
  type: "SANDBOX"
  lastChecked: string
}

export interface PrivateSupplier {
  id: string
  name: string
  serviceCategories: string[]
  serviceArea: string
  notes: string
}

export interface MutationResult<T = Operation> {
  success: boolean
  isReplay?: boolean
  blockedReason?: string
  data?: T
}

export interface EligibilityResult {
  eligible: boolean
  blockedReason?: string
  isReplay?: boolean
  existingOperation?: Operation
}
