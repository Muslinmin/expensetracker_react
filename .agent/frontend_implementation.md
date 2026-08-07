# XPNS Mobile Frontend — Decisions, Status, and Remaining Work

React Native (Expo) client for the Treasure Chest Records backend. This document records what was
decided and why, what actually exists in the repo today, and what is left. For the wire format see
`.agent/backend_contract.md`; where this document and the contract disagree, **this document is
correct** — see [Contract Corrections](#contract-corrections-verified-against-the-running-backend).

Last verified against the live backend on 2026-08-07 (473 real transactions rendering on an
Android emulator).

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
| `recharts` | TBD (Phase 4) | Full rewrite; tooltips must become tap-to-select |
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

All of the below runs on an Android emulator against the live backend. `tsc --noEmit` is clean.

### Foundation
| File | Purpose |
|---|---|
| `src/theme/tokens.ts` | Light/dark palettes from `theme.css`, 12-colour category palette, spacing, font families, `tabularNums` |
| `src/theme/ThemeProvider.tsx` | Theme from user preference (not OS scheme — the design presents it as a choice) |
| `src/store/settings.tsx` | Prefs in AsyncStorage, server key in SecureStore, hydration gate, `clearCredentials()` for 403 recovery |
| `src/app/_layout.tsx` | Providers, font loading, real splash gate, route guard (un-onboarded users cannot reach the tabs) |
| `src/app/(tabs)/_layout.tsx` | Four tabs with lucide icons and mono uppercase labels |

### API layer
| File | Purpose |
|---|---|
| `src/lib/api/types.ts` | Every wire shape; nothing narrowed to a union |
| `src/lib/api/client.ts` | Factory (not a singleton — credentials change at runtime), `ApiError` / `ApiAuthError` / `ApiNetworkError`, XHR multipart upload with progress |
| `src/lib/api/endpoints.ts` | One typed function per contract endpoint |
| `src/lib/api/queryClient.ts` | Query keys, auth-aware retry policy, invalidation groups |
| `src/hooks/useApi.ts` | Client memoised on base URL + key |

### Pure logic (platform-agnostic, would survive a web client)
| File | Purpose |
|---|---|
| `src/lib/money.ts` | Cents-only arithmetic, sign-aware formatting, `NON_SPEND_CATEGORIES` |
| `src/lib/period.ts` | Local-calendar date maths (never `toISOString()`), presets → ranges, labels |
| `src/lib/categoryTree.ts` | Flat list → tree, stem/leaf, `expand()`, uncategorised normalisation |
| `src/lib/categoryColor.ts` | Deterministic hash → palette, hierarchy-aware lightness shifts |

### Components and screens
| File | Purpose |
|---|---|
| `src/components/base.tsx` | `Sans`/`Mono`/`Eyebrow`, `Card`, `Button`, `Field`, `Loading`, `EmptyState`, `ErrorState` |
| `src/components/Select.tsx` | Modal picker with swatches, indentation, stem hints |
| `src/components/CategoryChip.tsx` | Nullable-safe category chip |
| `src/app/onboarding.tsx` | Welcome + connection steps, live key validation, emulator-aware error hints |
| `src/app/(tabs)/transactions.tsx` | **Complete** — period/category filters, stem expansion, exact counts, sign-aware rows, pending flag |

### Scaffold bugs fixed rather than ported
- `Field` and `Dropdown` were declared **inside** the render bodies of the scaffold's onboarding,
  settings and transactions screens. Every keystroke created a new component type, remounting the
  input and dropping focus — on mobile that also dismisses the keyboard on each character. All are
  now module-scope. Verified: a 9-character name types without losing focus.
- Dropdowns that never closed on outside click are now `Modal`s, which handle dismissal themselves.
- The fake 1.6-second splash timer is now a real gate on fonts + storage hydration.
- Hardcoded `"2026-08"` / `"AUGUST 2026"` / a fixed 2026–2027 month list are gone.

---

## 4. Remaining

Ordered as intended. Phases 4–5 are best done after a `POST /categorise` run — with every row
uncategorised, a donut chart of one grey slice verifies nothing.

### Phase 4 — Charts
Category donut and 12-month trend line. Library not yet chosen: `victory-native` XL (Skia-backed,
bundled in Expo Go, strong gesture support) or `react-native-gifted-charts` (lighter, only needs
`react-native-svg`). **Both chart tooltips must be redesigned** — the scaffold's are hover-driven
and there is no hover on touch; they need tap-to-select with a persistent readout.

### Phase 5 — Dashboard
Balance card, donut, trend, budget bars. Must:
- default to the most recent period **with data** (see §2)
- exclude income/transfers from "total spent" via `isSpendCategory()`
- use `magnitude()` for chart values — negative slices render unpredictably

### Phase 6 — Budget + Settings
`src/store/budgets.tsx`, `resolveBudget(configs, period)` with `month > period > continuous`
precedence, bucket-key reconciliation against live categories, the onboarding bucket-allocation
step, and a Settings screen with a "test connection" action.

### Phase 7 — Import
Blocked on the backend's multipart `/ingest`. `expo-document-picker` → `FormData` with
`{uri, name, type}` (an RN-specific shape; a Blob silently uploads nothing), real upload progress,
result rendering, and handling of `categorised: {}`.

### Phase 8 — Category management
Carve / soft-delete / reassign. Deliberately last: it is the only screen that destructively
rewrites historical data, and the contract notes `carved_from` has never run against real data or a
real LLM provider. Needs the loudest confirmations in the app.

### Phase 9 — Offline and polish
Query-cache persistence to AsyncStorage, `onlineManager` ← NetInfo, `focusManager` ← AppState,
`KeyboardAvoidingView` on the form screens, pressed states, Reanimated transitions.

### Cross-cutting, not yet started
- **Tests.** None exist. Plan: `jest-expo` + `@testing-library/react-native`, MSW v2 (`msw/native`).
  Highest value first: `money`, `period`, `categoryColor`, `categoryTree`, `budget`; then contract
  fixtures for the degenerate cases (`categorised: {}`, `category: null`, positive amounts, 401/403,
  empty summary); then a focus-retention regression test; then Maestro for ~4 E2E flows.
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
