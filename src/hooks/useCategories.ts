import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { endpoints } from '@/lib/api/endpoints';
import { qk } from '@/lib/api/queryClient';
import { buildCategoryTree } from '@/lib/categoryTree';
import { useApi, useApiReady } from './useApi';

/**
 * The taxonomy underpins colours, pickers, budget buckets and chart legends,
 * so it is fetched once and shared. Categories change only when the user edits
 * them or an import mints a new one, both of which invalidate this key.
 */
export function useCategories(includeInactive = false) {
  const api = useApi();
  const ready = useApiReady();

  const query = useQuery({
    queryKey: qk.categories(includeInactive),
    queryFn: () => endpoints.categories(api, includeInactive),
    enabled: ready,
    staleTime: 5 * 60_000,
  });

  const tree = useMemo(() => buildCategoryTree(query.data ?? []), [query.data]);

  return { ...query, tree };
}
