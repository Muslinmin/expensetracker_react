import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { BudgetConfig } from '@/lib/budget';
import { reconcileBuckets } from '@/lib/budget';

const BUDGETS_KEY = 'xpns.budgets.v1';

interface BudgetsValue {
  configs: BudgetConfig[];
  hydrated: boolean;
  saveConfig: (config: BudgetConfig) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  /** Drops bucket entries for categories the live taxonomy no longer has. */
  reconcile: (liveCategoryNames: ReadonlySet<string>) => Promise<void>;
}

const BudgetsContext = createContext<BudgetsValue | null>(null);

export function BudgetsProvider({ children }: { children: React.ReactNode }) {
  const [configs, setConfigsState] = useState<BudgetConfig[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BUDGETS_KEY);
        if (cancelled) return;
        if (raw) setConfigsState(JSON.parse(raw));
      } catch {
        // Corrupt storage shouldn't brick the app — fall through to empty.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConfig = useCallback(
    async (config: BudgetConfig) => {
      setConfigsState(prev => {
        const next = prev.some(c => c.id === config.id)
          ? prev.map(c => (c.id === config.id ? config : c))
          : [...prev, config];
        AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const deleteConfig = useCallback(async (id: string) => {
    setConfigsState(prev => {
      const next = prev.filter(c => c.id !== id);
      AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reconcile = useCallback(
    async (liveCategoryNames: ReadonlySet<string>) => {
      setConfigsState(prev => {
        let changed = false;
        const next = prev.map(cfg => {
          const buckets = reconcileBuckets(cfg.buckets, liveCategoryNames);
          if (Object.keys(buckets).length === Object.keys(cfg.buckets).length) return cfg;
          changed = true;
          return { ...cfg, buckets };
        });
        if (!changed) return prev;
        AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const value = useMemo<BudgetsValue>(
    () => ({ configs, hydrated, saveConfig, deleteConfig, reconcile }),
    [configs, hydrated, saveConfig, deleteConfig, reconcile],
  );

  return <BudgetsContext.Provider value={value}>{children}</BudgetsContext.Provider>;
}

export function useBudgets() {
  const ctx = useContext(BudgetsContext);
  if (!ctx) throw new Error('useBudgets must be used inside <BudgetsProvider>');
  return ctx;
}
