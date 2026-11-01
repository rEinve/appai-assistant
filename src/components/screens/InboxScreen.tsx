import { useState } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type { InboxItem } from "../../types/appai"

export function InboxScreen({
  items,
  onOpenItem,
  onOpenDiagnostics,
}: {
  items: InboxItem[]
  onOpenItem: (item: InboxItem) => void
  onOpenDiagnostics: () => void
}) {
  const [filter, setFilter] =
    useState<"ALL" | "REVIEW_REQUIRED" | "ACTION_REQUIRED" | "RESOLVED">("ALL")

  const filteredItems = items.filter((item) => {
    if (filter === "ALL") return true
    return item.type === filter
  })

  const reviewCount = items.filter(
    (i) => i.type === "REVIEW_REQUIRED" && !i.isResolved,
  ).length
  const actionCount = items.filter(
    (i) => i.type === "ACTION_REQUIRED" && !i.isResolved,
  ).length
  const resolvedCount = items.filter(
    (i) => i.isResolved || i.type === "RESOLVED",
  ).length
  const totalUnread = reviewCount + actionCount

  return (
    <main className="page">
      <Header
        title="Decision Inbox"
        eyebrow={`${totalUnread} need attention`}
        onOpenDiagnostics={onOpenDiagnostics}
        unreadCount={totalUnread}
      />

      {/* Safety Notice Banner */}
      <section className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center shrink-0">
            <Icon name="shield" />
          </span>
          <p className="text-xs text-slate-600">
            <strong>Durable Action Feed:</strong> Opening any notification or
            reviewing an offer never initiates payment or transfers funds.
          </p>
        </div>
        <span className="text-xs text-slate-500 font-medium shrink-0">
          Safe Inspection
        </span>
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${
            filter === "ALL"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          onClick={() => setFilter("ALL")}
        >
          All ({items.length})
        </button>
        <button
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 ${
            filter === "REVIEW_REQUIRED"
              ? "bg-blue-800 text-white"
              : "bg-blue-50 text-blue-800 hover:bg-blue-100"
          }`}
          onClick={() => setFilter("REVIEW_REQUIRED")}
        >
          <span>Review Required</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-blue-200/60 font-semibold">
            {reviewCount}
          </span>
        </button>
        <button
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 ${
            filter === "ACTION_REQUIRED"
              ? "bg-amber-800 text-white"
              : "bg-amber-50 text-amber-800 hover:bg-amber-100"
          }`}
          onClick={() => setFilter("ACTION_REQUIRED")}
        >
          <span>Action Required</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-amber-200/60 font-semibold">
            {actionCount}
          </span>
        </button>
        <button
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${
            filter === "RESOLVED"
              ? "bg-slate-700 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          onClick={() => setFilter("RESOLVED")}
        >
          Resolved ({resolvedCount})
        </button>
      </div>

      {/* Notification items list */}
      <section className="space-y-4" aria-label="Inbox notifications">
        {filteredItems.map((item) => {
          const isResolved = item.isResolved || item.type === "RESOLVED"

          return (
            <article
              key={item.id}
              className={`p-5 rounded-3xl border transition-all ${
                isResolved
                  ? "bg-slate-50/70 border-slate-200 opacity-80"
                  : item.type === "REVIEW_REQUIRED"
                    ? "bg-white border-blue-200 shadow-xs hover:border-blue-400"
                    : "bg-white border-amber-200 shadow-xs hover:border-amber-400"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <span
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      isResolved
                        ? "bg-slate-200 text-slate-600"
                        : item.type === "REVIEW_REQUIRED"
                          ? "bg-blue-100 text-blue-900"
                          : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    <Icon
                      name={
                        isResolved
                          ? "check_circle"
                          : item.type === "REVIEW_REQUIRED"
                            ? "notifications"
                            : "tune"
                      }
                    />
                  </span>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isResolved
                            ? "bg-slate-200 text-slate-700"
                            : item.type === "REVIEW_REQUIRED"
                              ? "bg-blue-100 text-blue-900"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {isResolved ? "Resolved" : item.type.replace("_", " ")}
                      </span>

                      {item.expiresIn && !isResolved && (
                        <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                          <Icon name="schedule" />
                          {item.expiresIn}
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400">
                        · {item.timeAgo}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {item.summary}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 w-full sm:w-auto pt-2 sm:pt-0 flex justify-end">
                  <Button
                    variant={
                      isResolved
                        ? "text"
                        : item.type === "REVIEW_REQUIRED"
                          ? "filled"
                          : "tonal"
                    }
                    icon="arrow_forward"
                    onClick={() => onOpenItem(item)}
                  >
                    {isResolved
                      ? "View Record"
                      : item.type === "REVIEW_REQUIRED"
                        ? "Review Offer"
                        : "Take Action"}
                  </Button>
                </div>
              </div>
            </article>
          )
        })}

        {filteredItems.length === 0 && (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 text-slate-500">
            <Icon name="check_circle" />
            <p className="mt-2 text-sm font-semibold">
              No notifications in this category
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
