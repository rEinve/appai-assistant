import { useState } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type { Operation, BudgetState } from "../../types/appai"

export function ReceiptScreen({
  operation,
  budget,
  onBackToHome,
  onViewInPlanner,
  onRequestCancellation,
}: {
  operation?: Operation | null
  budget: BudgetState
  onBackToHome: () => void
  onViewInPlanner: () => void
  onRequestCancellation: (opId: string) => void
}) {
  const [cancelling, setCancelling] = useState(false)

  if (!operation) {
    return (
      <main className="page max-w-3xl mx-auto pb-12">
        <Header
          title="Operation & Financial Receipt"
          eyebrow="Record Not Found"
        />
        <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
          <Icon name="info" />
          <h2 className="text-lg font-bold text-slate-900">
            No Operation Record Found
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The requested financial or operational record does not exist or has
            not yet been authorized.
          </p>
          <Button variant="filled" onClick={onBackToHome}>
            Return to Dashboard
          </Button>
        </div>
      </main>
    )
  }

  const isConfirmed = operation.status === "CONFIRMED"
  const isPendingCancellation = operation.status === "CANCELLATION_PENDING"
  const isActionRequired = operation.status === "ACTION_REQUIRED"

  const handleCancelClick = () => {
    setCancelling(true)
    setTimeout(() => {
      setCancelling(false)
      onRequestCancellation(operation.id)
    }, 400)
  }

  return (
    <main className="page max-w-3xl mx-auto pb-12">
      <Header
        title="Operation & Financial Receipt"
        eyebrow={
          isConfirmed
            ? "Confirmed Transaction"
            : isPendingCancellation
              ? "Cancellation Pending"
              : "Operation Status"
        }
      />

      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
        {/* Outcome banner based on actual operation status */}
        {isConfirmed ? (
          <div className="flex items-center gap-4 p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
            <span className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Icon name="check_circle" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Vendor Confirmed
                </span>
                <span className="text-xs font-mono text-emerald-700">
                  Order #{operation.orderNumber}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Purchase Authorized & Recorded
              </h2>
              <p className="text-xs text-slate-600">
                Payment settlement authorized through PayPal Sandbox Rail.
                Provider {operation.vendor} has accepted the order.
              </p>
            </div>
          </div>
        ) : isPendingCancellation ? (
          <div className="flex items-center gap-4 p-5 bg-amber-50/70 border border-amber-200 rounded-2xl">
            <span className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Icon name="schedule" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  Cancellation Pending
                </span>
                <span className="text-xs font-mono text-amber-700">
                  Order #{operation.orderNumber}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Awaiting Vendor Carrier Confirmation
              </h2>
              <p className="text-xs text-slate-600">
                Cancellation request submitted to {operation.vendor}. Budget
                impact will remain committed until carrier confirmation.
              </p>
            </div>
          </div>
        ) : isActionRequired ? (
          <div className="flex items-center gap-4 p-5 bg-amber-50/70 border border-amber-200 rounded-2xl">
            <span className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Icon name="warning" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  Action Required
                </span>
                <span className="text-xs font-mono text-amber-700">
                  Pending Order #{operation.orderNumber}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Delivery Address Verification Needed
              </h2>
              <p className="text-xs text-slate-600">
                This order has not been dispatched. Confirm your shipping
                address in the Inbox to authorize fulfillment.
              </p>
            </div>
          </div>
        ) : null}

        {/* Transaction Summary Table */}
        <section className="space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Transaction Breakdown
          </span>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200/80">
              <strong className="text-sm font-bold text-slate-900">
                {operation.itemTitle}
              </strong>
              <span className="font-semibold text-slate-700">
                ${operation.payableTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Fulfillment Vendor</span>
              <span className="font-medium text-slate-800">
                {operation.vendor}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Record Timestamp</span>
              <span className="font-medium text-slate-800">
                {operation.createdAt}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Financial Settlement Rail</span>
              <span className="font-medium text-slate-800">
                PayPal Purchasing Consent (pp_sandbox_consent_9983)
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Recorded Budget Impact</span>
              <span
                className={`font-semibold ${
                  operation.budgetImpactRecorded
                    ? "text-emerald-700"
                    : "text-amber-700"
                }`}
              >
                {operation.budgetImpactRecorded
                  ? "Committed to June 2026 allocation"
                  : "Pending dispatch (Not yet debited)"}
              </span>
            </div>
          </div>
        </section>

        {/* Current Workspace Budget Ledger Status */}
        <section className="p-4 bg-blue-50/50 border border-blue-200/60 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs text-blue-900">
            <Icon name="payments" />
            <span>
              Current Workspace Budget Status (Live Ledger · {budget.currency})
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1 text-xs">
            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
              <span className="text-slate-500 block text-[11px]">
                Monthly Cap
              </span>
              <strong className="text-slate-900 text-sm">
                ${budget.monthlyAllocation.toFixed(2)}
              </strong>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
              <span className="text-slate-500 block text-[11px]">
                Recorded Spend
              </span>
              <strong className="text-blue-900 text-sm">
                ${budget.committedSpend.toFixed(2)}
              </strong>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-blue-100">
              <span className="text-slate-500 block text-[11px]">
                Remaining Capacity
              </span>
              <strong className="text-emerald-700 text-sm">
                ${(budget.monthlyAllocation - budget.committedSpend).toFixed(2)}
              </strong>
            </div>
          </div>
        </section>

        {/* Cancellation flow notice */}
        <section className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <strong className="text-xs font-bold text-slate-900 block">
                Cancellation Policy & Terms
              </strong>
              <span className="text-[11px] text-slate-500">
                Free cancellation until carrier dispatch scan. Refund is
                separate.
              </span>
            </div>
            {isConfirmed && (
              <Button
                variant="danger"
                onClick={handleCancelClick}
                disabled={cancelling}
              >
                {cancelling ? "Submitting request..." : "Request Cancellation"}
              </Button>
            )}
            {isPendingCancellation && (
              <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
                Cancellation Request Sent
              </span>
            )}
          </div>
        </section>

        {/* Navigation Footer */}
        <footer className="pt-2 flex items-center justify-between border-t border-slate-100">
          <Button variant="tonal" icon="home" onClick={onBackToHome}>
            Back to Dashboard
          </Button>
          <Button
            variant="filled"
            icon="calendar_month"
            onClick={onViewInPlanner}
          >
            View in Schedule Planner
          </Button>
        </footer>
      </div>
    </main>
  )
}
