import { useState, useRef, useEffect } from "react"
import { Icon, Button, Header } from "../common/CommonUI"
import type { AppaiStoreType } from "../../store/appaiStore"
import type { PrivateSupplier } from "../../types/appai"

export function SettingsScreen({
  store,
  onOpenDiagnostics,
  onSignOut,
}: {
  store: AppaiStoreType
  onOpenDiagnostics: () => void
  onSignOut?: () => void
}) {
  const {
    budget,
    providers,
    privateSuppliers,
    updateBudgetLimit,
    updatePreferences,
    removePrivateSupplier,
    addPrivateSupplier,
    updatePrivateSupplier,
  } = store

  const [allocation, setAllocation] = useState(budget.monthlyAllocation)
  const [currency, setCurrency] = useState(budget.currency)
  const [timezone, setTimezone] = useState(budget.timezone)
  const [offerDecisions, setOfferDecisions] = useState(
    budget.notificationPreferences?.offerDecisions ?? true,
  )
  const [dispatchAlerts, setDispatchAlerts] = useState(
    budget.notificationPreferences?.dispatchAlerts ?? true,
  )
  const [savedSuccess, setSavedSuccess] = useState(false)

  // Inspection dialog state
  const [inspectedEntity, setInspectedEntity] = useState<{
    title: string
    details: Record<string, string>
  } | null>(null)
  const inspectDialogRef = useRef<HTMLDivElement>(null)
  const inspectCloseRef = useRef<HTMLButtonElement>(null)
  const inspectOpenerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!inspectedEntity) return
    inspectOpenerRef.current = (document.activeElement as HTMLElement)
    inspectCloseRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspectedEntity(null)

      if (e.key === "Tab" && inspectDialogRef.current) {
        const focusables = Array.from(
          inspectDialogRef.current.querySelectorAll<HTMLElement>(
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
      if (
        inspectOpenerRef.current &&
        typeof inspectOpenerRef.current.focus === "function"
      ) {
        inspectOpenerRef.current.focus()
      }
    }
  }, [inspectedEntity])

  // Add / Edit supplier state
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  )
  const [supplierName, setSupplierName] = useState("")
  const [supplierArea, setSupplierArea] = useState("")
  const [supplierCategory, setSupplierCategory] = useState("")
  const [supplierNotes, setSupplierNotes] = useState("")

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault()
    updateBudgetLimit(allocation)
    updatePreferences(currency, timezone, { offerDecisions, dispatchAlerts })
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  const handleStartEditSupplier = (supp: PrivateSupplier) => {
    setEditingSupplierId(supp.id)
    setSupplierName(supp.name)
    setSupplierArea(supp.serviceArea)
    setSupplierCategory(supp.serviceCategories.join(", "))
    setSupplierNotes(supp.notes)
    setShowAddSupplier(false)
  }

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierName.trim()) return

    const cats = supplierCategory
      ? supplierCategory
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : ["General Services"]

    if (editingSupplierId) {
      updatePrivateSupplier(editingSupplierId, {
        name: supplierName.trim(),
        serviceArea: supplierArea.trim() || "Local Area",
        serviceCategories: cats,
        notes: supplierNotes.trim() || "Member-saved preference.",
      })
      setEditingSupplierId(null)
    } else {
      addPrivateSupplier({
        name: supplierName.trim(),
        serviceArea: supplierArea.trim() || "Local Area",
        serviceCategories: cats,
        notes: supplierNotes.trim() || "Member-saved supplier preference.",
      })
      setShowAddSupplier(false)
    }

    setSupplierName("")
    setSupplierArea("")
    setSupplierCategory("")
    setSupplierNotes("")
  }

  const handleCancelSupplierForm = () => {
    setShowAddSupplier(false)
    setEditingSupplierId(null)
    setSupplierName("")
    setSupplierArea("")
    setSupplierCategory("")
    setSupplierNotes("")
  }

  return (
    <main className="page max-w-4xl mx-auto pb-12">
      <Header
        title="Permissions & Settings"
        eyebrow="Personal Workspace"
        onOpenDiagnostics={onOpenDiagnostics}
      />

      <div className="space-y-6">
        {/* Section 1: Versioned Budget Limits */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                Financial Governance
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1">
                Monthly Budget Allocation
              </h2>
              <p className="text-xs text-slate-500">
                Hard caps and approval thresholds are authenticated and
                versioned here, not overridden on checkout pages.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Ver: {budget.version}
            </span>
          </div>

          <form onSubmit={handleSaveBudget} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="monthly-budget-ceiling"
                  className="text-xs font-bold text-slate-700 block mb-1"
                >
                  Monthly Spend Ceiling (USD)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    id="monthly-budget-ceiling"
                    type="number"
                    min="100"
                    max="10000"
                    step="50"
                    value={allocation}
                    onChange={(e) => setAllocation(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-hidden focus:border-indigo-600"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Committed this month: ${budget.committedSpend.toFixed(2)} ·
                  Available: ${(allocation - budget.committedSpend).toFixed(2)}
                </span>
              </div>

              <div>
                <label
                  htmlFor="preapproval-threshold"
                  className="text-xs font-bold text-slate-700 block mb-1"
                >
                  Autonomous Pre-Approval Threshold
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold">
                    $
                  </span>
                  <input
                    id="preapproval-threshold"
                    type="number"
                    disabled
                    value={budget.approvalThreshold}
                    className="w-full pl-8 pr-4 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Orders over $150 strictly require explicit Review Required
                  approval.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Last updated {budget.lastUpdated} by Leah Morgan
              </span>
              <div className="flex items-center gap-3">
                {savedSuccess && (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 animate-in fade-in">
                    <Icon name="check_circle" />
                    Settings version saved
                  </span>
                )}
                <Button variant="filled" type="submit">
                  Save Versioned Limit
                </Button>
              </div>
            </div>
          </form>
        </section>

        {/* Section 2: Currency & Locale */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Locale & Timezone
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label
                htmlFor="display-currency-select"
                className="font-bold text-slate-700 block mb-1"
              >
                Display Currency
              </label>
              <select
                id="display-currency-select"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value)
                  updatePreferences(e.target.value, timezone, {
                    offerDecisions,
                    dispatchAlerts,
                  })
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900"
              >
                <option value="USD">
                  USD ($) — United States Dollar (Primary Ledger)
                </option>
                <option value="EUR">EUR (€) — Euro (Display Only)</option>
                <option value="GBP">
                  GBP (£) — British Pound (Display Only)
                </option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                Note: Prototype sandbox rail is denominated in USD. Existing
                obligations retain USD denomination. Multi-currency settlement
                is scheduled for future release.
              </p>
            </div>
            <div>
              <label
                htmlFor="workspace-timezone-select"
                className="font-bold text-slate-700 block mb-1"
              >
                Workspace Timezone
              </label>
              <select
                id="workspace-timezone-select"
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value)
                  updatePreferences(currency, e.target.value, {
                    offerDecisions,
                    dispatchAlerts,
                  })
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900"
              >
                <option value="America/New_York">
                  America/New_York (Eastern Time)
                </option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="America/Los_Angeles">
                  America/Los_Angeles (Pacific Time)
                </option>
              </select>
            </div>
          </div>
        </section>

        {/* Section: Payment Rail */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Payment Service Rail
              </h2>
              <p className="text-xs text-slate-500">
                Connected settlement service for authorized procurement and
                schedule continuity.
              </p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
              <Icon name="check_circle" />
              PayPal Connected
            </span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-black text-lg">
                P
              </span>
              <div>
                <strong className="text-slate-900 font-bold block">
                  PayPal Sandbox Rail
                </strong>
                <span className="text-slate-500 font-mono text-[11px]">
                  Consent ID: pp_sandbox_consent_9983 · Pre-funded
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-slate-700 hover:text-slate-900 font-semibold text-xs px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 rounded-lg transition-colors"
                onClick={() =>
                  setInspectedEntity({
                    title: "PayPal Purchasing Consent Record",
                    details: {
                      "Consent ID": "pp_sandbox_consent_9983",
                      "Integration Status":
                        "Connected · Active Purchasing Agreement",
                      Environment:
                        "PayPal Sandbox Rail (Client test credentials)",
                      Scope:
                        "Pre-funded procurement up to authenticated monthly limit",
                      "Token Expiry": "Continuous · Automatic sandbox renewal",
                    },
                  })
                }
              >
                Inspect Consent
              </button>
            </div>
          </div>
        </section>

        {/* Section 3: Vendor & Provider Connections */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Supported Vendor Sandboxes
              </h2>
              <p className="text-xs text-slate-500">
                Connected provider bridges for catalog research and sandbox
                procurement.
              </p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {providers.filter((p) => p.status === "HEALTHY").length} Healthy
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {providers.map((prov) => {
              const isReauth = prov.status === "REAUTH_REQUIRED"
              return (
                <div
                  key={prov.id}
                  className="py-3 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isReauth
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      <Icon name="storefront" />
                    </span>
                    <div>
                      <strong className="text-slate-900 block">
                        {prov.name}
                      </strong>
                      <span className="text-slate-400">
                        Sandbox bridge · Checked {prov.lastChecked}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isReauth
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {isReauth ? "Re-auth Required" : "Connected"}
                    </span>
                    {isReauth ? (
                      <button
                        className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] px-2.5 py-1 rounded-lg"
                        onClick={() => store.reconnectProvider(prov.id)}
                      >
                        Re-authenticate
                      </button>
                    ) : (
                      <button
                        className="text-slate-600 hover:text-slate-900 font-semibold text-[11px] px-2.5 py-1 bg-slate-100 rounded-md"
                        onClick={() =>
                          setInspectedEntity({
                            title: `${prov.name} Connection Details`,
                            details: {
                              "Provider ID": prov.id,
                              "Connection Name": prov.name,
                              "Bridge Type": "Verified Partner Sandbox API",
                              "Connection Status": prov.status,
                              "Last Synchronized": prov.lastChecked,
                            },
                          })
                        }
                      >
                        Inspect
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Section 4: Private Supplier List (with Add and Edit) */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Private Supplier List
              </h2>
              <p className="text-xs text-slate-500">
                Member-managed private service directory. Removing a supplier
                clears non-authorizing discovery references.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                {privateSuppliers.length} Saved
              </span>
              {!editingSupplierId && (
                <Button
                  variant="tonal"
                  icon="add"
                  onClick={() => setShowAddSupplier(!showAddSupplier)}
                >
                  {showAddSupplier ? "Cancel" : "Add Supplier"}
                </Button>
              )}
            </div>
          </div>

          {/* Add / Edit supplier form */}
          {(showAddSupplier || editingSupplierId) && (
            <form
              onSubmit={handleSaveSupplier}
              className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in text-xs"
            >
              <strong className="text-slate-900 font-bold block">
                {editingSupplierId
                  ? "Edit Preferred Supplier"
                  : "Add Preferred Private Supplier"}
              </strong>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="supplier-name-input"
                    className="text-[11px] font-bold text-slate-700 block mb-1"
                  >
                    Supplier Name
                  </label>
                  <input
                    id="supplier-name-input"
                    type="text"
                    required
                    placeholder="e.g. Apex Office Installers"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="supplier-area-input"
                    className="text-[11px] font-bold text-slate-700 block mb-1"
                  >
                    Service Area
                  </label>
                  <input
                    id="supplier-area-input"
                    type="text"
                    placeholder="e.g. New York Metro"
                    value={supplierArea}
                    onChange={(e) => setSupplierArea(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="supplier-cat-input"
                  className="text-[11px] font-bold text-slate-700 block mb-1"
                >
                  Service Categories (comma-separated)
                </label>
                <input
                  id="supplier-cat-input"
                  type="text"
                  placeholder="e.g. Furniture Setup, White-Glove Setup"
                  value={supplierCategory}
                  onChange={(e) => setSupplierCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="supplier-notes-input"
                  className="text-[11px] font-bold text-slate-700 block mb-1"
                >
                  Notes
                </label>
                <input
                  id="supplier-notes-input"
                  type="text"
                  placeholder="Special instructions or account notes"
                  value={supplierNotes}
                  onChange={(e) => setSupplierNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="text" onClick={handleCancelSupplierForm}>
                  Cancel
                </Button>
                <Button variant="filled" type="submit">
                  {editingSupplierId ? "Update Supplier" : "Save Supplier"}
                </Button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {privateSuppliers.map((supp) => (
              <div
                key={supp.id}
                className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm font-bold text-slate-900">
                      {supp.name}
                    </strong>
                    {supp.serviceCategories.map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    <span className="font-semibold text-slate-700">Area:</span>{" "}
                    {supp.serviceArea}
                  </p>
                  <p className="text-slate-500 text-[11px] italic">
                    {supp.notes}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    className="text-slate-600 hover:text-slate-900 font-semibold text-xs px-2.5 py-1 hover:bg-slate-200 rounded-lg transition-colors"
                    onClick={() => handleStartEditSupplier(supp)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-rose-600 hover:text-rose-800 font-semibold text-xs px-2.5 py-1 hover:bg-rose-50 rounded-lg transition-colors"
                    onClick={() => removePrivateSupplier(supp.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {privateSuppliers.length === 0 && (
              <p className="text-xs text-slate-400 py-3 text-center">
                No private suppliers listed.
              </p>
            )}
          </div>
        </section>

        {/* Section 5: Notifications & Channels */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
          <h2 className="text-base font-bold text-slate-900">
            Notification Preferences
          </h2>
          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
              <div>
                <strong className="text-slate-900 block">
                  Offer Decision Requests
                </strong>
                <span className="text-slate-500">
                  Immediate alerts when vendor offers match your criteria
                </span>
              </div>
              <input
                type="checkbox"
                checked={offerDecisions}
                onChange={(e) => {
                  setOfferDecisions(e.target.checked)
                  updatePreferences(currency, timezone, {
                    offerDecisions: e.target.checked,
                    dispatchAlerts,
                  })
                }}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
            <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer">
              <div>
                <strong className="text-slate-900 block">
                  Pre-Approved Dispatch Alerts
                </strong>
                <span className="text-slate-500">
                  Confirmations when autonomous tasks execute
                </span>
              </div>
              <input
                type="checkbox"
                checked={dispatchAlerts}
                onChange={(e) => {
                  setDispatchAlerts(e.target.checked)
                  updatePreferences(currency, timezone, {
                    offerDecisions,
                    dispatchAlerts: e.target.checked,
                  })
                }}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
          </div>
        </section>

        {/* Section 6: Active Session & Sign Out */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Active Member Session
            </h2>
            <p className="text-xs text-slate-500">
              Signed in as Leah Morgan (Personal Workspace)
            </p>
          </div>
          <Button variant="danger" icon="logout" onClick={onSignOut}>
            Sign Out
          </Button>
        </section>
      </div>

      {/* Inspect Details Dialog with focus containment */}
      {inspectedEntity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
          onClick={() => setInspectedEntity(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-dialog-title"
        >
          <div
            ref={inspectDialogRef}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3
                id="inspect-dialog-title"
                className="text-base font-bold text-slate-900"
              >
                {inspectedEntity.title}
              </h3>
              <button
                ref={inspectCloseRef}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                onClick={() => setInspectedEntity(null)}
                aria-label="Close inspection"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {Object.entries(inspectedEntity.details).map(([k, v]) => (
                <div key={k} className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    {k}
                  </span>
                  <strong className="text-slate-800 text-xs font-mono">
                    {v}
                  </strong>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="tonal" onClick={() => setInspectedEntity(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
