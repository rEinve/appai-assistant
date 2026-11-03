import { useState, type KeyboardEvent } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type { AppaiStoreType } from "../../store/appaiStore"
import type { Instruction, VendorOffer, Operation } from "../../types/appai"

interface DerivedTask {
  id: string
  instructionId: string
  dateLabel: string
  calendarDate: string | null
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

type PlannerView = "day" | "week" | "month"

const plannerViews: { id: PlannerView; label: string }[] = [
  { id: "day", label: "Day view" },
  { id: "week", label: "Week view" },
  { id: "month", label: "Monthly view" },
]

function getDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

function getDateKeyForInstant(
  value: string | null | undefined,
  timeZone: string,
): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : getDateKey(date, timeZone)
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`)
}

function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(dateFromKey(dateKey))
}

function addDays(dateKey: string, amount: number): string {
  const date = dateFromKey(dateKey)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function addMonths(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const targetMonth = new Date(Date.UTC(year, month - 1 + amount, 1))
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
  ).getUTCDate()
  targetMonth.setUTCDate(Math.min(day, lastDay))
  return targetMonth.toISOString().slice(0, 10)
}

function getMonday(dateKey: string): string {
  const weekday = dateFromKey(dateKey).getUTCDay()
  return addDays(dateKey, -((weekday + 6) % 7))
}

function getWeekDates(dateKey: string): string[] {
  const monday = getMonday(dateKey)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

function getMonthDates(dateKey: string): string[] {
  const [year, month] = dateKey.split("-").map(Number)
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`
  const gridStart = getMonday(firstDay)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function getTodayKey(timeZone: string): string {
  return getDateKey(new Date(), timeZone)
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
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const calendarTimeZone = budget.timezone || browserTimeZone
  const [view, setView] = useState<PlannerView>("day")
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const activeDate = selectedDate || getTodayKey(calendarTimeZone)

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

      const dateLabel =
        inst.status === "PAUSED"
          ? "Paused by member"
          : inst.status === "REVOKED"
            ? "Revoked"
            : inst.nextRun
      const calendarDate =
        inst.calendarDate ||
        getDateKeyForInstant(
          inst.nextRunAt,
          calendarTimeZone,
        ) ||
        (inst.nextRun.startsWith("Today")
          ? getTodayKey(calendarTimeZone)
          : null)

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
        calendarDate,
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

  const datedTasks = agreementTasks.filter((task) => task.calendarDate)
  const undatedTasks = agreementTasks.filter((task) => !task.calendarDate)
  const tasksForDate = (dateKey: string) =>
    datedTasks.filter((task) => task.calendarDate === dateKey)
  const weekDates = getWeekDates(activeDate)
  const monthDates = getMonthDates(activeDate)
  const activeMonth = activeDate.slice(0, 7)
  const rangeLabel =
    view === "day"
      ? formatDateKey(activeDate, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : view === "week"
        ? `${formatDateKey(weekDates[0], { month: "short", day: "numeric" })} – ${formatDateKey(weekDates[6], { month: "short", day: "numeric", year: "numeric" })}`
        : formatDateKey(activeDate, { month: "long", year: "numeric" })

  const movePeriod = (direction: number) => {
    setSelectedDate(
      view === "day"
        ? addDays(activeDate, direction)
        : view === "week"
          ? addDays(activeDate, direction * 7)
          : addMonths(activeDate, direction),
    )
  }

  const handleViewTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let targetIndex: number | null = null
    if (event.key === "ArrowRight") targetIndex = (index + 1) % plannerViews.length
    if (event.key === "ArrowLeft") {
      targetIndex = (index - 1 + plannerViews.length) % plannerViews.length
    }
    if (event.key === "Home") targetIndex = 0
    if (event.key === "End") targetIndex = plannerViews.length - 1
    if (targetIndex === null) return
    event.preventDefault()
    setView(plannerViews[targetIndex].id)
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    )
    tabs?.[targetIndex]?.focus()
  }

  const renderTaskCard = (task: DerivedTask) => (
    <article
      key={task.id}
      className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 md:flex-row md:items-center"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
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
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            <Icon name="shield" /> {task.authority}
          </span>
        </div>
        <h3 className="text-base font-bold text-slate-900">{task.title}</h3>
        <p className="text-xs text-slate-600">
          {task.provider} · {task.quantity} · ${task.cost.toFixed(2)}
        </p>
        <p className="text-[11px] text-slate-500">
          {task.dateLabel} · {task.note}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 pt-2 md:border-0 md:pt-0">
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
  )

  const renderDayAgenda = (dateKey: string) => {
    const tasks = tasksForDate(dateKey)
    return (
      <section className="mt-5 space-y-3" aria-label={`Tasks for ${formatDateKey(dateKey, { dateStyle: "full" })}`}>
        <h3 className="text-sm font-bold text-slate-900">
          {formatDateKey(dateKey, { weekday: "long", month: "long", day: "numeric" })}
        </h3>
        {tasks.length ? (
          tasks.map(renderTaskCard)
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            No scheduled tasks for this day.
          </p>
        )}
      </section>
    )
  }

  const renderDateCell = (dateKey: string, compact = false) => {
    const tasks = tasksForDate(dateKey)
    const sameMonth = dateKey.slice(0, 7) === activeMonth
    return (
      <div
        key={dateKey}
        className={`min-w-0 rounded-xl border p-2 ${
          dateKey === activeDate
            ? "border-blue-500 bg-blue-50"
            : sameMonth
              ? "border-slate-200 bg-white"
              : "border-slate-100 bg-slate-50 text-slate-400"
        }`}
      >
        <button
          type="button"
          aria-label={formatDateKey(dateKey, { dateStyle: "full" })}
          aria-pressed={dateKey === activeDate}
          onClick={() => setSelectedDate(dateKey)}
          className="min-h-10 w-full rounded-lg text-left text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {view === "week" && (
            <span className="block text-[10px] font-medium uppercase text-slate-500">
              {formatDateKey(dateKey, { weekday: "short" })}
            </span>
          )}
          {formatDateKey(dateKey, { day: "numeric" })}
          {tasks.length > 0 && (
            <span className="ml-1 text-[10px] font-medium text-blue-700">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            </span>
          )}
        </button>
        {!compact && tasks.length > 0 && (
          <div className="mt-1 space-y-1">
            {tasks.slice(0, 2).map((task) => (
              <button
                key={task.id}
                type="button"
                className="block w-full truncate rounded-md bg-blue-100 px-1.5 py-1 text-left text-[10px] font-medium text-blue-950 hover:bg-blue-200"
                onClick={() => setSelectedDate(dateKey)}
                aria-label={`Show ${task.title} on ${formatDateKey(dateKey, { dateStyle: "full" })}`}
              >
                {task.title}
              </button>
            ))}
            {tasks.length > 2 && (
              <span className="block px-1 text-[10px] text-slate-500">
                +{tasks.length - 2} more
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="page">
      <Header
        title="Agreement Planner"
        eyebrow={rangeLabel}
        onOpenDiagnostics={onOpenDiagnostics}
      />

      <section className="workspace-hero">
        <span className="workspace-hero__icon">
          <Icon name="calendar_month" />
        </span>
        <div>
          <span className="eyebrow">Read-only agreement timetable</span>
          <h2>Agreed Procurement Schedules</h2>
          <p>
            Review agreed tasks by day, week, or month. Change an agreement in
            its conversation; payment and authority rules stay unchanged.
          </p>
        </div>
      </section>

      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
            <Icon name="payments" />
          </span>
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Monthly budget capacity
            </span>
            <strong className="text-sm text-slate-900">
              ${budget.committedSpend.toFixed(2)} committed / $
              {(budget.monthlyAllocation - budget.committedSpend).toFixed(2)}{" "}
              remaining
            </strong>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
          Version: {budget.version}
        </span>
      </section>

      <section aria-label="Calendar planner" className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
        <div
          className="mb-5 flex w-full gap-1 rounded-2xl bg-slate-100 p-1"
          role="tablist"
          aria-label="Calendar view"
        >
          {plannerViews.map((item, index) => (
            <button
              key={item.id}
              id={`planner-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              aria-controls="planner-calendar-panel"
              tabIndex={view === item.id ? 0 : -1}
              onClick={() => setView(item.id)}
              onKeyDown={(event) => handleViewTabKeyDown(event, index)}
              className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:text-sm ${
                view === item.id
                  ? "bg-white text-blue-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => movePeriod(-1)}
              className="grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <Icon name="arrow_back" />
            </button>
            <button
              type="button"
              aria-label="Next period"
              onClick={() => movePeriod(1)}
              className="grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <Icon name="arrow_forward" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getTodayKey(calendarTimeZone))}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Today
            </button>
          </div>
          <h2 className="text-base font-bold text-slate-900">{rangeLabel}</h2>
        </div>

        <div
          id="planner-calendar-panel"
          role="tabpanel"
          aria-labelledby={`planner-tab-${view}`}
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {view === "day" && renderDayAgenda(activeDate)}

          {view === "week" && (
            <>
              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-[700px] grid-cols-7 gap-2">
                  {weekDates.map((dateKey) => renderDateCell(dateKey))}
                </div>
              </div>
              {renderDayAgenda(activeDate)}
            </>
          )}

          {view === "month" && (
            <>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {getWeekDates("2026-11-02").map((dateKey) => (
                  <div
                    key={`weekday-${dateKey}`}
                    className="px-1 py-2 text-center text-[10px] font-bold uppercase text-slate-500 sm:text-xs"
                  >
                    {formatDateKey(dateKey, { weekday: "short" })}
                  </div>
                ))}
                {monthDates.map((dateKey) => renderDateCell(dateKey))}
              </div>
              {renderDayAgenda(activeDate)}
            </>
          )}
        </div>
      </section>

      {undatedTasks.length > 0 && (
        <section className="mt-6 space-y-3" aria-label="Undated tasks">
          <div>
            <h2 className="text-base font-bold text-slate-900">Undated</h2>
            <p className="mt-1 text-xs text-slate-500">
              These tasks have no confirmed action date, so they are kept off
              the calendar.
            </p>
          </div>
          {undatedTasks.map(renderTaskCard)}
        </section>
      )}
    </main>
  )
}
