import type { Message } from './types';

export type Side = 'out' | 'in' | 'center';

/**
 * Where a message is drawn, given who the user chose to be. Messages by the
 * selected participant go right ("out"); everyone else goes left ("in");
 * system notices and unattributed text are centred. With no selection
 * (`selfId === null`) every message appears on the left.
 */
export function sideOf(m: Pick<Message, 'type' | 'senderId'>, selfId: string | null): Side {
  if (m.type === 'system') return 'center';
  if (m.type === 'unparsed' && !m.senderId) return 'center';
  return selfId !== null && m.senderId === selfId ? 'out' : 'in';
}
