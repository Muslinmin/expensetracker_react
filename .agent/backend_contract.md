# Treasure Chest Records — Backend API Contract

This is the interface contract for any frontend (Flutter, web, or otherwise) talking to this
backend. It documents exact request/response shapes as implemented today — not the aspirational
design. For internal architecture, data model rationale, and known gaps, see
[`.agent/architecture_and_progress.md`](.agent/architecture_and_progress.md).

## Base URL & Auth

Every endpoint on every router requires a Bearer token:

```
Authorization: Bearer <FAST_API_KEY>
```

Missing token → `401 {"detail": "Not authenticated"}` (FastAPI's `HTTPBearer` default). Present
but wrong token → `403 Forbidden`, no body. There is no separate login flow — the token is a single
shared secret provisioned out of band (the server's `.env`).

There is no CORS middleware. Native clients are unaffected; a browser-hosted client on a different
origin would fail the preflight and needs `CORSMiddleware` added server-side first.

## Conventions

- **Money** is always **integer cents**, signed — negative for debits/expenses, positive for
  credits/income (e.g. `-1320` = -$13.20, `45000` = $450.00). The server never converts to
  dollars; the frontend formats.
- **Dates**: `transaction_date`, `date_from`, `date_to` are ISO-8601 `YYYY-MM-DD`. `period` (on
  summaries) is `YYYY-MM`.
- **`category`** on a transaction can be `null` — categorisation runs automatically right after
  ingest, but a row can still be mid-pipeline or fall through to `"Unknown"`.
- **The category taxonomy is dynamic, not a hardcoded enum.** Always fetch it from
  `GET /categories` rather than hardcoding a category list in the frontend — categories can be
  added, renamed, or deactivated at runtime.
- All error responses use FastAPI's default shape: `{"detail": "<message>"}`.

---

## `POST /ingest`

Ingests one or more CSV files sent directly in the request. The upload phase (parse, dedupe,
insert, recompute summaries) is synchronous and DB-only, so it returns quickly. Categorisation of
the newly inserted rows depends on an external LLM provider with unbounded latency, so it runs as
a **background job** after the response is sent — poll `GET /ingest/jobs/{job_id}` for its outcome.

**Request:** `multipart/form-data`, one or more files under the `files` field. Nothing is retained
server-side: each upload is staged to a temp directory for parsing and discarded once the request
completes. There is no archive and no watched inbox folder.

**Response `202 Accepted`** with a `Location: /ingest/jobs/{job_id}` header:

```json
{
  "files": [
    {"file": "march.csv", "status": "ok", "inserted": 47, "skipped": 0},
    {"file": "bad.csv", "status": "failed", "error": "Records are empty ! []"}
  ],
  "job_id": "3f1c9a0e-5d2b-4c8e-9a7f-0b1c2d3e4f5a",
  "status_url": "/ingest/jobs/3f1c9a0e-5d2b-4c8e-9a7f-0b1c2d3e4f5a"
}
```

- `files` is empty (`[]`) if no files were sent (FastAPI actually rejects a request with no `files`
  part with `422`, so in practice a client always sends at least one).
- A file whose name doesn't end in `.csv` is reported as a `"failed"` entry (`"error": "Not a CSV
  file: <name>"`) rather than being silently ignored. Validation is by extension only; the MIME
  type of the part is not checked.
- The parser expects the bank's export layout: a preamble, then a header row containing
  `Transaction Date`, `Transaction Code`, `Description`, `Transaction Ref1..3`, `Status`,
  `Debit Amount`, `Credit Amount`, with dates formatted like `20 May 2026`. Any other layout fails
  that file with `"Headers are empty !"`.
- `skipped` counts rows already held by the database. Dedupe is per-fingerprint count
  reconciliation, so re-uploading the same export is a success with `inserted: 0`, not an error.
- Each file is committed independently: one bad file never rolls back another that succeeded.
- A job is always created, even if every file failed. In that case the job completes almost
  immediately with `rows: 0` and makes no LLM call.
- Money values inside newly-inserted rows aren't returned here — call `GET /transactions` /
  `GET /summary` afterward to read the actual data.

## `GET /ingest/jobs/{job_id}`

Poll for the categorisation job kicked off by `POST /ingest`.

**Response `200`:**

```json
{
  "job_id": "3f1c9a0e-5d2b-4c8e-9a7f-0b1c2d3e4f5a",
  "status": "completed",
  "result": {
    "rows": 47,
    "resolved_by_rules": 12,
    "resolved_unknown_no_key": 0,
    "resolved_by_cache": 20,
    "resolved_by_cluster": 5,
    "resolved_by_fuzzy": 2,
    "resolved_by_llm": 8,
    "llm_batches_attempted": 1,
    "llm_batches_failed": 0
  },
  "error": null
}
```

- `status` is one of `pending` | `running` | `completed` | `failed`. While `pending` or `running`
  the response carries a `Retry-After: 3` header; poll at that cadence.
- `result` is populated only once `status` is `completed`; `error` only once `failed`. Both are
  `null` otherwise.
- `result.llm_batches_failed > 0` on a `completed` job means some rows are still uncategorised
  (a per-batch provider failure is caught and counted, not raised). `POST /categorise` backfills
  them.
- A job goes to `failed` in three ways: an unexpected exception in the categoriser
  (`"unexpected failure during categorisation"`); the server restarting mid-job
  (`"interrupted by server restart"`, reconciled at startup); or no progress for over 10 minutes
  while `running` (`"stale: no progress detected"`, detected lazily on the next poll). Either way
  a client always converges to a terminal status — but keep a client-side attempt cap regardless.
- **Ingest results are never affected by a failed job.** The rows from `files` are already
  committed before the job starts; a failed job just leaves them with `category: null`.
- Unknown `job_id` → `404 {"detail": "Job not found"}`.

> **Breaking change history:** this endpoint originally took no request body (it scanned a
> server-side inbox folder) and returned a bare JSON array. It then moved to `multipart/form-data`
> with a `200 {files, categorised}` response that blocked on categorisation. It now returns `202`
> with a `job_id` instead of inline `categorised` stats — a client written against the `200` shape
> must switch to polling the job endpoint to get those stats.

---

## `GET /transactions`

| Query param | Type | Default | Notes |
|---|---|---|---|
| `date_from` | `YYYY-MM-DD` | none | inclusive |
| `date_to` | `YYYY-MM-DD` | none | inclusive |
| `category` | string | none | case-insensitive exact match |
| `retrieve_limit` | int | `50` | |
| `offset` | int | `0` | |

**Response `200`:** array of

```json
{
  "id": 123,
  "transaction_date": "2026-05-20",
  "amount_cents": -1320,
  "description": "SUBWAY @ TEST MALL SGP 19MAY XXXX-XXXX-XXXX-XXXX",
  "transaction_code": "UMC-S",
  "vendor_name": "SUBWAY @ TEST MALL     SGP 19MAY",
  "category": "Dining & Takeout",
  "is_settled": true,
  "is_category_manual": false
}
```

---

## `GET /summary`

| Query param | Type | Default |
|---|---|---|
| `period` | `YYYY-MM` | current month |
| `rollup` | bool | `false` |

**Response `200`:** array of

```json
{
  "period": "2026-05",
  "category": "Dining & Takeout",
  "total_cents": -4520,
  "tx_count": 3,
  "updated_at": "2026-05-22T14:03:11"
}
```

One row per category present in that period — categories with zero transactions in the period
don't appear. Sum `total_cents` across the array yourself if you need a period total.

`?rollup=true` groups rows by parent category instead of returning every leaf: a `"Coffee"` row and
a `"Dining & Takeout (Other)"` row both fold into one `"Dining & Takeout"` row with summed
`total_cents`/`tx_count`. Categories with no parent (and no hierarchy at all) are unaffected — every
row appears exactly once either way, this only changes which name/grouping it appears under. See
[Category Hierarchy](.agent/architecture_and_progress.md#category-hierarchy-v13)
below.

## `GET /summary/monthly`

| Query param | Type | Default |
|---|---|---|
| `rollup` | bool | `false` |

Otherwise no query params — always the trailing 12 months from today. Same row shape and `rollup`
behaviour as `GET /summary`, one row per `(period, category)` combination across the whole window.

---

## `POST /categorise`

Standalone re-run of the same categorisation pipeline `POST /ingest` triggers automatically, over
every uncategorised row in the table (not scoped to one upload). Useful for backfilling rows that
were never categorised (e.g. after a provider outage) without re-ingesting anything.

Unlike `POST /ingest`, this is **synchronous**: the request blocks until the LLM finishes, so use no
client timeout.

**Request:** no body. **Response `200`:** the same stats object shown under `result` in
`GET /ingest/jobs/{job_id}` above.

---

## `GET /categories`

| Query param | Type | Default |
|---|---|---|
| `include_inactive` | bool | `false` |

**Response `200`:** array of

```json
{"name": "Coffee", "is_system": false, "is_active": true, "created_at": "2026-08-05T00:00:00", "parent_name": "Dining & Takeout"}
```

`parent_name` is `null` for a top-level category. A category with children (a "stem") holds no
transactions of its own — see
[Category Hierarchy](.agent/architecture_and_progress.md#category-hierarchy-v13). `is_system: true`
categories (`Unknown`, `Transfer In`, `Transfer Out`, `Interest`, `Income`) are reserved and can
never be deleted or deactivated. Use this endpoint to populate any category picker — don't
hardcode the list.

## `POST /categories`

**Request body:**

```json
{"name": "Coffee", "carved_from": ["Dining & Takeout"]}
```

- `carved_from` is optional (defaults to `[]`), and supports **at most one** parent — multi-parent
  categories aren't supported.
- `[]` (or omitted) → plain new top-level category, no other effect.
- One entry → carves `name` out as a child leaf of that parent. The parent must currently be
  top-level (carving from an already-carved leaf is rejected). The first carve under a given parent
  promotes it to a stem and auto-creates a `"<Parent> (Other)"` catch-all sibling that absorbs
  everything the parent held directly; every merchant already filed under the parent (or, on later
  carves, under the catch-all) is then re-derived — reassigned to `name` if it belongs there, left
  in the catch-all otherwise. Every re-derivation decision goes through the LLM (batched, same as
  `POST /ingest`) — a merchant's own name is not treated as reliable evidence of what a purchase
  there was for (e.g. "May's Coffee" could easily have sold a sandwich, not coffee), so there's no
  free shortcut and the call may take a moment.

**Response `201`/`200`:**

```json
{
  "category": {"name": "Coffee", "is_system": false, "is_active": true, "created_at": "2026-08-05T00:00:00", "parent_name": "Dining & Takeout"},
  "catch_all_created": "Dining & Takeout (Other)",
  "rederivation": {
    "candidates": 12, "resolved_by_llm": 7,
    "llm_batches_attempted": 1, "llm_batches_failed": 0
  },
  "recomputed_periods": ["2026-04", "2026-05"]
}
```

`catch_all_created` is `null` for a plain `carved_from: []` addition, and also `null` on the
*second* carve under a parent (the catch-all already exists from the first). `rederivation` is
`null` whenever `carved_from` is empty.

**Errors:** `400 {"detail": "..."}` — the name already exists, `carved_from` has more than one
entry, or its single entry isn't a real/active/currently-top-level category.

## `DELETE /categories/{name}`

| Query param | Type | Default |
|---|---|---|
| `reassign_to` | string | none |

- **No `reassign_to`** → soft delete: sets `is_active = false`. Existing transactions keep the
  label. Response: `{"name": "...", "status": "deactivated"}`.
- **With `reassign_to`** → hard delete: bulk-reassigns every transaction (and cached merchant
  mapping) from `name` to `reassign_to`, deletes `name` from the taxonomy, and recomputes every
  affected month's summary. Response:
  ```json
  {"name": "Old Category", "status": "deleted", "reassigned_to": "New Category", "recomputed_periods": ["2026-05", "2026-06"]}
  ```

**Errors:** `400 {"detail": "..."}` — the category doesn't exist, is a system category (never
deletable), has subcategories carved from it (delete/reassign those first), `reassign_to` isn't a
real/active category, or `reassign_to` itself has subcategories (a stem can't hold transactions).

---

## Known Gaps Relevant to a Frontend

See [`.agent/architecture_and_progress.md`](.agent/architecture_and_progress.md) for the full list.
The ones that actually affect client behavior:

- `POST /categories`'s `carved_from` is now fully functional (creates the parent/child link,
  auto-generates the `"(Other)"` catch-all, and re-derives affected merchants) — see
  [Category Hierarchy](.agent/architecture_and_progress.md#category-hierarchy-v13) in the
  architecture doc. It has never run against the real (private) transaction history or a real LLM
  provider, only synthetic fixtures and a stub categoriser — see Known Gaps there.
- `POST /ingest` returns `202` and a `job_id`; categorisation stats come from polling
  `GET /ingest/jobs/{job_id}` (see the breaking-change history above).
- LLM-driven categorisation may take a noticeable pause on the *first* upload after a large
  backfill (many new merchants in one batch). Because it runs as a background job this no longer
  holds the `POST /ingest` response open, but the job will sit in `running` for that long —
  subsequent uploads are fast (steady-state is usually 0–2 new merchants per import).
- Jobs run in-process, not in a queue. A server restart fails any job in flight; the rows it was
  categorising stay `category: null` until `POST /categorise` is run.
