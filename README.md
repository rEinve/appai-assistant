# AppAI (appasssistant) — Autonomous Personal Procurement Assistant

> **Delegate your purchases. Retain complete control.**  
> AppAI is the world’s first autonomous personal procurement assistant designed to eliminate the mental tax of everyday purchasing chores—safely, reliably, and within user-defined budget guardrails.

![AppAI member dashboard showing active instructions, budget status, today's plan, and inbox updates](screenshot.png)

*Dashboard preview in fixture workspace mode; the displayed instructions and amounts are sample data.*

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
* **Node.js** 22.12 or newer (Node 24 LTS is also supported by Vite 8).
* **npm**, installed with Node.js.
* **PostgreSQL 16** locally, or Docker Compose to start the included PostgreSQL-only service.

### 1. Clone and install
```bash
git clone https://github.com/rEinve/appai-assistant.git
cd appai-assistant
npm ci
```

### 2. Configure the local environment

```bash
cp .env.example .env
openssl rand -base64 48
```

Copy the generated value into `BETTER_AUTH_SECRET` in `.env`. For the included local Compose database, use these matching development-only settings:

```bash
APP_USE_DOCKER_DB=true
POSTGRES_PASSWORD=appai-local-only
DATABASE_URL=postgresql://appai:appai-local-only@127.0.0.1:5432/appai_dev
```

Keep `PAYPAL_DEMO_MODE=fixture` for local use. Do not reuse the example database password or auth secret on an internet-facing server. For installed PostgreSQL, set `APP_USE_DOCKER_DB=false` and use that database's connection string instead.

### 3. Start the local application

`npm start` starts the local database if needed, applies migrations, builds and starts the API and worker, and serves the site:

```bash
npm start
```

* **Member website:** <http://localhost:4200>
* **API health:** <http://localhost:4300/health>
* **Hot-reload frontend:** `npm run dev` at <http://localhost:4201> (the API must also be running on port 4300).

### 4. Invite your first member

Enrollment is invite-only. Generate a one-use code for the email address that will sign up:

```bash
npm run invite:member -- --email=you@example.com
```

Enter the code on the sign-up screen and share it privately. It expires after seven days. The local Compose database can be stopped with `docker compose stop db`; its data volume remains in place.

For production installation, HTTPS, Nginx, persistent services, database backups, environment variables, and capability limits, follow the [self-hosting and deployment guide](docs/SELF-HOSTING.md).

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
* **[Self-hosting & deployment guide](docs/SELF-HOSTING.md)**: Clone, install, configure, run locally, deploy on one Ubuntu VPS, update, back up, and troubleshoot.
* **[License](LICENSE)**: MIT License.

The MIT license applies to the AppAI project software and first-party documentation. AppAI is free to use; hosting, domains, database services, and optional third-party API usage may have costs.
