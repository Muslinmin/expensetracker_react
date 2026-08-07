import { useQuery } from '@tanstack/react-query';

import type { Api } from '@/lib/api/client';
import { DEFAULT_PAGE_SIZE, endpoints } from '@/lib/api/endpoints';
import type { Transaction } from '@/lib/api/types';
import type { DateRange } from '@/lib/period';
import { useApi, useApiReady } from './useApi';

/** Safety valve so a huge range can't page forever. 1000 rows per category. */
const MAX_PAGES = 20;

async function fetchAllPages(
  api: Api,
  range: DateRange,
  category: string | undefined,
): Promise<{ rows: Transaction[]; truncated: boolean }> {
  const rows: Transaction[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await endpoints.transactions(api, {
      ...range,
      category,
      retrieve_limit: DEFAULT_PAGE_SIZE,
      offset: page * DEFAULT_PAGE_SIZE,
    });
    rows.push(...batch);
    // A short page means we've reached the end; the API returns no total.
    if (batch.length < DEFAULT_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export interface TransactionsFilter {
  range: DateRange;
  /**
   * Categories to include. Empty means "all" (no `category` param).
   * A stem must already be expanded to its children by the caller — the API
   * matches exactly, and a stem holds no transactions of its own.
   */
  categories: string[];
}

/**
 * Fetches every transaction in the selected range rather than paging the UI.
 *
 * `/transactions` returns a bare array with no total count, so an offset-based
 * infinite list can never show "N of M" and can't merge multiple category
 * queries coherently. A bounded date range is small enough (a month is tens to
 * low hundreds of rows) to fetch fully, which makes counts exact and lets a
 * stem selection be several queries merged and re-sorted.
 */
export function useTransactions({ range, categories }: TransactionsFilter) {
  const api = useApi();
  const ready = useApiReady();

  return useQuery({
    queryKey: ['transactions', range.date_from, range.date_to, [...categories].sort()],
    enabled: ready,
    queryFn: async () => {
      const targets: (string | undefined)[] = categories.length > 0 ? categories : [undefined];
      const results = await Promise.all(targets.map(cat => fetchAllPages(api, range, cat)));

      const rows = results.flatMap(r => r.rows);
      // Merging several category queries loses the server's ordering.
      rows.sort((a, b) =>
        a.transaction_date === b.transaction_date
          ? b.id - a.id
          : a.transaction_date < b.transaction_date
            ? 1
            : -1,
      );

      return { rows, truncated: results.some(r => r.truncated) };
    },
  });
}
