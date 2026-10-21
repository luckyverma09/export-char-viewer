/**
 * Converts message text into styled spans (WhatsApp formatting + links).
 * The output is rendered with React text nodes only - never as HTML - so
 * imported content cannot inject markup or scripts.
 */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mono?: boolean;
  /** Only http(s) URLs ever become links. */
  href?: string;
}

type Flags = Omit<RichSpan, 'text' | 'href'>;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const FORMAT_RE = /(^|[^\p{L}\p{N}*_~])([*_~])(?![\s*_~])([^\n]*?[^\s])\2(?![\p{L}\p{N}])/u;
const MARKER_FLAG: Record<string, keyof Flags> = { '*': 'bold', _: 'italic', '~': 'strike' };

/** Normalise a URL found in text; returns null for anything not http(s). */
export function safeHref(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function formatted(text: string, flags: Flags, out: RichSpan[]): void {
  let rest = text;
  while (rest) {
    const m = FORMAT_RE.exec(rest);
    if (!m) {
      out.push({ text: rest, ...flags });
      return;
    }
    const start = m.index + m[1].length;
    if (start > 0) out.push({ text: rest.slice(0, start), ...flags });
    formatted(m[3], { ...flags, [MARKER_FLAG[m[2]]]: true }, out);
    rest = rest.slice(m.index + m[0].length);
  }
}

function linked(text: string, flags: Flags, out: RichSpan[]): void {
  let pos = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // Trailing punctuation usually belongs to the sentence, not the URL.
    const trail = /[.,!?;:)\]}'"»]+$/.exec(url);
    if (trail && !(trail[0].startsWith(')') && url.includes('('))) url = url.slice(0, url.length - trail[0].length);
    const idx = m.index ?? 0;
    const href = safeHref(url);
    if (!href) continue;
    if (idx > pos) formatted(text.slice(pos, idx), flags, out);
    out.push({ text: url, href, ...flags });
    pos = idx + url.length;
  }
  if (pos < text.length) formatted(text.slice(pos), flags, out);
}

export function parseRich(text: string): RichSpan[] {
  const out: RichSpan[] = [];
  const parts = text.split(/```([\s\S]+?)```/);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) out.push({ text: part, mono: true });
    else linked(part, {}, out);
  });
  // Merge adjacent spans with identical styling.
  const merged: RichSpan[] = [];
  for (const s of out) {
    const p = merged[merged.length - 1];
    if (p && !p.href && !s.href && p.bold === s.bold && p.italic === s.italic && p.strike === s.strike && p.mono === s.mono) {
      p.text += s.text;
    } else merged.push({ ...s });
  }
  return merged;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|\u200d|\ufe0f|\s)+$/u;

/** WhatsApp shows 1-3 emoji with no other text in a larger size. */
export function isJumboEmoji(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40 || !EMOJI_ONLY.test(t) || /^[\d#*\s]+$/.test(t)) return false;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  const count = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(t.replace(/\s/g, ''))].length : Array.from(t).length;
  return count <= 3;
}
