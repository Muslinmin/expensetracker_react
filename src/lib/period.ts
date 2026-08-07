/**
 * Date helpers. Everything is computed from local calendar fields rather than
 * `toISOString()`, which converts to UTC and silently shifts the day near
 * midnight for anyone east or west of Greenwich.
 */

import type { IsoDate, Period } from './api/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toPeriod(d: Date): Period {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function currentPeriod(now = new Date()): Period {
  return toPeriod(now);
}

/** `"2026-05"` -> `"May 2026"`. */
export function periodLabel(p: Period): string {
  const [y, m] = p.split('-').map(Number);
  if (!y || !m) return p;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** `"2026-05"` -> `"MAY 2026"`, for the mono uppercase eyebrow labels. */
export function periodLabelUpper(p: Period): string {
  return periodLabel(p).toUpperCase();
}

/** `"2026-05"` -> `"May"`, for chart axis ticks. */
export function periodShortLabel(p: Period): string {
  const [, m] = p.split('-').map(Number);
  return m ? MONTH_NAMES[m - 1].slice(0, 3) : p;
}

export interface DateRange {
  date_from: IsoDate;
  date_to: IsoDate;
}

/** Inclusive first and last day of a `YYYY-MM` period. */
export function periodToRange(p: Period): DateRange {
  const [y, m] = p.split('-').map(Number);
  return {
    date_from: `${y}-${pad(m)}-01`,
    // Day 0 of the next month is the last day of this one, leap years included.
    date_to: toIsoDate(new Date(y, m, 0)),
  };
}

export function addMonths(p: Period, delta: number): Period {
  const [y, m] = p.split('-').map(Number);
  return toPeriod(new Date(y, m - 1 + delta, 1));
}

export const PERIOD_PRESETS = [
  'This Month',
  'Last 3 Months',
  'Last 6 Months',
  'This Year',
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/**
 * Preset -> inclusive range. "Last N Months" includes the current month, so
 * "Last 3 Months" spans this month plus the two before it.
 */
export function presetToRange(preset: PeriodPreset, now = new Date()): DateRange {
  const today = toIsoDate(now);
  const thisPeriod = toPeriod(now);

  switch (preset) {
    case 'This Month':
      return { date_from: periodToRange(thisPeriod).date_from, date_to: today };
    case 'Last 3 Months':
      return {
        date_from: periodToRange(addMonths(thisPeriod, -2)).date_from,
        date_to: today,
      };
    case 'Last 6 Months':
      return {
        date_from: periodToRange(addMonths(thisPeriod, -5)).date_from,
        date_to: today,
      };
    case 'This Year':
      return { date_from: `${now.getFullYear()}-01-01`, date_to: today };
  }
}

/** How many trailing months a preset covers, for slicing /summary/monthly. */
export function presetMonthSpan(preset: PeriodPreset, now = new Date()): number {
  switch (preset) {
    case 'This Month':
      return 1;
    case 'Last 3 Months':
      return 3;
    case 'Last 6 Months':
      return 6;
    case 'This Year':
      return now.getMonth() + 1;
  }
}

/** `"2026-08-05"` -> `"Aug 5"`, matching the scaffold's transaction rows. */
export function formatShortDate(iso: IsoDate): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}

/** The 12 periods `/summary/monthly` covers, oldest first. */
export function trailingTwelvePeriods(now = new Date()): Period[] {
  const cur = toPeriod(now);
  return Array.from({ length: 12 }, (_, i) => addMonths(cur, i - 11));
}
