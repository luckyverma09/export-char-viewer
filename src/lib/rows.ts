import { dayKey } from './format';
import type { Message } from './types';

export type Row =
  | { kind: 'date'; key: string; ts: number }
  | { kind: 'msg'; key: string; index: number; /** First of a run by the same sender (gets a tail). */ first: boolean };

export interface RowModel {
  rows: Row[];
  /** rowOfMessage[i] = row index of messages[i]. */
  rowOfMessage: Int32Array;
}

/**
 * Flatten messages into list rows with date separators, and mark the first
 * message of every consecutive run by the same sender on the same day.
 */
export function buildRows(messages: Message[]): RowModel {
  const rows: Row[] = [];
  const rowOfMessage = new Int32Array(messages.length);
  let prevDay = Number.NaN;
  let prev: Message | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const day = m.tsText ? dayKey(m.ts) : prevDay;
    let newDay = false;
    if (day !== prevDay && Number.isFinite(day)) {
      rows.push({ kind: 'date', key: `d${i}`, ts: m.ts });
      prevDay = day;
      newDay = true;
    }
    const first =
      newDay ||
      !prev ||
      prev.senderId !== m.senderId ||
      prev.type === 'system' ||
      m.type === 'system' ||
      prev.type === 'unparsed';
    rowOfMessage[i] = rows.length;
    rows.push({ kind: 'msg', key: m.id, index: i, first });
    prev = m;
  }
  return { rows, rowOfMessage };
}

/** Index of the first message on or after a floating-time timestamp. */
export function firstMessageAtOrAfter(messages: Message[], ts: number): number {
  let lo = 0;
  let hi = messages.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (messages[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, messages.length - 1);
}
