import type { DateOrder } from '../types';

/** The three numeric date fields exactly as they appear left-to-right. */
export type DateParts = [number, number, number];

export interface YMD {
  y: number;
  m: number;
  d: number;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function normYear(y: number, digits: number): number {
  // WhatsApp has existed since 2009, so two-digit years are always 20xx.
  return digits <= 2 ? 2000 + y : y;
}

/**
 * Interpret date parts using an order. `yearDigits` is the number of digits the
 * year field had in the source (two-digit years expand to 20xx).
 */
export function toYMD(parts: DateParts, order: DateOrder, firstDigits: number, lastDigits: number): YMD | null {
  const [a, b, c] = parts;
  let y: number, m: number, d: number;
  if (order === 'YMD') {
    if (firstDigits !== 4) return null;
    y = a;
    m = b;
    d = c;
  } else {
    if (lastDigits !== 2 && lastDigits !== 4) return null;
    y = normYear(c, lastDigits);
    if (order === 'DMY') {
      d = a;
      m = b;
    } else {
      m = a;
      d = b;
    }
  }
  if (y < 1990 || y > 2200) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export interface DateSample {
  parts: DateParts;
  firstDigits: number;
  lastDigits: number;
  /** Minutes since midnight, used for ordering checks. */
  minutes: number;
}

export interface DateOrderDecision {
  order: DateOrder;
  candidates: DateOrder[];
  confident: boolean;
}

const ORDERS: DateOrder[] = ['DMY', 'MDY', 'YMD'];

function inversions(samples: DateSample[], order: DateOrder): number {
  let prev = -Infinity;
  let count = 0;
  for (const s of samples) {
    const ymd = toYMD(s.parts, order, s.firstDigits, s.lastDigits);
    if (!ymd) continue;
    const v = Date.UTC(ymd.y, ymd.m - 1, ymd.d) / 60000 + s.minutes;
    // Allow tiny reorderings (WhatsApp sometimes logs a few seconds out of order).
    if (v < prev - 60) count++;
    prev = Math.max(prev, v);
  }
  return count;
}

/**
 * Decide how to read the dates in an export.
 *
 * 1. An order is a *candidate* if every header date is valid under it.
 * 2. One candidate -> confident.
 * 3. DMY and MDY both valid (all day/month values <= 12) -> prefer the order that
 *    keeps messages chronological. Only confident if exactly one order has no
 *    backwards jumps; otherwise the user is asked.
 */
export function decideDateOrder(samples: DateSample[], forced?: DateOrder): DateOrderDecision {
  if (samples.length === 0) return { order: forced ?? 'DMY', candidates: [], confident: true };

  const validCount = (o: DateOrder) =>
    samples.reduce((n, s) => n + (toYMD(s.parts, o, s.firstDigits, s.lastDigits) ? 1 : 0), 0);
  const counts = ORDERS.map((o) => [o, validCount(o)] as const);
  const candidates = counts.filter(([, n]) => n === samples.length).map(([o]) => o);

  if (forced) return { order: forced, candidates, confident: true };

  if (candidates.length === 1) return { order: candidates[0], candidates, confident: true };

  if (candidates.length === 0) {
    // Nothing fits perfectly (mixed/corrupt dates): take the best fit, ask user.
    const best = [...counts].sort((x, y) => y[1] - x[1])[0][0];
    return { order: best, candidates, confident: false };
  }

  const scored = candidates.map((o) => ({ o, inv: inversions(samples, o) }));
  scored.sort((x, y) => x.inv - y.inv || ORDERS.indexOf(x.o) - ORDERS.indexOf(y.o));
  const zero = scored.filter((s) => s.inv === 0);
  const confident = zero.length === 1 && scored.length > 1 && scored[1].inv > 0;
  return { order: scored[0].o, candidates, confident };
}
