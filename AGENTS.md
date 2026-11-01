# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React 19 + Vite web application: `src/App.tsx` (top-level routing & views), `src/components/` (screens & shared UI), `src/store/` (transactional state engine `domainCore.ts` and React hook adapter), and `src/types/` (canonical domain models).
- `index.html` and `vite.config.ts` define the browser entry point and build configuration, emitting production assets to `dist/appai-website`.
- `tests/acceptance-matrix.ts` holds the comprehensive 66-point automated verification suite.
- Start with `docs/README.md`, which links the current v1.1 PRD, technical requirements, schema, implementation plan, flows, and acceptance matrix.
- Preserve `docs/archive/v1.0/` as historical reference. The existing flow PDF is also v1.0; use the current Markdown flow.
- `apps/api/` contains the fixture/sandbox demo API; `apps/worker/`, `packages/persistence/`, and durable provider execution remain separate implementation boundaries.

## Build, Test, and Development Commands
- Use npm with the Vite + React toolchain in `package.json`.
- `npm install` installs dependencies; `npm run dev` serves the React site locally on port 4201 with hot reload; `npm run build` creates the production bundle in `dist/appai-website`.
- `npm run test:acceptance` executes the 66-assertion automated domain and UI lifecycle verification suite.
- `npm run build:domain` compiles the TypeScript domain package; `npm run test:domain` runs its focused Node tests.
- `npm run build:api` compiles the sandbox-only demo API; `npm run demo:api` starts it in fixture mode by default. Set `PAYPAL_DEMO_MODE=sandbox` only with secure PayPal Developer sandbox credentials.
- `npm run test:paypal` checks exact amount formatting and the OAuth/Orders v2 request contract with a local fetch stub.
- Start `npm run demo:api` alongside `npm start` to use the website's Developer Sandbox panel; fixture mode creates and captures a local order without real money.
- For current documentation changes, check relative links, requirement IDs, and consistency across affected specifications.

## Coding Style & Naming Conventions
- Follow existing Markdown: descriptive headings, concise lists, relative links, and tables for contracts or acceptance scenarios.
- Preserve established filenames and identifiers such as `FR-06`, `AC-08`, and `PRE_APPROVED`.
- Use React 19 functional components, Tailwind CSS v4, TypeScript strict mode, semantic HTML, and the canonical domain contracts in `src/types/appai.ts`. Keep product behavior out of page-only presentation code.

## Testing Guidelines
- Follow `docs/DEVELOPMENT-ACCEPTANCE.md`; its scenarios are requirements, not passed tests.
- Future coverage must include domain rules, PostgreSQL concurrency, adapter contracts, user journeys, and recovery. No numeric coverage threshold or test naming convention is selected.
- Record environment, fixture versus real adapter, observed result, and evidence. Fixture success does not establish sandbox or live capability.

## Commit & Pull Request Guidelines
- This directory has no Git metadata, so no historical commit convention can be inferred. Use concise, imperative subjects.
- PRs should describe the change, affected requirement/acceptance IDs, validation evidence, and unresolved decisions; include screenshots for UI changes.

## Agent-Specific Instructions
- The PRD owns behavior; technical requirements own execution contracts; the schema implements them. Update affected consumers together.
- Keep external execution disabled until the documented capability gates pass. Do not substitute payment providers or implement deferred holds/escrow without a scope decision.
- **Mandatory Collaboration Lifecycle**: Always follow **Problem → Solution → Plan → Signed → Implementation**.
  1. **Problem**: Identify root cause with concrete evidence, logs, or metrics.
  2. **Solution**: Present and discuss viable options and trade-offs.
  3. **Plan**: Formulate a clear, step-by-step implementation plan.
  4. **Signed**: Halt and wait for user sign-off ("signed" / "proceed") before applying modifications.
  5. **Implementation**: Execute the approved plan cleanly, verify with tests, and report evidence. Never apply speculative trial-and-error shotgun fixes.

## Commit Attribution
- AI-authored commits must include a `Co-Authored-By:` trailer identifying the agent model and attribution byline.
