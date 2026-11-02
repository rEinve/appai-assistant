# A-P-P-A-I

The repository contains the Angular website, invite-only member authentication, a PostgreSQL persistence foundation, domain contracts, and a fixture-only PayPal demo API. Product and safety contracts are in [`docs/README.md`](docs/README.md).

## Member sign-in checkpoint

The local M1 member workflow supports invite-only sign-in, account and budget setup, owner-scoped instructions, fixture-only activation, pause/resume/revoke, synthetic quotes, review decisions, and activity history. Fixture runs never call vendors or payment providers and grant no real spending authority. M0 provider capability, sandbox/live execution, public recovery delivery, sensitive-action step-up, and production deployment remain open. See [work status](docs/WORK-STATUS.md) and [M1 evidence](docs/M1-EVIDENCE.md).

## Local setup

Requirements: Node.js 22.9+ and a running local PostgreSQL server. Install dependencies once:

```bash
npm install
```

Run the API, local PostgreSQL database, migrations, and Angular site together:

```bash
npm start                  # member area + its API at http://localhost:4200
```

On first run, the launcher creates a private `.env` with a random local authentication secret if one does not exist. Set `DATABASE_URL` there to the database and credentials for your installed PostgreSQL server. The launcher checks that connection, applies migrations, builds the API, and waits for member authentication before starting Angular. It does not start Docker by default. The root page opens the member area and checks for an existing session; use **Back to website** to reach the public page. Keep `.env` private; it is ignored by Git.

The Compose database remains an optional isolated alternative: set `APP_USE_DOCKER_DB=true` and use `DATABASE_URL=postgresql://appai:appai-local-only@127.0.0.1:5432/appai_dev`. Its default password is for local development only. `npm run db:up` starts it manually; `npm run db:down` stops it while preserving its volume.

Create a member invite for an email you control:

```bash
npm run invite:member -- --email=you@example.com
```

The command prints a one-use invitation code to the terminal; share it privately and enter it on the member area's sign-up form. Local PayPal mode defaults to `fixture` and never moves money. `npm start` owns the local API lifecycle; use `npm run demo:api` only when you want to run the API separately.

To try the optional **Ask assistant** draft-refinement step, set `GOOGLE_KEY` in the private root `.env` and restart `npm start`. `GOOGLE_MODELS` accepts up to three comma-separated models in priority order, for example `gemini-3.8-flash,gemini-3.5-flash-lite`; the next model is tried only if the previous model is unavailable or rate limited. Manual instruction setup works without a key. The assistant sends the member's instruction to Gemini only when they select **Ask assistant**. Review the provider's data controls before using real personal information. This step cannot activate instructions or make purchases.

For optional read-only web search in Instructions, set `searchProvider=serper` and `serperApiKey` in the private `.env`, then restart the API. The member enters and submits search terms explicitly. Results are unverified links, never quotes or proof that a supplier can accept payment. `npm run test:search:live` checks the authenticated route with a synthetic query and temporary member; it passed with the corrected local key.

For PayPal sandbox checkout testing, use a PayPal Developer **Business** sandbox account for the REST app credentials and a separate **Personal** sandbox account as the demo customer. Set `PAYPAL_DEMO_MODE=sandbox`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` in the private `.env`. Run `npm run test:paypal:sandbox` to create a USD 1.00 synthetic order and print its buyer approval link. Sign in to that link with the Personal sandbox account. After approval, explicitly capture the sandbox order with `npm run test:paypal:sandbox -- --capture=ORDER_ID`; this uses sandbox funds only. To inspect an existing order and recover its approval link, run `npm run test:paypal:sandbox -- --order=ORDER_ID`. The normal fixture mode never contacts PayPal. Do not use live credentials for these commands.

## Development commands

```bash
npm run build              # production website bundle
npm run build:api          # compile API
npm run test:auth          # PostgreSQL-backed M1-A acceptance checks
npm run test:domain        # domain contract tests
npm run test:paypal        # PayPal adapter tests with a local fetch stub
npm run test:assistant:live # synthetic Gemini extraction and draft persistence; uses the private key
npm run test:search:live    # synthetic authenticated Serper search; uses the private key
npm run test:paypal:sandbox # real PayPal Developer sandbox create/status smoke test
```

`npm run test:auth` requires the configured local PostgreSQL database and applies the migrations before running. It creates and cleans up uniquely named test members. Migrations are in `packages/persistence/migrations/`; use `npm run db:migrate` to apply them to the configured development database. `npm run db:down` stops the local database container while retaining its named volume. Do not use production credentials for local acceptance tests.
