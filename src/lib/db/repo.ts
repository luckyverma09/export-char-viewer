import type { ImportRecords } from '../importer/build';
import { normalizeName } from '../importer/build';
import { previewText } from '../preview';
import type { Attachment, Conversation, Message, Participant, StoredBlob } from '../types';
import { getDb, isQuotaError } from './db';

export const MESSAGE_BATCH = 2000;
const ATTACHMENT_BATCH = 16;

export class StorageError extends Error {
  readonly quota: boolean;
  constructor(message: string, quota = false) {
    super(message);
    this.name = 'StorageError';
    this.quota = quota;
  }
}

export interface ImportProgress {
  phase: 'messages' | 'attachments' | 'finishing';
  done: number;
  total: number;
}

/** Read archive files by path (implemented by the import worker for ZIPs). */
export type FileReader = (paths: string[]) => Promise<Map<string, Uint8Array>>;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.byteOffset === 0 && u.byteLength === u.buffer.byteLength
    ? (u.buffer as ArrayBuffer)
    : (u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer);
}

/**
 * Save an import. The conversation is written with status "importing" first
 * and only flipped to "complete" when every message and attachment is stored.
 * On any failure the partial conversation is removed, so an incomplete import
 * is never shown as successful.
 */
export async function saveImport(
  records: ImportRecords,
  readFiles: FileReader | null,
  onProgress?: (p: ImportProgress) => void,
): Promise<string> {
  const db = getDb();
  const { conversation, participants, messages, attachments } = records;
  const id = conversation.id;
  try {
    await db.transaction('rw', db.conversations, db.participants, async () => {
      await db.conversations.add({ ...conversation, status: 'importing' });
      await db.participants.bulkAdd(participants);
    });

    for (let i = 0; i < messages.length; i += MESSAGE_BATCH) {
      await db.messages.bulkAdd(messages.slice(i, i + MESSAGE_BATCH));
      onProgress?.({ phase: 'messages', done: Math.min(i + MESSAGE_BATCH, messages.length), total: messages.length });
      await tick();
    }

    let stored = 0;
    const missing: string[] = [];
    if (attachments.length > 0 && readFiles) {
      for (let i = 0; i < attachments.length; i += ATTACHMENT_BATCH) {
        const batch = attachments.slice(i, i + ATTACHMENT_BATCH);
        const files = await readFiles(batch.map((a) => a.archivePath));
        const metas: Attachment[] = [];
        const blobs: StoredBlob[] = [];
        for (const { archivePath, ...a } of batch) {
          const data = files.get(archivePath);
          if (data) {
            metas.push({ ...a, size: data.byteLength, status: 'available' });
            blobs.push({ id: a.id, conversationId: id, data: toArrayBuffer(data) });
            stored++;
          } else {
            metas.push({ ...a, status: 'missing' });
            missing.push(a.messageId);
          }
        }
        await db.transaction('rw', db.attachments, db.blobs, async () => {
          await db.attachments.bulkAdd(metas);
          if (blobs.length) await db.blobs.bulkAdd(blobs);
        });
        onProgress?.({ phase: 'attachments', done: Math.min(i + ATTACHMENT_BATCH, attachments.length), total: attachments.length });
        await tick();
      }
    }

    onProgress?.({ phase: 'finishing', done: 1, total: 1 });
    await db.conversations.update(id, { status: 'complete', attachmentCount: stored });
    return id;
  } catch (e) {
    await deleteConversation(id).catch(() => undefined);
    if (isQuotaError(e)) {
      throw new StorageError(
        'There is not enough storage space on this device to save this chat. Free some space or import a smaller chat (for example without media).',
        true,
      );
    }
    throw new StorageError('The chat could not be saved to local storage. Nothing was imported.');
  }
}

/** Remove leftovers of imports interrupted by a crash or closed tab. */
export async function cleanupIncompleteImports(): Promise<number> {
  const db = getDb();
  const stale = await db.conversations.where('status').equals('importing').primaryKeys();
  for (const id of stale) await deleteConversation(id);
  return stale.length;
}

export async function listConversations(): Promise<Conversation[]> {
  return getDb().conversations.where('status').equals('complete').toArray();
}

export function getConversation(id: string): Promise<Conversation | undefined> {
  return getDb().conversations.get(id);
}

/** Participants of a chat, most active first (stable, deterministic order). */
export async function getParticipants(conversationId: string): Promise<Participant[]> {
  const list = await getDb().participants.where('conversationId').equals(conversationId).toArray();
  return list.sort((a, b) => b.messageCount - a.messageCount || a.displayName.localeCompare(b.displayName));
}

export async function getAllParticipants(): Promise<Participant[]> {
  return getDb().participants.toArray();
}

/** All messages of a conversation in source (chronological) order. */
export function loadMessages(conversationId: string): Promise<Message[]> {
  return getDb()
    .messages.where('[conversationId+order]')
    .between([conversationId, -Infinity], [conversationId, Infinity])
    .toArray();
}

export function findByFingerprint(fingerprint: string): Promise<Conversation[]> {
  return getDb().conversations.where('fingerprint').equals(fingerprint).and((c) => c.status === 'complete').toArray();
}

/** Change "who am I" for a conversation. Messages are never touched. */
export async function setSelfParticipant(conversationId: string, participantId: string | null): Promise<void> {
  const db = getDb();
  if (participantId) {
    const p = await db.participants.get(participantId);
    if (!p || p.conversationId !== conversationId) throw new Error('Unknown participant');
  }
  await db.conversations.update(conversationId, { selfParticipantId: participantId });
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const t = title.trim();
  if (!t) return;
  await getDb().conversations.update(id, { title: t.slice(0, 200) });
}

export async function renameParticipant(id: string, displayName: string): Promise<void> {
  const name = displayName.trim();
  if (!name) return;
  await getDb().participants.update(id, { displayName: name.slice(0, 120), normalizedName: normalizeName(name) });
}

export async function deleteConversation(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.conversations, db.participants, db.messages, db.attachments, db.blobs], async () => {
    await db.messages.where('conversationId').equals(id).delete();
    await db.participants.where('conversationId').equals(id).delete();
    await db.attachments.where('conversationId').equals(id).delete();
    await db.blobs.where('conversationId').equals(id).delete();
    await db.conversations.delete(id);
  });
}

export async function clearAllData(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', [db.conversations, db.participants, db.messages, db.attachments, db.blobs], async () => {
    await Promise.all([
      db.conversations.clear(),
      db.participants.clear(),
      db.messages.clear(),
      db.attachments.clear(),
      db.blobs.clear(),
    ]);
  });
}

export function getAttachment(id: string): Promise<Attachment | undefined> {
  return getDb().attachments.get(id);
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  const db = getDb();
  const [meta, data] = await Promise.all([db.attachments.get(id), db.blobs.get(id)]);
  if (!meta || !data) return null;
  return new Blob([data.data], { type: meta.mimeType });
}

export interface GlobalHit {
  conversationId: string;
  messageId: string;
  order: number;
  ts: number;
  senderId: string | null;
  preview: string;
}

/**
 * Search message text across all chats. Scans the messages table with an early
 * exit after `limit` hits; `signal` cancels stale searches between keystrokes.
 */
export async function searchAllMessages(
  query: string,
  limit = 50,
  signal?: { cancelled: boolean },
): Promise<GlobalHit[]> {
  const q = query.normalize('NFC').toLocaleLowerCase();
  if (q.length < 2) return [];
  const hits: GlobalHit[] = [];
  await getDb()
    .messages.filter((m) => {
      if (signal?.cancelled) return false;
      return m.type !== 'system' && m.text.normalize('NFC').toLocaleLowerCase().includes(q);
    })
    .until(() => hits.length >= limit || !!signal?.cancelled, true)
    .each((m) => {
      if (hits.length < limit) {
        hits.push({
          conversationId: m.conversationId,
          messageId: m.id,
          order: m.order,
          ts: m.ts,
          senderId: m.senderId,
          preview: previewText(m, 160),
        });
      }
    });
  return hits;
}
