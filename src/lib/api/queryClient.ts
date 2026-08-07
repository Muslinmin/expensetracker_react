import { QueryClient } from '@tanstack/react-query';

import { ApiAuthError } from './client';
import type { Period, TransactionQuery } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // A rejected key will never succeed on retry, and retrying just delays
      // the redirect to onboarding by several seconds.
      retry: (failureCount, error) =>
        !(error instanceof ApiAuthError) && failureCount < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export const qk = {
  categories: (includeInactive = false) => ['categories', includeInactive] as const,
  summary: (period: Period | undefined, rollup: boolean) =>
    ['summary', period ?? 'current', rollup] as const,
  monthlySummary: (rollup: boolean) => ['summary', 'monthly', rollup] as const,
  transactions: (q: TransactionQuery) => ['transactions', q] as const,
};

/**
 * Ingest and taxonomy edits both rewrite history server-side, so everything
 * derived from transactions has to go. Categories are included because
 * categorisation can mint rows under previously unseen names.
 */
export function invalidateAfterDataChange(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['transactions'] }),
    client.invalidateQueries({ queryKey: ['summary'] }),
    client.invalidateQueries({ queryKey: ['categories'] }),
  ]);
}
