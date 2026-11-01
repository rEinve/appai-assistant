import { useEffect, useRef } from "react"
import { Icon, Button } from "../common/CommonUI"
import type { Instruction } from "../../types/appai"

export function DecisionRecordModal({
  isOpen,
  instruction,
  onClose,
  onViewInstruction,
}: {
  isOpen: boolean
  instruction?: Instruction | null
  onClose: () => void
  onViewInstruction?: (instructionId: string) => void
}) {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    openerRef.current = (document.activeElement as HTMLElement)
    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()

      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([aria-hidden="true"]), [href]:not([aria-hidden="true"]), input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
          ),
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (openerRef.current && typeof openerRef.current.focus === "function") {
        openerRef.current.focus()
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isPaused = instruction ? instruction.status === "PAUSED" : true

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-record-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 border border-slate-200 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <Icon name="receipt_long" />
            </span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Resolved Action Record
              </span>
              <h2
                id="decision-record-title"
                className="text-lg font-bold text-slate-900 mt-0.5"
              >
                Price Surge Declined
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs text-slate-700">
          <div className="flex justify-between border-b border-slate-200/80 pb-2">
            <span className="text-slate-500 font-medium">
              Monitored Target:
            </span>
            <strong className="text-slate-900 font-bold">
              Sony WH-1000XM5 / Bose QC Ultra
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">
              Configured Ceiling:
            </span>
            <span className="font-semibold text-slate-900">$280.00 USD</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">
              Observed Vendor Price:
            </span>
            <span className="font-semibold text-rose-700">
              $319.00 USD (+$39.00 surge)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">
              Autonomous Action:
            </span>
            <span className="font-semibold text-slate-900">
              Purchase held under NOTIFY_ONLY authority
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200/80">
            <span className="text-slate-500 font-medium">
              Ledger Budget Impact:
            </span>
            <strong className="text-emerald-700 font-bold">
              $0.00 (Zero charge recorded)
            </strong>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200/80">
            <span className="text-slate-500 font-medium">
              Current Instruction Status:
            </span>
            <span
              className={`font-semibold ${
                isPaused ? "text-amber-800" : "text-emerald-800"
              }`}
            >
              {isPaused ? "Paused by member" : "Active"}
            </span>
          </div>
        </div>

        <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
          <Icon name="info" />
          <p>
            Historical facts: external vendor surge violated your ceiling rule.
            Current directive is {isPaused ? "paused" : "active"}. No
            unauthorized card charge or ledger debit occurred.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="tonal" onClick={onClose}>
            Close Record
          </Button>
          <Button
            variant="filled"
            icon="assignment"
            onClick={() => {
              onClose()
              onViewInstruction?.("inst-headphones")
            }}
          >
            View Instruction
          </Button>
        </div>
      </div>
    </div>
  )
}
