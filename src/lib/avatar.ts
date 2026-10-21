/** Number of distinct sender/avatar colours defined in index.css (--sender-N). */
export const COLOR_COUNT = 12;

export function colorIndexFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % COLOR_COUNT;
}

/** Initials for a generated avatar. Phone numbers get a generic glyph. */
export function initialsFor(name: string): string {
  const clean = name.replace(/[\u200e\u200f]/g, '').trim();
  if (!clean) return '?';
  if (/^[+\d\s()-]+$/.test(clean)) return '#';
  const words = clean.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const first = (w: string) => Array.from(w.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '';
  if (words.length === 0) return Array.from(clean)[0] ?? '?';
  const a = first(words[0]);
  const b = words.length > 1 ? first(words[words.length - 1]) : '';
  return (a + b).toUpperCase();
}
