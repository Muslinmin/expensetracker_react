/**
 * The taxonomy is one flat list with `parent_name` links, at most two levels
 * deep (the contract rejects carving from an already-carved leaf).
 *
 * The distinction that matters everywhere else: a *stem* has children and
 * therefore holds no transactions of its own. Filtering `/transactions` by a
 * stem returns nothing, which reads as a bug rather than as an empty result.
 */

import type { Category } from './api/types';

export interface CategoryTree {
  all: Category[];
  byName: Map<string, Category>;
  /** Top-level categories, stems and childless alike. */
  roots: Category[];
  childrenOf: (name: string) => Category[];
  /** A category with children — holds nothing directly. */
  isStem: (name: string) => boolean;
  /** Every category that can actually hold transactions. */
  leaves: Category[];
  /** Top-level ancestor of a category, or itself when already top-level. */
  rootOf: (name: string) => string;
  /**
   * The names to actually query for when the user picks `name`:
   * a stem expands to its children, anything else is itself.
   */
  expand: (name: string) => string[];
  /** Stable ordering: roots alphabetical, children under their parent. */
  ordered: Category[];
}

const EMPTY: Category[] = [];

export function buildCategoryTree(categories: Category[]): CategoryTree {
  const all = categories;
  const byName = new Map(all.map(c => [c.name, c]));

  const children = new Map<string, Category[]>();
  for (const c of all) {
    if (!c.parent_name) continue;
    const list = children.get(c.parent_name);
    if (list) list.push(c);
    else children.set(c.parent_name, [c]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const childrenOf = (name: string) => children.get(name) ?? EMPTY;
  const isStem = (name: string) => (children.get(name)?.length ?? 0) > 0;

  // A parent_name pointing at a category we didn't receive (deactivated and
  // excluded, say) would otherwise orphan the row out of every list.
  const roots = all
    .filter(c => !c.parent_name || !byName.has(c.parent_name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rootOf = (name: string) => {
    const c = byName.get(name);
    if (!c?.parent_name) return name;
    return byName.has(c.parent_name) ? c.parent_name : name;
  };

  const expand = (name: string) => {
    const kids = childrenOf(name);
    return kids.length > 0 ? kids.map(k => k.name) : [name];
  };

  const leaves = all.filter(c => !isStem(c.name));

  const ordered: Category[] = [];
  for (const r of roots) {
    ordered.push(r);
    ordered.push(...childrenOf(r.name));
  }

  return { all, byName, roots, childrenOf, isStem, leaves, rootOf, expand, ordered };
}

export const EMPTY_TREE = buildCategoryTree([]);

/**
 * The same "not classified" concept arrives under three different names:
 *  - `/transactions` sends `category: null`
 *  - `/summary` emits a row literally named "Uncategorised"
 *  - `/categories` reserves the system name "Unknown" as the fallback
 *
 * Only the first is documented. Everything downstream — colours, legends,
 * budget reconciliation — has to see these as one bucket, so normalise here.
 */
export const UNCATEGORISED = 'Uncategorised';

const UNCATEGORISED_ALIASES = new Set([UNCATEGORISED, 'Unknown', 'uncategorised', 'unknown']);

export function isUncategorised(name: string | null): boolean {
  return name === null || UNCATEGORISED_ALIASES.has(name);
}

/** Display label for a possibly-missing category on a transaction row. */
export function categoryLabel(name: string | null): string {
  return isUncategorised(name) ? UNCATEGORISED : (name as string);
}
