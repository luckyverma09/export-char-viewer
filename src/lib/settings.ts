/**
 * Small per-device UI preferences in localStorage. Never stores chat content:
 * only ids, theme, and list positions. All access is guarded because storage
 * can be unavailable (private mode, blocked site data).
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type SortPref = 'recent' | 'name' | 'size';

const KEY = 'chatss:prefs:v1';

interface Prefs {
  theme: ThemePref;
  sort: SortPref;
  lastConversationId: string | null;
  /** conversationId -> index of the top visible row */
  positions: Record<string, number>;
  persistAsked: boolean;
}

const DEFAULTS: Prefs = { theme: 'system', sort: 'recent', lastConversationId: null, positions: {}, persistAsked: false };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, positions: {} };
    return { ...DEFAULTS, positions: {}, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS, positions: {} };
  }
}

function write(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: preferences are simply not remembered.
  }
}

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return read()[key];
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  const p = read();
  p[key] = value;
  write(p);
}

export function savePosition(conversationId: string, rowIndex: number): void {
  const p = read();
  p.positions[conversationId] = rowIndex;
  const keys = Object.keys(p.positions);
  if (keys.length > 200) delete p.positions[keys[0]];
  write(p);
}

export function forgetConversation(conversationId: string): void {
  const p = read();
  delete p.positions[conversationId];
  if (p.lastConversationId === conversationId) p.lastConversationId = null;
  write(p);
}

export function resetPrefs(): void {
  write({ ...DEFAULTS, positions: {}, theme: read().theme });
}
