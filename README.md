# AppAI (appasssistant) — Autonomous Personal Procurement Assistant

> **Delegate your purchases. Retain complete control.**  
> AppAI is the world’s first autonomous personal procurement assistant designed to eliminate the mental tax of everyday purchasing chores—safely, reliably, and within user-defined budget guardrails.

---

## 1. Executive Summary & Vision

Between recurring household consumables, routine utility bills, and hardware upgrades, modern consumers waste over **14 hours each month** managing shopping carts and tracking orders. Meanwhile, legacy "Subscribe & Save" services lock buyers into single retailers while silently hiking prices.

**AppAI** replaces this manual chore loop with **guarded agentic commerce**. You instruct AppAI in natural English (*"Keep our office stocked with specialty whole-bean coffee under $35 every 3 weeks"*), and the system handles candidate discovery, authoritative quoting, scheduling, and checkout under **zero-trust financial guardrails**.

---

## 2. Core Features & Functionality

### 💬 1. Conversational AI Concierge (Prompt-First Intake)
* **Natural Dialogue:** Speak or type requests naturally without wrestling with rigid forms.
* **Instant Constraint Extraction:** The concierge automatically extracts delivery cadence, quality criteria, vendor requirements, and hard price caps.
* **Proposal & Agreement Versioning:** Synthesizes formal agreement proposals (`v1`, `v2`, etc.). Material changes increment the agreement version, cleanly invalidating unused approvals while preserving in-flight operations ([PRD](docs/A-P-P-A-I-agent-product-requirements-document.md)).

### 🛡️ 2. Dual Permission Modes & Safety Governance
AppAI enforces immutable safety boundaries defined in [`src/types/appai.ts`](src/types/appai.ts):
* **`REVIEW_BEFORE_PURCHASE`**: The agent identifies candidates, verifies authoritative merchant quotes, and prepares checkout—requiring an explicit **1-tap mobile authorization** before any money moves.
* **`PRE_APPROVED`**: Completely hands-free autonomous ordering up to an authorized budget ceiling. If a price rises by even **$0.01** above the ceiling, AppAI halts immediately and transitions to review mode.
* **`NOTIFY_ONLY`**: Continuous watch triggers that scout deals and alert members without placing orders.

### 📅 3. Dynamic Timetable Planner
* **Pure Read-Only Projection:** Automatically projects upcoming orders, recurring deliveries, and active deal watches from active instructions and confirmed quotes.
* **Zero Spreadsheet Maintenance:** Derives chronological schedules dynamically—no manual calendar tracking required ([`src/store/domainCore.ts`](src/store/domainCore.ts)).
* **Direct Navigation:** Tapping any scheduled task navigates directly to its originating conversation thread with full historical context.

### 🎯 4. 24/7 Deal & Price-Drop Watches
* **Continuous Scanning:** Set autonomous scouts for hardware, flights, or supplies with target price thresholds and merchant rating filters.
* **Rapid Notification & Sniping:** The moment a price drop lands, AppAI secures the quote and delivers an instant 1-tap checkout card before inventory sells out.

### 🤝 5. Private Supplier Relationships & Hierarchy
* **Custom Relationships:** Register preferred private suppliers, contractors, or local vendors.
* **Discovery Hierarchy:** Prioritizes sourcing in strict order: `Budget Preferred` → `Private History` → `Curated Catalogue` → `Read-Only Discovery`.

---

## 3. System Architecture & Under-the-Hood Rigor

```mermaid
flowchart TD
    User["Member (Prompt / 1-Tap Mobile Approval)"] <--> ReactUI["React 19 + Tailwind v4 Web App<br>(dist/appai-website)"]
    ReactUI <--> API["Authenticated API Gateway<br>(Better Auth / PostgreSQL Sessions)"]
    API <--> PG[("PostgreSQL Transaction Authority<br>(Migrations 001–018)")]
    PG <--> Worker["Durable Background Worker<br>(AC-03 Schedule & Downtime Recovery)"]
    Worker <--> Discovery["Discovery & WebMCP Adapters<br>(Read-Only Search / Quoting)"]
    Worker <--> PayPalRail["Payment Rail Gateway<br>(PayPal Orders v2 / Sandbox)"]
```

### Architectural Principles

1. **PostgreSQL as the Transaction Authority:**
   * Employs atomic budget reservations (`ACTIVE` → `COMMITTED` → `RELEASED`) to prevent double-spending or race conditions ([Schema Spec](docs/A-P-P-A-I-agent-schema.md)).
   * Enforces idempotent request deduplication (`stable_request_key`) across all execution attempts.

2. **Durable Worker & Timezone Engine (`AC-03` Matrix):**
   * Resilient background engine surviving server restarts, network dropouts, and multi-month downtime.
   * **Missed-Tick Recovery:** After extended downtime, executes exactly one overdue cycle rather than spamming duplicate catch-up charges.
   * Fully Daylight Saving Time (DST) compliant across EDT/EST transitions.

3. **Separation of Reasoning from Payment Rails:**
   * LLMs reason strictly over product specifications, merchant metadata, and schedules.
   * Payment authorization is strictly isolated within tokenized partner gateways (e.g., PayPal Orders v2). **Raw credit card numbers are never exposed to LLM prompts.**

---

## 4. Technology Stack

* **Frontend:** React 19, TypeScript (strict mode), Vite, Tailwind CSS v4, supporting desktop and compact 5-tab mobile viewports.
* **Backend & Persistence:** Node.js/TypeScript, PostgreSQL (Migrations 001–018), Better Auth session governance.
* **Integrations:** PayPal Orders v2 sandbox adapter, WebMCP browser host runner, Serper read-only discovery.
* **Verification:** Comprehensive 101-assertion automated acceptance suite in [`tests/acceptance-matrix.ts`](tests/acceptance-matrix.ts).

---

## 5. Local Setup & Quickstart

### Prerequisites
* **Node.js** 22.9+
* **PostgreSQL** running locally (e.g., `postgresql://127.0.0.1:5432/appai_dev` or via Docker Compose)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
On first launch, the runner creates a private `.env` file if one does not exist. Ensure your database connection is specified:
```bash
DATABASE_URL=postgresql://appai:appai-local-only@127.0.0.1:5432/appai_dev
```
*(Optional)* Add AI and payment keys for live sandbox testing:
```bash
GOOGLE_KEY=your_gemini_api_key                # Enables AI Concierge extraction
PAYPAL_DEMO_MODE=sandbox                      # Enables PayPal sandbox testing
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
```

### 3. Run Development Environment
Starts the API, applies PostgreSQL migrations, and launches the React 19 member site:
```bash
npm start
```
* **Member Website:** `http://localhost:4201`
* **API Server:** `http://localhost:4200`

### 4. Create an Invite Code
AppAI enforces invite-only member enrollment. Generate a one-time invitation code:
```bash
npm run invite:member -- --email=you@example.com
```
Use the output code on the web sign-up screen.

---

## 6. Verification & Test Commands

Every core capability is covered by automated verification:

```bash
npm run build              # Compile production website bundle (dist/appai-website)
npm run test:domain        # Domain contract tests (11/11 passing)
npm run test:acceptance    # Comprehensive 101-point lifecycle & UI acceptance suite
npm run test:m0            # Capability matrix, role bindings & mandate revocation
npm run test:ac03          # Schedule matrix, DST transitions & downtime recovery
npm run test:auth          # PostgreSQL session & invite security tests
npm run test:paypal        # PayPal Orders v2 contract tests with local fetch stub
```

---

## 7. Documentation & Marketing Navigation

### Core Specifications
* **[Product Requirements Document (PRD)](docs/A-P-P-A-I-agent-product-requirements-document.md)**: Product scope, permission rules, and requirement IDs.
* **[Technical Requirements Document](docs/A-P-P-A-I-agent-technical-requirements-document.md)**: Architecture, execution contracts, and state boundaries.
* **[Schema Specification](docs/A-P-P-A-I-agent-schema.md)**: Database tables, constraints, and migrations.
* **[Development Acceptance Matrix](docs/DEVELOPMENT-ACCEPTANCE.md)**: Requirement-linked verification scenarios.
* **[Work Status Log](docs/WORK-STATUS.md)**: Active implementation proof and milestone status.

### Marketing & Launch Distribution Kit
* **[Marketing Kit Overview](marketing/README.md)**: Central marketing index and distribution guide.
* **[3-Minute Demo Video Script](marketing/DEMO_VIDEO_SCRIPT_3MIN.md)**: Fast-paced 180-second product demo script for website embeds and social ads.
* **[1-Month Master Editorial Calendar (CSV)](marketing/EDITORIAL_CALENDAR_MONTH_1.csv)**: 44-row Excel/Sheets calendar (12 blog posts, 28 daily FB/IG posts, 4 YouTube videos).
* **[Master Editorial Handbook](marketing/EDITORIAL_CALENDAR_GUIDE.md)**: Outlines for all 12 articles and 4 YouTube video blueprints.
* **[SEO Keyword & Workload Strategy](marketing/SEO_KEYWORD_STRATEGY.md)**: 4 target keyword clusters and monthly production hours.
* **[Brand Positioning & Messaging Guide](marketing/POSITIONING_AND_MESSAGING.md)**: Personas, elevator pitches, and FAQs.
* **[Multi-Channel Social Media Kit](marketing/SOCIAL_MEDIA_KIT.md)**: X/Twitter launch thread, LinkedIn post, and Product Hunt / HN templates.
