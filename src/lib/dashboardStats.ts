/** Dashboard-specific aggregation over `/summary` rows. Kept pure and platform-agnostic like the rest of `lib/`. */

import type { SummaryRow } from './api/types';
import type { CategoryTree } from './categoryTree';
import { isUncategorised, UNCATEGORISED } from './categoryTree';
import { isSpendCategory, magnitude } from './money';

export interface CategoryTotal {
  category: string;
  cents: number;
}

/**
 * Groups leaf-level rows into their root category, so a taxonomy with carved
 * children (`Coffee` under `Dining & Takeout`) reads as one slice rather than
 * fragmenting the donut — matching categoryColor's "child is a shade of its
 * parent" model. Sorted largest first.
 */
export function totalsByRootCategory(rows: SummaryRow[], tree: CategoryTree): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!isSpendCategory(row.category)) continue;
    const key = isUncategorised(row.category) ? UNCATEGORISED : tree.rootOf(row.category);
    totals.set(key, (totals.get(key) ?? 0) + magnitude(row.total_cents));
  }
  return [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export const TREND_ALL = '__all_spend__';

/**
 * One total per period for the trend chart. `selection` is `TREND_ALL`, a
 * root category name, or `UNCATEGORISED` — leaves are attributed to their
 * root, matching `totalsByRootCategory`.
 */
export function trendSeries(
  rows: SummaryRow[],
  periods: string[],
  selection: string,
  tree: CategoryTree,
): number[] {
  return periods.map(period => {
    const matching = rows.filter(r => {
      if (r.period !== period || !isSpendCategory(r.category)) return false;
      if (selection === TREND_ALL) return true;
      return isUncategorised(r.category) ? selection === UNCATEGORISED : tree.rootOf(r.category) === selection;
    });
    return matching.reduce((sum, r) => sum + magnitude(r.total_cents), 0);
  });
}

/** Distinct periods present in a `/summary/monthly` response — the ones with any spend at all. */
export function periodsWithData(rows: SummaryRow[]): string[] {
  return [...new Set(rows.map(r => r.period))];
}
