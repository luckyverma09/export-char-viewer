import type { Message } from './types';

export function normalizeForSearch(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase();
}

/**
 * Lazily-built lowercase text cache so repeated searches in one chat do not
 * re-normalise every message on each keystroke.
 */
export class ChatSearchIndex {
  private cache: string[] | null = null;
  constructor(private readonly messages: Message[]) {}

  private texts(): string[] {
    if (!this.cache) {
      this.cache = this.messages.map((m) =>
        normalizeForSearch(m.media?.fileName ? `${m.text}\n${m.media.fileName}` : m.text),
      );
    }
    return this.cache;
  }

  /** Indices (into messages) of every message containing the query. */
  find(query: string): number[] {
    const q = normalizeForSearch(query.trim());
    if (!q) return [];
    const out: number[] = [];
    const texts = this.texts();
    for (let i = 0; i < texts.length; i++) if (texts[i].includes(q)) out.push(i);
    return out;
  }
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Split text into matching / non-matching segments for highlighting. */
export function highlightSegments(text: string, query: string): Segment[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [{ text, match: false }];
  const lower = normalizeForSearch(text);
  // Lower-casing can change string length for a few scripts; fall back safely.
  if (lower.length !== text.length) return [{ text, match: lower.includes(q) }];
  const out: Segment[] = [];
  let pos = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    if (i > pos) out.push({ text: text.slice(pos, i), match: false });
    out.push({ text: text.slice(i, i + q.length), match: true });
    pos = i + q.length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), match: false });
  return out.length ? out : [{ text, match: false }];
}
