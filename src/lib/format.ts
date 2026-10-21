/**
 * Formatting helpers. Timestamps are "floating local time" encoded as UTC
 * (see types.ts), so every formatter uses timeZone: 'UTC'.
 */

const DAY = 86_400_000;

/** Today's wall-clock date in the same floating encoding as message timestamps. */
export function floatingNow(now = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
}

export function dayKey(ts: number): number {
  return Math.floor(ts / DAY);
}

export function formatTime(ts: number, hour12: boolean): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: 'UTC',
  })
    .format(ts)
    .replace(/\u202f/g, ' ');
}

export function formatFullDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ts);
}

export function formatDateTime(ts: number, hour12: boolean): string {
  return `${formatFullDate(ts)}, ${formatTime(ts, hour12)}`;
}

/** WhatsApp-style date separator label: Today / Yesterday / weekday / full date. */
export function dateSeparatorLabel(ts: number, now = floatingNow()): string {
  const diff = dayKey(now) - dayKey(ts);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }).format(ts);
  }
  return formatFullDate(ts);
}

/** Conversation-list timestamp: time today, "Yesterday", weekday, or short date. */
export function listTimestamp(ts: number, hour12: boolean, now = floatingNow()): string {
  const diff = dayKey(now) - dayKey(ts);
  if (diff === 0) return formatTime(ts, hour12);
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }).format(ts);
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(ts);
}

/** Convert a `<input type="date">` value (YYYY-MM-DD) to a floating timestamp. */
export function dateInputToTs(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function tsToDateInput(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}
