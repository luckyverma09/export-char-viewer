import type {
  DateOrder,
  ParsedMessage,
  ParseResult,
  ParseWarning,
  SenderInfo,
  SourceFormat,
  SystemEvent,
} from '../types';
import { classifyBody, matchSystem, stripMarks } from './classify';
import { decideDateOrder, toYMD, type DateParts, type DateSample } from './dates';

export interface ParseOptions {
  /** Force a date interpretation (after the user resolved an ambiguity). */
  dateOrder?: DateOrder;
  /** Safety limit on the number of messages. */
  maxMessages?: number;
}

export const DEFAULT_MAX_MESSAGES = 1_000_000;

// --- Header recognition ------------------------------------------------------
// Spaces in exports may be regular, no-break (U+00A0) or narrow no-break (U+202F).
const SP = '[\\s\\u00a0\\u202f]';
const MARKS = '[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]*';
const DATE = '(\\d{1,4})([./-])(\\d{1,2})\\2(\\d{1,4})';
const TIME = '(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?';
const AMPM = `(?:${SP}*([aApP]\\.?${SP}?[mM]\\.?))?`;

/** iOS style:  [12/05/26, 22:30:15] Lucky: Hello */
const IOS_HEADER = new RegExp(`^${MARKS}\\[${DATE},?${SP}*${TIME}${AMPM}\\]${SP}*(.*)$`);
/** Android style:  12/05/26, 10:30 pm - Lucky: Hello */
const ANDROID_HEADER = new RegExp(`^${MARKS}${DATE},?${SP}+${TIME}${AMPM}${SP}+[-–—]${SP}+(.*)$`);

interface RawHeader {
  style: 'ios' | 'android';
  parts: DateParts;
  firstDigits: number;
  lastDigits: number;
  hour: number;
  minute: number;
  second: number;
  ampm: 'am' | 'pm' | null;
  tsText: string;
  rest: string;
}

export function matchHeader(line: string): RawHeader | null {
  let style: RawHeader['style'] = 'ios';
  let m = IOS_HEADER.exec(line);
  if (!m) {
    m = ANDROID_HEADER.exec(line);
    style = 'android';
  }
  if (!m) return null;
  const [, a, , b, c, hh, mm, ss, ap, rest] = m;
  const hour = Number(hh);
  const minute = Number(mm);
  const second = ss ? Number(ss) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ampm = ap ? (ap.replace(/[^a-z]/gi, '').toLowerCase().startsWith('p') ? 'pm' : 'am') : null;
  if (ampm && (hour < 1 || hour > 12)) return null;
  const restStart = line.length - rest.length;
  const tsText = stripMarks(line.slice(0, restStart))
    .replace(/^\[|\]?[\s\u00a0\u202f]*(?:[-–—][\s\u00a0\u202f]*)?$/g, '')
    .trim();
  return {
    style,
    parts: [Number(a), Number(b), Number(c)],
    firstDigits: a.length,
    lastDigits: c.length,
    hour,
    minute,
    second,
    ampm,
    tsText,
    rest,
  };
}

function hour24(h: RawHeader): number {
  if (!h.ampm) return h.hour;
  return (h.hour % 12) + (h.ampm === 'pm' ? 12 : 0);
}

/** Split "Sender: text" vs. system text. */
function splitRest(rest: string, style: RawHeader['style']): {
  sender: string | null;
  body: string;
  system: SystemEvent | null;
} {
  // The sender separator is the first colon followed by a space, a newline or
  // the end of the text. Colons inside the message (times, URLs, "a: b") are
  // never used because only the first separator on the header line counts.
  const sep = /^([^\n]*?):(?: |(?=\n)|$)/.exec(rest);

  if (!sep) {
    // No sender separator: a system notice (in any language).
    return { sender: null, body: rest, system: matchSystem(rest) ?? 'other' };
  }

  // A known system pattern with an actor that does not contain ": " wins
  // (e.g. `Lucky changed the subject from "a: b" to "c"`).
  const sys = matchSystem(rest);
  if (sys) return { sender: null, body: rest, system: sys };

  const sender = sep[1].trim();
  const body = rest.slice(sep[0].length).replace(/^\n/, '');

  // iOS writes system notices as "<Chat name>: \u200e<notice>".
  if (style === 'ios' || /^[\u200e\u200f]/.test(body)) {
    const bodySys = /^[\u200e\u200f]/.test(body) ? matchSystem(body) : null;
    if (bodySys) return { sender: null, body: stripMarks(body).trim(), system: bodySys };
  }
  if (!sender) return { sender: null, body, system: null };
  return { sender: stripMarks(sender).trim(), body, system: null };
}

const GROUP_EVENTS = new Set<SystemEvent>([
  'group_created',
  'member_added',
  'member_removed',
  'member_left',
  'member_joined',
  'subject_changed',
  'icon_changed',
  'description_changed',
  'admin',
]);

function excerpt(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

/**
 * Parse the text of a WhatsApp chat export.
 *
 * State machine: each line either starts a new message (it matches a header
 * pattern) or continues the current message. Text before the first header is
 * kept as an `unparsed` message and reported - nothing is silently dropped.
 */
export function parseChat(input: string, options: ParseOptions = {}): ParseResult {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const text = input.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  // Drop a single trailing empty line produced by a final newline.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  const warnings: ParseWarning[] = [];

  // Pass 1: find headers and group lines into raw entries.
  interface Entry {
    header: RawHeader | null;
    line: number;
    lines: string[];
  }
  const entries: Entry[] = [];
  let current: Entry | null = null;
  let truncated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = matchHeader(line);
    if (header) {
      if (entries.length >= maxMessages) {
        truncated = true;
        break;
      }
      current = { header, line: i + 1, lines: [header.rest] };
      entries.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim() !== '') {
      current = { header: null, line: i + 1, lines: [line] };
      entries.push(current);
    }
  }

  if (truncated) {
    warnings.push({
      line: 0,
      code: 'truncated',
      message: `This export has more than ${maxMessages.toLocaleString()} messages. Only the first ${maxMessages.toLocaleString()} were read.`,
    });
  }

  const headers = entries.filter((e) => e.header).map((e) => e.header!);
  const samples: DateSample[] = headers.map((h) => ({
    parts: h.parts,
    firstDigits: h.firstDigits,
    lastDigits: h.lastDigits,
    minutes: hour24(h) * 60 + h.minute,
  }));
  const decision = decideDateOrder(samples, options.dateOrder);

  const iosCount = headers.filter((h) => h.style === 'ios').length;
  const format: SourceFormat =
    headers.length === 0
      ? 'unknown'
      : iosCount === headers.length
        ? 'ios'
        : iosCount === 0
          ? 'android'
          : 'mixed';
  const hour12 = headers.some((h) => h.ampm !== null);

  // Pass 2: build messages.
  const messages: ParsedMessage[] = [];
  let lastTs = 0;
  let groupEvents = false;
  let outOfOrder = 0;
  let firstOutOfOrderLine = 0;

  for (const entry of entries) {
    const order = messages.length;
    if (!entry.header) {
      const body = entry.lines.join('\n').replace(/\s+$/, '');
      warnings.push({
        line: entry.line,
        code: 'orphan_text',
        message: 'Text found before the first recognised message. It is kept as an unattributed note.',
        excerpt: excerpt(body),
      });
      messages.push({
        order,
        line: entry.line,
        ts: lastTs,
        tsText: '',
        sender: null,
        text: body,
        type: 'unparsed',
        edited: false,
        warnings: ['Not recognised as a WhatsApp message'],
      });
      continue;
    }

    const h = entry.header;
    const msgWarnings: string[] = [];
    const ymd = toYMD(h.parts, decision.order, h.firstDigits, h.lastDigits);
    let ts: number;
    if (ymd) {
      ts = Date.UTC(ymd.y, ymd.m - 1, ymd.d, hour24(h), h.minute, h.second);
    } else {
      ts = lastTs;
      msgWarnings.push('Invalid date');
      warnings.push({
        line: entry.line,
        code: 'invalid_date',
        message: `The date "${h.tsText}" is not valid as ${decision.order}. The previous message time was used for ordering.`,
        excerpt: excerpt(entry.lines[0]),
      });
    }
    if (ymd && lastTs && ts < lastTs - 60_000) {
      outOfOrder++;
      if (!firstOutOfOrderLine) firstOutOfOrderLine = entry.line;
    }
    if (ymd) lastTs = Math.max(lastTs, ts);

    const rest = entry.lines.join('\n').replace(/\s+$/, '');
    const { sender, body, system } = splitRest(rest, h.style);

    if (system) {
      if (GROUP_EVENTS.has(system)) groupEvents = true;
      messages.push({
        order,
        line: entry.line,
        ts,
        tsText: h.tsText,
        sender: null,
        text: stripMarks(body).trim(),
        type: 'system',
        edited: false,
        systemEvent: system,
        ...(msgWarnings.length ? { warnings: msgWarnings } : {}),
      });
      continue;
    }

    if (!sender) {
      msgWarnings.push('Missing sender');
      warnings.push({
        line: entry.line,
        code: 'missing_sender',
        message: 'A message has no sender name. It is shown as an unattributed message.',
        excerpt: excerpt(rest),
      });
    }

    const cls = classifyBody(body);
    messages.push({
      order,
      line: entry.line,
      ts,
      tsText: h.tsText,
      sender: sender || null,
      text: cls.text,
      type: cls.type,
      edited: cls.edited,
      ...(cls.media ? { media: cls.media } : {}),
      ...(msgWarnings.length ? { warnings: msgWarnings } : {}),
    });
  }

  if (outOfOrder > 0) {
    warnings.push({
      line: firstOutOfOrderLine,
      code: 'out_of_order',
      message: `${outOfOrder} message${outOfOrder === 1 ? ' has a time' : 's have times'} earlier than the message before. Source order is kept.`,
    });
  }
  if (!decision.confident && headers.length > 0) {
    warnings.push({
      line: 0,
      code: 'date_order',
      message: 'The date format is ambiguous (day/month could be swapped). Please confirm how dates should be read.',
    });
  }

  // Participants in order of first appearance.
  const senderMap = new Map<string, SenderInfo>();
  for (const m of messages) {
    if (!m.sender) continue;
    const s = senderMap.get(m.sender);
    if (s) s.count++;
    else senderMap.set(m.sender, { name: m.sender, count: 1, firstOrder: m.order });
  }

  const dateSamples: string[] = [];
  const seen = new Set<string>();
  for (const h of headers) {
    const ds = h.parts.join('/');
    if (seen.has(ds)) continue;
    seen.add(ds);
    dateSamples.push(h.tsText);
    if (dateSamples.length >= 6) break;
  }

  return {
    messages,
    senders: [...senderMap.values()],
    format,
    dateOrder: decision.order,
    dateOrderCandidates: decision.candidates,
    dateOrderConfident: decision.confident,
    hour12,
    warnings,
    groupEvents,
    lineCount: lines.length,
    dateSamples,
  };
}

/** True if the text looks like a WhatsApp export (enough recognised headers). */
export function looksLikeWhatsApp(text: string, sampleLines = 200): boolean {
  const lines = text.replace(/^\ufeff/, '').split(/\r\n?|\n/, sampleLines);
  return lines.some((l) => matchHeader(l) !== null);
}
