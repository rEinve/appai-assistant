import { useState } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type { AppaiStoreType } from "../../store/appaiStore"
import type { Instruction } from "../../types/appai"

export function InstructionsScreen({
  store,
  onNewInstruction,
  onOpenConversation,
  onOpenOfferReview,
  onOpenDiagnostics,
}: {
  store: AppaiStoreType
  onNewInstruction: () => void
  onOpenConversation: (instruction: Instruction) => void
  onOpenOfferReview: (offerId?: string) => void
  onOpenDiagnostics: () => void
}) {
  const { instructions, togglePauseInstruction, revokeInstruction } = store
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "PAUSED" | "REVOKED">(
    "ALL",
  )
  const [selectedInstruction, setSelectedInstruction] =
    useState<Instruction | null>(null)

  const activeCount = instructions.filter((i) => i.status === "ACTIVE").length
  const pausedCount = instructions.filter((i) => i.status === "PAUSED").length
  const revokedCount = instructions.filter((i) => i.status === "REVOKED").length

  const filteredInstructions = instructions.filter((inst) => {
    if (filter === "ALL") return true
    return inst.status === filter
  })

  return (
    <main className="page">
      <Header
        title="Your Instructions"
        eyebrow={`${activeCount} active · ${pausedCount} paused${
          revokedCount > 0 ? ` · ${revokedCount} revoked` : ""
        }`}
        onOpenDiagnostics={onOpenDiagnostics}
      />

      {/* Hero */}
      <section className="workspace-hero">
        <span className="workspace-hero__icon">
          <Icon name="assignment" />
        </span>
        <div>
          <span className="eyebrow">Explicit permission rules</span>
          <h2>Autonomous Procurement Directives</h2>
          <p>
            Every recurring need, its explicit authority mode, and its current
            operation in one place.
          </p>
        </div>
        <Button icon="add" onClick={onNewInstruction}>
          New instruction
        </Button>
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-3">
        {(["ALL", "ACTIVE", "PAUSED", "REVOKED"] as const).map((tab) => {
          const count =
            tab === "ALL"
              ? instructions.length
              : instructions.filter((i) => i.status === tab).length
          return (
            <button
              key={tab}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === tab
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setFilter(tab)}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()} ({count})
            </button>
          )
        })}
      </div>

      {/* Instruction List */}
      <div className="space-y-4">
        {filteredInstructions.map((inst) => {
          const isPaused = inst.status === "PAUSED"
          const isRevoked = inst.status === "REVOKED"

          return (
            <article
              key={inst.id}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs hover:border-slate-300 transition-all space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <span className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                    <Icon name={inst.categoryIcon as any} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isRevoked
                            ? "bg-rose-100 text-rose-800"
                            : isPaused
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {inst.status}
                      </span>
                      <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {inst.authority === "REVIEW_REQUIRED"
                          ? "Review Required"
                          : inst.authority === "PRE_APPROVED"
                            ? "Pre-Approved"
                            : "Notify Only"}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Ceiling: ${inst.priceCeiling.toFixed(2)}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {inst.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {inst.criteria}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="text"
                    icon="edit"
                    onClick={() => onOpenConversation(inst)}
                  >
                    Edit
                  </Button>
                </div>
              </div>

              {/* Status and stop rule */}
              <div className="p-3 bg-slate-50 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    Current Operation:
                  </span>
                  <strong className="text-slate-900 font-medium">
                    {inst.currentOperation}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    Stop Rule:
                  </span>
                  <span className="text-slate-600">{inst.stopRule}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    Last Check:
                  </span>
                  <span className="text-slate-600">{inst.lastCheck}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Next scheduled check:{" "}
                  <strong className="text-slate-700">{inst.nextRun}</strong>
                </span>

                <div className="flex items-center gap-2">
                  {!isRevoked && (
                    <Button
                      variant="tonal"
                      icon={isPaused ? "replay" : "pause"}
                      onClick={() => togglePauseInstruction(inst.id)}
                    >
                      {isPaused ? "Resume" : "Pause"}
                    </Button>
                  )}
                  {!isRevoked && (
                    <Button
                      variant="text"
                      onClick={() => revokeInstruction(inst.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            </article>
          )
        })}

        {filteredInstructions.length === 0 && (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 text-slate-500">
            <Icon name="assignment" />
            <p className="mt-2 text-sm font-semibold">
              No instructions in this filter view
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
