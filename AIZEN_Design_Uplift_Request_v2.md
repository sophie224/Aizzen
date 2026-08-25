# AIZEN Risk & Compliance — Design Uplift Request

**Version 2.0** · Supersedes v1.0 · Status: For review

| Field | Value |
|---|---|
| Product | AIZEN Risk & Compliance (aizen.com) |
| Change type | UI / UX design uplift and visual refactor |
| Primary constraint | No functional, data, business-logic, or permission changes |
| Quality bar | Enterprise-grade, accessible, performant, maintainable |
| Locales in scope | EN, KA (Georgian) |
| Owner | *[assign]* |
| Design sign-off | *[assign]* |
| Engineering sign-off | *[assign]* |
| Accessibility sign-off | *[assign]* |

---

## 0. How to use this document

This is a **contract**, not a mood board. Every requirement here is written to be either objectively verifiable in CI, or explicitly marked as a judgement call requiring named sign-off.

It is written for three audiences, and all three are bound by it:

1. **Internal engineers** implementing the uplift.
2. **External contractors or agencies**, who should be able to work from this document without further briefing.
3. **AI coding agents**, which will follow explicit constraints and silently violate implicit ones. Anything that matters must be stated as a rule with a check attached.

Where this document says **MUST**, non-compliance blocks merge. Where it says **SHOULD**, deviation is allowed but must be recorded in the PR description with a reason.

---

## 1. Prime Directive

**Change how the product looks and feels — not what it does.**

- Preserve all existing functionality and prevent regressions.
- Keep behaviour, data flow, business rules, calculations, permissions, and audit behaviour unchanged.
- Maintain backward compatibility wherever possible.
- Do not introduce scope that is not required for the visual and interaction uplift.

### 1.1 Out of scope

- Data models, API payloads, database schema, and migrations.
- Routes, handlers, business logic, calculations, and scoring formulas.
- Validation rules, permissions, role checks, and audit-trail writes.
- Field sets: do not add, remove, rename, reorder, or re-bind fields.
- Feature flags, environment configuration, and build targets.
- New runtime dependencies. Removing a dependency that the platform now replaces is in scope and encouraged.

### 1.2 Stop-and-report protocol

If a visual improvement appears to require a change in any out-of-scope area, **stop and report** rather than changing the functional layer. Do not work around it with a hidden functional change.

Report using this format, as a comment on the tracking issue:

```
STOP-AND-REPORT #<n>
Screen / component:
Visual goal blocked:
Functional change that would be required:
Scope area touched:   [data | logic | permissions | fields | config | dependency]
Options:
  A. Ship without this improvement — cost:
  B. Approve the functional change — cost / risk:
  C. Alternative visual approach — cost:
Recommendation:
Decision required from:
```

Known stop-and-report items already identified in this document are listed in **§17**.

---

## 2. Design Uplift Goals

- Create a consistent, disciplined, modern enterprise interface across the product.
- Increase visual hierarchy so risk and compliance data is the primary focus and UI chrome recedes.
- Improve clarity, density, readability, interaction feedback, and perceived performance.
- Standardise reusable UI patterns instead of applying one-off styling screen by screen.
- Preserve existing brand identity and derive all design values from the established token system.
- **Reduce total CSS and component count.** A successful uplift ends with fewer button implementations, fewer bespoke overlays, and fewer lines of CSS than it started with. Net additions require justification.

---

## 3. Support baseline and progressive enhancement

> **This section is new in v2 and takes precedence over §5 where they conflict.**

v1 mandated a set of modern CSS capabilities without defining which browsers must be supported. That is the single largest unresolved risk in the brief: **every capability listed in §5 is at best "Baseline: newly available."** None of them are "Baseline: widely available." For a product used by regulated organisations — which commonly run managed, lagging browser fleets — that gap must be closed by decision, not by assumption.

### 3.1 Declare the baseline before writing code

Fill this in from real analytics before Phase 1 begins. Do not proceed on assumption.

| Browser | Minimum supported version | % of AIZEN sessions | Source |
|---|---|---|---|
| Chrome / Edge | *[fill]* | *[fill]* | *[analytics]* |
| Safari (macOS / iOS) | *[fill]* | *[fill]* | *[analytics]* |
| Firefox | *[fill]* | *[fill]* | *[analytics]* |
| Other / managed fleet | *[fill]* | *[fill]* | *[IT]* |

### 3.2 Enhancement tiers

Every platform feature used MUST be classified into one of three tiers, and the tier MUST be recorded in a comment above its first use.

| Tier | Meaning | Rule |
|---|---|---|
| **Core** | Widely available; safe to depend on | May be used without a fallback |
| **Enhanced** | Newly available; improves the experience | MUST be behind `@supports`, with a defined non-broken baseline experience |
| **Experimental** | Not baseline | MUST NOT be used in production |

**The test for Enhanced tier:** disable the feature entirely and the screen must remain usable, legible, and accessible — not merely "still renders." A tooltip that positions incorrectly is a failure. A tooltip that falls back to a static position below the trigger is a pass.

### 3.3 Verified status of mandated features (August 2026)

Verify these again at implementation time; Baseline status moves.

| Feature | Status | Tier | Required fallback |
|---|---|---|---|
| `contrast-color()` | <cite index="8-1">Works across the latest devices and browser versions since April 2026</cite>; newly available | Enhanced | Precomputed token pair — **see §6, this feature alone does not satisfy the badge contrast requirement** |
| CSS anchor positioning | Shipped in all three engines (Chrome 125+, Safari 26+, Firefox 147+); behaviour still differs between engines | Enhanced | Static placement below/right of trigger; `position-try-fallbacks` where supported |
| Popover API | Widely available | Core | — |
| `<dialog>` + `::backdrop` | Widely available | Core | — |
| `:has()` | Widely available | Core | — |
| Container queries | Widely available | Core | — |
| `subgrid` | Widely available | Core | — |
| `color-mix()` / relative colour syntax | Widely available | Core | — |
| `field-sizing: content` | <cite index="22-1">Baseline newly available since 2026-06-16; expected to reach widely available 2028-12-16</cite> | Enhanced | Fixed-height textarea with scroll. Degrades harmlessly |
| `@starting-style` + `transition-behavior` | Newly available | Enhanced | No entry animation; element appears instantly |
| `color-scheme` / `accent-color` | Widely available | Core | — |
| `content-visibility: auto` | Widely available | Core | MUST be paired with `contain-intrinsic-size` — see §12.3 |
| `text-wrap: balance` | Widely available | Core | — |
| `text-wrap: pretty` | Newly available; engines differ in what they optimise | Enhanced | Normal wrapping |

### 3.4 Feature detection pattern

Detect the feature, never the browser. No user-agent sniffing.

```css
.tooltip {
  /* Baseline: static, correct, unremarkable */
  position: absolute;
  inset-block-start: 100%;
  inset-inline-start: 0;
}

@supports (anchor-name: --probe) {
  .tooltip {
    position-anchor: --tooltip-trigger;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-block, flip-inline;
  }
}
```

---

## 4. Token architecture

v1 required `aizen-tokens.css` as the single source of truth but did not define what a token is or how one is named. Without that contract, "add the token rather than hard-coding a value" produces an unstructured pile of tokens, which is a slower version of the same problem.

### 4.1 Three tiers, one direction of reference

```
Tier 1 — Primitive     --color-slate-700, --space-4, --radius-md, --duration-fast
                       Raw values. Never referenced by a component.
        ↓
Tier 2 — Semantic      --surface-raised, --text-secondary, --border-strong,
                       --focus-ring, --motion-hover
                       Meaning, not appearance. Components reference this tier.
        ↓
Tier 3 — Component     --button-primary-bg, --table-row-hover-bg, --badge-radius
                       Only where a component genuinely needs to diverge.
```

**Rules:**

- Components MUST reference Tier 2 or Tier 3. Referencing Tier 1 from a component is a violation.
- A tier may only reference the tier above it. No sideways or upward references.
- Adding a Tier 3 token requires a one-line justification in the PR. Most components should need none.
- Theming (including any future dark mode) is achieved by reassigning Tier 2 only.

### 4.2 Naming

`--<category>-<role>-<variant>-<state>`, all lowercase, hyphen-separated.

```css
--surface-base
--surface-raised
--surface-overlay
--text-primary
--text-secondary
--text-on-accent
--border-subtle
--border-strong
--border-focus
--space-1 … --space-12
--radius-sm | --radius-md | --radius-lg | --radius-full
--duration-hover | --duration-popover | --duration-modal
--ease-standard
--elevation-overlay | --elevation-modal
```

Match the existing prefix convention in `aizen-tokens.css`. Do not introduce a competing convention.

### 4.3 Spacing and radius scales

Define once. A component that needs a value between two steps is a signal the scale is wrong, not a licence to hard-code.

- **Spacing:** one base unit (4px recommended for a dense data product), exposed as `--space-1` through `--space-12`. No arbitrary values.
- **Radius:** maximum three steps plus `--radius-full` for pills and avatars. v1 correctly forbids "rounded-everything"; three steps enforces that.
- **Elevation:** flat base (borders only) plus exactly two shadow tokens — `--elevation-overlay` for popovers, dropdowns and toasts, `--elevation-modal` for dialogs. Cards, tables and panels are defined by borders and surface colour, not shadow.

### 4.4 Component consolidation

One implementation per UI element. Before merging any component work, the PR MUST state how many implementations of that element existed before and how many exist after. The second number must be 1.

Consolidate at minimum: button, icon button, link, input, textarea, select, checkbox, radio, toggle, badge, chip, tag, tooltip, popover, dropdown menu, modal, drawer, toast, table, tabs, breadcrumb, pagination, avatar, skeleton, empty state.

---

## 5. Platform-first implementation

Prefer stable browser platform capabilities over custom JavaScript or additional dependencies where they meet the requirement **and clear the tier rules in §3**.

| Need | Preferred implementation |
|---|---|
| Auto-growing textarea | `field-sizing: content` |
| Readable text on dynamic fills | See **§6** — `contrast-color()` alone is insufficient |
| Tooltip / popover / dropdown | Popover API + CSS anchor positioning |
| Modal | `<dialog>` + `::backdrop` |
| State-dependent styling | `:has()` |
| Slot-aware responsive components | Container queries |
| Nested grid alignment | `subgrid` |
| Colour tints and shades | `color-mix()` / relative colour syntax |
| Enter / exit animation | `@starting-style` + `transition-behavior` |
| Native control theming | `color-scheme` + `accent-color` |
| Long lists | `content-visibility: auto` + `contain-intrinsic-size` |

Avoid arbitrary `z-index` stacks and custom overlay systems where the platform provides the behaviour. All overlay content MUST render in the top layer via Popover API or `<dialog>`. **Target state: zero `z-index` declarations outside a single documented stacking token.**

**Typography and layout defaults:**

- `text-wrap: balance` for headings; `text-wrap: pretty` for body copy (Enhanced tier).
- `font-variant-numeric: tabular-nums` for all numbers in tables, and for any number that updates in place.
- `lh` / `rlh` units where a size is tied to a line of text.
- Logical properties throughout: `margin-inline`, `padding-block`, `inset-inline-start`. No `left` / `right` / `margin-left` in new code.

---

## 6. Runtime rating-matrix colour contract

> **This section is new in v2 and specifies the hardest requirement in the brief.**

v1 stated the requirement correctly in two places — risk colours come from runtime configuration, and contrast must pass including for configured yellow and orange — but did not say how both can be true at once. They cannot be, under the approach v1 implies.

### 6.1 Why `contrast-color()` does not solve this

<cite index="8-1">`contrast-color()` returns either white or black, whichever has the greatest contrast with the input colour</cite>. <cite index="8-1">It commonly ensures the WCAG AA minimum, but WCAG AA (4.5:1) contrast is not capable of producing clearly readable text in all cases.</cite>

The consequence for AIZEN: an administrator can configure a mid-luminance amber or orange for a rating level. For such colours, **neither black nor white reaches 4.5:1**. `contrast-color()` will return the better of two failing options, silently. The Definition of Done item "contrast passes for all badges, including configured yellow and orange rating colours" would therefore be unachievable by construction.

### 6.2 The required pattern

**Never place small text directly on a raw configured rating colour.** Instead:

- The **badge surface** is a heavy tint of the rating colour mixed toward the page surface. Text on that tint uses the standard text token and passes 4.5:1 for any input hue.
- The **raw rating colour** appears only as a non-text indicator — a dot, a leading bar, or a border. Non-text UI indicators require 3:1, not 4.5:1, which is achievable across a far wider colour range.
- The **rating name** is always present as text. Meaning never depends on colour.

```css
.rating-badge {
  /* --rating-color is injected at runtime from the rating matrix */
  background: color-mix(in oklab, var(--rating-color) 14%, var(--surface-base));
  border-inline-start: var(--space-1) solid var(--rating-color);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.rating-badge::before {
  content: "";
  inline-size: 0.5rlh;
  block-size: 0.5rlh;
  border-radius: var(--radius-full);
  background: var(--rating-color);
}
```

This is hue-agnostic, level-count-agnostic, and requires no knowledge of how many rating levels exist or what they are called — satisfying v1's rule against assuming a fixed number of risk levels.

### 6.3 Verification

Add an automated test that reads **every** configured rating colour from the runtime configuration and asserts:

- Badge text vs. computed badge surface ≥ 4.5:1
- Indicator dot / bar vs. adjacent surface ≥ 3:1
- Rating name text is present and non-empty in both EN and KA

The test must iterate the live configuration, not a fixture, so that adding a rating level in Administration cannot silently break contrast.

### 6.4 Escalation

If the raw configured colour must appear behind text somewhere that cannot be restructured, this becomes a **stop-and-report** item — a warning in Administration → Rating Matrix when a chosen colour cannot meet contrast is a functional change and requires approval. See **§17**.

---

## 7. Interaction quality — all states are required

Every interactive element MUST support all six states.

| State | Selector | Rule |
|---|---|---|
| Default | — | Clickable elements look clickable; non-clickable elements must not imply interactivity |
| Hover | `:hover` | Colour, border, or shadow only. **Nothing lifts, scales, or shifts.** |
| Keyboard focus | `:focus-visible` | Visible ring. Never removed. Never obscured. |
| Active / pressed | `:active` | Distinct from hover |
| Disabled | `:disabled`, `[aria-disabled]` | Reduced opacity, not clickable in appearance, reason explained where appropriate |
| Loading | `[data-loading]` | Content-shaped skeleton or in-control pending state. No layout shift. |

**Additional rules:**

- Focus MUST use `:focus-visible`, not `:focus`, so pointer users do not see rings on click.
- The focus ring MUST have `outline-offset` sufficient to remain visible against both the element and its background, and MUST NOT be clipped by `overflow: hidden` ancestors.
- Loading states use content-shaped skeletons. No empty-page spinners.
- Nested actions inside clickable rows MUST NOT trigger row navigation. Use `:has()` for row hover state and `event.stopPropagation()` on nested controls; verify with keyboard as well as pointer.
- Disabled controls MUST remain focusable if the user needs to discover why they are disabled — prefer `aria-disabled` with an explanation over `disabled` for anything a user might reasonably try to click.

### 7.1 Motion language

One easing curve. Three durations. All tokenised.

| Token | Duration | Applies to |
|---|---|---|
| `--duration-hover` | ~120ms | Hover, focus, colour transitions |
| `--duration-popover` | ~180ms | Popovers, tooltips, chips, toasts |
| `--duration-modal` | ~240ms | Modals, drawers |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Reduced motion disables non-essential transitions. State changes must still be perceivable — replace movement with an instant change, never with nothing.

---

## 8. Accessibility floor — WCAG 2.2 AA

### 8.1 Contrast

- Text: ≥ 4.5:1 (1.4.3). Large text (≥ 18.66px bold or ≥ 24px): ≥ 3:1.
- UI components and graphics: ≥ 3:1 (1.4.11). This includes input borders, focus rings, toggle states, chart series, and rating indicators.
- Contrast MUST be verified against the actual rendered surface, including tints produced by `color-mix()` and any row-hover or zebra background beneath the element.

### 8.2 Target size

WCAG 2.2 SC 2.5.8 (AA) requires 24 × 24 CSS px. **AIZEN sets a stricter internal bar of 32 × 32 CSS px**, which exceeds the standard. Where the 32px bar is genuinely impractical — a dense table row action column, for example — the WCAG spacing exception applies: a smaller target is acceptable if a 24px-diameter circle centred on it does not intersect any other target. Record any use of the exception in the PR.

Inline links within a sentence are exempt under SC 2.5.8.

### 8.3 Keyboard and focus

- Every flow keyboard-accessible; no keyboard traps except intentional modal focus traps.
- Modal focus trapped on open and **returned to the triggering element** on close.
- SC 2.4.11 Focus Not Obscured: the focused element MUST NOT be hidden behind sticky headers, sticky footers, or overlays. Use `scroll-margin-block` on focusable elements to account for sticky chrome height.
- SC 2.5.7 Dragging Movements: if any column reorder, row reorder, or resize handle exists, a non-dragging alternative MUST be available. **Audit for this — v1 did not mention it.**
- Logical tab order matching visual order. Never `tabindex` above 0.

### 8.4 Names, errors, and meaning

- Every icon-only control has an accessible name. Icons are `aria-hidden`.
- Errors identify the affected field, explain the problem, and provide a path to correction (3.3.1, 3.3.3). Error text is programmatically associated with its field via `aria-describedby`.
- Meaning never relies on colour alone (1.4.1). Every risk badge includes a readable name.
- Status changes are announced via a polite live region. Failures via assertive.
- Respect `prefers-reduced-motion` and `prefers-contrast`. Under `prefers-contrast: more`, borders and focus rings strengthen.
- Forced-colors mode: verify focus rings and rating indicators survive. Use `forced-color-adjust` sparingly and only where meaning would otherwise be lost.

### 8.5 Verification

- `axe-core` runs in CI against every route in scope. Zero critical or serious violations.
- One manual screen-reader pass per major flow (NVDA + Chrome, VoiceOver + Safari) before sign-off.
- Automated checks catch roughly a third of real issues. The manual pass is not optional.

---

## 9. Data table specification

> **This section is new in v2.** Tables are the product. v1 treated them as one bullet.

### 9.1 Structure

- Semantic `<table>` with `<thead>`, `<tbody>`, `<th scope="col">`. Do not rebuild tables from `<div>`s.
- Sticky header: `position: sticky` on `<th>`, with `scroll-margin-block-start` on focusable cells so focus is never obscured (§8.3).
- `content-visibility: auto` on row groups for long tables, **always** with `contain-intrinsic-size` matching the true row height. Without it, the scrollbar jumps and CLS fails.

### 9.2 Alignment and typography

| Content | Alignment | Treatment |
|---|---|---|
| Text, names, descriptions | Start | `text-wrap: pretty` |
| Numbers, scores, currency | End | `font-variant-numeric: tabular-nums` |
| Dates | Start | Tabular; one format per locale, never mixed |
| Status / rating badges | Start | Per §6 |
| Row actions | End | Fixed width; never shifts on hover |

Column widths MUST be stable across loading, empty, and populated states. Reserve width for the longest realistic value, not the current data.

### 9.3 States

Every table implements all of: **loading** (skeleton rows matching real row height and count), **empty** (explains what would appear here and offers the action that creates it), **filtered-empty** (distinct from empty; offers to clear filters), **error** (explains what failed and offers retry), **partial/stale** (data shown but flagged as outdated).

Filtered-empty and empty are different states with different copy. Conflating them is a common and confusing failure.

### 9.4 Interaction

- Sort affordance visible on hover and focus; current sort always visible without hover; direction conveyed by icon **and** `aria-sort`.
- Row selection state uses background plus a persistent indicator, never background alone.
- Row hover uses `:has()` so nested controls do not double-highlight.
- Search input debounced (250–300ms). Sorting and filtering must not re-render the entire table body; render only changed rows.

---

## 10. Forms, errors, and system status

- One label position throughout the product. Do not mix top-aligned and inline labels.
- Required and optional marked consistently; whichever is rarer gets the marker.
- Validation timing consistent: validate on blur, revalidate on change once an error exists. Never validate on first keystroke.
- Error summary at the top of long forms, with links to each failing field.
- Helper text and error text occupy reserved space so appearing errors do not shift layout.

**System status** — the product MUST clearly and consistently communicate:

| State | Requirement |
|---|---|
| Last updated | Absolute timestamp on hover; relative time in the label |
| Saving | Pending state on the triggering control, not a global overlay |
| Saved | Confirmed, then quietly persistent — not a toast that vanishes before it is read |
| Failed | What failed, why if known, and a retry affordance |
| Retrying | Distinguishable from initial loading |
| Offline / stale | Data marked as potentially outdated rather than silently wrong |

**Destructive actions** are visually distinct, require confirmation naming the specific object being affected, and are reversible where the existing implementation already supports it. Do not add undo where none exists — that is functional scope.

---

## 11. Bilingual typography — EN and KA

> **This section is new in v2.** v1 mentioned Georgian once, in a font-loading bullet. It needs more than that.

Georgian (Mkhedruli) is not Latin with different glyphs, and several common UI patterns break on it.

### 11.1 Case

**Mkhedruli is unicameral — it has no capital letters.** `text-transform: uppercase` applied globally will map Georgian text to Mtavruli, a distinct titling form that reads as a stylistic shift, not as emphasis. This is wrong for table headers, buttons, and eyebrow labels.

```css
.table-header,
.eyebrow,
.button--tertiary {
  text-transform: none;
}

:lang(en) .table-header,
:lang(en) .eyebrow,
:lang(en) .button--tertiary {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

Preferred: avoid uppercase styling entirely. Sentence case is more legible, more accessible, and locale-neutral.

### 11.2 Letter-spacing

Do not apply positive `letter-spacing` to Georgian text. It degrades legibility of connected forms. Scope any tracking to `:lang(en)`.

### 11.3 Vertical metrics

Mkhedruli has ascenders and descenders (ბ, ღ, ყ, ჯ) with different proportions to Latin. Line-height tuned on English will clip Georgian descenders in dense table rows. Set line-height with headroom and verify against a Georgian pangram at the smallest type size used in tables.

### 11.4 String length

Georgian strings commonly render longer than their English equivalents. **Never size a container to fit the English string.** Every button, badge, tab, column header, and menu item must be tested with real KA content, not lorem ipsum and not machine-translated placeholders.

### 11.5 Font loading and CLS

Both locales require `font-display: swap` with **metric-matched fallbacks**, or the LCP and CLS budgets in §12 will fail on the KA locale specifically.

```css
@font-face {
  font-family: "AIZEN Sans Fallback";
  src: local("Noto Sans Georgian"), local("BPG Arial"), local("Arial");
  size-adjust: 100%;      /* measure and set */
  ascent-override: 100%;  /* measure and set */
  descent-override: 100%; /* measure and set */
  line-gap-override: 0%;
}
```

The override percentages MUST be measured against the actual webfont, not guessed. Candidate Georgian-capable webfaces to evaluate: **FiraGO**, **Noto Sans Georgian**, **BPG** family. Confirm the licence permits commercial product use before adopting.

### 11.6 Numbers and dates

Both locales use Arabic numerals — `tabular-nums` applies identically. Date and number *formatting* is functional; do not change it. Only the typographic rendering is in scope.

---

## 12. Performance and perceived speed

### 12.1 Budgets

| Metric | Budget | Measured how |
|---|---|---|
| INP | < 200ms | Field data preferred; lab via Lighthouse on the three heaviest screens |
| CLS | < 0.1 | Lab, both locales — KA is the likely failure case |
| LCP | < 2.5s | Lab at declared baseline network profile |
| Total CSS shipped | **≤ pre-uplift** | CI budget, hard fail |
| Total JS shipped | **≤ pre-uplift** | CI budget, hard fail |

The last two are new and deliberate. A visual uplift that ships more code has failed one of its own goals (§2).

### 12.2 Rules

- Reserve space for images, badges, and async regions so layout does not jump.
- Never animate `width`, `height`, `top`, `left`, or `box-shadow`. Use `transform`, `opacity`, and colour. For shadow transitions, animate the opacity of a pseudo-element carrying the shadow.
- Debounce search input; do not re-render the full table on every keystroke.
- Show pending state on the control that was clicked, within 100ms, before the operation completes.
- Avoid `filter` and `backdrop-filter` on large subtrees.

### 12.3 `content-visibility` caveat

`content-visibility: auto` without `contain-intrinsic-size` causes scrollbar jumping and directly breaks the CLS budget. Always pair them. After applying, verify that browser find-in-page, deep links, and anchor navigation still reach off-screen rows.

---

## 13. Enterprise product polish

AIZEN is a risk and compliance product. The visual language communicates **precision, trust, and control** — not playfulness or marketing energy.

- **Grid:** one layout system, consistent gutters. Uneven gutters immediately reduce perceived quality.
- **Density:** information-rich but breathable. Users scan operational data, not marketing content.
- **Hierarchy:** risk and compliance data is the loudest element; navigation and chrome recede.
- **Language:** one term per concept, everywhere. States and labels identical across screens. Build a term list during the audit (§15) and enforce it.
- **Voice:** buttons say what happens — "Save changes," not "Submit." The action keeps its name through the whole flow: a button labelled "Approve" produces a confirmation that says "Approved." Errors explain and direct; they do not apologise or hedge.
- **System status:** last updated, saving, saved, failed, retry — per §10.
- **Destructive actions:** visually obvious and reversible where already supported.

**Avoid:**

- Gradient hero sections, glassmorphism, neon accents, emoji in headings, decorative illustrations.
- More than two elevation levels above the flat base (§4.3).
- Scroll animations, animated counters, typing effects, parallax.
- Rounded-everything, or inconsistent radius within a screen.
- Gradient buttons, or any palette outside the defined brand tokens.
- Marketing-site patterns inside the product UI.

---

## 14. Quality gates

> **v1's grep checks are retained but corrected.** The originals produce false positives on URL fragments and IDs, and miss `rgb()`, `hsl()`, `oklch()`, `animation`, and `transition-duration` entirely. Grep is a pre-commit backstop, not the gate.

### 14.1 Primary gate — lint in CI

Configure `stylelint` with `declaration-property-value-allowed-list` so colour, radius, duration, and spacing properties accept only `var(--*)` plus a short allow-list (`currentColor`, `transparent`, `inherit`, `0`). This is enforceable, has no false positives, and fixes the problem at the source. `stylelint-declaration-strict-value` is an acceptable alternative.

### 14.2 Secondary gate — corrected pre-commit greps

```bash
# Hex literals outside token files (PCRE2 lookbehind avoids URL-fragment false positives)
rg -n --pcre2 '(?<![\w#])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b' \
   src/ -g '!**/*token*.css'

# Non-hex colour literals — missed entirely by v1
rg -n '\b(rgba?|hsla?|oklch|oklab|lab|lch)\(' src/ -g '!**/*token*.css'

# Hard-coded radii, any unit
rg -n 'border-[a-z-]*radius:\s*[0-9.]+(px|rem|em)' src/ -g '!**/*token*.css'

# Hard-coded durations — v1 missed `animation` and `transition-duration`
rg -n '(transition|animation)(-duration|-delay)?:[^;]*[0-9.]+m?s' src/ -g '!**/*token*.css'

# Arbitrary stacking
rg -n 'z-index:\s*-?[0-9]+' src/

# Physical properties in new code
rg -n '(margin|padding)-(left|right):' src/

# Uppercase transforms that will break Georgian (§11.1)
rg -n 'text-transform:\s*uppercase' src/
```

### 14.3 Full gate list

| Gate | Tool | Blocks merge |
|---|---|---|
| Token discipline | stylelint | Yes |
| Accessibility | axe-core, all in-scope routes | Yes (critical + serious) |
| Visual regression | Playwright screenshots, defined matrix | Yes (unreviewed diffs) |
| Rating-matrix contrast | Custom test per §6.3 | Yes |
| CSS / JS size budget | CI budget check | Yes |
| Lighthouse budgets | Lighthouse CI | Yes |
| Component count | PR checklist, manual | Yes |

---

## 15. Working method and delivery

### 15.1 Audit first

Before any edit, produce an inventory. See **Appendix A** for the template. The audit is a deliverable in its own right and is reviewed before Phase 1 begins.

### 15.2 Work bottom-up

`tokens → primitives → components → screens`. Never solve a system problem with one-off screen CSS.

### 15.3 Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Audit** | Inventory, token gap analysis, term list, browser baseline (§3.1). No code. | Audit reviewed and signed off |
| **1. Foundation** | Token layer, reset, typography, motion tokens, `color-scheme`. No component changes. | Lint gates green; zero visual diffs beyond intended type/spacing normalisation |
| **2. Primitives** | Button, input, select, checkbox, radio, badge, chip, link, icon button | One implementation each; all six states; axe clean |
| **3. Composites** | Table, form layout, modal, popover, dropdown, toast, tabs, empty/loading/error states | §7 and §9 fully satisfied |
| **4. Screens** | Screen-by-screen, in risk-priority order | Evidence pack per screen (§16) |
| **5. Sweep** | Accessibility pass, performance pass, KA pass, evidence consolidation | Full DoD (§18) |

### 15.4 Pull requests

One concern per PR. A shared badge refactor is one PR; a mixed table/modal/register redesign is three. Every PR states:

- Screens affected
- Component implementations before → after
- CSS bytes before → after
- Any SHOULD deviations, with reason
- Any stop-and-report items raised

### 15.5 Phasing and the feature-flag constraint

**Open tension requiring decision.** §1.1 places feature flags out of scope, while §15.3 requires incremental delivery of a large visual change. This means every phase must ship to production visually coherent on its own — a partially restyled product cannot sit half-finished behind a flag. Either accept that constraint and plan phase boundaries around visual coherence, or approve a temporary flag as an explicit exception. See §17.

---

## 16. Evidence and verification

v1 asked for "written confirmation" that nothing functional changed. That is an assertion, not evidence. Replace it with the following, per touched screen.

### 16.1 Screenshot matrix

| Axis | Values |
|---|---|
| Viewport | 1280, 1440 (required) · 1366, 1920 (spot check) |
| Locale | EN, KA |
| State | Populated, empty, loading, error |

Captured before and after, from the same seeded dataset.

### 16.2 Functional-equivalence proof

For every touched screen, capture from an identical seed, before and after:

1. **Rendered values** — serialise visible cell contents to JSON; diff must be empty.
2. **Row counts** — with no filter, and with each saved filter applied.
3. **Filter and sort results** — apply each and record resulting row order; diff must be empty.
4. **Exports** — run each export and diff the output. Normalise timestamps only.
5. **Network calls** — capture a HAR; the set of endpoints and request payloads must be identical.

An empty diff across all five is the proof. A written statement accompanies it but does not replace it.

### 16.3 Rating-matrix regression

Change one colour and one name in Administration → Rating Matrix. Screenshot every dependent location. Confirm all update, and that contrast still passes at the new colour (§6.3).

---

## 17. Open decisions

These must be resolved before or during Phase 0. Each is a stop-and-report item.

| # | Question | Why it matters | Owner |
|---|---|---|---|
| 1 | Minimum supported browser versions | Determines how much of §5 is usable at all (§3.1) | Engineering + IT |
| 2 | Is dark mode in scope? | v1 lists `color-scheme` but never decides. Retrofitting later doubles the token work | Product |
| 3 | Admin warning when a rating colour cannot meet contrast | Functional change; without it, contrast can be broken from Administration after sign-off (§6.4) | Product |
| 4 | Minimum supported viewport width | v1 specifies only 1280/1440. Behaviour below 1280 is undefined | Product |
| 5 | Temporary feature flag for phased rollout | Currently out of scope but implied by phasing (§15.5) | Engineering |
| 6 | Are printed / exported PDF layouts in scope? | Compliance products generate audit documents; print CSS is visual-only but unaddressed | Product |
| 7 | Does any drag-only interaction exist? | Triggers WCAG 2.2 SC 2.5.7 (§8.3) | Audit output |

---

## 18. Definition of Done

### Tokens and code discipline
- [ ] No colour literals in components — hex, `rgb()`, `hsl()`, or `oklch()` (§14.2)
- [ ] No hard-coded radii, durations, or spacing in components
- [ ] Token tiers respected; no component references a Tier 1 primitive (§4.1)
- [ ] One implementation per UI element; before/after counts recorded (§4.4)
- [ ] Zero `z-index` outside the documented stacking token
- [ ] CSS and JS bundle size ≤ pre-uplift baseline

### Interaction
- [ ] All six states implemented on every interactive element (§7)
- [ ] Hover never causes layout movement
- [ ] Keyboard navigation works throughout; focus always visible and never obscured
- [ ] Modal focus trapped and returned to trigger
- [ ] Nested row actions do not trigger row navigation, by pointer or keyboard
- [ ] `prefers-reduced-motion` disables non-essential transitions; state changes remain perceivable

### Accessibility
- [ ] axe-core: zero critical or serious violations on all in-scope routes
- [ ] Contrast passes for all badges at **every** configured rating colour, verified against live configuration (§6.3)
- [ ] Every icon-only control has an accessible name
- [ ] Manual screen-reader pass completed on each major flow
- [ ] Any drag-only interaction has a non-dragging alternative (SC 2.5.7)

### Localisation
- [ ] Product renders correctly in EN and KA at 1280px and 1440px with no clipping
- [ ] No `text-transform: uppercase` applied to Georgian text (§11.1)
- [ ] Georgian descenders not clipped at the smallest table type size
- [ ] Metric-matched font fallbacks measured, not guessed; CLS budget met in **both** locales

### Performance
- [ ] INP < 200ms, CLS < 0.1, LCP < 2.5s — verified in both locales
- [ ] No layout shift when data loads
- [ ] `content-visibility` always paired with `contain-intrinsic-size`; find-in-page verified

### Data integrity
- [ ] Changing a colour or name in Administration → Rating Matrix updates every dependent UI location correctly
- [ ] Functional-equivalence proof complete and diff-empty across all five checks (§16.2)
- [ ] Before/after screenshots attached for all touched screens, full matrix (§16.1)

### Process
- [ ] All stop-and-report items resolved or explicitly accepted
- [ ] Written confirmation attached, supported by §16.2 evidence
- [ ] Automated tests, security checks, and QA completed
- [ ] Design, engineering, and accessibility sign-offs recorded

---

## Expected outcome

A more mature version of the same AIZEN product: cleaner, more consistent, faster, more accessible, easier to maintain, and more credible for enterprise users — with less code than it started with, and behaviour and data preserved exactly.

---

## Appendix A — Audit template

One row per screen. Complete before Phase 1.

| Field | Notes |
|---|---|
| Screen name / route | |
| Primary user task | |
| Components used | |
| Duplicate implementations found | e.g. "3 button variants, 2 badge styles" |
| Hard-coded values found | Count by category |
| Interaction states missing | Which of the six |
| Accessibility issues found | axe + manual |
| KA-specific issues | Clipping, uppercase, overflow |
| Terminology inconsistencies | Terms differing from the canonical list |
| Drag-only interactions | Yes / no — triggers SC 2.5.7 |
| Risk of functional coupling | Where visual change might touch logic |
| Phase assignment | 2 / 3 / 4 |
| Priority | High / medium / low |

---

## Appendix B — What changed from v1.0

| Area | Change |
|---|---|
| §3 Support baseline | **New.** v1 mandated modern CSS with no defined browser floor. Every feature in v1's table is at best "newly available" — this section forces the decision and defines enhancement tiers |
| §4 Token architecture | **New.** v1 named `aizen-tokens.css` as the source of truth but defined no tier structure or naming contract |
| §6 Rating-matrix colour | **New.** v1's requirement was unachievable as written — `contrast-color()` returns only black or white and cannot guarantee 4.5:1 for mid-luminance ambers. This section gives a hue-agnostic pattern that works for any configured colour |
| §8.2 Target size | Clarified. WCAG 2.2 AA requires 24×24; AIZEN's 32×32 exceeds it. The spacing exception is now documented for dense table rows |
| §8.3 | Added SC 2.5.7 (dragging), 2.4.11 (focus not obscured) by name; added forced-colors and `prefers-contrast` |
| §9 Data tables | **New.** Tables are the core of a risk product; v1 gave them one bullet |
| §11 EN/KA typography | **New.** v1 mentioned Georgian once. Mkhedruli is unicameral — global `text-transform: uppercase` is a live bug waiting to happen |
| §14 Quality gates | Rewritten. v1's greps false-positive on URL fragments and miss `rgb()`, `hsl()`, `oklch()`, `animation`, and `transition-duration`. Lint replaces grep as the primary gate |
| §16 Evidence | Rewritten. "Written confirmation" replaced with five diffable artifacts |
| §17 Open decisions | **New.** Surfaces the ambiguities in v1 — dark mode, browser floor, the feature-flag-vs-phasing contradiction |
| §12.1 | Added CSS/JS size budgets. A visual uplift that ships more code has failed |
| §15.5 | **New.** Names the contradiction between "no feature flags" and "deliver incrementally" |
