/**
 * Colours for a taxonomy that is only known at runtime.
 *
 * The web scaffold hardcoded a six-entry name->colour map, which the contract
 * explicitly rules out. Instead: hash the *root* category name into the palette
 * so a colour is stable across sessions and devices without any stored state,
 * then shift lightness per child so `Coffee` reads as a shade of its parent
 * `Dining & Takeout` rather than an unrelated hue.
 */

import { type CategoryTree, isUncategorised } from './categoryTree';
import { categoryPalette } from '@/theme/tokens';

/** FNV-1a, 32-bit. Small, fast, and stable across JS engines. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** `amount` > 0 lightens toward white, < 0 darkens toward black. */
function shift(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}

/** Base hue for a top-level category name. */
export function rootColor(name: string): string {
  return categoryPalette[hash(name) % categoryPalette.length];
}

/**
 * Colour for any category. Children of the same parent get evenly spread
 * lightness offsets around the parent hue, so a carve stays legible without
 * stealing another root's colour.
 */
export function categoryColor(name: string, tree?: CategoryTree): string {
  if (!tree) return rootColor(name);

  const root = tree.rootOf(name);
  const base = rootColor(root);
  if (name === root) return base;

  const siblings = tree.childrenOf(root);
  const idx = siblings.findIndex(s => s.name === name);
  if (idx < 0) return base;

  // Alternate lighter/darker so adjacent children stay distinguishable:
  // +0.18, -0.18, +0.34, -0.34, ...
  const step = Math.floor(idx / 2) + 1;
  const dir = idx % 2 === 0 ? 1 : -1;
  return shift(base, dir * Math.min(0.5, 0.18 * step));
}

/** Uncategorised rows are grey, never a palette colour. */
export const UNCATEGORISED_COLOR = '#9CA3AF';

/**
 * Handles every spelling the backend uses for "not classified" — `null` on
 * transactions, "Uncategorised" on summary rows, "Unknown" in the taxonomy.
 */
export function colorFor(name: string | null, tree?: CategoryTree): string {
  return isUncategorised(name) ? UNCATEGORISED_COLOR : categoryColor(name as string, tree);
}

/**
 * Translucent version for chip backgrounds — the scaffold appended "18" to the
 * hex for ~9% alpha. Done explicitly here so it also works for the shifted
 * child colours.
 */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
