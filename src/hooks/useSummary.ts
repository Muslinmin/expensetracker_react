import { useQuery } from '@tanstack/react-query';

import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/api/queryClient';
import { useApi, useApiReady } from './useApi';

/**
 * Always the trailing 12 months. One fetch covers both the trend chart and
 * the Dashboard's current-period figures — the selected period is always
 * inside this window (see `mostRecentPeriodWithData` in lib/period.ts), so
 * there is no need for a second `/summary` call scoped to just that period.
 */
export function useMonthlySummary(rollup = false) {
  const api = useApi();
  const ready = useApiReady();

  return useQuery({
    queryKey: qk.monthlySummary(rollup),
    queryFn: () => endpoints.monthlySummary(api, rollup),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
}
