import { Icon, Button, Header } from "../common/CommonUI"
import type { AppaiStoreType } from "../../store/appaiStore"
import type { Instruction, VendorOffer, Operation } from "../../types/appai"

interface DerivedTask {
  id: string
  instructionId: string
  dateLabel: string
  day: string
  month: string
  title: string
  provider: string
  quantity: string
  cost: number
  authority: string
  status: string
  statusType: "review" | "scheduled" | "provisional" | "paid" | "paused" | "revoked" | "expired" | "action"
  note: string
  canPay: boolean
  offerId?: string
}

export function PlannerScreen({
  store,
  onEditInstruction,
  onOpenPayment,
  onOpenDiagnostics,
}: {
  store: AppaiStoreType
  onEditInstruction: (instructionId?: string) => void
  onOpenPayment?: (offerId?: string) => void
  onOpenDiagnostics: () => void
}) {
  const { budget, instructions, offers, operations, checkPaymentEligibility } =
    store

  // Dynamically derive timetable from active instructions, offers, and operations
  const agreementTasks: DerivedTask[] = instructions.map(
    (inst: Instruction) => {
      const offer = offers.find((o: VendorOffer) => o.instructionId === inst.id)
      const op = operations.find((o: Operation) => o.instructionId === inst.id)

      // Check if an operation exists for this obligation (survives CONFIRMED, CANCELLATION_PENDING)
      const existingOp = operations.find(
        (o: Operation) =>
          o.instructionId === inst.id &&
          (o.status === "CONFIRMED" || o.status === "CANCELLATION_PENDING") &&
          (!offer ||
            o.offerId === offer.id ||
            o.obligationId === offer.obligationId),
      )

      // Parse date display
      let day = "—"
      let month = "Active"
      let dateLabel = inst.nextRun

      if (inst.status === "PAUSED") {
        month = "Paused"
        dateLabel = "Paused by member"
      } else if (inst.status === "REVOKED") {
        month = "Revoked"
        dateLabel = "Revoked"
      } else if (
        offer?.deliveryWindow &&
        offer.deliveryWindow.includes("June")
      ) {
        const match = offer.deliveryWindow.match(/June\s+(\d+)/)
        if (match) {
          day = match[1]
          month = "Jun"
        }
      } else if (inst.nextRun.includes("June")) {
        const match = inst.nextRun.match(/June\s+(\d+)/)
        if (match) {
          day = match[1]
          month = "Jun"
        }
      } else if (inst.nextRun.includes("Today")) {
        day = "Today"
        month = "Jun"
      }

      // Determine status & payment capability
      let status = "Scheduled"
      let statusType: DerivedTask["statusType"] = "scheduled"
      let canPay = false
      let provider = offer?.vendor || "Comparing verified providers"
      let quantity = offer ? "1 unit confirmed" : "Autonomous research"
      let cost = offer ? offer.payableTotal : inst.priceCeiling
      let note = inst.currentOperation

      if (inst.status === "PAUSED") {
        status = "Paused by member"
        statusType = "paused"
        note =
          "Monitoring and schedule paused. Resume in Instructions to re-enable."
      } else if (inst.status === "REVOKED") {
        status = "Revoked"
        statusType = "revoked"
        note = "Authority permanently revoked by member."
      } else if (existingOp) {
        provider = existingOp.vendor
        cost = existingOp.payableTotal
        quantity = existingOp.itemTitle
        if (existingOp.status === "CANCELLATION_PENDING") {
          status = `Cancellation Pending · #${existingOp.orderNumber}`
          statusType = "action"
          canPay = false
          note = `Cancellation requested with ${existingOp.vendor}. Funds remain committed until carrier scan confirmation.`
        } else {
          status = `Order #${existingOp.orderNumber} Confirmed & Paid`
          statusType = "paid"
          canPay = false
          note = `Payment authorized on PayPal sandbox rail. Budget recorded.`
        }
      } else if (offer) {
        provider = offer.vendor
        cost = offer.payableTotal
        quantity = offer.itemTitle

        const eligibility = checkPaymentEligibility(offer.id)
        if (eligibility.isReplay && eligibility.existingOperation) {
          const replayOp = eligibility.existingOperation
          status =
            replayOp.status === "CANCELLATION_PENDING"
              ? `Cancellation Pending · #${replayOp.orderNumber}`
              : `Order #${replayOp.orderNumber} Paid`
          statusType = "paid"
          canPay = false
          note = `Obligation already authorized.`
        } else if (!eligibility.eligible) {
          status =
            offer.status === "EXPIRED"
              ? "Price hold expired"
              : offer.status === "REJECTED"
                ? "Offer declined"
                : inst.authority === "NOTIFY_ONLY"
                  ? "Notify only · Purchase disabled"
                  : offer.agreementVersion !== inst.agreementVersion
                    ? "Terms amended · Refresh required"
                    : offer.payableTotal > inst.priceCeiling
                      ? "Ceiling exceeded"
                      : "Payment blocked by policy"
          statusType = "expired"
          canPay = false
          note =
            eligibility.blockedReason || "Execution blocked by policy rule."
        } else {
          status = `Offer pending review · ${offer.expiresIn}`
          statusType = "review"
          canPay = true
          note = `Verified quote ready. Review terms and authorize payment.`
        }
      } else if (op && op.status === "ACTION_REQUIRED") {
        status = "Address verification required"
        statusType = "action"
        provider = op.vendor
        quantity = op.itemTitle
        cost = op.payableTotal
        note =
          op.actionRequiredNotice ||
          "Vendor requires shipping address confirmation before dispatch."
      } else if (inst.authority === "PRE_APPROVED") {
        status = "Scheduled · Pre-approved"
        statusType = "scheduled"
        note = `Autonomous recurring order within $${inst.priceCeiling.toFixed(2)} limit`
      } else {
        status = "Provisional · Undated"
        statusType = "provisional"
        note =
          "Open-ended research remains undated without false execution date"
      }

      return {
        id: `task-${inst.id}`,
        instructionId: inst.id,
        dateLabel,
        day,
        month,
        title: inst.title,
        provider,
        quantity,
        cost,
        authority:
          inst.authority === "REVIEW_REQUIRED"
            ? "Review required"
            : inst.authority === "PRE_APPROVED"
              ? "Pre-approved"
              : "Notify only",
        status,
        statusType,
        note,
        canPay,
        offerId: offer?.id,
      }
    },
  )

  return (
    <main className="page">
      <Header
        title="Agreement Planner"
        eyebrow="June 2026 Schedule"
        onOpenDiagnostics={onOpenDiagnostics}
      />

      {/* Hero explanation: Read-only notice */}
      <section className="workspace-hero">
        <span className="workspace-hero__icon">
          <Icon name="calendar_month" />
        </span>
        <div>
          <span className="eyebrow">Read-only agreement timetable</span>
          <h2>Agreed Procurement Schedules</h2>
          <p>
            A read-only timeline of tasks and schedules dynamically projected
            from your active instructions and confirmed offers. Budget
            boundaries are negotiated conversationally; editing returns directly
            to the originating dialogue.
          </p>
        </div>
      </section>

      {/* Monthly Budget Capacity Summary Bar (Read-Only) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center">
            <Icon name="payments" />
          </span>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              June 2026 Ledger
            </span>
            <strong className="text-sm text-slate-900">
              ${budget.committedSpend.toFixed(2)} committed / $
              {(budget.monthlyAllocation - budget.committedSpend).toFixed(2)}{" "}
              capacity remaining
            </strong>
          </div>
        </div>
        <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
          Version: {budget.version}
        </span>
      </section>

      {/* Tasks List */}
      <section className="space-y-4" aria-label="Scheduled agreement tasks">
        {agreementTasks.map((task) => (
          <article
            key={task.id}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="date-chip shrink-0">
                <strong>{task.day}</strong>
                <span>{task.month}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      task.statusType === "review"
                        ? "bg-blue-100 text-blue-900"
                        : task.statusType === "paid"
                          ? "bg-emerald-100 text-emerald-900"
                          : task.statusType === "action"
                            ? "bg-amber-100 text-amber-900"
                            : task.statusType === "expired"
                              ? "bg-rose-100 text-rose-800"
                              : task.statusType === "paused"
                                ? "bg-slate-200 text-slate-700"
                                : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {task.status}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    <Icon name="shield" /> {task.authority}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {task.title}
                </h3>
                <p className="text-xs text-slate-600">
                  {task.provider} · {task.quantity} · ${task.cost.toFixed(2)}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                  <span className="font-medium bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded-md">
                    🗓️ {task.dateLabel}
                  </span>
                  <span>{task.note}</span>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
              {task.canPay && (
                <Button
                  variant="tonal"
                  icon="payments"
                  onClick={() => onOpenPayment?.(task.offerId)}
                >
                  Payment
                </Button>
              )}
              <Button
                variant="text"
                icon="edit"
                onClick={() => onEditInstruction(task.instructionId)}
              >
                Edit instruction
              </Button>
            </div>
          </article>
        ))}

        {agreementTasks.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-3xl border border-slate-200">
            No active agreement tasks in this timetable.
          </div>
        )}
      </section>
    </main>
  )
}
