import { MEDIA_LABEL } from './media';
import type { Conversation, Message, Participant } from './types';

/**
 * Re-create a WhatsApp-style text export from stored messages, using the
 * original timestamp text and the current participant display names.
 */
export function conversationToText(_conversation: Conversation, participants: Participant[], messages: Message[]): string {
  const names = new Map(participants.map((p) => [p.id, p.displayName]));
  const lines: string[] = [];
  for (const m of messages) {
    if (m.type === 'unparsed') {
      lines.push(m.text);
      continue;
    }
    let body: string;
    if (m.type === 'media' && m.media) {
      const ref = m.media.fileName ? `${m.media.fileName} (file attached)` : `<${MEDIA_LABEL[m.media.kind]} omitted>`;
      body = m.text ? `${ref}\n${m.text}` : ref;
    } else {
      body = m.text;
    }
    if (m.edited) body += ' <This message was edited>';
    const prefix = m.tsText ? `${m.tsText} - ` : '';
    const sender = m.senderId ? names.get(m.senderId) ?? m.rawSender : m.rawSender;
    lines.push(m.type === 'system' || !sender ? `${prefix}${body}` : `${prefix}${sender}: ${body}`);
  }
  return `${lines.join('\n')}\n`;
}

/** File-system-safe file name for downloads. */
export function safeFileName(name: string, fallback = 'chat'): string {
  const cleaned = name
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex -- deliberately strip control characters
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** Offer a Blob to the user as a download (no network involved). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
