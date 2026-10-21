import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { createId, messageId } from '../ids';
import type { Attachment, Conversation, Message, Participant } from '../types';
import { listZip, ZipError } from '../zip';
import { getDb } from './db';

/**
 * CHATSS BACKUP FORMAT (version 1)
 *
 * A ZIP archive containing:
 *   manifest.json                       BackupManifest
 *   conversations/<conversationId>.json ConversationBundle
 *   attachments/<attachmentId>          raw attachment bytes
 *
 * Restoring validates the manifest and every bundle before anything is
 * written, and never overwrites an existing conversation: conflicts are either
 * skipped or restored as a copy with new identifiers.
 */
export const BACKUP_FORMAT = 'chatss-backup';
export const BACKUP_VERSION = 1;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  app: 'Chatss';
  conversations: Array<{ id: string; title: string; messageCount: number; attachmentCount: number }>;
}

export interface ConversationBundle {
  conversation: Conversation;
  participants: Participant[];
  messages: Message[];
  attachments: Attachment[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Build a backup archive of the given conversations (default: all). */
export async function createBackup(conversationIds?: string[]): Promise<Blob> {
  const db = getDb();
  const convs = (await db.conversations.where('status').equals('complete').toArray()).filter(
    (c) => !conversationIds || conversationIds.includes(c.id),
  );
  const files: Zippable = {};
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    app: 'Chatss',
    conversations: [],
  };
  for (const conversation of convs) {
    const [participants, messages, attachments] = await Promise.all([
      db.participants.where('conversationId').equals(conversation.id).toArray(),
      db.messages.where('[conversationId+order]').between([conversation.id, -Infinity], [conversation.id, Infinity]).toArray(),
      db.attachments.where('conversationId').equals(conversation.id).toArray(),
    ]);
    const bundle: ConversationBundle = { conversation, participants, messages, attachments };
    files[`conversations/${conversation.id}.json`] = strToU8(JSON.stringify(bundle));
    for (const a of attachments) {
      const blob = await db.blobs.get(a.id);
      // Media is already compressed; store it as-is (level 0).
      if (blob) files[`attachments/${a.id}`] = [new Uint8Array(blob.data), { level: 0 }];
    }
    manifest.conversations.push({
      id: conversation.id,
      title: conversation.title,
      messageCount: messages.length,
      attachmentCount: attachments.length,
    });
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}

// --- Validation ----------------------------------------------------------------

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): v is string => isStr(v) && v.length > 0 && v.length <= 200;

function validateManifest(v: unknown): BackupManifest {
  const m = v as BackupManifest;
  if (!m || typeof m !== 'object' || m.format !== BACKUP_FORMAT) throw new BackupError('This file is not a Chatss backup.');
  if (!isNum(m.version) || m.version > BACKUP_VERSION) {
    throw new BackupError('This backup was created by a newer version of Chatss. Please update the app first.');
  }
  if (!Array.isArray(m.conversations) || !m.conversations.every((c) => isId(c?.id) && isStr(c?.title))) {
    throw new BackupError('The backup manifest is damaged.');
  }
  return m;
}

const MESSAGE_TYPES = new Set(['text', 'system', 'media', 'deleted', 'call', 'unparsed']);

export function validateBundle(v: unknown, expectedId: string): ConversationBundle {
  const b = v as ConversationBundle;
  const fail = (why: string): never => {
    throw new BackupError(`The backup data for a conversation is damaged (${why}).`);
  };
  if (!b || typeof b !== 'object') fail('not an object');
  const c = b.conversation;
  if (!c || c.id !== expectedId || !isStr(c.title) || (c.type !== 'individual' && c.type !== 'group')) fail('conversation');
  if (!Array.isArray(b.participants) || !Array.isArray(b.messages) || !Array.isArray(b.attachments)) fail('missing lists');
  const pids = new Set<string>();
  for (const p of b.participants) {
    if (!isId(p?.id) || p.conversationId !== c.id || !isStr(p.displayName) || !isStr(p.originalName)) fail('participant');
    pids.add(p.id);
  }
  for (const m of b.messages) {
    if (!isId(m?.id) || m.conversationId !== c.id || !isNum(m.order) || !isNum(m.ts) || !isStr(m.text)) fail('message');
    if (!MESSAGE_TYPES.has(m.type)) fail('message type');
    if (m.senderId !== null && m.senderId !== undefined && !pids.has(m.senderId)) fail('message sender');
  }
  for (const a of b.attachments) {
    if (!isId(a?.id) || a.conversationId !== c.id || !isStr(a.fileName) || !isStr(a.mimeType)) fail('attachment');
  }
  if (c.selfParticipantId !== null && c.selfParticipantId !== undefined && !pids.has(c.selfParticipantId)) fail('perspective');
  return b;
}

// --- Restore -------------------------------------------------------------------

export interface RestorePlanItem {
  id: string;
  title: string;
  messageCount: number;
  attachmentCount: number;
  /** An existing conversation already uses this id. */
  conflict: boolean;
}

export interface RestorePlan {
  createdAt: string;
  items: RestorePlanItem[];
}

export type RestoreChoice = 'skip' | 'restore' | 'copy';

function readJson(files: Record<string, Uint8Array>, path: string): unknown {
  const data = files[path];
  if (!data) throw new BackupError(`The backup is missing "${path}".`);
  try {
    return JSON.parse(strFromU8(data));
  } catch {
    throw new BackupError(`"${path}" in the backup is not valid JSON.`);
  }
}

function openArchive(bytes: Uint8Array, paths: (name: string) => boolean): Record<string, Uint8Array> {
  try {
    listZip(bytes); // size / entry / path validation
    return unzipSync(bytes, { filter: (f) => paths(f.name) });
  } catch (e) {
    if (e instanceof ZipError) throw new BackupError(e.message);
    throw new BackupError('The backup archive is damaged.');
  }
}

/** Read and validate a backup without changing the database. */
export async function inspectBackup(bytes: Uint8Array): Promise<RestorePlan> {
  const files = openArchive(bytes, (n) => n === 'manifest.json' || /^conversations\/[^/]+\.json$/.test(n));
  const manifest = validateManifest(readJson(files, 'manifest.json'));
  const db = getDb();
  const items: RestorePlanItem[] = [];
  for (const entry of manifest.conversations) {
    const bundle = validateBundle(readJson(files, `conversations/${entry.id}.json`), entry.id);
    const existing = await db.conversations.get(entry.id);
    items.push({
      id: entry.id,
      title: bundle.conversation.title,
      messageCount: bundle.messages.length,
      attachmentCount: bundle.attachments.length,
      conflict: !!existing,
    });
  }
  return { createdAt: manifest.createdAt, items };
}

/** Give a bundle fresh identifiers so it can live beside the original. */
export function remapBundle(b: ConversationBundle): ConversationBundle {
  const cid = createId();
  const pmap = new Map(b.participants.map((p) => [p.id, createId()]));
  const amap = new Map(b.attachments.map((a) => [a.id, createId()]));
  const mmap = new Map(b.messages.map((m) => [m.id, messageId(cid, m.order)]));
  return {
    conversation: {
      ...b.conversation,
      id: cid,
      participantIds: b.conversation.participantIds.map((id) => pmap.get(id) ?? id),
      selfParticipantId: b.conversation.selfParticipantId ? (pmap.get(b.conversation.selfParticipantId) ?? null) : null,
      lastMessageSenderId: b.conversation.lastMessageSenderId ? (pmap.get(b.conversation.lastMessageSenderId) ?? null) : null,
      title: `${b.conversation.title} (restored)`,
    },
    participants: b.participants.map((p) => ({ ...p, id: pmap.get(p.id)!, conversationId: cid })),
    messages: b.messages.map((m) => ({
      ...m,
      id: mmap.get(m.id)!,
      conversationId: cid,
      senderId: m.senderId ? (pmap.get(m.senderId) ?? null) : null,
      media: m.media ? { ...m.media, attachmentId: m.media.attachmentId ? amap.get(m.media.attachmentId) : undefined } : undefined,
    })),
    attachments: b.attachments.map((a) => ({
      ...a,
      id: amap.get(a.id)!,
      conversationId: cid,
      messageId: mmap.get(a.messageId) ?? a.messageId,
    })),
  };
}

/**
 * Restore conversations from a backup according to per-conversation choices.
 * Existing conversations are never overwritten: a conflicting "restore" is
 * treated as "skip"; use "copy" to keep both.
 */
export async function restoreBackup(
  bytes: Uint8Array,
  choices: Record<string, RestoreChoice>,
): Promise<{ restored: number; skipped: number }> {
  const files = openArchive(bytes, (n) => n === 'manifest.json' || n.startsWith('conversations/') || n.startsWith('attachments/'));
  const manifest = validateManifest(readJson(files, 'manifest.json'));
  const db = getDb();

  // Validate everything first; nothing is written if any bundle is damaged.
  const bundles = manifest.conversations.map((e) => validateBundle(readJson(files, `conversations/${e.id}.json`), e.id));

  let restored = 0;
  let skipped = 0;
  for (const original of bundles) {
    const choice = choices[original.conversation.id] ?? 'skip';
    const exists = !!(await db.conversations.get(original.conversation.id));
    if (choice === 'skip' || (choice === 'restore' && exists)) {
      skipped++;
      continue;
    }
    const bundle = choice === 'copy' ? remapBundle(original) : original;
    const blobFor = new Map(original.attachments.map((a, i) => [bundle.attachments[i].id, files[`attachments/${a.id}`]]));
    const attachments = bundle.attachments.map((a) => ({
      ...a,
      status: blobFor.get(a.id) ? ('available' as const) : ('missing' as const),
    }));
    await db.transaction('rw', [db.conversations, db.participants, db.messages, db.attachments, db.blobs], async () => {
      await db.conversations.add({ ...bundle.conversation, status: 'complete' });
      await db.participants.bulkAdd(bundle.participants);
      await db.messages.bulkAdd(bundle.messages);
      await db.attachments.bulkAdd(attachments);
      const blobs = attachments
        .filter((a) => blobFor.get(a.id))
        .map((a) => {
          const u = blobFor.get(a.id)!;
          return { id: a.id, conversationId: a.conversationId, data: u.slice().buffer as ArrayBuffer };
        });
      if (blobs.length) await db.blobs.bulkAdd(blobs);
    });
    restored++;
  }
  return { restored, skipped };
}
