import { useMemo } from 'react';

import { createApi } from '@/lib/api/client';
import { useSettings } from '@/store/settings';

/**
 * The API client rebuilt whenever the base URL or key changes, so a settings
 * edit takes effect on the next query without an app restart.
 */
export function useApi() {
  const { prefs, serverKey } = useSettings();
  return useMemo(
    () => createApi(prefs.apiBaseUrl, serverKey),
    [prefs.apiBaseUrl, serverKey],
  );
}

/** Queries stay disabled until there is something to authenticate with. */
export function useApiReady() {
  const { prefs, serverKey } = useSettings();
  return serverKey.trim().length > 0 && prefs.apiBaseUrl.trim().length > 0;
}
