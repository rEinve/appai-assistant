import { useState, useEffect, useRef } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type {
  Operation,
  BudgetState,
  Instruction,
  MutationResult,
} from "../../types/appai"

export function PreApprovedScreen({
  operation,
  linkedInstruction,
  budget,
  onConfirmAddress,
  onBack,
  onManageInstruction,
}: {
  operation?: Operation | null
  linkedInstruction?: Instruction | null
  budget: BudgetState
  onConfirmAddress: (opId: string, address: string) => MutationResult<Operation>
  onBack: () => void
  onManageInstruction?: () => void
}) {
  const [address, setAddress] = useState(
    operation?.deliveryAddress ||
      "742 Evergreen Terrace, Apt 4B, New York, NY 10001",
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmedSuccess, setConfirmedSuccess] = useState(
    operation?.status === "CONFIRMED" && operation?.budgetImpactRecorded,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset local state when operation changes or screen unmounts
  useEffect(() => {
    setAddress(
      operation?.deliveryAddress ||
        "742 Evergreen Terrace, Apt 4B, New York, NY 10001",
    )
    setConfirmedSuccess(
      operation?.status === "CONFIRMED" && operation?.budgetImpactRecorded,
    )
    setErrorMessage(null)
    setIsSubmitting(false)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [
    operation?.id,
    operation?.status,
    operation?.budgetImpactRecorded,
    operation?.deliveryAddress,
  ])

  if (!operation) {
    return (
      <main className="page max-w-3xl mx-auto pb-12">
        <Header title="Pre-Approved Operation" eyebrow="Record Not Found" />
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
          <Icon name="info" />
          <h2 className="text-lg font-bold text-slate-900">
            No Operation Record Found
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The requested autonomous task record does not exist or has already
            been completed.
          </p>
          <Button variant="filled" onClick={onBack}>
            Return to Inbox
          </Button>
        </div>
      </main>
    )
  }

  const isInstructionInactive =
    linkedInstruction &&
    (linkedInstruction.status === "PAUSED" ||
      linkedInstruction.status === "REVOKED")

  const availableCapacity = budget.monthlyAllocation - budget.committedSpend
  const isBudgetSufficient = availableCapacity >= operation.payableTotal
  const isCeilingExceeded = linkedInstruction
    ? operation.payableTotal > linkedInstruction.priceCeiling
    : false

  const handleConfirm = () => {
    setIsSubmitting(true)
    setErrorMessage(null)

    timerRef.current = setTimeout(() => {
      setIsSubmitting(false)
      const result = onConfirmAddress(operation.id, address)
      if (result.success) {
        setConfirmedSuccess(true)
      } else {
        setErrorMessage(result.blockedReason || "Dispatch blocked by policy.")
      }
    }, 450)
  }

  const currentAuthority = linkedInstruction?.authority || "PRE_APPROVED"
  const currentCeiling =
    linkedInstruction?.priceCeiling ?? operation.payableTotal

  return (
    <main className="page max-w-3xl mx-auto pb-12">
      <Header
        title="Pre-Approved Operation"
        eyebrow="Autonomous Task Execution"
      />

      <div className="mb-4">
        <button
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          onClick={onBack}
        >
          <Icon name="arrow_back" />
          <span>Back to inbox</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
        {/* Inactive instruction warning */}
        {isInstructionInactive && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Icon name="warning" />
              <div>
                <strong className="text-amber-950 font-bold block">
                  Execution Paused
                </strong>
                <p className="text-amber-900">
                  Parent instruction "{linkedInstruction?.title}" is currently{" "}
                  {linkedInstruction?.status.toLowerCase()}. Autonomous dispatch
                  is held until instruction is resumed.
                </p>
              </div>
            </div>
            <Button variant="tonal" onClick={onManageInstruction}>
              Manage
            </Button>
          </div>
        )}

        {isCeilingExceeded && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
            <Icon name="warning" />
            <div>
              <strong className="font-bold block">Ceiling Exceeded</strong>
              <p>
                Order total (${operation.payableTotal.toFixed(2)}) exceeds your
                pre-approved instruction limit (${currentCeiling.toFixed(2)}).
                Dispatch is blocked.
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
            <Icon name="warning" />
            <div>
              <strong className="font-bold block">Dispatch Failed</strong>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Prior Authority Banner */}
        <div className="p-4 bg-indigo-50 border border-indigo-200/80 rounded-2xl flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Icon name="bolt" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">
                {currentAuthority === "PRE_APPROVED"
                  ? "Pre-Approved Authority Active"
                  : `Authority: ${currentAuthority}`}
              </span>
              <span className="text-xs font-semibold text-indigo-700">
                Limit: Up to ${currentCeiling.toFixed(2)}/mo
              </span>
            </div>
            <p className="text-xs text-indigo-900 mt-1">
              This task was pre-approved by you. Apas verified that the payable
              total (${operation.payableTotal.toFixed(2)}) is within your limit
              and did not ask for redundant financial re-approval.
            </p>
          </div>
        </div>

        {/* Task Details */}
        <section className="space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Scheduled Operation
          </span>
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex justify-between items-baseline">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {operation.itemTitle}
                </h3>
                <p className="text-slate-500">
                  Fulfilled by {operation.vendor} · Recurring June Delivery
                </p>
              </div>
              <strong className="text-lg font-bold text-slate-900">
                ${operation.payableTotal.toFixed(2)} {operation.currency}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-4 text-slate-600">
              <div>
                <span className="text-slate-400 block text-[11px]">
                  Authority & Rail
                </span>
                <span className="font-medium text-slate-800">
                  Pre-Approved · PayPal Rail
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  Monthly Budget Impact
                </span>
                <span className="font-medium text-slate-800">
                  ${operation.payableTotal.toFixed(2)} of $
                  {availableCapacity.toFixed(2)} available
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Provider-Required Action Box */}
        {!confirmedSuccess ? (
          <section className="border-2 border-amber-300 bg-amber-50/50 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
              <Icon name="warning" />
              <span>
                Provider-Required Action: Shipping Address Verification
              </span>
            </div>
            <p className="text-xs text-amber-900/90 leading-relaxed">
              {operation.actionRequiredNotice ||
                "Northline Roasters requires confirmation of your delivery destination prior to dispatch."}
            </p>

            <div className="space-y-2">
              <label
                htmlFor="shipping-address-input"
                className="text-xs font-bold text-slate-700 block"
              >
                Confirm Destination Address:
              </label>
              <input
                id="shipping-address-input"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:border-indigo-600 font-medium text-slate-900"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                variant="filled"
                icon="check_circle"
                onClick={handleConfirm}
                disabled={
                  isSubmitting ||
                  !address.trim() ||
                  isInstructionInactive ||
                  isCeilingExceeded ||
                  !isBudgetSufficient
                }
              >
                {isSubmitting
                  ? "Confirming with provider..."
                  : "Confirm Address & Dispatch"}
              </Button>
            </div>
          </section>
        ) : (
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Icon name="check_circle" />
            </span>
            <div>
              <strong className="text-sm font-bold text-emerald-900 block">
                Delivery Address Confirmed
              </strong>
              <p className="text-xs text-emerald-800">
                Address verified with {operation.vendor}. Order dispatched to{" "}
                <em>{address}</em> under prior pre-approval. Budget recorded.
              </p>
            </div>
          </div>
        )}

        {/* Action bar */}
        <footer className="pt-2 flex items-center justify-between border-t border-slate-100">
          <Button variant="text" onClick={onBack}>
            Back to Inbox
          </Button>
          {confirmedSuccess && (
            <Button variant="tonal" icon="arrow_forward" onClick={onBack}>
              Done
            </Button>
          )}
        </footer>
      </div>
    </main>
  )
}
