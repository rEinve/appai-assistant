import { useState, useEffect } from "react"
import { api, type MemberSession } from "./api/client"
import {
  Icon,
  BrandMark,
  Button,
  Navigation,
  DiagnosticsDrawer,
  type IconName,
} from "./components/common/CommonUI"
import { useAppaiStore } from "./store/appaiStore"
import { HomeScreen } from "./components/screens/HomeScreen"
import { InstructionsScreen } from "./components/screens/InstructionsScreen"
import { ConversationScreen } from "./components/screens/ConversationScreen"
import { PlannerScreen } from "./components/screens/PlannerScreen"
import { InboxScreen } from "./components/screens/InboxScreen"
import { SettingsScreen } from "./components/screens/SettingsScreen"
import { OfferReviewModal } from "./components/screens/OfferReviewModal"
import { PaymentScreen } from "./components/screens/PaymentScreen"
import { ReceiptScreen } from "./components/screens/ReceiptScreen"
import { PreApprovedScreen } from "./components/screens/PreApprovedScreen"
import {
  UnsupportedModal,
  type UnsupportedType,
} from "./components/screens/UnsupportedModal"
import { DecisionRecordModal } from "./components/screens/DecisionRecordModal"
import type { InboxItem } from "./types/appai"

function ProductPreview() {
  return (
    <div className="product-preview">
      <div className="preview-rail">
        <BrandMark compact />
        {(["home", "assignment", "calendar_month", "inbox"] as IconName[]).map(
          (icon, index) => (
            <span
              className={index === 0 ? "preview-rail__active" : ""}
              key={icon}
            >
              <Icon name={icon} />
            </span>
          ),
        )}
      </div>
      <div className="preview-main">
        <div className="preview-header">
          <div>
            <small>Good morning</small>
            <strong>Your plans are on track.</strong>
          </div>
          <span className="profile__avatar">LM</span>
        </div>
        <div className="preview-banner">
          <span>
            <Icon name="tune" />
          </span>
          <div>
            <small>Active instruction</small>
            <strong>Find an ergonomic desk chair</strong>
          </div>
        </div>
        <div className="preview-grid">
          <div className="preview-card preview-card--large">
            <span className="status">Researching</span>
            <strong>Comparing providers</strong>
            <p>Delivery, return terms, and total cost</p>
            <div className="preview-progress">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="preview-card preview-budget">
            <span className="eyebrow">June budget</span>
            <strong>$890</strong>
            <p>fixture capacity</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Landing({
  isAuthenticated,
  onEnter,
  onSignIn,
}: {
  isAuthenticated: boolean
  onEnter: () => void
  onSignIn: (mode?: "signin" | "signup") => void
}) {
  return (
    <main className="landing">
      <header className="landing-nav">
        <div className="brand">
          <BrandMark />
          <span className="brand__name">appai</span>
        </div>
        <nav
          className="landing-nav__links"
          aria-label="Landing page navigation"
        >
          <a href="#how-it-works">How it works</a>
          <a href="#control">Control</a>
          <a href="#security">Security</a>
        </nav>
        <div className="landing-nav__actions">
          {isAuthenticated ? (
            <Button onClick={onEnter}>Open workspace</Button>
          ) : (
            <>
              <Button variant="text" onClick={() => onSignIn("signin")}>
                Sign in
              </Button>
              <Button onClick={() => onSignIn("signup")}>Redeem invite</Button>
            </>
          )}
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <span className="landing-kicker">
            <Icon name="bolt" /> Procurement, on your terms
          </span>
          <h1>
            Tell it once.
            <br />
            <em>Let it get done.</em>
          </h1>
          <p>
            APPAI is a personal procurement assistant that researches products,
            compares supplier terms, and tracks purchases within the budget and
            permissions you set.
          </p>
          <div className="landing-hero__actions">
            {isAuthenticated ? (
              <Button icon="arrow_forward" onClick={onEnter}>
                Open workspace
              </Button>
            ) : (
              <>
                <Button icon="arrow_forward" onClick={() => onSignIn("signin")}>
                  Sign in
                </Button>
                <Button variant="secondary" onClick={() => onSignIn("signup")}>
                  Redeem invite
                </Button>
              </>
            )}
            <a className="text-link" href="#how-it-works">
              See how it works <Icon name="arrow_forward" />
            </a>
          </div>
          <div className="trust-row">
            <span>
              <Icon name="check_circle" /> You set every limit
            </span>
            <span>
              <Icon name="lock" /> No raw payment details
            </span>
          </div>
        </div>
        <div
          className="landing-hero__visual"
          role="img"
          aria-label="APPAI workspace preview showing product research, supplier comparisons, and budget status"
        >
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <ProductPreview />
          <div className="floating-note floating-note--top">
            <span>
              <Icon name="search" />
            </span>
            <div>
              <small>Researching</small>
              <strong>4 providers compared</strong>
            </div>
          </div>
          <div className="floating-note floating-note--bottom">
            <span>
              <Icon name="shield" />
            </span>
            <div>
              <small>Permission</small>
              <strong>Review before purchase</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="promise-strip" aria-label="Product principles">
        <span>Clear authority</span>
        <i />
        <span>Human decisions first</span>
        <i />
        <span>Durable progress</span>
        <i />
        <span>Inspectable terms</span>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-intro">
          <span className="eyebrow">A simpler way to get things done</span>
          <h2>From a conversation to a clear plan.</h2>
          <p>
            No complicated intake forms. Explain what you need naturally, choose
            how much authority to give, and stay informed at every important
            moment.
          </p>
        </div>
        <div className="process-grid">
          <article className="process-card process-card--primary">
            <span className="process-card__number">01</span>
            <span className="process-card__icon">
              <Icon name="chat" />
            </span>
            <h3>Describe the need</h3>
            <p>
              Start a conversation. Refine preferences, timing, quantity, and
              budget without translating your life into a form.
            </p>
            <div className="conversation-demo">
              <span>I need a supportive desk chair under $450.</span>
              <span>Got it. Is a 30-day return window important?</span>
            </div>
          </article>
          <article className="process-card">
            <span className="process-card__number">02</span>
            <span className="process-card__icon">
              <Icon name="tune" />
            </span>
            <h3>Choose the authority</h3>
            <p>
              Ask for review, pre-approve a narrow operation, or receive
              notifications only. The choice is always explicit.
            </p>
          </article>
          <article className="process-card">
            <span className="process-card__number">03</span>
            <span className="process-card__icon">
              <Icon name="shopping_bag" />
            </span>
            <h3>Stay in control</h3>
            <p>
              See provider terms and payable totals before deciding. Follow
              progress through a durable inbox and receipt trail.
            </p>
          </article>
        </div>
      </section>

      <section className="control-section" id="control">
        <div className="control-copy">
          <span className="landing-kicker">
            <Icon name="shield" /> Built around permission
          </span>
          <h2>Automation without the black box.</h2>
          <p>
            Every instruction carries an authority mode, stop rule, current
            operation, and next check. Pause or revoke it whenever you want.
          </p>
          <ul>
            <li>
              <Icon name="check_circle" />
              <span>
                <strong>Review required</strong> before a provider action
              </span>
            </li>
            <li>
              <Icon name="check_circle" />
              <span>
                <strong>Pre-approved</strong> only within agreed boundaries
              </span>
            </li>
            <li>
              <Icon name="check_circle" />
              <span>
                <strong>Notify only</strong> when you just want the research
              </span>
            </li>
          </ul>
          <Button variant="tonal" onClick={onEnter}>
            See supported pages
          </Button>
        </div>
        <div className="authority-panel">
          <span className="eyebrow">Authority for this instruction</span>
          <div className="authority-option">
            <span>
              <Icon name="notifications" />
            </span>
            <div>
              <strong>Review required</strong>
              <p>Ask before any provider action</p>
            </div>
            <i className="radio radio--active" />
          </div>
          <div className="authority-option">
            <span>
              <Icon name="bolt" />
            </span>
            <div>
              <strong>Pre-approved</strong>
              <p>Proceed within exact limits</p>
            </div>
            <i className="radio" />
          </div>
          <div className="authority-option">
            <span>
              <Icon name="inbox" />
            </span>
            <div>
              <strong>Notify only</strong>
              <p>Research and report back</p>
            </div>
            <i className="radio" />
          </div>
        </div>
      </section>

      <section className="security-section" id="security">
        <div>
          <span className="eyebrow">Designed for trust</span>
          <h2>Your limits are product behavior, not fine print.</h2>
        </div>
        <div className="security-grid">
          <article>
            <Icon name="lock" />
            <h3>Sensitive by default</h3>
            <p>
              No usable tokens, credentials, or raw payment details shown in the
              workspace.
            </p>
          </article>
          <article>
            <Icon name="payments" />
            <h3>Clear money states</h3>
            <p>
              Available limits, verified funds, payable totals, and recorded
              impact remain distinct.
            </p>
          </article>
          <article>
            <Icon name="public" />
            <h3>Source-aware research</h3>
            <p>
              Provider findings keep source links and never turn estimates into
              agreed facts.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <BrandMark />
        <h2>Ready to make procurement feel lighter?</h2>
        <p>
          {isAuthenticated
            ? "Your personal procurement workspace is ready."
            : "APPAI is currently invitation-only. Sign in or enter your invitation code to access your workspace."}
        </p>
        <Button
          icon="arrow_forward"
          onClick={() => (isAuthenticated ? onEnter() : onSignIn("signin"))}
        >
          {isAuthenticated ? "Open workspace" : "Sign in to workspace"}
        </Button>
      </section>

      <footer className="landing-footer">
        <div className="brand">
          <BrandMark />
          <span className="brand__name">appai</span>
        </div>
        <p>Personal procurement, with permission.</p>
        <span>Invitation-only access</span>
      </footer>
    </main>
  )
}

function Login({
  initialMode = "signin",
  onBack,
  onComplete,
}: {
  initialMode?: "signin" | "signup"
  onBack: () => void
  onComplete: () => void
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from URL query parameters if present (e.g. ?invite=...&email=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const urlInvite = params.get("invite")
      const urlEmail = params.get("email")
      if (urlInvite) {
        setInviteCode(urlInvite)
        setMode("signup")
      }
      if (urlEmail) {
        setEmail(urlEmail)
      }
    } catch {}
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === "signin") {
        await api.signIn(email, password)
      } else {
        if (!inviteCode.trim()) {
          throw new Error("An invitation code is required to join APPAI.")
        }
        await api.signUp({
          name: name.trim() || email.split("@")[0] || "Member",
          email: email.trim().toLowerCase(),
          password,
          inviteCode: inviteCode.trim(),
        })
      }
      onComplete()
    } catch (err: any) {
      setError(
        err?.data?.message ||
          err?.message ||
          (mode === "signin"
            ? "Sign in failed. Check your email and password."
            : "Registration failed. Please verify your invitation code and details.")
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <header className="login-header">
        <button
          className="brand"
          type="button"
          aria-label="Back to APPAI home"
          onClick={onBack}
        >
          <BrandMark />
          <span className="brand__name">appai</span>
        </button>
        <button className="login-help" type="button">
          Help
        </button>
      </header>

      <section className="login-card-wrap">
        <button className="login-back" type="button" onClick={onBack}>
          <Icon name="arrow_back" /> Back
        </button>

        <div className="login-card">
          <div className="login-card__intro">
            <span className="eyebrow">Invitation-Only Workspace</span>
            <h1>{mode === "signin" ? "Welcome back" : "Redeem invitation"}</h1>
            <p>
              {mode === "signin"
                ? "Sign in to continue to your verified APPAI workspace."
                : "Enter your details and invitation code to create your account."}
            </p>
          </div>

          <div className="auth-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={`auth-mode-tab ${mode === "signin" ? "auth-mode-tab--active" : ""}`}
              onClick={() => {
                setMode("signin")
                setError(null)
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`auth-mode-tab ${mode === "signup" ? "auth-mode-tab--active" : ""}`}
              onClick={() => {
                setMode("signup")
                setError(null)
              }}
            >
              Redeem invite
            </button>
          </div>

          {error && (
            <div
              className="p-3 my-4 text-xs rounded-xl bg-red-50 text-red-700 border border-red-200"
              role="alert"
            >
              {error}
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label className="field">
                <span>Full name</span>
                <span className="field__control">
                  <input
                    type="text"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Meshack M"
                    autoComplete="name"
                    required
                  />
                </span>
              </label>
            )}

            <label className="field">
              <span>Email address</span>
              <span className="field__control">
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <label className="field">
              <span>Password</span>
              <span className="field__control">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                />
                <button
                  className="field__visibility"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} />
                </button>
              </span>
            </label>

            {mode === "signup" && (
              <label className="field">
                <span>Invitation code</span>
                <span className="field__control">
                  <input
                    type="text"
                    name="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste your 32-character invite code"
                    autoComplete="off"
                    required
                  />
                </span>
              </label>
            )}

            {mode === "signin" && (
              <div className="login-form__options">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>Keep me signed in</span>
                </label>
                <button className="login-link" type="button">
                  Forgot password?
                </button>
              </div>
            )}

            <button className="login-submit" type="submit" disabled={loading}>
              {loading
                ? mode === "signin"
                  ? "Signing in…"
                  : "Activating account…"
                : mode === "signin"
                ? "Sign in"
                : "Create account & enter"}
            </button>
          </form>
        </div>
      </section>

      <footer className="login-footer">
        <span>© 2026 APPAI</span>
        <nav aria-label="Legal links">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </nav>
      </footer>
    </main>
  )
}

export default function App() {
  const store = useAppaiStore()
  const [active, setActive] = useState<string>("Landing")
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")
  const [session, setSession] = useState<MemberSession | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  // Verify auth session on mount and handle invite link
  useEffect(() => {
    let mounted = true
    const checkAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const urlInvite = params.get("invite")
        if (urlInvite) {
          setAuthMode("signup")
          setActive("Login")
        }
        const userSession = await api.getSession()
        if (!mounted) return
        if (userSession?.user) {
          setSession(userSession)
          await store.hydrateFromApi()
        } else {
          setSession(null)
        }
      } catch {
        if (mounted) setSession(null)
      } finally {
        if (mounted) setSessionChecked(true)
      }
    }
    checkAuth()
    return () => {
      mounted = false
    }
  }, [store.hydrateFromApi])

  // Strict route clearance guard: unauthenticated users cannot enter any workspace view
  useEffect(() => {
    if (sessionChecked && !session && active !== "Landing" && active !== "Login") {
      setActive("Login")
    }
  }, [session, sessionChecked, active])

  const [offerReviewOpen, setOfferReviewOpen] = useState(false)
  const [decisionRecordOpen, setDecisionRecordOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [unsupportedOpen, setUnsupportedOpen] = useState(false)
  const [unsupportedType, setUnsupportedType] =
    useState<UnsupportedType>("POLICY_HARD_CAP")

  const [activeOfferId, setActiveOfferId] = useState("offer-chair-workform")
  const [activeOperationId, setActiveOperationId] = useState("op-coffee-1")
  const [editingInstructionId, setEditingInstructionId] =
    useState<string | null>(null)

  const currentOffer = store.offers.find((o) => o.id === activeOfferId) || null
  const currentOperation =
    store.operations.find((op) => op.id === activeOperationId) || null

  const unreadInboxCount = store.inboxItems.filter(
    (i) => !i.isResolved && i.type !== "RESOLVED",
  ).length

  // Inbox item opener with strict target matching
  const handleOpenInboxItem = (item: InboxItem) => {
    if (item.targetView === "DecisionRecord" || item.id === "inbox-3") {
      setDecisionRecordOpen(true)
    } else if (item.targetView === "OfferReview") {
      const targetOffer = store.offers.find((o) => o.id === item.targetId)
      if (targetOffer) {
        setActiveOfferId(item.targetId)
        setOfferReviewOpen(true)
      } else {
        setUnsupportedType("STALE_OFFER")
        setUnsupportedOpen(true)
      }
    } else if (item.targetView === "PreApproved") {
      const targetOp = store.operations.find((op) => op.id === item.targetId)
      if (targetOp) {
        setActiveOperationId(item.targetId)
        setActive("PreApproved")
      } else {
        setUnsupportedType("MISSING_CAPABILITY")
        setUnsupportedOpen(true)
      }
    } else if (item.targetView === "Receipt") {
      if (item.targetId && item.targetId !== "none") {
        const targetOp = store.operations.find((op) => op.id === item.targetId)
        if (targetOp) {
          setActiveOperationId(item.targetId)
          setActive("Receipt")
        } else {
          setActiveOperationId("")
          setActive("Receipt")
        }
      } else {
        setDecisionRecordOpen(true)
      }
    } else if (item.targetView === "Payment") {
      const targetOffer = store.offers.find((o) => o.id === item.targetId)
      if (targetOffer) {
        setActiveOfferId(item.targetId)
        setActive("Payment")
      } else {
        setUnsupportedType("STALE_OFFER")
        setUnsupportedOpen(true)
      }
    } else if (item.targetId === "policy-block") {
      setUnsupportedType("POLICY_HARD_CAP")
      setUnsupportedOpen(true)
    } else if (item.targetId === "reauth-required") {
      setUnsupportedType("REAUTH_REQUIRED")
      setUnsupportedOpen(true)
    } else {
      setUnsupportedType("POLICY_HARD_CAP")
      setUnsupportedOpen(true)
    }
  }

  // Offer approval -> advances to payment screen
  const handleApproveOffer = (offerId: string) => {
    const result = store.approveOffer(offerId)
    if (result.success) {
      setOfferReviewOpen(false)
      setActiveOfferId(offerId)
      setActive("Payment")
    } else {
      setOfferReviewOpen(false)
      if (
        result.blockedReason?.includes("expired") ||
        result.blockedReason?.includes("agreement")
      ) {
        setUnsupportedType("STALE_OFFER")
      } else {
        setUnsupportedType("POLICY_HARD_CAP")
      }
      setUnsupportedOpen(true)
    }
  }

  // Payment execution -> advances to receipt screen
  const handlePaymentSuccess = (
    offerId: string,
    activateSchedule?: boolean,
  ) => {
    const result = store.executePaymentWithSchedule(
      offerId,
      !!activateSchedule,
      store.scenarioEpoch,
    )
    if (result.success && result.data) {
      setActiveOperationId(result.data.id)
      setActive("Receipt")
    } else {
      if (
        result.blockedReason?.includes("expired") ||
        result.blockedReason?.includes("re-quoted")
      ) {
        setUnsupportedType("STALE_OFFER")
      } else if (result.blockedReason?.includes("Re-authentication")) {
        setUnsupportedType("REAUTH_REQUIRED")
      } else {
        setUnsupportedType("POLICY_HARD_CAP")
      }
      setUnsupportedOpen(true)
    }
  }

  if (active === "Landing") {
    return (
      <Landing
        isAuthenticated={!!session}
        onEnter={() => {
          if (session) {
            setActive("Home")
          } else {
            setAuthMode("signin")
            setActive("Login")
          }
        }}
        onSignIn={(mode = "signin") => {
          setAuthMode(mode)
          setActive("Login")
        }}
      />
    )
  }

  if (active === "Login") {
    return (
      <Login
        initialMode={authMode}
        onBack={() => setActive("Landing")}
        onComplete={async () => {
          const userSession = await api.getSession()
          setSession(userSession)
          await store.hydrateFromApi()
          setActive("Home")
        }}
      />
    )
  }

  return (
    <div className="app-shell">
      <Navigation
        active={active}
        onChange={(view) => {
          if (view === "New instruction") {
            setEditingInstructionId(null)
          }
          setActive(view)
        }}
        onLogo={() => setActive("Landing")}
        inboxCount={unreadInboxCount}
      />

      {active === "Home" && (
        <HomeScreen
          store={store}
          onOpenInbox={() => setActive("Inbox")}
          onOpenInstructions={() => setActive("Instructions")}
          onOpenPlanner={() => setActive("Planner")}
          onOpenSettings={() => setActive("Settings")}
          onOpenOfferReview={(offerId) => {
            setActiveOfferId(offerId || "offer-chair-workform")
            setOfferReviewOpen(true)
          }}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
      )}

      {active === "Instructions" && (
        <InstructionsScreen
          store={store}
          onNewInstruction={() => {
            setEditingInstructionId(null)
            setActive("New instruction")
          }}
          onOpenConversation={(inst) => {
            setEditingInstructionId(inst.id)
            setActive("New instruction")
          }}
          onOpenOfferReview={(offerId) => {
            setActiveOfferId(offerId || "offer-chair-workform")
            setOfferReviewOpen(true)
          }}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
      )}

      {active === "New instruction" && (
        <ConversationScreen
          store={store}
          editingInstructionId={editingInstructionId}
          onClose={() =>
            setActive(editingInstructionId ? "Planner" : "Instructions")
          }
          onComplete={() =>
            setActive(editingInstructionId ? "Planner" : "Instructions")
          }
        />
      )}

      {active === "Planner" && (
        <PlannerScreen
          store={store}
          onEditInstruction={(instId) => {
            setEditingInstructionId(instId || null)
            setActive("New instruction")
          }}
          onOpenPayment={(offerId) => {
            if (offerId) setActiveOfferId(offerId)
            setActive("Payment")
          }}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
      )}

      {active === "Inbox" && (
        <InboxScreen
          items={store.inboxItems}
          onOpenItem={handleOpenInboxItem}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        />
      )}

      {active === "Settings" && (
        <SettingsScreen
          store={store}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onSignOut={async () => {
            try {
              await api.signOut()
            } catch {}
            setSession(null)
            store.loadScenario("HAPPY_PATH")
            setActive("Landing")
          }}
        />
      )}

      {active === "Payment" && (
        <PaymentScreen
          offer={currentOffer}
          budget={store.budget}
          existingOperation={store.operations.find(
            (o) =>
              (o.offerId === activeOfferId ||
                (currentOffer &&
                  o.obligationId === currentOffer.obligationId)) &&
              o.status !== "CANCELLED",
          )}
          eligibility={
            currentOffer
              ? store.checkPaymentEligibility(currentOffer.id)
              : undefined
          }
          onBack={() => setActive("Inbox")}
          onPaySuccess={handlePaymentSuccess}
          onGoToSettings={() => setActive("Settings")}
          onDiscussInConversation={() => {
            if (currentOffer) {
              setEditingInstructionId(currentOffer.instructionId)
            }
            setActive("New instruction")
          }}
          onRequestFreshQuote={(id) => {
            store.requestFreshQuote(id)
            setActive("Inbox")
          }}
          onViewReceipt={(opId) => {
            setActiveOperationId(opId)
            setActive("Receipt")
          }}
        />
      )}

      {active === "Receipt" && (
        <ReceiptScreen
          operation={
            store.operations.find((op) => op.id === activeOperationId) || null
          }
          budget={store.budget}
          onBackToHome={() => setActive("Home")}
          onViewInPlanner={() => setActive("Planner")}
          onRequestCancellation={(opId) => store.requestCancellation(opId)}
        />
      )}

      {active === "PreApproved" && (
        <PreApprovedScreen
          operation={
            store.operations.find((op) => op.id === activeOperationId) || null
          }
          linkedInstruction={store.instructions.find(
            (i) => i.id === currentOperation?.instructionId,
          )}
          budget={store.budget}
          onConfirmAddress={(opId, addr) =>
            store.confirmShippingAddress(opId, addr)
          }
          onBack={() => setActive("Inbox")}
          onManageInstruction={() => setActive("Instructions")}
        />
      )}

      {/* Global Modals and Drawers */}
      <OfferReviewModal
        offer={currentOffer}
        isOpen={offerReviewOpen}
        onClose={() => setOfferReviewOpen(false)}
        onApprove={handleApproveOffer}
        onReject={(offerId, reason) => store.rejectOffer(offerId, reason)}
        onRequestFreshQuote={(offerId) => store.requestFreshQuote(offerId)}
      />

      <DecisionRecordModal
        isOpen={decisionRecordOpen}
        instruction={store.instructions.find((i) => i.id === "inst-headphones")}
        onClose={() => setDecisionRecordOpen(false)}
        onViewInstruction={() => setActive("Instructions")}
      />

      <UnsupportedModal
        isOpen={unsupportedOpen}
        type={unsupportedType}
        onClose={() => setUnsupportedOpen(false)}
        onGoToSettings={() => setActive("Settings")}
      />

      <DiagnosticsDrawer
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        diagnostics={store.diagnostics}
        activeScenario={store.activeScenario}
        onSelectScenario={(s) => {
          store.loadScenario(s)
          setOfferReviewOpen(false)
          setDecisionRecordOpen(false)
          setUnsupportedOpen(false)
        }}
      />
    </div>
  )
}
