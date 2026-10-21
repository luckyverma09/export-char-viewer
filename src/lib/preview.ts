import { MEDIA_LABEL } from './media';
import type { Message } from './types';

/** One-line preview of a message for the conversation list / search results. */
export function previewText(m: Pick<Message, 'type' | 'text' | 'media'>, max = 120): string {
  let s: string;
  switch (m.type) {
    case 'media': {
      const label = m.media ? MEDIA_LABEL[m.media.kind] : 'Media';
      s = m.text ? `${label}: ${m.text}` : label;
      break;
    }
    case 'deleted':
      s = 'This message was deleted';
      break;
    default:
      s = m.text;
  }
  s = s.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
