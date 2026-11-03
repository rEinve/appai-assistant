import { useEffect, useRef } from "react"
import { Icon, Button } from "../common/CommonUI"

export type UnsupportedType = "MISSING_CAPABILITY" | "POLICY_HARD_CAP" | "STALE_OFFER" | "REAUTH_REQUIRED"

export function UnsupportedModal({
  isOpen,
  type = "POLICY_HARD_CAP",
  onClose,
  onGoToSettings,
}: {
  isOpen: boolean
  type?: UnsupportedType
  onClose: () => void
  onGoToSettings: () => void
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

  const contentMap = {
    POLICY_HARD_CAP: {
      icon: "shield" as const,
      color: "rose",
      title: "Monthly Budget Limit Policy Block",
      eyebrow: "Policy Rule Enforced",
      description:
        'This transaction exceeds your configured $1,200.00 monthly allocation limit. In accordance with strict financial governance, Apas prohibits inline "hard cap exception" overrides.',
      recommendation:
        "To proceed, you must update your monthly allocation via authenticated versioned settings so policy compliance can be re-evaluated.",
      actionText: "Adjust limit in Settings",
    },
    MISSING_CAPABILITY: {
      icon: "warning" as const,
      color: "amber",
      title: "Vendor Direct API Unavailable",
      eyebrow: "Unsupported Integration",
      description:
        "The specified merchant does not support automated ordering or secure sandbox checkout via standard APIs.",
      recommendation:
        "Apas can continue researching alternative merchants with verified API fulfillment, or track price drops via notifications.",
      actionText: "Explore alternative vendors",
    },
    STALE_OFFER: {
      icon: "schedule" as const,
      color: "slate",
      title: "Vendor Offer Expired",
      eyebrow: "Time Limit Elapsed",
      description:
        "The 3-hour price hold provided by the vendor has elapsed. Apas cannot guarantee previous pricing or inventory holds.",
      recommendation:
        "Ask the assistant to re-check current pricing and request a fresh offer from the vendor.",
      actionText: "Check fresh prices",
    },
    REAUTH_REQUIRED: {
      icon: "lock" as const,
      color: "amber",
      title: "Provider Re-authentication Required",
      eyebrow: "Session Expired",
      description:
        "The connection token to the vendor catalog has expired. Re-authentication is required to access inventory.",
      recommendation: "Re-authenticate your connection securely in Settings.",
      actionText: "Go to Settings",
    },
  }

  const current = contentMap[type]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsupported-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 border border-slate-200 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                current.color === "rose"
                  ? "bg-rose-100 text-rose-800"
                  : current.color === "amber"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-800"
              }`}
            >
              <Icon name={current.icon} />
            </span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                {current.eyebrow}
              </span>
              <h2
                id="unsupported-title"
                className="text-base font-bold text-slate-900"
              >
                {current.title}
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          {current.description}
        </p>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1">
          <strong className="font-semibold block text-slate-900">
            Recommended Next Step:
          </strong>
          <p>{current.recommendation}</p>
        </div>

        <footer className="pt-2 flex items-center justify-between">
          <Button variant="text" onClick={onClose}>
            Dismiss
          </Button>
          <Button
            variant="filled"
            icon="settings"
            onClick={() => {
              onClose()
              onGoToSettings()
            }}
          >
            {current.actionText}
          </Button>
        </footer>
      </div>
    </div>
  )
}
