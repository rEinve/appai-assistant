---
name: five-final-checklist
description: Execute the mandatory 5-step final quality, accessibility, design token, SEO, and release verification checklist before delivering or deploying any web page, component, or microsite.
---

# Five Final Quality & Pre-Flight Checklist

This protocol is the **mandatory pre-flight verification gate** before delivering UI work, committing code, or completing deployment across IntelliTheme Studio and IntelliWebLab projects.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                    5-STEP PRE-FLIGHT VERIFICATION GATE                        │
│                                                                               │
│  [1] Strict Token & Style Hygiene  ──► Zero hex, zero invented classes        │
│  [2] Semantic & A11y Compliance    ──► WCAG 2.1/2.2 AA, 100% clean tree       │
│  [3] Motion & Reduced-Motion       ──► Tokenized easing, no jank, full a11y   │
│  [4] Privacy, SEO & LLM Discovery  ──► Consent Mode v2, sitemap, llms.txt     │
│  [5] Build & Live Verification     ──► 0-error build, all routes verified     │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Step 1: Strict Token & Style Hygiene (Zero Hardcoded Values)

All visual styling must consume canonical tokens and layout primitives.

### Verification Checklist:
- [ ] **Zero Hardcoded Colors**: No raw `#hex`, `rgb()`, or `hsl()` in SCSS, CSS, or inline HTML.
  - Surfaces: `var(--color-surface)`, `var(--color-surface-container-low)`, `var(--color-surface-100)`, `var(--accent-contrast-brighter)`.
  - Text: `var(--color-text-primary)`, `var(--color-text-secondary)`, `var(--color-text-tertiary)`, `var(--color-text-inverse)`.
  - Accents: `var(--accent-base)`, `var(--accent-strong)`, `var(--accent-50)`, `var(--accent-100)`.
  - Outlines: `var(--outline-default)`, `var(--outline-variant)`, `var(--accent-300)`.
- [ ] **Zero Arbitrary Fixed Spacing/Sizes**: Use tokenized spacing scale (`var(--space-xxs)` through `var(--space-xxl)`, `var(--king-space)`) and fluid typography (`var(--step-0)` through `var(--step-5)`).
- [ ] **Layout Primitives First**: Grid and alignment belong exclusively to primitives (`.container`, `.grid-12`, `.stack`, `.row`, `.cluster`, `.items-middle`, `.justify-between`). Never create page-specific layout grid classes.
- [ ] **No Invented Class Names**: Only use selectors already declared in `themeui-lab` and canonical `src/scss/` stylesheets.

### Verification Command:
```bash
# Scan for illegal raw hex colors in SCSS / HTML
grep -rnE "#[0-9a-fA-F]{3,8}" src/scss/ *.html partials/ | grep -v "_color.scss" || echo "✅ Zero hardcoded colors"
```

---

## 2. Step 2: Semantic & Accessibility Compliance (WCAG 2.1/2.2 AA)

Ensure 100% accessible landmarks, heading hierarchy, interactive controls, and focus states.

### Verification Checklist:
- [ ] **Unique Page Metadata**: Every page must have exactly **one** `<title>` tag and `<meta name="description">` inside `<head>` (no duplicate titles from partial inclusions).
- [ ] **Strict Heading Hierarchy (WCAG 1.3.1 & 2.4.6)**: Document must start with a single `<h1>` and progress sequentially (`<h1>` $\rightarrow$ `<h2>` $\rightarrow$ `<h3>`) without skipping levels.
- [ ] **Accessible Interactive Elements**:
  - Every `<a>` link must enclose descriptive text or have an `aria-label` (never empty `<a href="..."></a>`).
  - Every `<button>` must have visible text or an explicit `aria-label`.
- [ ] **Form Input Labelling**: Every `<input>`, `<textarea>`, and `<select>` must be paired with `<label for="...">` or wrapped inside a `<label>`.
- [ ] **Dialogs & Live Regions**: Modals must declare `role="dialog" aria-modal="true" aria-labelledby="..."`, trap focus, and close on `Escape`. Dynamic chat logs must declare `role="log" aria-live="polite"`.
- [ ] **High-Contrast Focus Indicators (WCAG 2.2 AA)**: Global `:focus-visible` must provide a minimum 2px solid outline with high contrast (`outline: 2px solid var(--accent-base); outline-offset: 2px;`).
- [ ] **Touch Targets**: All clickable elements must meet the $\ge 44 \times 44\text{px}$ touch target minimum.

### Verification Command:
```bash
# Automated Static Accessibility Scan across all compiled HTML
node -e '
const fs = require("fs"), path = require("path");
const files = fs.readdirSync("./dist").filter(f => f.endsWith(".html"));
let errors = 0;
files.forEach(f => {
  const html = fs.readFileSync(path.join("./dist", f), "utf8");
  const titles = html.match(/<title>[^<]*<\/title>/gi) || [];
  if (titles.length !== 1) { console.error(`❌ ${f}: ${titles.length} title tags found`); errors++; }
  if (/<a\s+[^>]*href=["\x27][^"\x27]*["\x27][^>]*>\s*<\/a>/gi.test(html)) {
    console.error(`❌ ${f}: Empty link tag detected`); errors++;
  }
});
if (errors === 0) console.log("✅ 100% Static A11y Compliance");
'
```

---

## 3. Step 3: Motion, Transitions & Reduced-Motion Respect

All visual state transitions and animations must be fluid, performant, and accessible.

### Verification Checklist:
- [ ] **Tokenized Motion**: All transitions and keyframes use canonical tokens (`var(--motion-standard)`, `var(--motion-fast)`, `var(--motion-ease-standard)`, `var(--motion-ease-decelerate)`).
- [ ] **Zero Layout Shifts**: Accordions, dropdowns, and mobile drawers use hardware-accelerated transforms (`translateY`, `scale`, `opacity`) or smooth height interpolation without clipping content.
- [ ] **Strict Reduced-Motion Support**: All animations, reveals, and modal zoom effects must gracefully disable or simplify when the user requests reduced motion:
  ```scss
  @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
      }
  }
  ```

---

## 4. Step 4: Privacy, SEO, Structured Data & LLM Discovery

Full compliance with privacy regulations (GDPR/ePrivacy) and AI search indexing standards.

### Verification Checklist:
- [ ] **Google Consent Mode v2**:
  - Default consent state set to `'denied'` for analytics and advertising before user choice.
  - User consent stored reliably in `localStorage` and synchronized dynamically via `gtag('consent', 'update', ...)`.
  - Banner dismisses instantly upon clicking "Accept all", "Reject non-essential", or saving preferences.
  - "Cookie preferences" link in footer allows reviewing and changing settings anytime.
- [ ] **Search Engine Discovery & Sitemaps**:
  - `sitemap.xml` contains all active public URLs with accurate `<lastmod>`.
  - Canonical link (`<link rel="canonical" href="...">`) present on all pages.
  - Clean URL rewrites configured in `_redirects`, `netlify.toml`, and Nginx.
- [ ] **LLM Search & AI Discovery**:
  - `public/llms.txt` present and linked in `<head>` via `<link rel="alternate" type="text/plain" href="/llms.txt" ... />`.
  - JSON-LD Structured data (`Organization`, `WebSite`, `WebApplication`, `TechArticle`, `FAQPage`) valid per Schema.org.

---

## 5. Step 5: Production Build, Live Deployment & Multi-Endpoint Verification

Never consider a task complete without build verification and live HTTP endpoint testing.

### Verification Checklist:
- [ ] **Clean Build Gate**: Execute `npm run build` and ensure 0 errors, 0 warnings, and all assets compile into `dist/`.
- [ ] **Atomic Asset Sync**: Deploy distribution files (`dist/`) and required server runtimes (`server.mjs`, `mosi-api.mjs`) to production host.
- [ ] **Service & Daemon Health**: Restart application service (`systemctl restart mosibot.service`) and reload web server (`systemctl reload nginx`).
- [ ] **Multi-Endpoint Live Verification**:
  - Verify HTTP 200 responses across all primary routes:
    - `/` (Homepage)
    - `/technology` (Architecture)
    - `/demo` (Controlled Interactive Demo)
    - `/buy` (Pricing & Ordering)
    - `/privacy-policy` (Privacy Policy)
    - `/terms-of-use` (Terms of Use)
    - `/terms-of-service` (Terms of Service)
    - `/404` (Error fallback)
    - `/sitemap.xml` & `/llms.txt`
  - Verify TLS 1.3 encryption and security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).

### Verification Command:
```bash
# Verify live endpoints
curl -sI https://mosi.intelliweblab.com/ | grep -E "HTTP/|server|x-content-type"
curl -sI https://mosi.intelliweblab.com/terms-of-use | grep -E "HTTP/|content-type"
curl -sI https://mosi.intelliweblab.com/privacy-policy | grep -E "HTTP/|content-type"
```

---

## Pre-Flight Sign-Off Summary Template

When presenting the completed checklist to the user or recording in release docs, use this standard format:

```markdown
### ✈️ Pre-Flight Verification Sign-Off

- [x] **Step 1: Strict Token & Style Hygiene** — 0 hardcoded colors, 0 invented classes, layout primitives verified.
- [x] **Step 2: Semantic & A11y Compliance** — 100% WCAG 2.1/2.2 AA static pass, unique titles, sequential headings (h1->h2).
- [x] **Step 3: Motion & Reduced-Motion** — Tokenized easing, zero layout jank, prefers-reduced-motion respected.
- [x] **Step 4: Privacy, SEO & LLM Discovery** — Consent Mode v2 active, sitemap.xml, llms.txt, JSON-LD validated.
- [x] **Step 5: Build & Live Verification** — Clean `npm run build` (0 errors), all 8 live endpoints returning HTTP 200.
```
