import { normalizeName } from './build';

/**
 * Sender names that may need review: bare phone numbers, and names that are
 * equal or prefixes of each other after normalisation ("Mansi" / "Mansi S").
 */
export function findAmbiguousSenders(names: string[]): Set<string> {
  const out = new Set<string>();
  const norm = names.map((n) => normalizeName(n).replace(/[^\p{L}\p{N}]/gu, ''));
  for (let i = 0; i < names.length; i++) {
    if (/^\+?[\d\s()-]{7,}$/.test(names[i])) out.add(names[i]);
    for (let j = i + 1; j < names.length; j++) {
      if (norm[i] && norm[j] && (norm[i] === norm[j] || norm[i].startsWith(norm[j]) || norm[j].startsWith(norm[i]))) {
        out.add(names[i]);
        out.add(names[j]);
      }
    }
  }
  return out;
}
