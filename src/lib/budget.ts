/**
 * Budgets are on-device only — there is no `/budgets` endpoint (see
 * .agent/frontend_implementation.md §1.6). Bucket keys are category names, so
 * they need reconciling whenever the taxonomy changes (a rename or delete
 * must not leave a bucket budgeting a category that no longer exists).
 */

import type { CategoryTree } from './categoryTree';
import { isUncategorised } from './categoryTree';
import { isSpendCategory, magnitude } from './money';
import type { Period } from './api/types';

export type BudgetScope = 'month' | 'period' | 'continuous';

export interface BudgetConfig {
  id: string;
  scope: BudgetScope;
  /** YYYY-MM, inclusive. Equal to endMonth when scope is 'month'; unused (but present) when 'continuous'. */
  startMonth: Period;
  endMonth: Period;
  totalBudgetCents: number;
  /** Category name -> allocated cents. Keys may be any category, stem or leaf. */
  buckets: Record<string, number>;
}

function inRange(period: Period, start: Period, end: Period): boolean {
  return period >= start && period <= end;
}

/**
 * month > period > continuous. A period should only ever match one config per
 * scope in practice; the first match wins if that invariant is ever broken.
 */
export function resolveBudget(configs: BudgetConfig[], period: Period): BudgetConfig | null {
  const month = configs.find(c => c.scope === 'month' && c.startMonth === period);
  if (month) return month;
  const range = configs.find(c => c.scope === 'period' && inRange(period, c.startMonth, c.endMonth));
  if (range) return range;
  return configs.find(c => c.scope === 'continuous') ?? null;
}

export interface SummaryLike {
  category: string;
  total_cents: number;
}

/**
 * Sum of magnitudes for a bucket's category. A stem holds no transactions of
 * its own, so budgeting a stem sums whatever its children spent that period.
 */
export function spendForBucket(rows: SummaryLike[], categoryName: string, tree: CategoryTree): number {
  const targets = new Set(tree.isStem(categoryName) ? tree.expand(categoryName) : [categoryName]);
  return rows
    .filter(r => targets.has(r.category))
    .reduce((sum, r) => sum + magnitude(r.total_cents), 0);
}

/** Total spend across every spend category in a period, for the balance card. */
export function totalSpend(rows: SummaryLike[]): number {
  return rows
    .filter(r => isSpendCategory(r.category))
    .reduce((sum, r) => sum + magnitude(r.total_cents), 0);
}

export interface BucketStatus {
  category: string;
  budgetCents: number;
  spentCents: number;
  /** 0..100+, uncapped so callers can tell overage from "right at the line". */
  pct: number;
  remainingCents: number;
  over: boolean;
  warning: boolean;
}

export function bucketStatus(category: string, budgetCents: number, spentCents: number): BucketStatus {
  const pct = budgetCents > 0 ? (spentCents / budgetCents) * 100 : spentCents > 0 ? 100 : 0;
  return {
    category,
    budgetCents,
    spentCents,
    pct,
    remainingCents: budgetCents - spentCents,
    over: spentCents > budgetCents,
    warning: pct >= 80,
  };
}

export function totalAllocated(buckets: Record<string, number>): number {
  return Object.values(buckets).reduce((sum, cents) => sum + cents, 0);
}

/**
 * Drops buckets keyed to a category the live taxonomy no longer has (renamed
 * or deleted) rather than silently budgeting a name nothing can ever match
 * again. `Uncategorised`/`Unknown` is kept — it isn't in the taxonomy either,
 * but it is always a valid budgeting target.
 */
export function reconcileBuckets(
  buckets: Record<string, number>,
  liveCategoryNames: ReadonlySet<string>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [name, cents] of Object.entries(buckets)) {
    if (isUncategorised(name) || liveCategoryNames.has(name)) next[name] = cents;
  }
  return next;
}

export function makeEmptyConfig(id: string, scope: BudgetScope, period: Period): BudgetConfig {
  return {
    id,
    scope,
    startMonth: period,
    endMonth: period,
    totalBudgetCents: 0,
    buckets: {},
  };
}
