import type { Api, UploadFile } from './client';
import type {
  Category,
  CategoriseStats,
  CreateCategoryResponse,
  DeleteCategoryResponse,
  IngestResponse,
  Period,
  SummaryRow,
  Transaction,
  TransactionQuery,
} from './types';

export const DEFAULT_PAGE_SIZE = 50;

export const endpoints = {
  /**
   * Multipart CSV/PDF upload. The response keeps the `{files, categorised}`
   * object shape documented for the inbox-scanning version of this endpoint,
   * with `files` holding a single entry for the uploaded file.
   */
  ingest: (api: Api, file: UploadFile, onProgress?: (pct: number) => void) =>
    api.upload<IngestResponse>('/ingest', file, onProgress),

  /** Standalone re-run of the categorisation pipeline. No body. */
  categorise: (api: Api) => api.post<CategoriseStats>('/categorise'),

  transactions: (api: Api, q: TransactionQuery = {}) =>
    api.get<Transaction[]>('/transactions', {
      date_from: q.date_from,
      date_to: q.date_to,
      category: q.category,
      retrieve_limit: q.retrieve_limit ?? DEFAULT_PAGE_SIZE,
      offset: q.offset ?? 0,
    }),

  /** Defaults to the current month server-side when `period` is omitted. */
  summary: (api: Api, period?: Period, rollup = false) =>
    api.get<SummaryRow[]>('/summary', { period, rollup }),

  /** Always the trailing 12 months; takes no date params. */
  monthlySummary: (api: Api, rollup = false) =>
    api.get<SummaryRow[]>('/summary/monthly', { rollup }),

  categories: (api: Api, includeInactive = false) =>
    api.get<Category[]>('/categories', { include_inactive: includeInactive }),

  /**
   * `carved_from` accepts at most one parent. An empty array is a plain
   * top-level add; one entry carves a child and may trigger batched LLM
   * re-derivation of every merchant under the parent.
   */
  createCategory: (api: Api, name: string, carvedFrom: string[] = []) =>
    api.post<CreateCategoryResponse>('/categories', {
      name,
      carved_from: carvedFrom,
    }),

  /** Without `reassignTo` this is a soft delete (is_active = false). */
  deleteCategory: (api: Api, name: string, reassignTo?: string) =>
    api.delete<DeleteCategoryResponse>(`/categories/${encodeURIComponent(name)}`, {
      reassign_to: reassignTo,
    }),
};
