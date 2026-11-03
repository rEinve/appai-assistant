import { useState, useEffect, useRef, type ReactNode } from "react"
import type { DiagnosticLog } from "../../store/appaiStore"

export type IconName = "home" | "assignment" | "calendar_month" | "inbox" | "settings" | "search" | "more_horiz" | "arrow_forward" | "pause" | "add" | "check_circle" | "schedule" | "notifications" | "shield" | "storefront" | "tune" | "bolt" | "chat" | "lock" | "shopping_bag" | "payments" | "public" | "edit" | "logout" | "mail" | "visibility" | "visibility_off" | "arrow_back" | "verified_user" | "attach_file" | "send" | "close" | "info" | "warning" | "receipt_long" | "local_shipping" | "replay" | "terminal" | "expand_more" | "expand_less"

export function Icon({ name }: { name: IconName }) {
  return (
    <span className="material-symbols-rounded" aria-hidden="true">
      {name}
    </span>
  )
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <img
      className={compact ? "brand-logo brand-logo--compact" : "brand-logo"}
      src="/appai-logo.svg"
      alt=""
    />
  )
}

export function Button({
  children,
  variant = "filled",
  icon,
  onClick,
  disabled,
  type = "button",
  ariaLabel,
}: {
  children: ReactNode
  variant?: "filled" | "tonal" | "text" | "danger"
  icon?: IconName
  onClick?: () => void
  disabled?: boolean
  type?: "button" | "submit"
  ariaLabel?: string
}) {
  return (
    <button
      className={`button button--${variant} ${
        disabled ? "button--disabled opacity-50 cursor-not-allowed" : ""
      }`}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  )
}

interface NavItem {
  label: string
  icon: IconName
}

const navItems: NavItem[] = [
  { label: "Home", icon: "home" },
  { label: "Instructions", icon: "assignment" },
  { label: "Planner", icon: "calendar_month" },
  { label: "Inbox", icon: "inbox" },
  { label: "Settings", icon: "settings" },
]

export function Navigation({
  active,
  onChange,
  onLogo,
  inboxCount = 2,
}: {
  active: string
  onChange: (item: string) => void
  onLogo: () => void
  inboxCount?: number
}) {
  return (
    <aside className="navigation">
      <button
        className="brand"
        type="button"
        aria-label="Go to A-P-P-A-I landing page"
        onClick={onLogo}
      >
        <BrandMark />
        <span className="brand__name">appai</span>
      </button>

      <Button icon="add" onClick={() => onChange("New instruction")}>
        New instruction
      </Button>

      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            className={`nav-item ${
              active === item.label ? "nav-item--active" : ""
            }`}
            key={item.label}
            type="button"
            onClick={() => onChange(item.label)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.label === "Inbox" && inboxCount > 0 && (
              <span className="nav-item__count">{inboxCount}</span>
            )}
          </button>
        ))}
      </nav>

      <button
        className="profile"
        type="button"
        onClick={() => onChange("Settings")}
      >
        <span className="profile__avatar">LM</span>
        <span className="profile__copy">
          <strong>Leah Morgan</strong>
          <span>Personal workspace</span>
        </span>
        <Icon name="more_horiz" />
      </button>
    </aside>
  )
}

export function Header({
  title,
  eyebrow = "Personal procurement",
  onOpenDiagnostics,
  onSearch,
  onInbox,
  unreadCount = 2,
}: {
  title: string
  eyebrow?: string
  onOpenDiagnostics?: () => void
  onSearch?: () => void
  onInbox?: () => void
  unreadCount?: number
}) {
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="topbar__actions">
        <button
          className="environment cursor-pointer hover:bg-slate-200/60 transition-colors"
          type="button"
          onClick={onOpenDiagnostics}
          title="Open Technical Diagnostics Drawer"
        >
          <span className="environment__dot" />
          <span>Fixture workspace</span>
          <span className="text-xs text-slate-500 font-mono ml-1 px-1.5 py-0.5 bg-slate-200 rounded">
            dev
          </span>
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Search"
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
        <button
          className="icon-button relative"
          type="button"
          aria-label="Notifications"
          onClick={onInbox}
        >
          <Icon name="notifications" />
          {unreadCount > 0 && <span className="notification-dot" />}
        </button>
      </div>
    </header>
  )
}

export function DiagnosticsDrawer({
  isOpen,
  onClose,
  diagnostics,
  activeScenario = "HAPPY_PATH",
  onSelectScenario,
}: {
  isOpen: boolean
  onClose: () => void
  diagnostics: DiagnosticLog[]
  activeScenario?: "HAPPY_PATH" | "POLICY_BLOCK" | "STALE_OFFER" | "REAUTH_REQUIRED"
  onSelectScenario?: (
    scenario: "HAPPY_PATH" | "POLICY_BLOCK" | "STALE_OFFER" | "REAUTH_REQUIRED",
  ) => void
}) {
  const [filter, setFilter] = useState("")
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    openerRef.current = (document.activeElement as HTMLElement)
    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()

      if (e.key === "Tab" && drawerRef.current) {
        const focusables = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
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

  const filteredLogs = filter
    ? diagnostics.filter(
        (d) =>
          d.action.toLowerCase().includes(filter.toLowerCase()) ||
          d.details.toLowerCase().includes(filter.toLowerCase()),
      )
    : diagnostics

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <aside
        ref={drawerRef}
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Technical Diagnostics"
      >
        <header className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-indigo-700">
              terminal
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Developer Diagnostics
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                FR-20 · Testing & Scenario Controls
              </span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="p-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60"
            onClick={onClose}
            aria-label="Close diagnostics"
          >
            <Icon name="close" />
          </button>
        </header>

        {/* Move 1: Scenario Switcher Toolbar */}
        <section className="p-4 bg-slate-100/80 border-b border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <strong className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Simulated Test Scenarios
            </strong>
            <span className="text-[11px] font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full font-semibold">
              Active: {activeScenario}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              className={`p-2 rounded-xl text-left border transition-all ${
                activeScenario === "HAPPY_PATH"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => onSelectScenario?.("HAPPY_PATH")}
            >
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>A: Happy Path</span>
              </div>
              <p className="text-[10px] mt-0.5 opacity-80">
                Chair review within $1,200 budget
              </p>
            </button>

            <button
              type="button"
              className={`p-2 rounded-xl text-left border transition-all ${
                activeScenario === "POLICY_BLOCK"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => onSelectScenario?.("POLICY_BLOCK")}
            >
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>B: Policy Block</span>
              </div>
              <p className="text-[10px] mt-0.5 opacity-80">
                Remaining $150 blocks $417 order
              </p>
            </button>

            <button
              type="button"
              className={`p-2 rounded-xl text-left border transition-all ${
                activeScenario === "STALE_OFFER"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => onSelectScenario?.("STALE_OFFER")}
            >
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>C: Stale Offer</span>
              </div>
              <p className="text-[10px] mt-0.5 opacity-80">
                3-hour vendor price hold expired
              </p>
            </button>

            <button
              type="button"
              className={`p-2 rounded-xl text-left border transition-all ${
                activeScenario === "REAUTH_REQUIRED"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => onSelectScenario?.("REAUTH_REQUIRED")}
            >
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>D: Re-auth Needed</span>
              </div>
              <p className="text-[10px] mt-0.5 opacity-80">
                Vendor token expired
              </p>
            </button>
          </div>
        </section>

        <div className="p-4 bg-amber-50 border-b border-amber-200/60 text-xs text-amber-900 flex items-start gap-2.5">
          <Icon name="info" />
          <p>
            Technical session diagnostics are segregated here away from
            conversational purchasing flows. Idempotency keys and simulated rail
            responses are displayed for inspection.
          </p>
        </div>

        <div className="p-3 border-b border-slate-200">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter diagnostic events..."
            className="w-full px-3 py-1.5 text-xs bg-slate-100 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-600"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
          {filteredLogs.map((log) => (
            <article
              key={log.id}
              className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold text-indigo-700">
                  {log.action}
                </span>
                <span>{log.timestamp}</span>
              </div>
              <p className="text-slate-700 font-sans text-xs">{log.details}</p>
              <div className="pt-1 border-t border-slate-200/80 flex items-center gap-2 text-[10px] text-slate-400">
                <span>Key:</span>
                <code className="text-slate-600 bg-slate-200/60 px-1 py-0.5 rounded">
                  {log.idempotencyKey}
                </code>
              </div>
            </article>
          ))}
        </div>

        <footer className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Sandbox Mode: Active</span>
          <span className="font-mono text-[11px]">
            Total Events: {diagnostics.length}
          </span>
        </footer>
      </aside>
    </div>
  )
}
