import { describe, expect, it } from 'vitest';
import { initialsFor } from '../src/lib/avatar';
import { findAmbiguousSenders } from '../src/lib/importer/ambiguity';
import { resolveMerges } from '../src/lib/importer/build';
import { dateSeparatorLabel, formatTime, listTimestamp } from '../src/lib/format';
import { kindForFile, mimeForFile, isInlineSafeMime } from '../src/lib/media';
import { parseRich, isJumboEmoji, safeHref } from '../src/lib/richText';
import { buildRows, firstMessageAtOrAfter } from '../src/lib/rows';
import { ChatSearchIndex, highlightSegments } from '../src/lib/search';
import type { Message } from '../src/lib/types';

const msg = (order: number, ts: number, senderId: string | null, text = 'x', type: Message['type'] = 'text'): Message => ({
  id: `c:${order}`,
  conversationId: 'c',
  order,
  ts,
  tsText: 'x',
  senderId,
  text,
  type,
});

describe('rich text (rendered as text, never HTML)', () => {
  it('parses WhatsApp formatting and links', () => {
    expect(parseRich('*bold* and _it_ ~gone~ ```code```')).toEqual([
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'it', italic: true },
      { text: ' ' },
      { text: 'gone', strike: true },
      { text: ' ' },
      { text: 'code', mono: true },
    ]);
    const spans = parseRich('see https://example.com/a?b=1. ok');
    expect(spans[1]).toEqual({ text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' });
    expect(spans[2].text).toBe('. ok');
  });

  it('does not treat multiplication or snake_case as formatting', () => {
    expect(parseRich('2*3*4 and snake_case_name')).toEqual([{ text: '2*3*4 and snake_case_name' }]);
  });

  it('only links http(s) - never javascript: or data: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('www.example.com')).toBe('https://www.example.com/');
    expect(parseRich('javascript:alert(1) <img src=x onerror=alert(1)>').some((s) => s.href)).toBe(false);
    expect(parseRich('<script>alert(1)</script>')).toEqual([{ text: '<script>alert(1)</script>' }]);
  });

  it('detects emoji-only messages', () => {
    expect(isJumboEmoji('😂')).toBe(true);
    expect(isJumboEmoji('👍🏽❤\ufe0f')).toBe(true);
    expect(isJumboEmoji('😂😂😂😂')).toBe(false);
    expect(isJumboEmoji('ok 😂')).toBe(false);
    expect(isJumboEmoji('123')).toBe(false);
  });
});

describe('rows and grouping', () => {
  const day = (d: number, h = 10) => Date.UTC(2026, 0, d, h);
  const messages = [msg(0, day(1), 'a'), msg(1, day(1, 11), 'a'), msg(2, day(1, 12), 'b'), msg(3, day(2), 'b'), msg(4, day(2, 11), null, 'sys', 'system')];

  it('inserts one date separator per day and marks sender runs', () => {
    const { rows, rowOfMessage } = buildRows(messages);
    expect(rows.map((r) => (r.kind === 'date' ? 'D' : r.first ? 'F' : 'm')).join('')).toBe('DFmFDFF');
    expect(Array.from(rowOfMessage)).toEqual([1, 2, 3, 5, 6]);
  });

  it('finds the first message on or after a date', () => {
    expect(firstMessageAtOrAfter(messages, day(2, 0))).toBe(3);
    expect(firstMessageAtOrAfter(messages, day(9))).toBe(4);
  });

  it('builds rows for 200k messages quickly', () => {
    const big = Array.from({ length: 200_000 }, (_, i) => msg(i, day(1) + i * 60_000, i % 3 ? 'a' : 'b'));
    const t0 = performance.now();
    const { rows } = buildRows(big);
    expect(rows.length).toBeGreaterThan(200_000);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('in-chat search', () => {
  const messages = [msg(0, 1, 'a', 'Hello World'), msg(1, 2, 'b', 'hello again 👋'), msg(2, 3, 'a', 'Bye'), msg(3, 4, 'a', 'Ünïcode ÜBER')];

  it('matches case-insensitively, Unicode and emoji, in order', () => {
    const idx = new ChatSearchIndex(messages);
    expect(idx.find('HELLO')).toEqual([0, 1]);
    expect(idx.find('👋')).toEqual([1]);
    expect(idx.find('über')).toEqual([3]);
    expect(idx.find('   ')).toEqual([]);
  });

  it('splits text for highlighting', () => {
    expect(highlightSegments('Hello hello', 'HELLO')).toEqual([
      { text: 'Hello', match: true },
      { text: ' ', match: false },
      { text: 'hello', match: true },
    ]);
  });
});

describe('formatting helpers', () => {
  it('formats floating timestamps without timezone shifts', () => {
    const ts = Date.UTC(2026, 4, 12, 22, 30);
    expect(formatTime(ts, false)).toMatch(/22:30/);
    expect(formatTime(ts, true)).toMatch(/10:30/);
  });

  it('labels Today / Yesterday relative to now', () => {
    const now = Date.UTC(2026, 4, 12, 9);
    expect(dateSeparatorLabel(Date.UTC(2026, 4, 12, 1), now)).toBe('Today');
    expect(dateSeparatorLabel(Date.UTC(2026, 4, 11, 23), now)).toBe('Yesterday');
    expect(dateSeparatorLabel(Date.UTC(2025, 0, 1), now)).toMatch(/2025/);
    expect(listTimestamp(Date.UTC(2026, 4, 11, 23), false, now)).toBe('Yesterday');
  });

  it('builds initials', () => {
    expect(initialsFor('Mansi Sharma')).toBe('MS');
    expect(initialsFor('lucky')).toBe('L');
    expect(initialsFor('+91 98765 43210')).toBe('#');
  });
});

describe('media helpers', () => {
  it('maps WhatsApp file names to kinds and MIME types', () => {
    expect(kindForFile('PTT-20260512-WA0003.opus')).toBe('voice');
    expect(kindForFile('STK-20260512-WA0004.webp')).toBe('sticker');
    expect(kindForFile('00000012-PHOTO-2026-05-13-08-00-00.jpg')).toBe('image');
    expect(kindForFile('report.pdf')).toBe('document');
    expect(mimeForFile('evil.html')).toBe('application/octet-stream');
    expect(isInlineSafeMime('image/svg+xml')).toBe(false);
    expect(isInlineSafeMime('image/jpeg')).toBe(true);
  });
});

describe('participant mapping helpers', () => {
  it('follows merge chains and ignores cycles', () => {
    const m = resolveMerges([
      { raw: 'a', displayName: 'a', mergeInto: 'b' },
      { raw: 'b', displayName: 'b', mergeInto: 'c' },
      { raw: 'c', displayName: 'c', mergeInto: null },
      { raw: 'x', displayName: 'x', mergeInto: 'y' },
      { raw: 'y', displayName: 'y', mergeInto: 'x' },
    ]);
    expect(m.get('a')).toBe('c');
    expect(m.get('b')).toBe('c');
    expect(['x', 'y']).toContain(m.get('x'));
  });

  it('flags phone numbers and near-duplicate names for review', () => {
    expect([...findAmbiguousSenders(['Mansi', 'Mansi S', 'Lucky', '+91 98765 43210'])].sort()).toEqual(['+91 98765 43210', 'Mansi', 'Mansi S']);
  });
});
