# XPNS Mobile Frontend — Decisions, Status, and Remaining Work

React Native (Expo) client for the Treasure Chest Records backend. This document records what was
decided and why, what actually exists in the repo today, and what is left. For the wire format see
`.agent/backend_contract.md`; where this document and the contract disagree, **this document is
correct** — see [Contract Corrections](#contract-corrections-verified-against-the-running-backend).

Last verified against the live backend on 2026-08-07 (473 real transactions rendering on an
Android emulator). Phases 4–5 and the budget half of Phase 6 (added 2026-08-08) passed
`tsc --noEmit` / `expo lint` / a clean `expo export` bundle throughout, and the Dashboard's trend
chart (scroll, long-press-to-inspect, y-axis scaling) is now confirmed working on-device (Android,
Expo Go) — see 1.9. The rest of the Dashboard and the Budget screen's CRUD flow are still only
build-verified, not yet exercised on-device.

---

## 1. Decisions

### 1.1 Platform: React Native via Expo — the Figma scaffold is reference only

The scaffold in `.scaffold_figma/` is a **Vite + react-dom web app**, not React Native. It depends
on Tailwind utility classes on every element, recharts, Radix/shadcn, `document.documentElement`,
`localStorage`, `<table>`, HTML drag-and-drop and `position: fixed`. None of that runs on RN.

The port is therefore a rewrite of the presentation layer, with one mitigating discovery: the
scaffold's `App.tsx` imports only `react`, `recharts` and `lucide-react`. **All 40 shadcn/Radix
components under `src/app/components/ui/` are dead code** and were never ported.

| Scaffold | Replacement | Notes |
|---|---|---|
| `lucide-react` | `lucide-react-native` | Near drop-in; needs `react-native-svg` |
| Tailwind classes | StyleSheet + typed tokens | See 1.2 |
| `recharts` | `react-native-gifted-charts` | Full rewrite; tooltips became tap-to-select — see 1.9 |
| `localStorage` | AsyncStorage + `expo-secure-store` | Server key goes to SecureStore only |
| `<table>` | `FlatList` | |
| `position: fixed` | `Modal` | Splash, onboarding, pickers |
| `.dark` on `<html>` | Theme context + token objects | |

### 1.2 Styling: StyleSheet + typed tokens, **not** NativeWind

NativeWind was the initial recommendation because it would have preserved the scaffold's
`className` strings. It was **rejected during implementation**: the latest release (4.2.6) predates
Expo SDK 57 / RN 0.86 / React 19, and a style layer that silently half-applies on a brand-new SDK
is a worse failure mode than writing StyleSheet by hand.

The scaffold's `className` strings would have needed heavy rewriting anyway — NativeWind does not
support `grid`, `fixed`, `hover:*`, `[&::-webkit-scrollbar]`, CSS transitions, or `tabular-nums`
(which matters: it is what stops money columns jittering, and RN needs
`fontVariant: ['tabular-nums']` explicitly).

Design tokens are transcribed 1:1 from the scaffold's `theme.css` into `src/theme/tokens.ts`.

### 1.3 Category colours are computed, never mapped

The scaffold hardcoded a six-entry name→colour map (`"Food & Dining"`, `"Transport"`, …) that does
not match the backend taxonomy at all. The contract explicitly forbids hardcoding categories.

Colours are now derived: an FNV-1a hash of the **root** category name selects a palette slot, and
children are lightness-shifted around the parent hue so a carved `Coffee` reads as a shade of
`Dining & Takeout` rather than an unrelated colour. Stable across sessions and devices with no
stored state.

### 1.4 Transactions fetch a whole date range instead of infinite-scrolling

`GET /transactions` returns a bare array with no total count. That makes offset paging unable to
show "N transactions", and unable to coherently merge the several queries a stem selection needs.

Since a date range is bounded, the client pages through it fully (50 per request, capped at 1000
per category) and holds the result. Counts become exact, stem expansion becomes trivial, and
`FlatList` still virtualises rendering. A month is tens to low hundreds of rows.

### 1.5 Selecting a parent category expands to its children

A stem holds no transactions of its own, so `?category=<stem>` returns an empty list — which reads
as a bug. The picker keeps stems selectable, labels them "Group — includes its subcategories", and
`categoryTree.expand()` turns the selection into one query per child, merged and re-sorted.

### 1.6 Budgets stay on-device

No `/budgets` endpoint exists. Budgets live in AsyncStorage. **Consequence to accept explicitly:
reinstalling the app wipes every budget, with no recovery.** Either add an export/import, or add a
backend endpoint. Bucket keys are category names, so they need reconciliation whenever the taxonomy
changes.

### 1.7 Auth and secrets

Single shared bearer secret, no login flow. The key lives in `expo-secure-store`, never in
AsyncStorage and never in the settings blob. Onboarding **validates the key with a real
`GET /categories` round-trip** before completing — the scaffold accepted any non-empty string,
which produced an app where every screen failed at once.

The scaffold's second credential field ("LLM API Key") was **dropped**: the backend has no endpoint
that accepts one, it is server-side `.env` configuration.

### 1.8 Import will use multipart

Decided with the backend author: `POST /ingest` is being changed to accept a multipart CSV/PDF
upload rather than scanning a server-side inbox folder. The response keeps the documented
`{files, categorised}` shape with a single-element `files` array.

Upload goes through `XMLHttpRequest` rather than `fetch`, because RN's `fetch` reports no upload
progress. That makes step 1 of the import progress indicator genuinely real; the remaining steps
are indeterminate server-side work.

### 1.9 Chart library: `react-native-gifted-charts`, not `victory-native` XL

Decided in favour of the lighter option from the two the doc had shortlisted: `react-native-gifted-charts`
only needs `react-native-svg`, already a dependency for the lucide icons. `victory-native` XL needs
`@shopify/react-native-skia`, a second rendering dependency this project has no other use for — not
worth the extra native surface on an SDK 57 / RN 0.86 stack this new, where an untested combination
is a real risk (see 1.2's NativeWind rejection for the same reasoning).

Neither library's tooltip is touch-native out of the box, so both chart components render their own
persistent readout instead of the scaffold's hover tooltip: `CategoryDonut` selects a slice on tap
(state, not a transient hover) and shows it in the donut's centre label plus a tappable legend;
`SpendTrendChart` uses `pointerConfig` with `persistPointer` so a touch pins the readout until the
next touch rather than it vanishing on release.

Getting the trend chart right on-device took three iterations, worth recording so nobody re-treads
them:
1. **Instant-touch pointer + the library's own scroll** — didn't scroll or respond to touch at all.
   `activatePointersInstantlyOnTouch` claims the touch responder on press-down, before a plain drag
   can ever be read as a scroll, so neither gesture got through.
2. **Hand-rolled scroll** (`disableScroll` + an external `ScrollView` wrapping the whole chart) —
   fixed horizontal scroll, but broke two things: the y-axis scrolled off with the content (gifted-
   charts normally renders it *outside* its own internal ScrollView, which this wrapping discarded),
   and a hardcoded container height clipped the x-axis label row.
3. **What shipped** — back to the library's own internal scroll (free sticky y-axis), with the
   pointer gated to `activatePointersOnLongPress` instead of instant: a plain drag scrolls, a
   long-press-then-drag inspects. An `nestedScrollEnabled` + `showScrollIndicator` pair on the chart
   is enough since the Dashboard's outer `ScrollView` no longer needs to cooperate with it — see
   below.

One more dead end along the way: swapping both the chart's and the Dashboard's `ScrollView` for
`react-native-gesture-handler`'s (plus adding the `GestureHandlerRootView` it requires) was tried to
fix vertical-scroll-over-the-chart specifically, and didn't — reverted. **The chart's horizontal
scroll and the Dashboard's vertical scroll do not currently cooperate when a touch starts directly
over the chart**; touching the chart always resolves to the chart's own gesture. Revisit only if a
user actually reports this as a problem — it wasn't worth chasing further blind.

The y-axis also needed an explicit `maxValue`: gifted-charts doesn't pad above the highest data
point by default, so a value near the computed ceiling would render at or past the top of the chart,
invisible. `niceAxisMax()` in `SpendTrendChart.tsx` pads 15% and rounds to a clean gridline number.

### 1.10 Dashboard aggregates locally instead of adding a second `/summary` call

The donut and the budget balance both need the *current period's* totals, and the trend chart needs
the *trailing twelve months'* — but `GET /summary/monthly` already returns every category row for
all twelve months, and the selected period is always inside that window (`mostRecentPeriodWithData`
never picks a period the monthly response doesn't contain). So the Dashboard makes exactly one
`/summary/monthly?rollup=false` call and derives everything else from it client-side
(`lib/dashboardStats.ts`): the donut groups leaf rows into their root category with `tree.rootOf()`,
matching `categoryColor`'s "child is a shade of its parent" model, rather than requesting
`rollup=true` separately.

### 1.11 Budget buckets pulled forward into Phase 5, ahead of the rest of Phase 6

The scaffold's Dashboard treats the balance card and budget-bucket bars as part of the Dashboard,
not the Budget tab, so building the Dashboard honestly required a minimal `src/store/budgets.tsx`
and a working `(tabs)/budget.tsx` now rather than leaving them for later — a Dashboard that can never
show a budget isn't really done. What's *not* pulled forward: the onboarding bucket-allocation step
and the Settings screen's "test connection" action, both still open under Phase 6 in §4.

---

## 2. Contract Corrections (verified against the running backend)

Three things the contract states are wrong in practice. All are handled in code.

| # | Contract says | Backend actually does | Handled in |
|---|---|---|---|
| 1 | Missing **or** wrong token → `403`, no body | **Missing** → `401 {"detail":"Not authenticated"}`; **wrong** → `403` | `lib/api/client.ts` — both raise `ApiAuthError`, distinguished so the UI can say which |
| 2 | Uncategorised is `null` (transactions) / `"Unknown"` (taxonomy) | `/summary` additionally emits rows literally named **`"Uncategorised"`** — a name absent from `GET /categories` | `lib/categoryTree.ts` — `isUncategorised()` normalises all three |
| 3 | — | Every transaction in the live database currently has `category: null`; nothing has been categorised | Rendered honestly as "Uncategorised"; needs a `POST /categorise` run |

Additional live-data observations:

- **33 of 500 sampled transactions have positive `amount_cents`** (e.g. `Incoming PayNow +$450.00`).
  The scaffold hardcoded a red `−$` prefix with `Math.abs()` on every row and would have shown all
  of them as debits. Sign-aware rendering is implemented and verified.
- Transaction data spans **2025-12-10 → 2026-05-20**, so `GET /summary` for the current period
  returns `[]`. The Dashboard must default to the most recent period *with data*, not the current
  month.
- Unrelated fix applied to the backend repo: `.dockerignore` was missing `.venv/`, making the build
  context 308 MB and killing `docker compose build`.

---

## 3. Implemented

Everything below is in the repo and passes `tsc --noEmit` + `expo lint` (configured for the first
time this pass: `eslint.config.js`, `eslint` + `eslint-config-expo`). Transactions, onboarding and
foundation are also confirmed against the live backend on an emulator; Dashboard/Budget/charts are
confirmed for the pieces noted under the title, build-verified for the rest.

- **Foundation** — theme tokens + light/dark provider (user preference, not OS scheme); settings and
  budgets stores (AsyncStorage, hydration-gated, secrets in `expo-secure-store`); root layout with
  font loading, a real splash gate, and an onboarding route guard.
- **API layer** (`lib/api/`, `hooks/`) — one typed function per contract endpoint, a client factory
  (not a singleton, since credentials change at runtime) distinguishing `ApiAuthError` from network
  failures, XHR-based multipart upload for future import progress, and React Query hooks for
  categories, transactions, and the 12-month summary.
- **Pure logic** (`lib/`, platform-agnostic) — `money`, `period`, `categoryTree`, `categoryColor`,
  `budget` (scope precedence + bucket reconciliation), `dashboardStats` (chart aggregation). This is
  the highest-leverage place for tests — see §4.
- **Screens** — onboarding (live key validation); **Transactions** (complete: filters, stem
  expansion, exact counts, sign-aware rows); **Dashboard** (balance card, category donut, scroll/
  long-press-inspect trend chart, budget bucket bars, defaults to the most recent period with data);
  **Budget** (config CRUD — scope, total, per-category buckets against the live taxonomy).
- **Scaffold bugs fixed rather than ported** — `Field`/`Dropdown` moved to module scope (they were
  declared inside render bodies, remounting and dropping focus on every keystroke); blocking
  dropdowns replaced with dismissable `Modal`s; the fake splash timer replaced with a real hydration
  gate; hardcoded `"2026-08"` / a fixed 2026–2027 month list removed in favour of computed ranges.

---

## 4. Remaining

Phases 4–5 are done (§3, §1.9–1.11) but need an on-device re-verification pass against the live
backend before being trusted — see the note under the title. **They still need a `POST /categorise`
run against real data first**: with every row uncategorised, the donut is one grey "Uncategorised"
slice and verifies nothing about the category-grouping logic.

### Phase 6 — Settings, and the rest of Budget
Budget config CRUD (`src/store/budgets.tsx`, `(tabs)/budget.tsx`, `resolveBudget` precedence,
bucket-key reconciliation) is done — see §1.11. Still open:
- the onboarding bucket-allocation step (budgets can currently only be set after onboarding, from
  the Budget tab)
- a Settings screen with a "test connection" action (`(tabs)/settings.tsx` is still the 18-line stub)

### Phase 7 — Import (done)
`app/import.tsx`, presented as a modal from the dashboard. `expo-document-picker` → `FormData` with
`{uri, name, type}` (an RN-specific shape; a Blob silently uploads nothing) → XHR multipart upload
with real progress → `202 {files, job_id}` → polls `GET /ingest/jobs/{job_id}` every 3s (matching
the server's `Retry-After`) up to a 220-attempt cap, guarded by a generation counter so a stale poll
loop can't clobber a new upload → renders per-file results and categorisation stats, with a
`POST /categorise` retry when the job fails. Invalidates transactions/summary/categories on
completion. Not yet verified on-device against the live backend.

### Phase 8 — Category management
Carve / soft-delete / reassign. Deliberately last: it is the only screen that destructively
rewrites historical data, and the contract notes `carved_from` has never run against real data or a
real LLM provider. Needs the loudest confirmations in the app.

### Phase 9 — Offline and polish
Query-cache persistence to AsyncStorage, `onlineManager` ← NetInfo, `focusManager` ← AppState,
`KeyboardAvoidingView` on the form screens, pressed states, Reanimated transitions.

### Cross-cutting, not yet started
- **Tests.** None exist. Plan: `jest-expo` + `@testing-library/react-native`, MSW v2 (`msw/native`).
  Highest value first: `money`, `period`, `categoryColor`, `categoryTree`, `budget`,
  `dashboardStats` — `resolveBudget`'s scope precedence and `mostRecentPeriodWithData` are the two
  most likely to have an off-by-one nobody notices without a test; then contract fixtures for the
  degenerate cases (`categorised: {}`, `category: null`, positive amounts, 401/403, empty summary);
  then a focus-retention regression test; then Maestro for ~4 E2E flows.
- **Global 403 handling.** `ApiAuthError` is typed and thrown, but nothing yet subscribes to the
  query cache to clear credentials and route back to onboarding.
- **Android cleartext HTTP.** Works in Expo Go; a standalone/dev build over plain `http://` will
  need `usesCleartextTraffic` via a config plugin.

---

## 5. Asks of the backend

1. **`POST /ingest` multipart** — agreed, in progress. Keep the `{files, categorised}` response.
2. **`PATCH /transactions/{id}`** — there is no way to correct a wrong category. Rows already carry
   `is_category_manual`, implying the concept exists. With LLM categorisation this is the most
   likely first user complaint, and it is cheap to add now versus retrofitting the UI later.
3. **Update the contract's auth section** to document 401-vs-403 (§2).
4. **Reconcile the uncategorised naming** — `null`, `"Uncategorised"` and `"Unknown"` are currently
   three names for one concept across three endpoints.

---

## 6. Running it

```bash
# Backend (from Treasure-Chest-Records-Backend/)
docker compose up -d --build          # serves 0.0.0.0:8000

# Frontend (from this directory)
npm install
npx expo start --android              # emulator must be running
```

In onboarding, the server address must be **`http://10.0.2.2:8000`** on an Android emulator —
`localhost` resolves to the device itself, never the host. The API key is the backend's
`FAST_API_KEY`.

If the emulator dies mid-bundle it is usually host memory; relaunch with
`emulator -avd <name> -gpu swiftshader_indirect`.
