# Parity Checklist — legacy `app.html` → refactored SPA

The regression contract for the refactor. Every item is behaviour the v7 build exhibits today and the refactored SPA must still exhibit. Derived from the spec's QA sections (Risk Management §25, Administration §19) and the cross-module regression matrix.

**How to use.** Each section names the milestone that implements it. When that milestone completes, walk its section against the running app and tick the boxes. A milestone is not done while its section has an unticked box or an unexplained deviation.

**Baseline.** `fixtures/legacy-state.json` — schema 7, 8 risks, 6 controls, 10 actions, 13 history items, 4 global audit events, 38 categories, 7 business units, 8 users, 7 roles. Counts are enforced by `src/domain/validation/baseline-fixture.test.ts`.

**Deviation rule.** Where the PRD (pp. 1–7) deliberately overrides legacy behaviour, mark the item **PRD-override** and record what changed. Everything else that differs is a regression.

---

## 1. Authentication and session — M6, M15

- [ ] Each of the 8 seeded users logs in with the correct credential
- [ ] Correct role loads into the session for each user
- [ ] Invalid credentials produce an error and create no session
- [ ] Session persists across a page refresh
- [ ] Logout clears the session reference
- [ ] An **Inactive** user cannot log in
- [ ] Admin sees the Administration entry point; Risk Manager, Risk Owner, Control Owner, Action Owner and Auditor do not
- [ ] Auditor sees no edit or save control anywhere
- [ ] Direct route access obeys visibility rules, not just menu visibility

## 2. Record visibility by role — M7

- [ ] Super Administrator sees all 8 risks
- [ ] Administrator sees all 8 risks
- [ ] Risk Manager sees all 8 risks
- [ ] Auditor sees all 8 risks, read-only
- [ ] Risk Owner sees only risks where `riskOwnerId` matches
- [ ] Control Owner sees only risks containing a control they own
- [ ] Action Owner sees only risks containing an action they own
- [ ] Custom role sees only risks within its effective Business Unit scope
- [ ] A hidden risk cannot be reached by search
- [ ] A hidden risk cannot be reached by direct URL

## 3. Business Unit scope inheritance — M4, M10

Fixture tree: Enterprise → Technology Division → {Information Security, IT Operations Department}; plus Finance, Legal Risk & Compliance, People.

- [ ] A grant on **Technology Division** covers Technology Division, Information Security and IT Operations
- [ ] A grant on **Information Security** covers Information Security only
- [ ] A user scoped to Information Security cannot see Technology Division parent-level risks
- [ ] A user scoped to Information Security cannot see IT Operations sibling risks
- [ ] A newly added child under a granted parent is included automatically
- [ ] Direct and effective scope counts display separately in the user editor
- [ ] Inherited units render as `Inherited` and cannot be individually unchecked while the parent grant is active

## 4. Risk Register — M7

**Search** (case-insensitive, all fields):

- [ ] Risk reference
- [ ] Risk title
- [ ] Cause
- [ ] Event
- [ ] Consequence
- [ ] Category name
- [ ] Business Unit name
- [ ] Business Unit full hierarchy path
- [ ] Risk Owner name
- [ ] Remediation action title

**Filters** (each independently, then combined):

- [ ] Risk Category (Level 1 group)
- [ ] Business Unit — includes descendants, excludes parents and siblings
- [ ] Residual Rating (Low / Medium / High / Significant)
- [ ] Risk Status
- [ ] Risk Outlook (Increasing / Stable / Decreasing)

**Sorting:**

- [ ] Risk title
- [ ] Risk Owner
- [ ] Residual numeric score
- [ ] Target Date
- [ ] Default is Risk Reference ascending
- [ ] Repeated header click toggles ascending ⇄ descending

**Display:**

- [ ] Compact mode renders the condensed management list
- [ ] Detailed mode renders Cause / Event / Consequence and control/action detail
- [ ] Inherent, Residual and Target chips are equal-sized in Detailed mode
- [ ] Each chip shows `Score | Rating | Impact × Likelihood`
- [ ] Column visibility panel selects columns
- [ ] An active custom attribute with `showInRegister = true` appears in selectable columns

**States:**

- [ ] Role-aware empty state when the user's scope holds no risks
- [ ] Zero-result state offers a clear-filters action
- [ ] New Risk button visible only to users with create rights

## 5. Saved Views — M7

- [ ] Save current view
- [ ] Apply view
- [ ] Set as default
- [ ] Clear default
- [ ] Remove view
- [ ] Persists search and filter state
- [ ] Persists sort state
- [ ] Persists visible columns
- [ ] Persists Compact/Detailed mode
- [ ] Only one default per user; setting a new default clears the old
- [ ] The current user's default auto-applies when the Register opens
- [ ] Deleting the default leaves the Register usable
- [ ] Saved views are user-specific and invisible to other users

## 6. Risk creation and editing — M8

**Editor tabs:**

- [ ] Basic
- [ ] Structured Description
- [ ] Assessments
- [ ] Controls
- [ ] Actions
- [ ] Custom Fields

**Validation blocks save when:**

- [ ] Title empty
- [ ] No category selected
- [ ] No risk owner selected
- [ ] Cause empty
- [ ] Event empty
- [ ] Consequence empty
- [ ] Response = Accept with empty acceptance rationale
- [ ] Status = Accepted without approver, approval date or valid-until

**Behaviour:**

- [ ] Generated reference is correct (`<BU CODE>-<3 digits>`)
- [ ] Reference recalculates when the BU changes on a **new** risk
- [ ] Reference never changes on an **existing** risk
- [ ] Fallback prefix `ERM` when the BU code is blank
- [ ] Cancel persists nothing
- [ ] Modal close persists nothing
- [ ] A score change appends exactly one history item
- [ ] A title/status/control/action-only change appends **no** history item
- [ ] Every save appends an audit event
- [ ] Title is trimmed on save
- [ ] Controls with an empty title are dropped on save
- [ ] Actions with an empty title are dropped on save
- [ ] Custom values stay keyed by attribute ID
- [ ] Only Super Administrator, Administrator and Risk Manager can create a risk
- [ ] Owner dropdowns exclude inactive users
- [ ] Owner dropdowns exclude users outside the selected BU's effective scope

**Defaults for a new risk:**

- [ ] Business Unit — first active unit in the user's direct scope
- [ ] Category — first active category
- [ ] Risk Owner — current Risk Owner user, else first active Risk Owner, else current user
- [ ] Origin Date = today
- [ ] Review Date = today + 12 months
- [ ] Target Date = today + 6 months
- [ ] Status = Draft
- [ ] Risk Type = Current
- [ ] Response = Mitigate
- [ ] Outlook = Stable
- [ ] Inherent 3 × 3, Residual 2 × 3, Target 2 × 2
- [ ] Controls and actions empty
- [ ] Custom number defaults to 0, other custom types to empty string

**Field-level partial update:**

- [ ] Control Owner can edit only their own controls
- [ ] Control Owner save leaves risk master data, assessments and other owners' controls unchanged
- [ ] Action Owner can edit only their own actions
- [ ] Action Owner save leaves risk master data, assessments and other owners' actions unchanged
- [ ] Auditor cannot mutate anything

## 7. Assessment engine — M4, M9

- [ ] Score = Impact × Likelihood
- [ ] All 25 cells resolve their configured rating
- [ ] `2 × 3 = 6 → Medium`
- [ ] `5 × 4 = 20 → Significant`
- [ ] Rating comes from the exact cell, not a score band
- [ ] Inherent, Residual and Target stay independent
- [ ] Changing a matrix cell updates chips, heatmaps, filters and reports together
- [ ] Restore 2026 defaults reproduces the matrix exactly
- [ ] Restore 2026 defaults reproduces colours `#00B050`, `#FFF200`, `#FFB900`, `#F32121`

## 8. Trend, direction and outlook — M4, M9

- [ ] Fewer than 2 history snapshots → `New`
- [ ] Residual lower than previous → `Improving`
- [ ] Residual higher than previous → `Worsening`
- [ ] Residual equal to previous → `Stable`
- [ ] Target < Residual → decreasing toward target
- [ ] Target = Residual → at target
- [ ] Target > Residual → increasing
- [ ] Outlook is manual and never overwritten by computed trend

## 9. Controls and actions — M8, M9

- [ ] Quick control input creates one control per unique non-empty line
- [ ] Leading/trailing whitespace trimmed
- [ ] Case-insensitive duplicate titles are not added
- [ ] New controls receive default values
- [ ] Control types render: Directive, Preventative, Detective, Corrective
- [ ] Automation types render: Manual, Automated, Semi-Automated
- [ ] Effectiveness statuses render: Effective, Needs Improvement, Ineffective, Not Assessed
- [ ] Action statuses render: Not Started, In Progress, Blocked, Rescheduled, Overdue, Completed
- [ ] Action priorities render: Low, Medium, High, Critical
- [ ] Progress stays within 0–100 in steps of 5
- [ ] Overdue computed as `dueDate < today AND status != Completed`
- [ ] Overdue badge can display over another stored open status
- [ ] New action defaults: due today + 3 months, Not Started, Medium, progress 0
- [ ] Overview action table shows Action, Description, Deliverable, Status, Deadline, Action Owner

## 10. Risk acceptance — M8, M9

- [ ] Acceptance form exposes rationale, initiator, approver, approval date, valid until, review date
- [ ] Response = Accept requires rationale
- [ ] Status = Accepted requires approver, approval date and valid until
- [ ] Default validity is six months from approval date
- [ ] `validUntil` is manually editable
- [ ] Acceptance summary appears on Overview only when response = Accept

## 11. Individual Risk View — M9

- [ ] Header shows reference, title, category, BU, risk owner, action-owner context, three scores, target date, status
- [ ] Overview tab
- [ ] Assessment tab — three score cards, three 5×5 matrices, selected cells, guidance, history table, residual trend chart
- [ ] Controls tab
- [ ] Actions tab
- [ ] Trend & Audit tab — chronological history plus risk-scoped audit with actor, timestamp, summary, change labels
- [ ] Audit events ordered newest first
- [ ] Opening a risk outside the user's visibility yields access-denied / not-found

## 12. Dashboard Builder — M13

**Widget types (all seven):**

- [ ] Metric
- [ ] Heatmap
- [ ] Distribution / Bar
- [ ] Top Risks
- [ ] Action Plan Progress
- [ ] Recent Activity
- [ ] Trend Summary

**Metric rules:**

- [ ] Total Risks = all filtered risks
- [ ] Open Risks = status ≠ Completed
- [ ] Significant Residual = residual rating = Significant
- [ ] Overdue Actions = due date passed and not Completed
- [ ] Emerging Risks = type = Emerging
- [ ] Completed Actions = action status = Completed

**Filters (all seven) saved and restored:**

- [ ] Business Unit
- [ ] Risk Category
- [ ] Risk Status
- [ ] Residual Rating
- [ ] Risk Type
- [ ] Risk Owner
- [ ] Risk Outlook

**CRUD:**

- [ ] Add dashboard
- [ ] Edit metadata
- [ ] Duplicate — new ID and independent widget collection
- [ ] Delete
- [ ] Shared toggle
- [ ] Accent colour
- [ ] English and Georgian name and description
- [ ] **Deleting the last remaining dashboard is blocked**
- [ ] Deleting a dashboard removes report sections bound to it
- [ ] Widget colour, span (3/4/6/8/12), reorder and duplicate all persist
- [ ] Widget limit accepts 1–20

## 13. Report Template Builder — M14

- [ ] Create, edit, duplicate, delete templates
- [ ] English and Georgian name and description
- [ ] Dashboard section — selects a saved dashboard
- [ ] Dashboard section carries independent filters
- [ ] Two dashboard sections in one report can hold different scopes
- [ ] Open Text section — EN/KA title and narrative
- [ ] Compact Register section — selectable base columns
- [ ] Compact Register section — selectable active custom-attribute columns
- [ ] Compact Register section — independent filters, template-driven column order
- [ ] **A compact register section cannot be reduced to zero columns**
- [ ] Sections add, move up, move down, duplicate, delete
- [ ] Print/PDF view opens cleanly

## 14. Export — M7, M14

- [ ] CSV contains the current filtered dataset
- [ ] CSV escapes commas, quotes and newlines
- [ ] SpreadsheetML `.xls` opens in Excel
- [ ] Export includes active custom attributes
- [ ] Export reflects only the current user's visible, filtered records

## 15. Administration — access and sections — M10–M12

- [ ] Super Administrator can open Risk Administration
- [ ] Administrator can open Risk Administration
- [ ] Risk Manager, Risk Owner, Control Owner, Action Owner and Auditor cannot
- [ ] Website Administration opens only for Super Administrator
- [ ] Sidebar selection switches workspace from URL/state
- [ ] Unsaved modal drafts do not persist across module changes

**All ten sections present:**

- [ ] Administration Overview
- [ ] Categories
- [ ] Business Units
- [ ] Custom Attributes
- [ ] Users
- [ ] Roles & Permissions
- [ ] Rating Matrix
- [ ] Branding
- [ ] SSO / SAML Roadmap
- [ ] Data Tools

**Overview metrics:** active categories, active business units, active users, active custom attributes, roles, audit events

- [ ] All six counts computed per the documented formulas

## 16. Administration — master data — M10

**Categories:**

- [ ] Add, edit, deactivate, reactivate
- [ ] Bilingual labels
- [ ] Save blocked when English labels are empty
- [ ] A deactivated category still resolves its label on old risks
- [ ] Audit event created

**Business Units:**

- [ ] Add root, add child under a selected parent
- [ ] Edit node, toggle active
- [ ] Expand / collapse
- [ ] Hierarchy path, direct users count, directly scoped risk count, descendant count all display
- [ ] Duplicate code rejected
- [ ] Self as parent rejected
- [ ] Descendant as parent (cycle) rejected
- [ ] Empty required name or code rejected
- [ ] Deactivation preserves historical references

**Custom Attributes:**

- [ ] All five types render: text, number, date, select, user picker
- [ ] Select options parse from comma-separated input, trimmed, empties dropped
- [ ] Values persist on the risk
- [ ] `showInRegister` adds the register column
- [ ] Report column option appears
- [ ] Deactivation hides the field **without deleting stored values**
- [ ] Reactivation restores the old values

## 17. Administration — users, roles, matrix — M11

**Users:**

- [ ] Save blocked when name, email, role or BU scope missing
- [ ] Multiple roles and multiple direct scopes supported
- [ ] Inactive user cannot log in
- [ ] Inactive user excluded from owner pickers
- [ ] Effective scope count correct

**Roles:**

- [ ] Custom role create and edit
- [ ] None / Read / Edit behave correctly per module
- [ ] Effective permission is the highest across assigned roles
- [ ] Routes and buttons match effective permission
- [ ] Record-level scope still enforced on top of module permission

**Matrix:**

- [ ] Every one of the 25 cells is editable
- [ ] Colour changes update register chips, detail cards, heatmaps, distributions, reports and rating filters
- [ ] Restore defaults is exact
- [ ] Score remains Impact × Likelihood regardless of matrix edits

## 18. Administration — branding, SSO, data tools — M12

**Branding:**

- [ ] Client logo uploads and displays top-right
- [ ] Persists across refresh
- [ ] Remove returns to placeholder
- [ ] Oversized image produces a clear error
- [ ] Risk Administrator cannot change AIZEN public-site content or team members

**SSO:**

- [ ] All draft fields present: provider name, IdP entity ID, metadata URL, ACS URL, email attribute, role attribute, role mappings, enabled toggle
- [ ] Enabled toggle raises an audit event

**Data Tools:**

- [ ] Export full JSON produces valid JSON containing every collection
- [ ] Import accepts the current schema
- [ ] Import accepts the legacy schema-7 baseline
- [ ] Invalid JSON leaves state unchanged
- [ ] Structurally invalid JSON leaves state unchanged
- [ ] Reset demo data requires confirmation and restores the seed
- [ ] Audit export produces valid JSON

## 19. Site Administration — M12

- [ ] Every capability present in `app.html` still works
- [ ] Public site, About Us, solutions, team members, demo media all editable
- [ ] Hero carousel behaviour preserved
- [ ] Accessible only to Super Administrator

## 20. Bilingual UI — M5

- [ ] Runtime English ⇄ ქართული toggle
- [ ] All chrome labels switch
- [ ] Master data shows Georgian labels where present
- [ ] **Empty Georgian label falls back to English, never renders blank**
- [ ] User-entered narratives are not auto-translated
- [ ] Both languages verified on: login, dashboard, register (compact), register (detailed), individual risk, reports, all ten administration sections, public site

## 21. Navigation and accessibility — M5, M16

- [ ] Route transitions are smooth with scroll-to-top
- [ ] Animation reduced or disabled under `prefers-reduced-motion`
- [ ] Every interactive control has a visible label or `aria-label`/`title`
- [ ] Keyboard focus is always visible
- [ ] Colour is never the only carrier of meaning — rating and status text always shown
- [ ] Dialogs close via Cancel/Close without losing focus

## 22. Error handling and edge cases — all milestones

- [ ] Opening a hidden risk ID → access denied / not found
- [ ] No categories, BUs or users → New Risk save blocked with validation
- [ ] Corrupt or missing matrix cell → migration/default repair with fallback rating
- [ ] Removed category still used by an old risk → category inactive, reference retained
- [ ] Due date passed → overdue visual state computed
- [ ] Empty control or action title → removed on save
- [ ] Invalid JSON import → state unchanged, error shown
- [ ] Valid but old-schema import → migrated and repaired before persist
- [ ] Delete last dashboard → blocked
- [ ] Report referencing a deleted dashboard → those sections removed with the dashboard
- [ ] Default Saved View deleted → default cleared, Register remains usable
- [ ] Repository write failure → error shown, modal draft kept

## 23. Persistence and migration — M3

- [ ] Storage key remains `erm-risk-management-v3-state`
- [ ] Importing the schema-7 baseline migrates to schema 8
- [ ] Risk count preserved (8)
- [ ] Control count preserved (6)
- [ ] Action count preserved (10)
- [ ] History item count preserved (13)
- [ ] Audit event counts preserved (4 global, 3 risk-scoped)
- [ ] Risk IDs unchanged
- [ ] Risk references unchanged
- [ ] Migration is idempotent — running twice yields an identical result
- [ ] Export → clear storage → import round-trips to an equal state
- [ ] No component calls `localStorage` directly

---

## Reference screenshots

Visual baseline for comparing the refactored UI against the legacy build.

**Status: not captured, and no longer capturable from source.** This required driving the legacy single-file build in a browser; that build has been removed from the repository. Recovering it would mean restoring it from git history. See the M0 completion note — this was the one M0 deliverable outstanding.

Required coverage once captured — each in **English and ქართული**:

- [ ] Login page
- [ ] Dashboard
- [ ] Risk Register — Compact
- [ ] Risk Register — Detailed
- [ ] Risk Editor — all six tabs
- [ ] Individual Risk View — all five tabs
- [ ] Reports — template list and print view
- [ ] Administration — all ten sections
- [ ] Website Administration
- [ ] Public site
