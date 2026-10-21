import Dexie, { type Table } from 'dexie';
import type { Attachment, Conversation, Message, Participant, StoredBlob } from '../types';

export const DB_NAME = 'chatss';

/**
 * Versioned IndexedDB schema.
 *
 * Migration policy: never delete or rewrite user data in an upgrade. New
 * versions add `this.version(n).stores({...}).upgrade(...)` blocks below the
 * existing ones; old blocks are kept so every past version can upgrade.
 */
export class ChatssDB extends Dexie {
  conversations!: Table<Conversation, string>;
  participants!: Table<Participant, string>;
  messages!: Table<Message, string>;
  attachments!: Table<Attachment, string>;
  /** Attachment bytes, kept apart so listing attachments never loads files. */
  blobs!: Table<StoredBlob, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      conversations: 'id, status, importedAt, latestTs, fingerprint',
      participants: 'id, conversationId',
      messages: 'id, conversationId, [conversationId+order], [conversationId+ts], [conversationId+senderId]',
      attachments: 'id, conversationId, messageId',
      blobs: 'id, conversationId',
    });
  }
}

let instance: ChatssDB | null = null;

export function getDb(): ChatssDB {
  if (!instance) instance = new ChatssDB();
  return instance;
}

/** Test helper: swap the database (e.g. a fresh fake-indexeddb instance). */
export function setDb(db: ChatssDB | null): void {
  instance = db;
}

export function isQuotaError(e: unknown): boolean {
  const err = e as { name?: string; inner?: { name?: string } } | null;
  const names = [err?.name, err?.inner?.name];
  return names.some((n) => n === 'QuotaExceededError' || n === 'QuotaExceeded');
}
