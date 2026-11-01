import { useState, useEffect, useRef } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type {
  VendorOffer,
  BudgetState,
  Operation,
  EligibilityResult,
} from "../../types/appai"

export function PaymentScreen({
  offer,
  budget,
  existingOperation,
  eligibility,
  onBack,
  onPaySuccess,
  onGoToSettings,
  onDiscussInConversation,
  onRequestFreshQuote,
  onViewReceipt,
}: {
  offer?: VendorOffer | null
  budget: BudgetState
  existingOperation?: Operation | null
  eligibility?: EligibilityResult
  onBack: () => void
  onPaySuccess: (offerId: string, activateSchedule?: boolean) => void
  onGoToSettings?: () => void
  onDiscussInConversation?: () => void
  onRequestFreshQuote?: (offerId: string) => void
  onViewReceipt?: (opId: string) => void
}) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!offer) {
    return (
      <main className="page max-w-4xl mx-auto pb-12">
        <Header
          title="Payment & Schedule Activation"
          eyebrow="Offer Not Found"
        />
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
          <Icon name="info" />
          <h2 className="text-lg font-bold text-slate-900">Offer Not Found</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The requested offer quote could not be located or has been
            invalidated by an agreement update.
          </p>
          <Button variant="filled" onClick={onBack}>
            Return to Inbox
          </Button>
        </div>
      </main>
    )
  }

  const isAlreadyPaid =
    !!existingOperation &&
    (existingOperation.status === "CONFIRMED" ||
      existingOperation.status === "CANCELLATION_PENDING")
  const isCancellationPending =
    existingOperation?.status === "CANCELLATION_PENDING"
  const isExpired = offer.status === "EXPIRED"
  const isRejected = offer.status === "REJECTED"

  const isEligible =
    isAlreadyPaid || (eligibility ? eligibility.eligible : true)
  const blockedReason = eligibility?.blockedReason

  const isSubscription =
    offer.itemTitle.toLowerCase().includes("subscription") ||
    offer.itemTitle.toLowerCase().includes("monthly") ||
    offer.deliveryWindow.toLowerCase().includes("renewal")

  const remainingCapacityBefore =
    budget.monthlyAllocation - budget.committedSpend
  const remainingCapacityAfter = remainingCapacityBefore - offer.payableTotal
  const isBudgetSufficient = remainingCapacityAfter >= 0

  const handleAuthorizePayment = (activateSchedule = false) => {
    if (!isEligible && !isAlreadyPaid) {
      setSubmissionError(
        blockedReason || "Payment cannot proceed under current policy rules.",
      )
      return
    }
    if (isAlreadyPaid) {
      onViewReceipt?.(existingOperation!.id)
      return
    }

    setIsProcessing(true)
    setSubmissionError(null)

    timerRef.current = setTimeout(() => {
      setIsProcessing(false)
      onPaySuccess(offer.id, activateSchedule)
    }, 450)
  }

  return (
    <main className="page max-w-4xl mx-auto pb-12">
      <Header
        title="Payment & Schedule Activation"
        eyebrow="Review & Authorize"
      />

      <div className="mb-4">
        <button
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          onClick={onBack}
        >
          <Icon name="arrow_back" />
          <span>Back</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Left Column: Summary & Payment Authorization */}
        <div className="md:col-span-2 space-y-6">
          {/* Card: Order Payable Total */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    isCancellationPending
                      ? "bg-amber-50 text-amber-900 border-amber-200"
                      : isAlreadyPaid
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : isExpired
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : isRejected
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : !isEligible
                              ? "bg-amber-50 text-amber-900 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {isCancellationPending
                    ? "Cancellation Pending"
                    : isAlreadyPaid
                      ? "Confirmed Order"
                      : isExpired
                        ? "Quote Expired"
                        : isRejected
                          ? "Offer Declined"
                          : !isEligible
                            ? "Policy Blocked"
                            : "Pending Authorization"}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  {offer.itemTitle}
                </h2>
                <p className="text-xs text-slate-500">
                  Fulfilled by {offer.vendor} · Delivery window:{" "}
                  {offer.deliveryWindow}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">
                  Payable Total
                </span>
                <strong className="text-2xl font-extrabold text-slate-900">
                  ${offer.payableTotal.toFixed(2)}
                </strong>
                <span className="text-xs text-slate-500 block">
                  {offer.currency}
                </span>
              </div>
            </div>

            {/* Price breakdown table */}
            <div className="space-y-2 text-xs text-slate-600 pt-1">
              <div className="flex justify-between">
                <span>Base item price</span>
                <span>${offer.itemPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping & handling</span>
                <span className="text-emerald-700 font-semibold">
                  Free ($0.00)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sales tax</span>
                <span>${offer.taxAmount.toFixed(2)}</span>
              </div>
            </div>
          </section>

          {/* Card: Payment Rail */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Icon name="verified_user" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Connected Payment Service
                </h3>
                <p className="text-xs text-slate-500">
                  Zero raw card numbers or bank credentials stored in UI
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-700 font-black text-base">
                  P
                </span>
                <div>
                  <strong className="text-xs font-bold text-slate-900 block">
                    PayPal Sandbox Rail
                  </strong>
                  <span className="text-xs text-slate-500 font-mono">
                    Consent: pp_sandbox_consent_9983 · Pre-funded
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                <Icon name="check_circle" />
                Purchasing Consent Active
              </span>
            </div>
          </section>

          {/* Card: Inspectable Essential Terms */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
            <button
              className="w-full flex items-center justify-between text-left font-bold text-sm text-slate-900"
              onClick={() => setShowTerms(!showTerms)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <Icon name="info" />
                <span>Essential Terms & Cancellation Policy</span>
              </div>
              <Icon name={showTerms ? "expand_less" : "expand_more"} />
            </button>

            {showTerms && (
              <div className="space-y-3 pt-3 border-t border-slate-100 text-xs text-slate-600 animate-in fade-in">
                <div>
                  <strong className="text-slate-900 block mb-0.5">
                    Cancellation Policy:
                  </strong>
                  <p>
                    {offer.cancellationTerms}. Cancellation requests remain
                    pending until vendor confirmation.
                  </p>
                </div>
                <div>
                  <strong className="text-slate-900 block mb-0.5">
                    Return & Refund Terms:
                  </strong>
                  <p>
                    {offer.returnPolicy}. Refunds are executed as separate
                    ledger credits once return item is received and inspected by{" "}
                    {offer.vendor}.
                  </p>
                </div>
                <div>
                  <strong className="text-slate-900 block mb-0.5">
                    Obligation Identity & Fraud Protection:
                  </strong>
                  <p>
                    Each transaction binds to a stable obligation token (
                    {offer.obligationId}), preventing duplicate charges on
                    replay or concurrent clicks.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Budget Impact & Authorization Action */}
        <aside className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
            <div>
              <span className="eyebrow">Financial Governance</span>
              <h3 className="text-base font-bold text-slate-900">
                Budget Capacity Impact
              </h3>
            </div>

            {/* Budget Meter */}
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Monthly Allocation</span>
                <span className="font-semibold text-slate-900">
                  ${budget.monthlyAllocation.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Already Committed</span>
                <span className="font-semibold text-slate-900">
                  ${budget.committedSpend.toFixed(2)}
                </span>
              </div>
              {!isAlreadyPaid && (
                <div className="flex justify-between text-xs text-blue-700 font-semibold bg-blue-50/60 p-2 rounded-lg">
                  <span>This Purchase</span>
                  <span>-${offer.payableTotal.toFixed(2)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-between text-xs">
                <span className="font-bold text-slate-900">
                  {isAlreadyPaid
                    ? "Current Available Capacity"
                    : "Remaining After Purchase"}
                </span>
                <strong
                  className={`text-sm ${
                    isBudgetSufficient || isAlreadyPaid
                      ? "text-emerald-700"
                      : "text-rose-700"
                  }`}
                >
                  $
                  {(isAlreadyPaid
                    ? remainingCapacityBefore
                    : remainingCapacityAfter
                  ).toFixed(2)}
                </strong>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div
                  className="bg-slate-400 h-full"
                  style={{
                    width: `${Math.min(100, (budget.committedSpend / budget.monthlyAllocation) * 100)}%`,
                  }}
                  title="Committed spend"
                />
                {!isAlreadyPaid && (
                  <div
                    className="bg-blue-600 h-full"
                    style={{
                      width: `${Math.min(100, (offer.payableTotal / budget.monthlyAllocation) * 100)}%`,
                    }}
                    title="Current purchase"
                  />
                )}
              </div>
            </div>

            {/* Pay Button or Status Block */}
            <div className="pt-2 space-y-3">
              {submissionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                  <Icon name="warning" />
                  <span>{submissionError}</span>
                </div>
              )}

              {isCancellationPending ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Icon name="schedule" />
                    <span>Cancellation Pending</span>
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    Order #{existingOperation?.orderNumber} has a pending
                    cancellation request with {offer.vendor}. Funds remain
                    committed until vendor confirmation scan. Re-purchasing the
                    same obligation is blocked.
                  </p>
                  <Button
                    variant="tonal"
                    icon="receipt_long"
                    onClick={() => onViewReceipt?.(existingOperation!.id)}
                  >
                    View Pending Receipt
                  </Button>
                </div>
              ) : isAlreadyPaid ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <Icon name="check_circle" />
                    <span>Order Already Authorized</span>
                  </div>
                  <p className="text-emerald-800 leading-relaxed">
                    This order was previously settled (#
                    {existingOperation?.orderNumber}). Duplicate charges are
                    prevented.
                  </p>
                  <Button
                    variant="filled"
                    icon="receipt_long"
                    onClick={() => onViewReceipt?.(existingOperation!.id)}
                  >
                    View Confirmed Receipt
                  </Button>
                </div>
              ) : !isEligible ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <Icon name="shield" />
                    <span>Payment Blocked by Policy</span>
                  </div>
                  <p className="text-amber-900 leading-relaxed">
                    {blockedReason ||
                      "This quote cannot be settled under current agreement permissions."}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Button
                      variant="filled"
                      icon="chat"
                      onClick={onDiscussInConversation}
                    >
                      Adjust in Conversation
                    </Button>
                    <Button
                      variant="tonal"
                      icon="settings"
                      onClick={onGoToSettings}
                    >
                      Settings
                    </Button>
                  </div>
                </div>
              ) : isExpired ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-rose-900">
                    <Icon name="schedule" />
                    <span>Offer Expired · Stale Pricing</span>
                  </div>
                  <p className="text-rose-800 leading-relaxed">
                    The 3-hour price hold elapsed. In compliance with member
                    protection rules, payment for expired quotes is strictly
                    blocked.
                  </p>
                  <Button
                    variant="filled"
                    icon="replay"
                    onClick={() => onRequestFreshQuote?.(offer.id)}
                  >
                    Request Fresh Quote
                  </Button>
                </div>
              ) : isRejected ? (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Icon name="close" />
                    <span>Offer Declined</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    This quote was declined by you. Payment authorization cannot
                    proceed.
                  </p>
                  <Button variant="tonal" onClick={onBack}>
                    Back
                  </Button>
                </div>
              ) : !isBudgetSufficient ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-rose-900">
                    <Icon name="shield" />
                    <span>Blocked by spending limit</span>
                  </div>
                  <p className="text-rose-800 leading-relaxed">
                    This transaction exceeds your available budget capacity by{" "}
                    <strong>
                      ${Math.abs(remainingCapacityAfter).toFixed(2)}
                    </strong>
                    . In compliance with strict governance, inline exception
                    bypasses are prohibited.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Button
                      variant="filled"
                      icon="chat"
                      onClick={onDiscussInConversation}
                    >
                      Discuss limit in chat
                    </Button>
                    <Button
                      variant="tonal"
                      icon="settings"
                      onClick={onGoToSettings}
                    >
                      Adjust in Settings
                    </Button>
                  </div>
                </div>
              ) : isSubscription ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-xs">
                    <span className="w-6 h-6 rounded-md bg-amber-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <Icon name="schedule" />
                    </span>
                    <div>
                      <strong className="text-amber-950 font-bold block">
                        Service Continuity Protection
                      </strong>
                      <p className="text-amber-900/90 text-[11px] mt-0.5 leading-relaxed">
                        To ensure uninterrupted service, activate a{" "}
                        <strong>Pre-Approved Schedule</strong> so renewals
                        settle automatically within your budget.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="filled"
                      icon="bolt"
                      onClick={() => handleAuthorizePayment(true)}
                      disabled={isProcessing}
                      ariaLabel="Pay and activate pre-approved schedule via PayPal"
                    >
                      {isProcessing
                        ? "Activating schedule..."
                        : `Pay & Activate Schedule ($${offer.payableTotal.toFixed(2)}/mo)`}
                    </Button>

                    <Button
                      variant="tonal"
                      icon="lock"
                      onClick={() => handleAuthorizePayment(false)}
                      disabled={isProcessing}
                      ariaLabel="Pay once for this cycle only"
                    >
                      Pay once for this cycle only
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="filled"
                  icon="lock"
                  onClick={() => handleAuthorizePayment(false)}
                  disabled={isProcessing}
                  ariaLabel="Pay and authorize purchase via PayPal"
                >
                  {isProcessing
                    ? "Settling via PayPal..."
                    : `Pay $${offer.payableTotal.toFixed(2)} via PayPal`}
                </Button>
              )}

              <p className="text-[11px] text-slate-500 text-center">
                <Icon name="shield" /> Payments execute exclusively via
                connected PayPal purchasing consent. Opening links never pays
                automatically.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
