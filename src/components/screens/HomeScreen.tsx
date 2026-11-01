import { Icon, Button, Header } from "../common/CommonUI"
import type { AppaiStoreType } from "../../store/appaiStore"

export function HomeScreen({
  store,
  onOpenInbox,
  onOpenInstructions,
  onOpenPlanner,
  onOpenSettings,
  onOpenOfferReview,
  onOpenDiagnostics,
}: {
  store: AppaiStoreType
  onOpenInbox: () => void
  onOpenInstructions: () => void
  onOpenPlanner: () => void
  onOpenSettings: () => void
  onOpenOfferReview: (offerId?: string) => void
  onOpenDiagnostics: () => void
}) {
  const {
    instructions,
    budget,
    providers,
    inboxItems,
    togglePauseInstruction,
  } = store
  const chairInst =
    instructions.find((i) => i.id === "inst-chair") || instructions[0]
  const isPaused = chairInst.status === "PAUSED"
  const isRevoked = chairInst.status === "REVOKED"

  const availableCapacity = budget.monthlyAllocation - budget.committedSpend
  const percentUsed = Math.min(
    100,
    Math.round((budget.committedSpend / budget.monthlyAllocation) * 100),
  )

  const unreadInboxCount = inboxItems.filter(
    (i) => !i.isResolved && i.type !== "RESOLVED",
  ).length
  const healthyCount = providers.filter((p) => p.status === "HEALTHY").length
  const reauthCount = providers.filter(
    (p) => p.status === "REAUTH_REQUIRED",
  ).length

  return (
    <main className="page">
      <Header
        title="Good morning, Leah"
        eyebrow="Personal procurement"
        onOpenDiagnostics={onOpenDiagnostics}
        onInbox={onOpenInbox}
        unreadCount={unreadInboxCount}
      />

      {/* Hero Overview */}
      <section className="hero">
        <div className="hero__copy">
          <span className="hero__icon">
            <Icon name="tune" />
          </span>
          <div>
            <span className="eyebrow">Workspace Overview</span>
            <h2>Your plans are on track.</h2>
            <p>
              {unreadInboxCount > 0
                ? `${unreadInboxCount} item${
                    unreadInboxCount === 1 ? "" : "s"
                  } need${
                    unreadInboxCount === 1 ? "s" : ""
                  } your attention in Inbox. Everything else is operating within your set permissions.`
                : "All instructions and scheduled operations are running within configured boundaries."}
            </p>
          </div>
        </div>
        <Button variant="tonal" icon="inbox" onClick={onOpenInbox}>
          Review inbox ({unreadInboxCount})
        </Button>
      </section>

      <div className="content-grid">
        {/* Primary Column */}
        <section className="primary-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">In progress</span>
              <h2>Active instructions</h2>
            </div>
            <Button variant="text" onClick={onOpenInstructions}>
              View all ({instructions.length})
            </Button>
          </div>

          {/* Chair Instruction Card */}
          <article className="instruction-card">
            <div className="instruction-card__top">
              <div className="instruction-card__title">
                <span className="category-icon">
                  <Icon name={chairInst.categoryIcon as any} />
                </span>
                <div>
                  <div className="status-row">
                    <span
                      className={`status ${
                        isRevoked
                          ? "status--revoked bg-rose-100 text-rose-800"
                          : isPaused
                            ? "status--paused"
                            : ""
                      }`}
                    >
                      {isRevoked ? "Revoked" : isPaused ? "Paused" : "Active"}
                    </span>
                    <span className="mode">
                      {chairInst.authority === "REVIEW_REQUIRED"
                        ? "Review required"
                        : chairInst.authority === "PRE_APPROVED"
                          ? "Pre-approved"
                          : "Notify only"}
                    </span>
                  </div>
                  <h3>{chairInst.title}</h3>
                  <p>{chairInst.criteria}</p>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="More instruction options"
                onClick={onOpenInstructions}
              >
                <Icon name="more_horiz" />
              </button>
            </div>

            <div className="assistant-note">
              <span className="assistant-note__avatar">A</span>
              <div>
                <strong>Assistant update</strong>
                <p>{chairInst.assistantNote}</p>
              </div>
            </div>

            <div className="timeline" aria-label="Instruction progress">
              {chairInst.timeline.map((item, index) => (
                <div
                  key={item.title}
                  className={`timeline__item timeline__item--${item.state}`}
                >
                  <span className="timeline__node">
                    {item.state === "done" ? (
                      <Icon name="check_circle" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="card-actions">
              <Button
                variant="filled"
                icon="arrow_forward"
                onClick={() => onOpenOfferReview("offer-chair-workform")}
              >
                Review offer
              </Button>
              {!isRevoked ? (
                <Button
                  variant="tonal"
                  icon={isPaused ? "replay" : "pause"}
                  onClick={() => togglePauseInstruction(chairInst.id)}
                >
                  {isPaused ? "Resume" : "Pause"}
                </Button>
              ) : (
                <span className="text-xs text-rose-700 font-semibold px-2 py-1 bg-rose-50 rounded-lg">
                  Revoked
                </span>
              )}
            </div>
          </article>

          {/* Quick Schedule Preview Bar */}
          <div className="schedule-card">
            <div>
              <span className="eyebrow">Agreement Schedule</span>
              <h3>June Procurement Timetable</h3>
              <p>
                Dynamic projection of all scheduled deliveries, renewals, and
                monitoring tasks.
              </p>
            </div>
            <Button
              variant="tonal"
              icon="calendar_month"
              onClick={onOpenPlanner}
            >
              Open Planner
            </Button>
          </div>
        </section>

        {/* Side Column: Budget & Attention */}
        <aside className="side-column">
          {/* Budget Card */}
          <article className="budget-card">
            <div className="budget-card__header">
              <div>
                <span className="eyebrow">Monthly Allocation</span>
                <h2>Budget</h2>
              </div>
              <button
                className="icon-button icon-button--surface"
                type="button"
                aria-label="Budget settings"
                onClick={onOpenSettings}
              >
                <Icon name="settings" />
              </button>
            </div>
            <div className="budget-card__body">
              <div
                className="progress-ring"
                aria-label={`${percentUsed} percent of monthly budget used`}
                style={{
                  background: `conic-gradient(var(--color-primary) 0 ${percentUsed}%, var(--color-primary-container) ${percentUsed}% 100%)`,
                }}
              >
                <div className="progress-ring__inner">
                  <strong>{percentUsed}%</strong>
                  <span>used</span>
                </div>
              </div>
              <div className="budget-numbers">
                <span>Committed spend</span>
                <strong>${budget.committedSpend.toFixed(2)}</strong>
                <small>
                  of ${budget.monthlyAllocation.toFixed(2)} allocated
                </small>
              </div>
            </div>
            <div className="budget-card__footer">
              <div>
                <span>Available capacity</span>
                <strong>${availableCapacity.toFixed(2)}</strong>
              </div>
              <div>
                <span>Payment rail</span>
                <strong>PayPal Sandbox</strong>
              </div>
            </div>
          </article>

          {/* Attention Card */}
          <article className="attention-card">
            <div className="attention-card__icon">
              <Icon name="notifications" />
            </div>
            <div>
              <span className="eyebrow">Needs attention</span>
              <h2>
                {unreadInboxCount} update{unreadInboxCount === 1 ? "" : "s"}{" "}
                waiting
              </h2>
              <p>
                {unreadInboxCount > 0
                  ? "Vendor offers and autonomous operations require your review or destination verification."
                  : "All notifications and actions are currently resolved."}
              </p>
            </div>
            <Button variant="filled" icon="arrow_forward" onClick={onOpenInbox}>
              Go to inbox
            </Button>
          </article>

          {/* Connection Card */}
          <article className="connection-card">
            <div className="connection-card__status">
              <span
                className={`connection-card__icon ${
                  reauthCount > 0 ? "text-amber-600" : ""
                }`}
              >
                <Icon name="shield" />
              </span>
              <div>
                <h3>
                  {reauthCount > 0 ? "Re-auth needed" : "Connections healthy"}
                </h3>
                <p>
                  {reauthCount > 0
                    ? `${reauthCount} provider bridge requires re-authentication`
                    : `${healthyCount} sandbox vendor bridges connected`}
                </p>
              </div>
            </div>
            <Button variant="text" onClick={onOpenSettings}>
              Manage
            </Button>
          </article>
        </aside>
      </div>
    </main>
  )
}
