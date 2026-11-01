# PRD Drift, Additions, and Clarification Tracking

Status: **Active Reference & Traceability Log**  
Date: **31 October 2026**  
Authority: Documents behavioral evolution between PRD v1.1, Member Prompt & Discovery Design, and live implementation to maintain requirements integrity.

---

## 1. Executive Summary

As development transitioned from static form templates to an agentic conversational concierge, user testing highlighted key areas of alignment, implementation drift, and needed clarifications. This document classifies each item as a **Drift** (defect/deviation from PRD intent), an **Addition** (new capability extending v1.1 scope), or a **Clarification** (sharpening of an existing requirement), providing an auditable trace across the documentation and codebase.

---

## 2. Traceability Matrix

| Item # | Subject | Classification | Previous Specification Reference | Live Implementation Reality | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TR-01** | Dual textareas / "Two thinking areas" | **DRIFT** (Defect) | `A-P-P-A-I-agent-user-flow-chat.md` § 2: "The Instructions workspace stays in one place." | Cached UI had two active input boxes (top prompt box + suggestions reply box), both showing "Thinking...", creating confusion. | **Fixed**: Consolidated into a single conversational composer at the bottom with one primary action. |
| **TR-02** | Hard 6-reply limit crash (`INVALID_CLARIFICATION`) | **DRIFT** (Defect) | `FR-02`: Clarify missing values without inventing authority. No turn-limit or 400 crash was ever specified in PRD v1.1. | `apps/api/src/server.ts` threw HTTP 400 `Send up to six short clarification replies` when `clarifications.length > 6`, breaking multi-turn chat. | **Fixed**: Removed rigid `length > 6` failure; automatically slides context window (`clarificationsInput.slice(-10)`) and increased reply limit to 2,000 characters. |
| **TR-03** | "Questioning Dance" / Questionnaire vs. Action | **CLARIFICATION** | `FR-02`, `MEMBER-PROMPT-AND-SUPPLIER-DISCOVERY-DESIGN.md` § "Need capture": "Ask only for missing information that affects fit, price, service, or safe fulfillment." | Assistant peppered user with 4+ questions in a row, trapping the user in an interrogation loop rather than scouting options. | **Fixed**: Assistant acts decisively on context: discovers market estimates, scouts PayPal providers, resolves dates, and drafts directive immediately. Questionnaire bubble removed from UI; questions suppressed. |
| **TR-04** | Prompt vs. Synthesized Instruction (Title & Directive) | **ADDITION** | PRD v1.1 § 3: "Each instruction preserves the member's original prompt... The assistant may extract constraints." | Informal member prompts were previously used as the display title and summary everywhere. | **Added**: Raw prompt is preserved in `prompt_text`, while `structured_constraints` now formally stores `title` (e.g. "Book Arusha Video Stay"), `directive` (operational execution mandate), and `paymentRail` ('PAYPAL'). |
| **TR-05** | Disappearing / "Swallowed" Instruction on Save | **DRIFT** (Defect) | `FR-08`: Persist instruction lifecycle. `user-flow-chat.md` § 2: "Save DRAFT → show prompt and inherited budget bounds." | Saving a draft called `selectedInstruction.set(null)` and cleared composer, resetting screen to blank greeting. | **Fixed**: Saving draft keeps `selectedInstruction` selected, rendering the formal Saved Instruction Ticket with full details. |
| **TR-06** | Instruction Visibility in Planner Calendar | **DRIFT** (Defect) | PRD v1.1 § 3: "The Planner opens to a day agenda... for instruction start dates, deadlines and scheduled runs." | Drafts without explicit future dates (`validFrom`, `validUntil`, `nextRunAt`) were invisible on the Planner calendar. | **Fixed**: Instructions with target dates appear on those dates; open-ended drafts appear on `createdAt` as "Saved draft". |
| **TR-07** | Bidirectional Navigation (Ticket ↔ Planner) | **ADDITION** | `user-flow-chat.md` § 2: Planner shows validity windows; selecting month date opens day agenda. | No direct jump existed between an instruction ticket and its scheduled day in Planner. | **Added**: `[ 📅 View in Planner ]` button on ticket navigates straight to that date in Planner; clicking agenda item in Planner navigates back to the instruction. |
| **TR-08** | PayPal Provider Eligibility Badge | **ADDITION** | PRD v1.1 § 2: "PayPal only for the initial rail." `MEMBER-PROMPT-AND-SUPPLIER-DISCOVERY-DESIGN.md` § "Initial payment". | Discovered candidate options had no explicit indication of PayPal compatibility. | **Added**: Assistant recommendations include `paypalAccepted: boolean` and display `✓ PayPal Accepted` pill badges. |
| **TR-09** | Form-like Entity Card in Chat Stream | **DRIFT** (Defect) | Member Prompt & Discovery Design: Pure conversational concierge intake without form controls. | `assistant-entity-card` rendered raw API schema keys (`INTENT: PLAN_VACATION_ITINERARY`, raw ISO timestamps) on top of candidate leads, appearing like a form data dump. | **Fixed**: Removed entity card from active chat stream. Concierge natural response flows directly into scouted PayPal leads and one-tap confirmation; structured metadata remains preserved in backend draft storage. |
| **TR-10** | Draft Save Failure in Market Rate Discovery Mode | **DRIFT** (Defect) | `FR-08`: Persist instruction lifecycle. PRD v1.1 § 3: "Never invent an explicit maximum ceiling if none was stated... use null when absent." | Saving drafts with no explicit hard ceiling sent `suggestedBudget` text (e.g., `"TZS 5,200,000 total..."`) as `maximumTotal`, triggering `INVALID_MAXIMUM_TOTAL` (length > 40) or `INVALID_SUGGESTED_LIMIT` (amountToMinor failed on non-decimals). | **Fixed**: `maximumTotal` now strictly sends explicit numeric ceilings (or empty/null for market discovery); `suggestedBudget` text is stored in `structured_constraints.suggestedBudget`; dates are normalized; commas stripped; idempotency key resets on error. |
| **TR-11** | Tunnel / Reverse-Proxy Client IP & Rate Limiting Resolution | **CLARIFICATION** | `TECHNICAL-REQUIREMENTS.md` § 1: Member Authentication & Rate Limiting. | When requests arrived via Cloudflare Tunnel (`appai.themeshak.com`) and local Nginx, Better Auth defaulted to single-hop `x-forwarded-for` and failed to resolve client IP (`WARN [Better Auth]: Rate limiting could not determine a client IP...`), falling back to a shared rate-limit bucket. Nginx also failed IPv6 upstream (`connect() failed (61: Connection refused) http://[::1]:4200/`). | **Fixed**: Added `advanced.ipAddress` in `apps/api/src/auth.ts` prioritizing `cf-connecting-ip`, `x-real-ip`, and trusting `127.0.0.1`/`::1` proxies. Bound `scripts/serve-staging.mjs` to dual-stack `::`. |
| **TR-12** | Stale Intake Proposal Cleanup & Draft Activation Unblocking | **DRIFT** (Defect) | `FR-08`: Persist instruction lifecycle; PRD v1.1 § 3: "Evaluate readiness before first activation." | On save/update, `instructionProposal` was never cleared, leaving stale proposal cards and repeated "Confirm & Update" buttons below the saved ticket. Furthermore, readiness/activation controls required `executionEnvironment === 'FIXTURE'`, which was impossible for a draft whose environment is null until activated. | **Fixed**: Cleared `instructionProposal` and conversation turns upon save/update; enabled `Check activation readiness` and fixture activation for all drafts (`selected.state === 'DRAFT'`). |

---

## 3. Detailed Analysis & Justification

### TR-01 & TR-02: Eliminating Dual Input Areas & Hard Turn Cutoffs
- **Root Cause**: Early prototypes split prompt creation from assistant refinement by nesting an editable proposal card inside the page, complete with its own reply box. In addition, an arbitrary backend validation rule (`clarifications.length > 6` and 500 characters) caused HTTP 400 errors when users naturally continued a conversation.
- **Specification Alignment**: PRD v1.1 explicitly dictates a single coherent member workspace. Breaking natural user conversation with a server validation error (`Send up to six short clarification replies`) directly violates conversational usability.
- **Resolution**:
  1. The API will accept ongoing multi-turn conversations and gracefully window the history to the latest turns without failing.
  2. The frontend maintains a single, persistent conversational composer at the bottom of the screen.

### TR-03: Ending the "Questioning Dance" (Concierge vs. Questionnaire)
- **Root Cause**: The Gemini prompt instructed the model to ask questions for missing details. The model over-indexed on this instruction, generating 3–5 questions per turn (beds, dates, power backup, internet) even when the user provided substantial context.
- **Specification Alignment**: `MEMBER-PROMPT-AND-SUPPLIER-DISCOVERY-DESIGN.md` explicitly warns against "Appai-authored forms" and instructs the system to "reduce repeated entry and keep the user's stated need visible."
- **Resolution**: The assistant prompt is updated to prioritize autonomous synthesis and discovery: make reasonable market assumptions, resolve dates, scout PayPal-eligible providers, and formulate the instruction ticket immediately. Follow-up interrogation is suppressed.

### TR-04: Prompt vs. Instruction (Operational Directives)
- **Root Cause**: In early iterations, the user's raw prompt was treated as the instruction title itself. For example, *"I'm looking for a nearby B&B next month for a YouTube video shoot in Bay Area"* was rendered directly as the card title.
- **Specification Alignment**: A prompt is an informal dialogue; an instruction is a binding procurement contract. PRD v1.1 § 3 requires structured constraints and clear operational parameters.
- **Resolution**:
  - `prompt_text` preserves the verbatim member input for audit and traceability.
  - `structured_constraints.title` holds a concise professional title (e.g., *"Book Bay Area Video Production Stay"*).
  - `structured_constraints.directive` holds the binding mandate (e.g., *"Scout and reserve a video-friendly stay in SF Bay Area up to $300 USD via PayPal before Nov 20, 2026."*).
  - `structured_constraints.paymentRail` explicitly enforces `'PAYPAL'`.

### TR-05, TR-06 & TR-07: Instruction Persistence & Planner Synchronization
- **Root Cause**: Saving a draft previously reset the component state, creating the perception that the instruction had been "swallowed" and lost. Additionally, instructions without explicit validity windows were omitted by `calendarDays()`.
- **Specification Alignment**: The PRD and User Flows require transparent status and durable tracking across the member workspace and the Planner.
- **Resolution**:
  - On save, `selectedInstruction` is retained on-screen as a formal Instruction Ticket.
  - Open-ended drafts are mapped to `createdAt` on the calendar, ensuring 100% visibility.
  - Direct two-way navigation links the Instruction Ticket and the Planner Day Agenda.

---

## 4. Upstream Documentation Updates

To maintain consistency across specifications:
1. **`docs/README.md`**: Add link to this tracking document under § "Start here".
2. **`docs/WORK-STATUS.md`**: Update "Member instruction UX" to record the resolution of dual textareas, elimination of the 6-turn crash, and addition of synthesized directives.
