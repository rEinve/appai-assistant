# Autonomous Procurement MVP

Current baseline: **v1.1, 29 October 2026**. Use the [development index](README.md) and [PRD](A-P-P-A-I-agent-product-requirements-document.md) for implementation.

Build a personal procurement officer that remembers future needs, monitors eligible offers and pays supported vendors under explicit user instructions.

1. **Persistent instructions and discovery:** one-time/future purchases, recurring bills and offer watches; typed constraints; supported MCP/WebMCP/feed/search/read-only scraping adapters; vendor-confirmed purchase terms.
2. **Permission and budget:** PRE_APPROVED, REVIEW_REQUIRED or NOTIFY_ONLY per instruction; exact total/currency; shared durable allocations and atomic reservations; scoped authority and stop rules.
3. **Supported payment and recovery:** PayPal/vendor adapter, stable operation identity, unknown-outcome reconciliation and confirmed vendor receipt; no raw credentials in the model.
4. **Phone control:** durable inbox and selected mobile push transport; authenticated approval, pause/revoke and vendor-confirmed cancellation/refund status. The worker continues independently of phone UI.

Pre-purchase reservation/authorization-capture is a later extension, not an MVP dependency. Agent-to-agent payments, custodial escrow and universal merchant coverage are not part of the selected first-release architecture. External integration feasibility is validated in M0; fixtures permit local development but do not establish live support.
