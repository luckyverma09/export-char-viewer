import type { MediaKind } from './types';

/**
 * Allow-list of file extensions Chatss will store from imported archives, with
 * the MIME type used when the file is displayed. Anything not listed is treated
 * as an opaque document that can only be downloaded (never rendered inline).
 */
const EXT: Record<string, { mime: string; kind: MediaKind }> = {
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  png: { mime: 'image/png', kind: 'image' },
  gif: { mime: 'image/gif', kind: 'gif' },
  webp: { mime: 'image/webp', kind: 'image' },
  heic: { mime: 'image/heic', kind: 'image' },
  heif: { mime: 'image/heif', kind: 'image' },
  mp4: { mime: 'video/mp4', kind: 'video' },
  m4v: { mime: 'video/mp4', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  '3gp': { mime: 'video/3gpp', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  opus: { mime: 'audio/ogg', kind: 'audio' },
  ogg: { mime: 'audio/ogg', kind: 'audio' },
  m4a: { mime: 'audio/mp4', kind: 'audio' },
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  aac: { mime: 'audio/aac', kind: 'audio' },
  amr: { mime: 'audio/amr', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
  pdf: { mime: 'application/pdf', kind: 'document' },
  vcf: { mime: 'text/vcard', kind: 'contact' },
  txt: { mime: 'text/plain', kind: 'document' },
  doc: { mime: 'application/msword', kind: 'document' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'document' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'document' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' },
  csv: { mime: 'text/csv', kind: 'document' },
};

/** MIME types that are safe to render inline (img/video/audio elements). */
const INLINE_SAFE = /^(image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|quicktime|3gpp|webm)|audio\/(ogg|mp4|mpeg|aac|amr|wav))$/;

export function extensionOf(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(fileName);
  return m ? m[1].toLowerCase() : '';
}

export function mimeForFile(fileName: string): string {
  return EXT[extensionOf(fileName)]?.mime ?? 'application/octet-stream';
}

export function isInlineSafeMime(mime: string): boolean {
  return INLINE_SAFE.test(mime);
}

/** Guess what kind of media a WhatsApp file name refers to. */
export function kindForFile(fileName: string): MediaKind {
  const base = fileName.toUpperCase();
  // WhatsApp naming conventions (Android: IMG-20240101-WA0001.jpg, iOS: 00000012-PHOTO-2024-...).
  if (/^PTT-|-AUDIO-|^AUD-.*\.OPUS$/.test(base)) return 'voice';
  if (/^STK-|-STICKER-/.test(base)) return 'sticker';
  if (/-GIF-|\.GIF$/.test(base)) return 'gif';
  if (/^IMG-|-PHOTO-/.test(base)) return 'image';
  if (/^VID-|-VIDEO-/.test(base)) return 'video';
  if (/^AUD-/.test(base)) return 'audio';
  const kind = EXT[extensionOf(fileName)]?.kind;
  if (kind === 'image' && extensionOf(fileName) === 'webp' && /STK|STICKER/.test(base)) return 'sticker';
  return kind ?? 'document';
}

export const MEDIA_LABEL: Record<MediaKind, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
  voice: 'Voice message',
  document: 'Document',
  sticker: 'Sticker',
  gif: 'GIF',
  contact: 'Contact card',
  unknown: 'Media',
};

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
