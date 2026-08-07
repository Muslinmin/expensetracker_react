/**
 * Wire shapes from `.agent/backend_contract.md`, as implemented today.
 *
 * Two conventions run through all of it:
 *  - money is *signed integer cents* (negative = debit). Never widen to float.
 *  - the category taxonomy is dynamic; nothing here may be narrowed to a union.
 */

/** ISO-8601 `YYYY-MM-DD`. */
export type IsoDate = string;
/** `YYYY-MM`. */
export type Period = string;

export interface Transaction {
  id: number;
  transaction_date: IsoDate;
  amount_cents: number;
  description: string;
  transaction_code: string;
  vendor_name: string;
  /** Null while mid-pipeline, or when categorisation fell through. */
  category: string | null;
  is_settled: boolean;
  is_category_manual: boolean;
}

export interface SummaryRow {
  period: Period;
  category: string;
  total_cents: number;
  tx_count: number;
  updated_at: string;
}

export interface Category {
  name: string;
  /** Reserved: Unknown, Transfer In, Transfer Out, Interest, Income. */
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  /** Null for a top-level category. */
  parent_name: string | null;
}

export interface CategoriseStats {
  rows: number;
  resolved_by_rules: number;
  resolved_unknown_no_key: number;
  resolved_by_cache: number;
  resolved_by_cluster: number;
  resolved_by_fuzzy: number;
  resolved_by_llm: number;
  llm_batches_attempted: number;
  llm_batches_failed: number;
}

export interface IngestFileResult {
  file: string;
  status: 'ok' | 'failed';
  inserted?: number;
  skipped?: number;
  error?: string;
}

export interface IngestResponse {
  files: IngestFileResult[];
  /** `{}` when the categorisation step itself failed; ingest still committed. */
  categorised: CategoriseStats | Record<string, never>;
}

export interface CreateCategoryResponse {
  category: Category;
  catch_all_created: string | null;
  rederivation: {
    candidates: number;
    resolved_by_llm: number;
    llm_batches_attempted: number;
    llm_batches_failed: number;
  } | null;
  recomputed_periods: Period[];
}

export type DeleteCategoryResponse =
  | { name: string; status: 'deactivated' }
  | {
      name: string;
      status: 'deleted';
      reassigned_to: string;
      recomputed_periods: Period[];
    };

export interface TransactionQuery {
  date_from?: IsoDate;
  date_to?: IsoDate;
  category?: string;
  retrieve_limit?: number;
  offset?: number;
}

/** True when `/ingest` reported rows but categorisation returned `{}`. */
export function categorisationFailed(r: IngestResponse): boolean {
  return Object.keys(r.categorised).length === 0;
}

export function ingestInsertedCount(r: IngestResponse): number {
  return r.files.reduce((n, f) => n + (f.inserted ?? 0), 0);
}
