---
version: 1.1
name: APPAI-agent-design-system
description: "A light Material 3 fintech design system for the A-P-P-A-I Angular website and product surfaces. White and grey surface levels create hierarchy; navy is reserved for compact emphasis, with restrained blue accents and explicit review states."
colors:
  primary: "#0b1018"
  on-primary: "#f4f8fd"
  primary-container: "#1a2b40"
  on-primary-container: "#dbe9f8"
  secondary: "#4f8cff"
  on-secondary: "#08111f"
  secondary-container: "#dce9ff"
  on-secondary-container: "#102e65"
  background: "#f7f8fa"
  on-background: "#132033"
  surface: "#ffffff"
  on-surface: "#132033"
  surface-variant: "#eef0f3"
  surface-container: "#eef0f3"
  surface-container-high: "#e5e8ed"
  on-surface-variant: "#64748b"
  outline: "#d7e0ea"
  outline-variant: "#c1cfdf"
  inverse-surface: "#0b1018"
  on-inverse-surface: "#f4f8fd"
  inverse-primary: "#a9c6ff"
  error: "#8f1d1d"
  on-error: "#ffffff"
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: -1.8px
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: -1.2px
  display-md:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: -0.6px
  headline:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: 500
    lineHeight: 1.22
    letterSpacing: -0.4px
  card-title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.28
    letterSpacing: -0.2px
  subhead:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.42
    letterSpacing: -0.1px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.48
    letterSpacing: 0
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
  eyebrow:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: 0.2px
  mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 9999px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px
---

# Autonomous Personal Procurement Assistant Agent (A-P-P-A-I) Brand Kit and Design System

> Development alignment: v1.1, 29 October 2026. This document owns appearance. [Current user flows](A-P-P-A-I-agent-user-flow-chat.md) and the [PRD](A-P-P-A-I-agent-product-requirements-document.md) own behavior. Review-required purchases need consent even below caps; hard-cap breaches block until settings change. Payment tokens and API payloads are optional, sanitized diagnostics—not usable credentials. Pre-purchase holds are a later extension.

## Overview

The **A-P-P-A-I (Autonomous Personal Procurement Assistant Agent)** design system establishes a confident fintech/SaaS visual language for the Angular website and future product surfaces. The website is predominantly light, with white and grey Material 3 surface levels providing structure. Reserve dark navy for compact emphasis such as primary actions and member navigation. Use one sans-serif family throughout.

The core interface uses a light canvas (`{colors.background}`), white data cards (`{colors.surface}`), grey containers (`{colors.surface-container}`), and restrained blue accents (`{colors.secondary}`). Provider branding is not a separate product colour; any PayPal demo must remain visibly labelled as fixture or sandbox.

### Evidence and state boundaries

- **Fixture:** deterministic local behavior; useful for demonstrating journeys, not provider support.
- **Sandbox:** provider test credentials and provider responses are present; buyer approval and webhook evidence still need to be recorded.
- **Live:** separately authorised production capability; never implied by a fixture or sandbox badge.
- **Review required:** the user must explicitly approve the current, immutable quote.
- **Blocked:** the system cannot proceed until the stated limit, identity, capability, or configuration issue is resolved.

### Current website mapping

- **Dark control plane:** announcement, navigation, hero, and the CSS-native rules/telemetry illustration.
- **Light technical surfaces:** trust strip, capability cards, workflow, and category detail.
- **Dark governance surfaces:** permission decision panel and PayPal fixture/sandbox panel.
- **Illustration rule:** prefer small, information-bearing diagrams and status views over decorative stock imagery.

### Core Design Pillars and Palette Mapping

| Design System Axis | Visual Token Strategy | Operational Purpose in A-P-P-A-I |
| ------ | ------ | ------ |
| **Control Surface** | Dark Navy (`#0b1018`) | Gives the hero and governance areas the authority of a fintech control plane. |
| **Technical Canvas** | Light Blue-Gray (`#f4f7fb`) | Keeps lower-page product detail readable and structured. |
| **Primary Typography** | Near-black ink (`{colors.on-background}`) set in `Inter` / `Geist` | Keeps headlines and structured assistant responses legible. |
| **Technical Data** | `JetBrains Mono` set on `{colors.surface-variant}` (`#edf2f8`) | Formats price caps, JSON-LD attributes, and sanitized technical diagnostics. |
| **Payment State Accent** | Secondary blue (`{colors.secondary}`) with its container pair | Identifies a clearly labelled payment state; never substitutes for provider evidence. |
| **Governance & Safety** | Secondary Container (`#dce9ff`) & Error (`#8f1d1d`) | Highlights review-required overlays and hard budget cap blocks. |

**Key Characteristics:**
* **Dark-to-Light Product Rhythm:** Lead with a dark control plane, then use light surfaces for explanation, comparison, and technical detail.
* **Product-and-Governance-Led Rhythm:** Every interaction makes the need, offer, limits, next step, and pause state easy to scan.
* **Dual-Type Architecture:** `Inter` (or `Geist Sans`) carries display, body, and button labels; `JetBrains Mono` handles API tokens, JSON-LD schema feeds, and price/limit parameters.
* **Provider-Aware Accents:** Use the secondary pair (`{colors.secondary}` / `{colors.secondary-container}`) for a labelled provider state only after the corresponding capability is proven; never infer proof from colour alone.
* **Hard Governance Guardrails:** Clear visual distinctions for review-required offers, hard-cap blocks, and budget compliance status.

---

## Colors

### Brand & Accent
* **Primary Ink** (`{colors.on-background}`): The system text colour. Headlines, body copy, and dense product detail use this grounded tone.
* **Secondary Blue** (`{colors.secondary}`): The primary product action colour. Use it for clear next steps and confirmed in-scope actions, not as a claim of autonomous execution.
* **Primary Navy** (`{colors.primary}`): The dark control-plane family used for authority, navigation, and governance surfaces.

### Surface
* **Background** (`{colors.background}`): Default light application ground — cool technical blue-gray (`#f4f7fb`).
* **Surface** (`{colors.surface}`): Pure white (`#ffffff`) — used for floating chat bubbles, catalog match cards, and modal containers.
* **Surface Variant** (`{colors.surface-variant}`): Cool blue-gray (`#edf2f8`) — used for input backgrounds, code blocks, and alternating rows.
* **Outline** (`{colors.outline}`): 1px subtle card borders — cool neutral gray (`#d7e0ea`).
* **Outline Variant** (`{colors.outline-variant}`): Stronger dividers (`#c1cfdf`) for dark-panel boundaries and focus context.
* **Inverse Surface** (`{colors.inverse-surface}`): Near-black navy (`#0b1018`) — used for the hero, governance sections, and dark callouts.

### Text
* **On Background** (`{colors.on-background}`): All primary headlines, body text, and active input labels — deep navy (`#132033`).
* **On Surface Variant** (`{colors.on-surface-variant}`): Secondary body text (`#64748b`) — product subtext, merchant names, delivery dates.
* **On Inverse Surface** (`{colors.on-inverse-surface}`): Soft white (`#f4f8fd`) on dark backgrounds.
* **Inverse Primary** (`{colors.inverse-primary}`): Light blue (`#a9c6ff`) for readable secondary text on dark surfaces.

### Governance & Semantic Palette
* **Secondary Container** (`{colors.secondary-container}`): Light blue (`#dce9ff`) — review-required or successfully observed states.
* **Error** (`{colors.error}`): Reserved deep red (`#8f1d1d`) — the operation is blocked or its data cannot be trusted.

---

## Typography

### Font Family
* **Inter** (or **Geist Sans**, with a system sans fallback): Primary geometric/neo-grotesque sans-serif. Carries display headlines, body text, buttons, and form labels.
* **JetBrains Mono** (or **Geist Mono**): Technical monospace. Used exclusively for scoped identifiers, provider references, JSON-LD attributes, and exact price calculations.

### Hierarchy Table
| Token | Size | Weight | Line Height | Letter Spacing | Operational Use |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `{typography.display-xl}` | 64px | 500 | 1.08 | -1.8px | Main hero statement / primary landing header |
| `{typography.display-lg}` | 48px | 500 | 1.12 | -1.2px | Section headers, major modal titles |
| `{typography.display-md}` | 36px | 500 | 1.18 | -0.6px | App section sub-headers |
| `{typography.headline}` | 26px | 500 | 1.22 | -0.4px | Catalog match title, checkout banner headline |
| `{typography.card-title}` | 20px | 500 | 1.28 | -0.2px | Product item title, HITL modal title |
| `{typography.subhead}` | 18px | 400 | 1.42 | -0.1px | Lead chat prompt intro, sub-section descriptions |
| `{typography.body-lg}` | 17px | 400 | 1.48 | 0 | Featured AI response text, user query text |
| `{typography.body}` | 15px | 400 | 1.50 | 0 | Default body text, message history, table cells |
| `{typography.body-sm}` | 13px | 400 | 1.45 | 0 | Product specs, merchant delivery details |
| `{typography.caption}` | 12px | 400 | 1.40 | 0 | Security disclaimers, timestamp logs |
| `{typography.button}` | 14px | 500 | 1.20 | 0 | Button labels, action pills |
| `{typography.eyebrow}` | 13px | 500 | 1.30 | 0.2px | Section category tags, status badges |
| `{typography.mono}` | 12px | 400 | 1.50 | 0 | Token hashes, API parameters, raw price caps |

### Typographic Principles
* **Medium Weight (500) for Headings:** Keeps headlines clean and modern without heavy bolding.
* **Negative Tracking on Large Displays:** Display sizes pull tracking inward (-1.8px to -0.4px) to increase visual density.
* **Monospace Isolation:** Monospace font (`JetBrains Mono`) is never used for general body copy; it is reserved for technical data, redacted status values, and schema tags.

---

## Layout

### Spacing System
* **Base Grid Unit:** 8px.
* **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
* **Card Interior Padding:** 20px on standard product tiles; 24px on pricing and checkout cards; 32px on HITL modal overlays.
* **Chat Container Width:** Maximum 840px centered layout for chat interaction; 1280px max-width for desktop catalog viewports.

### Whitespace Philosophy
The light technical ground (`{colors.background}`) keeps dense product information calm without flattening the hierarchy. Generous vertical padding (`{spacing.section}` 80px) between major functional zones, combined with white tile elevations and dark control sections, lets users scan product specifications and budget parameters without losing the operational context.

---

## Elevation and Depth

| Elevation Level | Visual Treatment | Operational Component |
| ------ | ------ | ------ |
| **Level 0 (Flat)** | No shadow, background `{colors.background}` | Base page background, chat canvas, footer |
| **Level 1 (Card Lift)** | `{colors.surface}` white background + 1px `{colors.outline}` border | Catalog match cards, user message bubbles, budget widgets |
| **Level 2 (Hover/Focus)** | `{colors.surface}` + 1px `{colors.outline}` border + subtle 4px blur shadow | Interactive product cards, focused input fields |
| **Level 3 (Modal Overlay)** | `{colors.surface}` + 12px blur shadow + dark backdrop opacity (40%) | Human-in-the-Loop (HITL) approval dialog, security status modal |

---

## Shapes and Geometry

### Border Radius Scale
| Token | Value | Applied Design Element |
| ------ | ------ | ------ |
| `{rounded.xs}` | 4px | Status chips, schema tags, small input badges |
| `{rounded.sm}` | 6px | Inline code blocks, price cap indicators |
| `{rounded.md}` | 8px | Standard buttons, text inputs, chat prompt container |
| `{rounded.lg}` | 12px | Product cards, budget limit widgets, summary banners |
| `{rounded.xl}` | 16px | Large catalog preview tiles, modal containers |
| `{rounded.xxl}` | 24px | Floating CTA callout banners |
| `{rounded.pill}` | 9999px | Filter pills, status toggles, user avatars |

---

## Component Library Specifications

### 1. Buttons
* **`button-primary` (Product CTA):** Default primary action across the system.
  * Background: `{colors.primary}` (`#0b1018`), Text: `{colors.on-primary}` (`#f4f8fd`), Typography: `{typography.button}`, Padding: 10px 18px, Radius: `{rounded.md}` (8px).
* **`button-payment-provider` (Provider CTA):** Used only for a verified provider action after permission, quote, and capability checks pass. In fixture mode, label it as a demo action and do not imply financial execution.
  * Background: `{colors.secondary}` (`#4f8cff`) only after the provider and permission checks pass; Text: `{colors.on-secondary}` (`#08111f`), Typography: `{typography.button}`, Padding: 10px 18px, Radius: `{rounded.md}` (8px).
* **`button-secondary` (White Tile CTA):** Used for secondary actions (e.g., "Modify Criteria", "View Raw Feed").
  * Background: `{colors.surface}` (`#ffffff`), Text: `{colors.on-surface}` (`#132033`), Border: 1px `{colors.outline}` (`#d7e0ea`), Padding: 10px 18px, Radius: `{rounded.md}` (8px).

### 2. Inputs and Chat Bar
* **`chat-input-container`:** Floating input bar where users enter natural-language procurement queries.
  * Background: `{colors.surface}`, Border: 1px `{colors.outline}`, Radius: `{rounded.lg}` (12px), Padding: 12px 16px, Shadow: Level 1.
* **`intent-chip`:** Small removable filter pill showing parsed parameters (e.g., `Max Price: $50`, `Delivery: By Fri`).
  * Background: `{colors.surface-variant}` (`#edf2f8`), Text: `{colors.on-surface}`, Typography: `{typography.caption}`, Radius: `{rounded.pill}`.

### 3. Catalog Match and Product Cards
* **`catalog-product-card`:** Displays structured item details from a configured provider or fixture feed.
  * Background: `{colors.surface}`, Border: 1px `{colors.outline}`, Radius: `{rounded.xl}` (16px), Padding: 20px.
  * Contains: Product image when available, structured title, observed price, delivery window, and a clearly labelled stock/status badge.

### 4. Governance and HITL Approval Overlays
* **`governance-budget-badge`:** Displays current spend against hard budget limits.
  * Background: `{colors.surface-variant}`, Border: 1px `{colors.outline}`, Radius: `{rounded.sm}` (6px), Padding: 4px 8px.
  * Secondary-container treatment when within the current rules; error treatment when blocked.
* **`hitl-approval-banner`:** Modal overlay for REVIEW_REQUIRED purchases or a soft approval threshold within hard caps. Hard-cap blocks are a separate non-purchasing state.
  * Background: `{colors.surface}`, Border: 2px `{colors.secondary}` (`#4f8cff`), Radius: `{rounded.xl}` (16px), Padding: 28px, Shadow: Level 3.
  * Actions for a valid review-required quote: "Approve Purchase" (`button-payment-provider`) vs "Reject Offer" (`button-secondary`). A hard-cap violation instead shows "Change Spending Settings" or "Cancel"; it cannot be approved as an exception. All actions use authenticated, versioned application APIs.

---

## Do's and Don'ts

### Do
* **DO** reserve `{colors.inverse-surface}` (`#0b1018`) for the control-plane hero and governance sections; use `{colors.background}` (`#f4f7fb`) for light technical surfaces.
* **DO** use `{colors.secondary}` (`#4f8cff`) for the primary product action and rely on labels—not colour alone—for provider identity.
* **DO** present product matches as structured cards showing the source, observation time, price basis, and any unresolved fields.
* **DO** display hard budget limits and sanitized payment state clearly before any execution attempt.
* **DO** use `JetBrains Mono` for exact price parameters, scoped identifiers, and redacted API status values.

### Don't
* **DON'T** use pure stark white (`#ffffff`) as the main application background canvas.
* **DON'T** introduce a third brand hue or use colour alone as evidence that a provider is connected.
* **DON'T** obscure price breakdowns, taxes, or shipping fees during a purchase preview.
* **DON'T** execute purchases silently when spending limits or policy parameters are breached.
* **DON'T** introduce heavy drop shadows or bright saturated neon background colors.

---

## Responsive Behavior and Breakpoints

| Breakpoint Name | Viewport Width | Layout & Component Adaptation |
| ------ | ------ | ------ |
| **Desktop XL** | 1440px+ | 2-column layout (Chat history left, Catalog & Governance right) |
| **Desktop** | 1280px | 2-column layout maintained; catalog tiles scale to 2-up grid |
| **Tablet** | 768px – 1023px | Single-column stacked view; budget meters move to sticky top bar |
| **Mobile** | < 768px | Full single-column chat; HITL modals render as full-screen bottom sheets |

---

## Iteration and Maintenance Guide
1. **Token Reference Consistency:** When styling new UI features, reference Material 3 roles directly by name (e.g., `{colors.secondary}`, `{colors.secondary-container}`, `{typography.headline}`).
2. **Surface Hierarchy:** Always determine surface elevation first: Technical Canvas (`#f4f7fb`) -> Floating White Card (`#ffffff`) -> Dark Control Callout (`#0b1018`).
3. **Security Audit Check:** Verify that raw card data and client secrets never appear in mockups; payment states show only scoped, redacted status or provider references.
