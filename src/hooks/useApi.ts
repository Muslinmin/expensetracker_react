import { useMemo } from 'react';

import { createApi } from '@/lib/api/client';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';

/**
 * The API client, rebuilt whenever the base URL, the access token or the data
 * key changes. The token in particular is refreshed in the background by
 * supabase-js, so a memoised client keyed on anything less would keep sending
 * an expired one.
 */
export function useApi() {
  const { prefs } = useSettings();
  const { session, dataKey } = useAuth();
  const accessToken = session?.access_token ?? '';
  return useMemo(
    () => createApi(prefs.apiBaseUrl, { accessToken, dataKey }),
    [prefs.apiBaseUrl, accessToken, dataKey],
  );
}

/**
 * Queries stay disabled until a request could actually succeed.
 *
 * The data key is part of that test, not just the token: almost every screen
 * reads transactions, and firing those without a key produces a wall of 400s
 * instead of the unlock prompt the user should be seeing.
 */
export function useApiReady() {
  const { prefs } = useSettings();
  const { status, session } = useAuth();
  return (
    status === 'ready' &&
    Boolean(session?.access_token) &&
    prefs.apiBaseUrl.trim().length > 0
  );
}
