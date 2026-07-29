# Beyblade X Meta Platform V2 - Current Project Audit

Audit date: 2026-07-29  
Completed phase: Phase 0 - Current Project Audit  
Repository: `k89150-art/Beyblade-manager`  
Baseline commit: `3427d3dcf484e0172a485dcd06db7c97a448d1a4`  
Rollback tag: `v2-phase0-baseline-20260729`

## 1. Scope

This audit follows `BEYBLADE_META_PLATFORM_V2/README.md` and specifications
`01_PRD.md` through `10_ACCEPTANCE_TEST.md` in the required order.

Phase 0 performed only:

- Existing project and deployment inspection.
- Technology, data, feature, security, and architecture inventory.
- Reuse, gap, conflict, and risk analysis.
- A minimal-change strategy for future phases.

Phase 0 did not modify:

- Existing HTML, CSS, or JavaScript behavior.
- Firestore rules or stored user documents.
- Catalog, stock, analysis, Meta, or tournament data.
- Existing URLs, functions, field names, or local storage keys.
- Any schema, engine, page, API, or deployment configuration.

No paid external API, generative AI API, automatic scraper, or external data
collector was added.

## 2. Executive Summary

The current application is a working, mobile-first, multi-page static web app.
It combines a collection manager, extra-parts inventory, build management,
test history, tournament records, a rule-based configuration analyzer, and a
read-only administrator view.

The application can be evolved rather than rebuilt. The current UI, Firebase
authentication, per-user Firestore data, stock-product catalog, Beyblade part
catalog, compatibility checks, and current analysis explanations are useful
legacy assets.

The current architecture is not yet the V2 evidence platform:

- Catalog, rules, aggregate Meta observations, coach text, and derived values
  are mixed in one main JSON file.
- There are no normalized raw Evidence records, revisions, analysis runs,
  traces, immutable weekly snapshots, or API read models.
- Analysis runs directly in the browser and UI orchestration also calculates
  classifications and recommendations.
- There is no internal `/api/meta/...` layer.
- GitHub Pages is static hosting and cannot execute the specified dynamic API
  routes by itself.
- Twenty Blade identifiers are duplicated in the main analysis database.

The safest path is additive migration: preserve all legacy behavior and data,
introduce V2 domain and evidence layers beside the current app, validate them
against read-only fixtures, and switch reads only after compatibility and
rollback tests pass.

## 3. Current Technology Stack

| Area | Current implementation | Assessment |
| --- | --- | --- |
| Framework | None; native multi-page HTML | Keep unless a later phase explicitly approves a core change. |
| Language | Browser JavaScript ES modules plus classic scripts | Existing project is JavaScript, not TypeScript. |
| Runtime | Modern browser; Node is not part of production runtime | Analysis and rendering execute client-side. |
| Package manager | None | No `package.json` or lockfile exists. |
| Build system | None | Files are deployed without compilation or bundling. |
| Database | Firebase Firestore plus version-controlled static JSON | Firestore stores user data; JSON stores catalogs and analysis data. |
| Authentication | Firebase Auth with Google popup sign-in | Used by collection, tournament, analysis inventory suggestions, and admin pages. |
| ORM | None | Browser code calls Firebase SDK directly. |
| Routing | Static `.html` files, query parameters, and section hashes | No application router exists. |
| Styling | `style.css` and `site-menu.css` with CSS custom properties | Responsive rules exist, with several accumulated override layers. |
| Testing | No test framework or checked-in automated test suite | Only manual behavior and ad hoc syntax/data checks are currently available. |
| Deployment | GitHub Pages, legacy mode, `main` branch root | Current status is built at `https://k89150-art.github.io/Beyblade-manager/`. |
| Rules deployment | Manual GitHub Actions workflow using Firebase CLI | Requires the configured service-account secret. |
| PWA | Web app manifest only | No service worker or offline cache implementation was found. |

Firebase JavaScript SDK `11.2.0` is loaded directly from Google's CDN. Firebase
configuration and administrator UID checks are repeated in several files.

## 4. Current Application Map

### Public and information pages

- `home.html`: entry page.
- `guide.html`: usage instructions.
- `changelog.html`: update history.
- `about.html`, `contact.html`, `privacy.html`: supporting information.

### User tools

- `index.html` + `script.js`
  - Original Beyblade collection.
  - Automatic stock-product lookup and manual fallback.
  - Extra-parts inventory and quantity protection.
  - BX/UX and CX free build management.
  - Compatibility rules and stock exhaustion checks.
  - Deleted-build test history.
  - Live Firestore synchronization.
- `analysis.html` + `analysis.js`
  - Standard, CX three-piece, and CX split-part analysis.
  - Seven current score dimensions.
  - Strengths, warnings, modification advice, deck role, Meta route notes, and
    rule-based Meta Coach text.
  - Suggestions generated from the signed-in user's owned parts.
- `tournament.html` + `tournament.js`
  - Tournament, opponent, 3G deck, match, round, score, and result records.

### Administration

- `admin.html` + `admin.js`
  - Admin-only collection-group read.
  - User, build, history, and tournament counts.
  - Opens a selected user's read-only detail page.
- `user-view.html` + `user-view.js`
  - Admin-only read of a selected user document.
  - Read-only collection, inventory, build, history, and tournament display.

### Shared UI

- `site-menu.js` + `site-menu.css`
  - Desktop side navigation, collapsed state, mobile bottom navigation, active
    section tracking, and admin-menu visibility.
- `style.css`
  - Shared colors, controls, cards, dialogs, tables, responsive conversions,
    and later admin-derived design overrides.

## 5. Current Data Architecture

### 5.1 User data in Firestore

Path:

```text
users/{uid}/appData/main
```

Current document fields:

```text
beybladeTable[]
partTable[]
configTable[]
historyTable[]
tournamentRecords[]
ownerUid
ownerEmail
updatedAt
```

Collection, extra parts, and builds are primarily persisted as positional
`cells[]` arrays that mirror table columns. Tournament records use nested
objects with generated tournament, match, and round IDs.

The main page uses `onSnapshot` and merge writes. The tournament page uses
read/merge-write behavior so fields owned by other pages are retained.

`localStorage` is not the primary user-data store in the current version. It is
used only for the desktop navigation collapsed preference.

### 5.2 Static product and stock data

`stock_products_AUTOFILL_SAFE_2026-07-15.json` contains:

- 213 stock-product records.
- 213 unique `recordId` values.
- 209 unique product codes.
- Four intentional duplicate product-code groups: `BX-00-01` through
  `BX-00-04`, each representing a confirmed two-Bey set.
- Exact-code and base-model lookup indexes.
- Standard, CX three-piece, CX four-piece, integrated-ratchet, and expansion
  assembly modes.
- Original parts, set metadata, lookup behavior, and review flags.

This is the strongest existing source for future `Product` and
`StockConfiguration` migration. `recordId` is safer as the product-record
identity than `productCode`, because a product code may identify a multi-Bey
set.

### 5.3 Static part and analysis data

`beyblade_x_database_v1_zhTW.json` currently contains:

- 77 Blade records.
- 35 Ratchet records.
- 51 Bit records.
- 16 CX Lock Chips.
- 22 CX Main Blades.
- 5 CX Metal Blades.
- 10 CX Over Blades.
- 15 CX Assist Blades.
- 8 alias records.
- 7 priority rules.
- 29 Meta common routes.
- 1 Meta snapshot.
- 1 Meta Coach update.

It also embeds a legacy `__v18` database, display rules, conflict policy,
global updates, legacy parts, Meta policies, and update history.

Important identity finding: 20 Blade `id` values occur twice. The current
browser index resolves collisions using a record-priority heuristic. That
allows current lookup to work, but it is not a sufficient canonical primary
key policy for V2 migration.

### 5.4 Current Meta data

Current Meta fields are curated aggregate observations:

- `metaSnapshots`
- `metaCommonRoutes`
- `metaEvidencePolicy`
- `metaCoachUpdates`

They preserve warnings that top-cut appearances and first-place share are not
match win rates. This is compatible with the V2 rule that placement must not
be converted into win rate.

They are not yet a V2 Raw Evidence layer because individual source records,
verification status, grade, revision chain, independent source group,
evidence targets, import batches, and immutable analysis traces are absent.

## 6. Required Architecture Audit

### Product

Current state:

- Product-like records exist in the stock-product JSON.
- Exact and base model lookup, variants, and multi-Bey sets are implemented.
- Product data is used only for original collection autofill and display
  enrichment, not for performance analysis.

Reusable:

- `recordId`, product code normalization, series, assembly system, parts,
  set membership, and lookup indexes.

Gap:

- No standalone V2 `Product` model or explicit relation to canonical
  `StockConfiguration` component IDs.

### Part

Current state:

- Analysis parts are grouped into Blade, Ratchet, Bit, and CX arrays.
- Extra owned parts are free-form rows in user documents.
- Aliases are supported by analysis lookup.

Reusable:

- Existing names, codes, aliases, series labels, physical fields, roles, and
  compatibility knowledge.

Gap:

- No unified `CatalogEntity` identity across all part types.
- Some identifiers are names rather than stable IDs.
- Twenty duplicated Blade IDs must be resolved before Phase 1 completes.
- Existing role, tier, confidence, and recommendation fields mix catalog and
  derived Meta concerns.

### Series

Current state:

- Series values are strings such as `BX`, `UX`, `CX`, `BXG`, and `BXH`.
- Analysis Blade data also contains a combined `BX/UX/CX` value.

Reusable:

- Existing labels and product associations.

Gap:

- No standalone, dynamically extensible `Series` model.
- Combined series values require an explicit many-series or applicability
  policy.

### Stock Configuration

Current state:

- Each stock product has a `parts` object and assembly/ratchet mode.
- The collection stores a denormalized nine-cell display record plus stock
  metadata.

Reusable:

- Original configuration composition, integrated-part modes, CX distinctions,
  set rules, and product-record references.

Gap:

- No normalized `StockConfiguration` and component relation.
- Stored user rows depend on column order and display strings.
- Migration must keep the legacy row shape readable and must not rewrite all
  users automatically.

### Search

Current state:

- Analysis datalists search current IDs, codes, Chinese/English names, models,
  and aliases.
- Stock input supports normalized exact code and base-model variant lookup.
- There is no global Search page or `/api/meta/search`.

Reusable:

- Normalizers, aliases, exact index, and base-model index behavior.

Gap:

- No grouped cross-entity, Combo, Analysis, or Compare search.
- No canonical deduplication contract shared by all pages.

### Analysis

Current state:

- Standard analysis prefers the v1.8 helper.
- CX analysis and fallback use the legacy contextual engine.
- `analysis.js` adds UI-level weighting, role classification, strengths,
  warnings, recommendations, and deck-role output.
- Meta route and Meta Coach helpers run in the browser.
- The rules JSON is fetched, but its `rules` object is not passed into the
  active engines and currently acts only as a load prerequisite.

Reusable:

- Legal-combination validation.
- BX/UX/CX input mapping.
- Existing compatibility and risk language.
- Conservative sample warnings.
- Current rule-based, non-generative explanation patterns.
- Explicit distinction between top-cut appearances and win rate.

Gap:

- Evidence, confidence, performance, trend, maturity, risk, and
  recommendation are not separate engines.
- Current scores are small heuristic values, not V2 `0-100 | null`.
- Missing information often begins at numeric zero rather than `null`.
- No persisted rule definition/version, cutoff time, analysis run, input
  Evidence IDs, or calculation trace.
- Complete Combo evidence is not a normalized independent analysis entity.
- UI orchestration calculates scores and conclusions directly.

### Admin

Current state:

- Admin identity is checked by Firebase UID in both UI and Firestore Rules.
- Admin can read all user `appData/main` documents.
- Admin cannot write another user's document through Firestore Rules.
- Admin UI is a read-only user-data summary and viewer.

Reusable:

- Authentication, authorization rule, read-only user inspection, status
  components, and Firestore rules deployment workflow.

Gap:

- No Evidence import, verification, rejection, supersession, revision,
  mapping queue, rule publication, weekly publication, or editorial admin
  workflow.
- Future Meta collections are not covered by current Firestore Rules.
- Repeated client-side UID constants should eventually come from one shared
  authorization module, while Firestore remains the security boundary.

### API

Current state:

- No internal API routes, API service, repository layer, or standard
  `{data,error,meta}` response exists.
- Pages directly fetch JSON, call Firestore, run analysis, and render results.

Reusable:

- Current pure lookup helpers can later sit behind repositories/services.

Conflict:

- GitHub Pages cannot execute dynamic routes such as
  `/api/meta/entities/:id` or `/api/meta/compare`.
- An exact implementation requires an approved server/serverless runtime or a
  documented static read-model interpretation. This is a Phase 11 deployment
  decision and must not be silently introduced during an earlier phase.

## 7. Reuse Matrix

| Current asset | Future use | Required treatment |
| --- | --- | --- |
| Firebase Google sign-in | Keep for user and admin tools | Centralize configuration later without changing login behavior. |
| `users/{uid}/appData/main` | Keep as legacy user workspace | Add adapters; do not rewrite or delete existing documents. |
| Firestore ownership rules | Keep as current user-data boundary | Add separate, least-privilege V2 rules only when V2 storage is approved. |
| Stock-product JSON | Seed Product and Stock Configuration | Preserve `recordId`, product codes, set rules, and all original configuration fields. |
| Main analysis JSON | Migration source, not final V2 schema | Split Catalog, Raw/Imported Meta, Derived, and Editorial data additively. |
| Alias logic | Seed `EntityAlias` and search | Normalize once and deduplicate through canonical entity IDs. |
| Compatibility checks | Seed rule definitions | Move magic values into versioned rule definitions with tests. |
| Current analysis wording | Seed deterministic Coach templates | Require traceable reason codes and input references. |
| Meta routes and snapshot | Imported aggregate observations | Label as aggregate/editorial evidence; never infer match win rate. |
| Tournament records | Keep as private user records | Do not treat as verified public Evidence without a separate opt-in review process. |
| Existing cards/navigation | Keep user workflows | V2 components should reuse tokens and remain mobile-first. |
| GitHub Pages | Keep for current app | API strategy requires an explicit later decision. |

## 8. Specification Conflicts and Risks

### Blocking before or during Phase 1

1. **Canonical Blade IDs are ambiguous.** Twenty Blade IDs are duplicated.
   V2 requires existing IDs to be preserved, while migration also requires
   stable unique identities. A reviewed legacy-ID-to-canonical-ID mapping is
   required; IDs must not be guessed.
2. **Dynamic API versus static deployment.** The specified API routes cannot
   run on the current GitHub Pages deployment. No backend or hosting migration
   is approved in Phase 0.
3. **Target storage is undecided.** V2 requires append-only Evidence,
   revisions, transactions, immutable snapshots, and analysis runs. The
   current project has both static JSON and a single user Firestore document,
   but neither is currently designated as the V2 system of record.

These match the development-order stop conditions for ambiguous primary IDs
and a possible core deployment/database change. They must be decided
explicitly before implementation reaches the affected phase.

### High risk

- Catalog, Meta aggregates, policies, coach updates, and derived fields share
  one JSON file.
- Current analysis has no immutable trace or reproducible analysis-run record.
- Unknown values and current score defaults do not satisfy V2 null semantics.
- Raw Evidence governance, deduplication, revision, and mapping queues do not
  exist.
- UI, data access, orchestration, and analysis responsibilities overlap.
- No automated regression suite protects Google login, stock counting, CX
  rules, deletion history, synchronization, and admin read-only behavior.

### Medium risk

- Large scripts (`script.js` and `analysis.js`) contain many responsibilities.
- Firebase configuration and authorization checks are duplicated.
- Several functions are exposed globally for inline HTML event handlers.
- CSS contains accumulated repeated selectors and 16 `!important`
  declarations, increasing responsive regression risk.
- The analysis rules JSON is loaded but not used by the active engine path.
- PWA installation exists without offline behavior.

### Current strengths

- Firestore rules correctly distinguish owner writes from admin reads.
- Admin views do not expose modify, delete, or restore actions for other users.
- Product autofill is kept separate from performance scoring.
- Current Meta text explicitly says placement/top-cut share is not win rate.
- Existing compatibility checks cover integrated parts, no-ratchet models,
  simple-ratchet constraints, CX part paths, and stock exhaustion.
- The current repository and user data can remain operational during an
  additive V2 migration.

## 9. Minimal Modification Strategy

This is a strategy only. No step below was implemented in Phase 0.

### A. Preserve the current application

- Keep all current pages, URLs, Firebase Auth behavior, user Firestore fields,
  stock calculations, and static datasets operational.
- Treat the rollback tag as the recovery point.
- Do not bulk-convert user documents.

### B. Resolve identity before creating V2 models

- Inventory every current entity key and duplicate.
- Propose a reviewed canonical-ID map.
- Preserve every legacy ID/name/code as an alias or legacy reference.
- Use `recordId` for stock-product records and model multi-Bey product codes as
  one Product with multiple stock configurations or children.
- Do not generate canonical IDs from display text without approval.

### C. Add a compatibility boundary

- Introduce repository/service adapters beside current code rather than
  replacing page logic immediately.
- Read legacy JSON and Firestore through adapters that return typed,
  normalized read models.
- Keep legacy write paths unchanged until migration tests and rollback are
  proven.

### D. Separate V2 data by responsibility

- Catalog: identity, names, aliases, series, products, and components.
- Raw: sources, evidence records, targets, revisions, batches, and mapping
  tasks.
- Derived: rule definitions, runs, analyses, traces, profiles, snapshots, and
  timelines.
- Editorial: notes and manually written context.

No derived score should be written by a frontend component.

### E. Keep engines deterministic and local

- Implement V2 engines as pure JavaScript functions with explicit cutoff time
  and versioned rule inputs.
- Use only verified local/administrative evidence.
- Add no generative AI, paid API SDK, or external scraping.
- Return `null` for insufficient evidence and include reason codes and trace
  references.

### F. Delay API and UI replacement

- Build and test domain models and engines before changing current pages.
- Decide at Phase 11 whether exact dynamic API routes use an approved runtime
  or whether the specification will formally accept generated static read
  models plus a client adapter.
- Add V2 UI only after API/read-model contracts are stable.
- Keep current analysis available until side-by-side compatibility testing is
  complete.

### G. Add tests before migration

At minimum, future phases need fixtures and regression coverage for:

- Product exact/base/set lookup.
- Existing user document parsing.
- Inventory quantity and used-part limits.
- BX/UX/CX legality and integrated-part rules.
- No-evidence and null behavior.
- Evidence status, grade weighting, deduplication, and revisions.
- Placement versus win-rate protection.
- Rule-version trace reproducibility.
- Auth owner/admin permissions.
- Mobile one-card-per-row behavior.
- Migration rollback and legacy ID preservation.

## 10. Phase 0 Validation

Completed read-only checks:

- Confirmed Git baseline and rollback tag.
- Read all required V2 specification files in order.
- Inspected all 11 HTML pages and all JavaScript/CSS/data/config files.
- All JavaScript files passed `node --check`.
- All 6 JSON files parsed successfully.
- All local HTML references to scripts, stylesheets, manifest, icon, and pages
  resolve to existing files.
- Local HTTP smoke checks returned `200` for the main user, analysis, admin,
  tournament, catalog, and stock-product resources.
- GitHub Pages reports `built`, HTTPS enforced, legacy deployment from
  `main` branch `/`.
- Working tree remained unchanged before this audit document was added.

Not executed in Phase 0:

- Authenticated browser mutation tests.
- Firestore write tests.
- Schema migration.
- Analysis result changes.
- UI visual changes.
- Any Phase 1 work.

## 11. Phase 0 Decision

The existing project is suitable for an additive V2 migration. A full rewrite
is neither required nor recommended.

Before Phase 1 implementation, the following decisions require explicit
approval:

1. Canonical identity policy for duplicated Blade IDs.
2. V2 system of record for Catalog, Raw Evidence, Derived Analysis, and
   Editorial data.
3. Future interpretation or hosting solution for `/api/meta/...`.

Phase 0 is complete. Work stops here as required by
`09_DEVELOPMENT_ORDER.md`.
