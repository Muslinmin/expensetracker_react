/**
 * All money is signed integer cents (negative = debit). Arithmetic stays in
 * cents; only formatting converts, and only at the last step. The web scaffold
 * worked in float dollars and hardcoded a red minus on every row, which
 * rendered Income and Transfer In as debits.
 */

const GROUPED = /\B(?=(\d{3})+(?!\d))/g;

function groupThousands(intPart: string): string {
  return intPart.replace(GROUPED, ',');
}

/** `-1320` -> `"13.20"`. Magnitude only, no sign and no currency symbol. */
export function formatCentsBare(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${groupThousands(String(whole))}.${String(frac).padStart(2, '0')}`;
}

export interface FormatOptions {
  /** Prefix a sign: '-' for debits, '+' for credits. Default false. */
  signed?: boolean;
  /** Include the `$`. Default true. */
  symbol?: boolean;
}

/** `-1320` -> `"-$13.20"` when signed, `"$13.20"` otherwise. */
export function formatCents(cents: number, opts: FormatOptions = {}): string {
  const { signed = false, symbol = true } = opts;
  const body = `${symbol ? '$' : ''}${formatCentsBare(cents)}`;
  if (!signed) return body;
  // U+2212 MINUS SIGN aligns with digits; ASCII hyphen does not.
  if (cents < 0) return `−${body}`;
  if (cents > 0) return `+${body}`;
  return body;
}

/** Charts need positive magnitudes; a negative slice renders unpredictably. */
export function magnitude(cents: number): number {
  return Math.abs(cents);
}

/** Cents -> float dollars. Only for chart axis values, never for arithmetic. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** Dollars entered in a text field -> cents, tolerant of "1,200.5" and "". */
export function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.\-]/g, '');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function isExpense(cents: number): boolean {
  return cents < 0;
}

/**
 * Categories that are not spending. Summing these into "total spent" makes a
 * salary credit cancel out a month of expenses, so every spend aggregation
 * filters them out. These are exactly the backend's reserved system names
 * minus `Unknown`, which *is* real spending that simply failed to classify.
 */
export const NON_SPEND_CATEGORIES = new Set([
  'Income',
  'Interest',
  'Transfer In',
  'Transfer Out',
]);

export function isSpendCategory(category: string | null): boolean {
  return category !== null && !NON_SPEND_CATEGORIES.has(category);
}
