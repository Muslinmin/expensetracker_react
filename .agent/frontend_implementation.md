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

### 1.12 OCR/PDF extraction: one `OcrEngine` interface, engines swapped in behind it

PDF statement import needs OCR for scanned statements and can use cheaper text-layer extraction
for born-digital ones — and which library wins on accuracy/speed/footprint is an open question
being benchmarked, not a settled choice. So `src/lib/ocr/types.ts` defines a small `OcrEngine`
interface (`id`, `label`, `isAvailable()`, `extractPdf()`) and `registry.ts` is the one place that
maps an id to an implementation. The import screen and the future benchmark harness both call
`getOcrEngine(id).extractPdf(uri)` — neither knows or cares which library is behind it. Adding an
engine means writing one adapter and adding one line to the registry.

`pdfjs` (`src/lib/ocr/engines/pdfjs.ts` + `pdfjsBridge.tsx`) is the first engine, and the only one
that needs no native module — everything else on the shortlist (ML Kit, expo-pdf-text-extract,
PaddleOCR) requires a custom dev client, so pdf.js is what's actually running in Expo Go today.
See Phase 10 (§4) for how it works and the gotchas that cost the most time getting it there.

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

### Phase 10 — PDF statement import (OCR) — in progress, branch `feat/pdf-ocr-import`

Goal: pick a PDF bank statement, extract it entirely on-device (privacy requirement — raw
statement bytes/images never leave the device unmasked), and feed the result through the same
pipeline `/ingest` already accepts. Card numbers must never reach the server unmasked; see §1.12
for why this is behind a swappable `OcrEngine` interface rather than one hardcoded library.

**Done and verified on an Android emulator (2026-09-13):**
- `Import PDF Statement` button on the import screen (`src/app/import.tsx`), alongside the existing
  CSV picker.
- The `pdfjs` engine (§1.12) end-to-end: a born-digital PDF returns its exact text, a scanned PDF
  correctly reports "no text layer found" with no crash — the screen shows a text-layer preview or
  that message accordingly.
- The `mlkit` engine (`src/lib/ocr/engines/mlkit.ts`), wired as the automatic fallback when `pdfjs`
  finds zero lines: renders each page via the same pdf.js WebView bridge (`renderPdfPages` in
  `pdfjsBridge.tsx`) rather than adding a second native PDF-rendering module, writes each page to a
  temp PNG, and runs `@react-native-ml-kit/text-recognition` (genuinely on-device — confirmed no
  network call for the standard Text Recognition API) on it. Verified working end-to-end on a
  born-digital-JPEG-image PDF: recovered the exact header text ("SAMPLE / Statement of Account /
  12345678 / JAMES C. MORRISON / …", 104 lines total) via real OCR, not the text layer.
- Turning extracted text into transactions is **not** wired up yet on either engine; the import
  screen only shows a preview to prove extraction works, it inserts nothing.

**Known limitation, not fixed — scanned statements using 1-bit `/ImageMask` encoding OCR as
empty.** Many scanners use `/ImageMask` (a fax-style 1-bit compression for B&W text pages) rather
than a plain JPEG page image. Rendering that through pdf.js onto this WebView's `<canvas>` comes
out at extremely low effective contrast — measured around gray 210-250 instead of black; borders
and rules (vector-drawn) stay crisp, but the actual text pixels are nearly indistinguishable from
white, so ML Kit's OCR call succeeds but returns zero blocks. Confirmed by pulling the actual
rendered PNG off-device (`adb exec-out run-as <pkg> cat .../cache/mlkit-page-*.png`) and inspecting
it directly — the table borders were crisp, the transaction text was a faint ghost.

Two fixes were tried and both rejected:
- A fixed brightness threshold (e.g. "gray ≥235 → white, else black") recovers the `/ImageMask`
  text, but there is no single constant that works for both cases: a normal antialiased scan's
  text is already near-black, and the same threshold that recovers the washed-out mask garbles
  that case into unreadable noise (verified: OCR on a real JPEG page went from correct text to
  "ecount / Ageount / Tcdor / 193:" after adding the threshold).
- Otsu's method (adaptive per-image threshold, the theoretically correct fix — it separates each
  image's own two histogram peaks instead of guessing a constant) hung for 90+ seconds with zero
  progress on a multi-megapixel canvas. Never diagnosed further — likely `getImageData`/
  `putImageData` cost in this WebView's canvas backend at that resolution, not a logic bug in the
  Otsu implementation itself (it's a bounded double pass over the pixel buffer). Reverted rather
  than ship a hang.

Current shipped behavior: `renderPages` in `pdfjsBridge.tsx` does a plain, fast, unmodified render
at scale 2 — correct and fast for normal scans, silently returns nothing useful for `/ImageMask`
scans. Fixing that properly needs either a cheap adaptive threshold that doesn't choke on a large
canvas (e.g. downsample before histogramming, or sample a subset of pixels instead of all of
them), or investigating why pdf.js renders `/ImageMask` at reduced opacity on this WebView in the
first place.

**Gotchas that ate the debugging time, kept here so nobody re-discovers them the slow way:**
1. **A 0×0 `<WebView>` gets throttled by Chromium and never runs its JS at all.** The hidden bridge
   host must be a real but off-screen size (1×1, positioned off-screen) — not `width: 0, height: 0`
   — or every message just hangs forever with zero error.
2. **`<script type="module" src={blobUrl}>` silently never executes past the static `import`
   line** on this Android WebView (148.x) — `onload` fires, no error fires, `window.pdfjsLib`
   never gets set. Switching to dynamic `import(blobUrl)` with an explicit `.then/.catch` fixed it
   outright. Don't use the static form for a blob-sourced module script here.
3. **pdf.js 6.x hard-throws `No "GlobalWorkerOptions.workerSrc" specified"`** — there is no silent
   main-thread fallback in this version (older pdf.js had one; assume it's gone). The worker
   (`pdf.worker.min.mjs`, ~1.3MB) has to be bundled and set as a Blob URL same as the main library.
4. **Metro does not pick up a brand-new file under `assets/` for an already-running dev server.**
   Adding `pdfjs-worker.rawjs` after Metro had started produced a silent, permanent hang with zero
   log output — not an error. A full `expo start --clear` restart was required. If a newly-added
   asset "just hangs" with no error, restart Metro before debugging anything else.
5. **The very first asset download after a cold Expo Go launch is flaky** (`ExpoAsset.downloadAsync`
   rejects "Unable to download asset") but has reliably succeeded on an immediate retry every time
   it's been hit. Looks like an Expo Go networking race on process start, not a code bug — don't
   sink time into it, just retry once.
6. Both pdf.js build files are bundled locally (`assets/vendor/pdfjs-main.rawjs`,
   `pdfjs-worker.rawjs`, registered as a Metro asset extension in `metro.config.js`) and injected as
   Blobs rather than fetched from a CDN — keeps extraction fully offline, no library-fetch network
   dependency at runtime either.
7. **`expo run:android`'s first Gradle build failed on `jlink`** (`Execution failed for
   JdkImageTransform`) against the system JDK (Oracle JDK 26 at `/usr/lib/jvm/`) — too new for this
   AGP/Gradle combination. Fix: point `JAVA_HOME` at Android Studio's bundled JBR instead
   (`~/android_studio/android-studio/jbr`, JDK 21) before running Gradle. If a fresh native build
   fails specifically inside a `jlink`/`core-for-system-modules.jar` step, it's the JDK version,
   not the RN/Expo config.
8. **`adb install` failed with "Requested internal only, but not enough space"** — the AVD's
   `disk.dataPartition.size` (`~/.android/avd/<name>.avd/config.ini`) was only 6G and 94% full from
   preinstalled Play Store apps (Chrome, YouTube, Gmail, Maps, …), which `pm uninstall --user 0`
   does *not* reclaim space for (they're preinstalled system packages; that command just hides them
   for the user, the APK bytes stay). Fix: bump `disk.dataPartition.size` in `config.ini` and
   relaunch the emulator with `-wipe-data` to actually apply the new size — a plain restart does
   not resize an existing data image.
9. **The Android document picker ("Recent"/list view) is the reliable way to pick a test file; the
   grid view reached via Documents → Downloads intermittently stopped responding to taps
   entirely** (no visual selection state, no error) across many retries and coordinate recalculations
   confirmed correct via `dumpsys window`/`input`. Backing out to the picker root and reopening from
   "Recent" (list layout) reliably worked every time it was tried. If a picked file "does nothing"
   on tap, try List via Recent before assuming the app's `DocumentPicker` call is broken.
10. `run-as <package> cat <path> > file` is how to pull a file out of an app's private
    `/data/user/0/<pkg>/cache` (or any private dir) on a debuggable build for inspection — plain
    `adb pull` can't read there without root.

**Not started:**
- `expo-pdf-text-extract` and `ppu-paddle-ocr` — the two remaining candidate engines from the
  original research — aren't installed or scaffolded yet.
- Benchmarking the engines against each other (speed/accuracy/footprint) — the actual reason for
  the swappable-engine design — hasn't started; only `pdfjs` and `mlkit` exist to benchmark so far,
  and only on synthetic single-page test fixtures, not a real multi-page statement.
- Fixing the `/ImageMask` rendering limitation above.
- Turning extracted text into transactions and posting to `/ingest` — today's PDF flow stops at a
  preview, it inserts nothing.
- iOS is completely unverified — this machine has no Xcode/Simulator; everything above was tested
  on Android only.

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
