import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS,
  AMBIGUOUS_RESOLVABLE,
  ANDROID_12H,
  ANDROID_24H_4Y,
  GROUP,
  IOS,
  IOS_12H,
  syntheticChat,
} from '../../../tests/fixtures/chats';
import { matchHeader, parseChat } from './parseChat';

const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s);

describe('Android exports', () => {
  const r = parseChat(ANDROID_12H);

  it('detects the format and 12-hour clock', () => {
    expect(r.format).toBe('android');
    expect(r.hour12).toBe(true);
    expect(r.dateOrder).toBe('DMY');
    expect(r.dateOrderConfident).toBe(true);
  });

  it('parses the encryption notice as a system message', () => {
    expect(r.messages[0]).toMatchObject({ type: 'system', sender: null, systemEvent: 'encryption' });
  });

  it('parses senders, names with spaces and emoji', () => {
    expect(r.messages[1]).toMatchObject({ sender: 'Lucky', text: 'Hello', type: 'text' });
    expect(r.messages[2]).toMatchObject({ sender: 'Mansi Sharma', text: 'Hi! How are you? 😊' });
  });

  it('keeps colons inside the message and joins multiline messages', () => {
    expect(r.messages[3].sender).toBe('Lucky');
    expect(r.messages[3].text).toBe(
      'Good. Meeting at 10:30: is that ok?\nSecond line of the same message\n\nFourth line after a blank line',
    );
  });

  it('converts 12-hour times correctly (12 am = 00:xx, 12 pm = noon)', () => {
    expect(r.messages[1].ts).toBe(utc(2026, 5, 12, 22, 30));
    expect(r.messages[4].ts).toBe(utc(2026, 5, 13, 0, 5));
    expect(r.messages[8].ts).toBe(utc(2026, 5, 13, 12, 0));
  });

  it('preserves the original timestamp text', () => {
    expect(r.messages[1].tsText).toBe('12/05/26, 10:30 pm');
  });

  it('recognises media placeholders, attached files, deletions and edits', () => {
    expect(r.messages[4]).toMatchObject({ type: 'media', media: { kind: 'unknown', omitted: true } });
    expect(r.messages[5]).toMatchObject({
      type: 'media',
      text: 'Look at this view',
      media: { kind: 'image', fileName: 'IMG-20260513-WA0001.jpg', omitted: false },
    });
    expect(r.messages[6]).toMatchObject({ type: 'deleted', sender: 'Mansi Sharma' });
    expect(r.messages[7]).toMatchObject({ type: 'text', text: 'See you tomorrow', edited: true });
  });

  it('extracts participants in order of appearance', () => {
    expect(r.senders.map((s) => s.name)).toEqual(['Lucky', 'Mansi Sharma']);
    expect(r.senders[0].count).toBe(5);
  });

  it('parses 24-hour, 4-digit-year exports', () => {
    const r2 = parseChat(ANDROID_24H_4Y);
    expect(r2.hour12).toBe(false);
    expect(r2.dateOrder).toBe('DMY');
    expect(r2.messages[0].ts).toBe(utc(2026, 12, 5, 22, 30));
  });
});

describe('iOS exports', () => {
  const r = parseChat(IOS);

  it('detects iOS format with seconds', () => {
    expect(r.format).toBe('ios');
    expect(r.messages[1]).toMatchObject({ sender: 'Lucky', text: 'Hello', ts: utc(2026, 5, 12, 22, 30, 15) });
    expect(r.messages[1].tsText).toBe('12/05/26, 22:30:15');
  });

  it('treats "<Name>: \\u200e<notice>" as a system message, not a participant message', () => {
    expect(r.messages[0]).toMatchObject({ type: 'system', sender: null, systemEvent: 'encryption' });
  });

  it('handles iOS media, attachments, deletions, edits and documents', () => {
    expect(r.messages[3]).toMatchObject({ type: 'media', media: { kind: 'image', omitted: true } });
    expect(r.messages[4]).toMatchObject({
      type: 'media',
      media: { kind: 'image', fileName: '00000012-PHOTO-2026-05-13-08-00-00.jpg', omitted: false },
    });
    expect(r.messages[5].text).toBe('Multi\nline');
    expect(r.messages[6].type).toBe('deleted');
    expect(r.messages[7]).toMatchObject({ text: 'edited text', edited: true });
    expect(r.messages[8]).toMatchObject({ type: 'media', media: { kind: 'document', fileName: 'Report.pdf' } });
  });

  it('keeps emoji with skin-tone modifiers intact', () => {
    expect(r.messages[2].text).toBe('Hi 👋🏽');
  });

  it('parses US-style 12-hour iOS exports (incl. narrow no-break space)', () => {
    const r2 = parseChat(IOS_12H);
    expect(r2.dateOrder).toBe('MDY');
    expect(r2.dateOrderConfident).toBe(true);
    expect(r2.messages[0].ts).toBe(utc(2026, 5, 12, 22, 30, 15));
    expect(r2.messages[1].ts).toBe(utc(2026, 5, 12, 22, 31, 0));
    expect(r2.messages[2].ts).toBe(utc(2026, 5, 13, 0, 0, 0));
  });
});

describe('group chats and system events', () => {
  const r = parseChat(GROUP);

  it('classifies group membership events', () => {
    expect(r.groupEvents).toBe(true);
    expect(r.messages.slice(0, 3).map((m) => m.systemEvent)).toEqual(['group_created', 'member_added', 'member_added']);
    expect(r.messages[7]).toMatchObject({ type: 'system', systemEvent: 'member_left' });
  });

  it('does not split a subject change at the colon inside quotes', () => {
    expect(r.messages[5]).toMatchObject({ type: 'system', systemEvent: 'subject_changed', sender: null });
  });

  it('keeps a normal message that merely contains "added"', () => {
    expect(r.messages[8]).toMatchObject({ type: 'text', sender: 'Asha', text: 'I added a note: check it' });
  });

  it('lists only real senders as participants', () => {
    expect(r.senders.map((s) => s.name)).toEqual(['Ben', 'Chandra Kumar Rao', 'Asha']);
  });
});

describe('date ambiguity', () => {
  it('asks when day/month cannot be determined', () => {
    const r = parseChat(AMBIGUOUS);
    expect(r.dateOrderConfident).toBe(false);
    expect(r.dateOrderCandidates).toEqual(expect.arrayContaining(['DMY', 'MDY']));
    expect(r.warnings.some((w) => w.code === 'date_order')).toBe(true);
  });

  it('honours a user-selected order', () => {
    const dmy = parseChat(AMBIGUOUS, { dateOrder: 'DMY' });
    const mdy = parseChat(AMBIGUOUS, { dateOrder: 'MDY' });
    expect(dmy.messages[0].ts).toBe(utc(2026, 2, 1, 10));
    expect(mdy.messages[0].ts).toBe(utc(2026, 1, 2, 10));
    expect(dmy.dateOrderConfident).toBe(true);
  });

  it('resolves ambiguity when only one reading is chronological', () => {
    const r = parseChat(AMBIGUOUS_RESOLVABLE);
    expect(r.dateOrder).toBe('DMY');
    expect(r.dateOrderConfident).toBe(true);
  });

  it('reads ISO-like year-first dates', () => {
    const r = parseChat('2026-05-12, 22:30 - Lucky: Hi\n2026-05-13, 08:00 - Mansi: Morning');
    expect(r.dateOrder).toBe('YMD');
    expect(r.messages[1].ts).toBe(utc(2026, 5, 13, 8));
  });

  it('accepts dotted dates and dotted times', () => {
    const r = parseChat('12.05.26, 22.30 - Lucky: Hallo');
    expect(r.messages[0]).toMatchObject({ sender: 'Lucky', ts: utc(2026, 5, 12, 22, 30) });
  });
});

describe('robustness', () => {
  it('keeps text before the first header and reports it', () => {
    const r = parseChat('garbage line\n12/05/26, 10:30 - Lucky: Hi');
    expect(r.messages[0]).toMatchObject({ type: 'unparsed', text: 'garbage line' });
    expect(r.warnings[0].code).toBe('orphan_text');
    expect(r.messages[1].sender).toBe('Lucky');
  });

  it('reports messages with a missing sender instead of dropping them', () => {
    const r = parseChat('12/05/26, 10:30 - : orphan\n12/05/26, 10:31 - Lucky: Hi');
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0].sender).toBeNull();
    expect(r.warnings.some((w) => w.code === 'missing_sender')).toBe(true);
  });

  it('treats unknown sender-less lines (any language) as system notices', () => {
    const r = parseChat('12/05/26, 10:30 - Lucky a créé le groupe « Amis »');
    expect(r.messages[0]).toMatchObject({ type: 'system', systemEvent: 'other' });
  });

  it('handles CRLF line endings and a UTF-8 BOM', () => {
    const r = parseChat('\ufeff12/05/26, 10:30 - Lucky: Hi\r\nthere\r\n12/05/26, 10:31 - Mansi: Yo\r\n');
    expect(r.messages.map((m) => m.text)).toEqual(['Hi\nthere', 'Yo']);
  });

  it('flags impossible dates but keeps the message', () => {
    const r = parseChat('12/05/26, 10:30 - Lucky: Hi\n31/02/26, 10:31 - Mansi: bad date');
    expect(r.messages).toHaveLength(2);
    expect(r.messages[1].warnings).toContain('Invalid date');
  });

  it('keeps messages that are only "Name:" with text on the next line', () => {
    const r = parseChat('12/05/26, 10:30 - Lucky:\nnext line');
    expect(r.messages[0]).toMatchObject({ sender: 'Lucky', text: 'next line' });
  });

  it('returns no messages for non-chat text', () => {
    const r = parseChat('just some notes\nwith no headers');
    expect(r.messages.every((m) => m.type === 'unparsed')).toBe(true);
  });

  it('rejects header-like lines with impossible times', () => {
    expect(matchHeader('12/05/26, 25:30 - Lucky: Hi')).toBeNull();
    expect(matchHeader('12/05/26, 13:30 pm - Lucky: Hi')).toBeNull();
  });

  it('respects the message-count safeguard', () => {
    const r = parseChat(syntheticChat(50), { maxMessages: 10 });
    expect(r.messages).toHaveLength(10);
    expect(r.warnings.some((w) => w.code === 'truncated')).toBe(true);
  });

  it('preserves source order and chronological timestamps', () => {
    const r = parseChat(syntheticChat(500));
    expect(r.messages.map((m) => m.order)).toEqual([...Array(500).keys()]);
    for (let i = 1; i < r.messages.length; i++) expect(r.messages[i].ts).toBeGreaterThanOrEqual(r.messages[i - 1].ts);
  });

  it('parses a large export quickly', () => {
    const text = syntheticChat(100_000);
    const t0 = performance.now();
    const r = parseChat(text);
    const ms = performance.now() - t0;
    expect(r.messages).toHaveLength(100_000);
    expect(ms).toBeLessThan(5000);
  });
});
