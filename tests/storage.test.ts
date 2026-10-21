import { describe, expect, it, vi } from 'vitest';
import { ChatssDB, setDb } from '../src/lib/db/db';
import {
  cleanupIncompleteImports,
  deleteConversation,
  findByFingerprint,
  getConversation,
  getParticipants,
  listConversations,
  loadMessages,
  renameParticipant,
  saveImport,
  searchAllMessages,
  setSelfParticipant,
  StorageError,
} from '../src/lib/db/repo';
import { buildRecords, defaultDecisions } from '../src/lib/importer/build';
import { prepareFromText } from '../src/lib/importer/draft';
import { sideOf } from '../src/lib/perspective';
import { ANDROID_12H, GROUP, syntheticChat } from './fixtures/chats';
import { freshDb, importText } from './helpers';

describe('IndexedDB persistence', () => {
  it('saves a chat and reads it back after the database is reopened (reload)', async () => {
    const db = freshDb();
    const { id } = await importText(ANDROID_12H);
    db.close();

    // Simulate an app reload: a brand new connection to the same database.
    const reopened = new ChatssDB(db.name);
    setDb(reopened);
    const convs = await listConversations();
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ id, status: 'complete', messageCount: 9 });
    const msgs = await loadMessages(id);
    expect(msgs.map((m) => m.order)).toEqual([...Array(9).keys()]);
    expect(msgs[1].text).toBe('Hello');
    expect(msgs[1].tsText).toBe('12/05/26, 10:30 pm');
  });

  it('stores messages in batches and reports progress', async () => {
    freshDb();
    const draft = prepareFromText(syntheticChat(5000));
    const d = defaultDecisions(draft);
    const progress: number[] = [];
    const id = await saveImport(buildRecords(draft, d), null, (p) => p.phase === 'messages' && progress.push(p.done));
    expect(progress).toEqual([2000, 4000, 5000]);
    expect((await loadMessages(id)).length).toBe(5000);
  });

  it('deletes a conversation and all its rows', async () => {
    const db = freshDb();
    const { id } = await importText(ANDROID_12H);
    await importText(GROUP);
    await deleteConversation(id);
    expect(await getConversation(id)).toBeUndefined();
    expect(await db.messages.where('conversationId').equals(id).count()).toBe(0);
    expect(await db.participants.where('conversationId').equals(id).count()).toBe(0);
    expect(await listConversations()).toHaveLength(1);
  });

  it('rolls back a failed import and reports quota errors clearly', async () => {
    const db = freshDb();
    const draft = prepareFromText(ANDROID_12H);
    const records = buildRecords(draft, defaultDecisions(draft));
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const spy = vi.spyOn(db.messages, 'bulkAdd').mockRejectedValueOnce(quota);
    const err = await saveImport(records, null).catch((e) => e);
    spy.mockRestore();
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).quota).toBe(true);
    expect((err as Error).message).toMatch(/not enough storage/i);
    expect(await db.conversations.count()).toBe(0);
    expect(await db.messages.count()).toBe(0);
  });

  it('never lists incomplete imports and cleans them up on start', async () => {
    const db = freshDb();
    const draft = prepareFromText(ANDROID_12H);
    const records = buildRecords(draft, defaultDecisions(draft));
    await db.conversations.add({ ...records.conversation, status: 'importing' });
    await db.messages.bulkAdd(records.messages);
    expect(await listConversations()).toHaveLength(0);
    expect(await cleanupIncompleteImports()).toBe(1);
    expect(await db.messages.count()).toBe(0);
  });

  it('detects re-imports of the same export by fingerprint', async () => {
    freshDb();
    const { draft } = await importText(ANDROID_12H);
    expect(await findByFingerprint(draft.fingerprint)).toHaveLength(1);
    expect(await findByFingerprint(prepareFromText(GROUP).fingerprint)).toHaveLength(0);
  });
});

describe('perspective (who am I)', () => {
  it('switching perspective flips sides without touching messages', async () => {
    const db = freshDb();
    const { id } = await importText(ANDROID_12H);
    const ps = await getParticipants(id);
    const lucky = ps.find((p) => p.originalName === 'Lucky')!;
    const mansi = ps.find((p) => p.originalName === 'Mansi Sharma')!;
    const before = await loadMessages(id);
    const snapshot = JSON.stringify(before);

    let conv = (await getConversation(id))!;
    expect(conv.selfParticipantId).toBe(lucky.id);
    expect(sideOf(before[1], conv.selfParticipantId)).toBe('out'); // Lucky: Hello
    expect(sideOf(before[2], conv.selfParticipantId)).toBe('in'); // Mansi

    await setSelfParticipant(id, mansi.id);
    conv = (await getConversation(id))!;
    expect(sideOf(before[1], conv.selfParticipantId)).toBe('in');
    expect(sideOf(before[2], conv.selfParticipantId)).toBe('out');

    await setSelfParticipant(id, null);
    conv = (await getConversation(id))!;
    expect(sideOf(before[1], null)).toBe('in');
    expect(sideOf(before[2], null)).toBe('in');

    const after = await loadMessages(id);
    expect(JSON.stringify(after)).toBe(snapshot);
    expect(await db.messages.count()).toBe(before.length);
  });

  it('rejects a participant from another conversation', async () => {
    freshDb();
    const a = await importText(ANDROID_12H);
    const b = await importText(GROUP);
    const other = (await getParticipants(b.id))[0];
    await expect(setSelfParticipant(a.id, other.id)).rejects.toThrow();
  });

  it('system messages are always centred', () => {
    expect(sideOf({ type: 'system', senderId: null }, 'x')).toBe('center');
  });

  it('renaming a participant changes display only', async () => {
    freshDb();
    const { id } = await importText(ANDROID_12H);
    const p = (await getParticipants(id)).find((x) => x.originalName === 'Lucky')!;
    await renameParticipant(p.id, 'Lucky (brother)');
    const updated = (await getParticipants(id)).find((x) => x.id === p.id)!;
    expect(updated.displayName).toBe('Lucky (brother)');
    expect(updated.originalName).toBe('Lucky');
  });
});

describe('participant mapping', () => {
  it('merges two sender names into one participant', async () => {
    freshDb();
    const text = ['01/01/26, 10:00 - +91 98765 43210: hi', '01/01/26, 10:01 - Lucky: hello', '01/01/26, 10:02 - Mansi: yo'].join('\n');
    const { id } = await importText(text, (d) => ({
      ...d,
      participants: d.participants.map((p) => (p.raw === '+91 98765 43210' ? { ...p, mergeInto: 'Lucky' } : p)),
      selfRaw: '+91 98765 43210',
    }));
    const ps = await getParticipants(id);
    expect(ps).toHaveLength(2);
    const lucky = ps.find((p) => p.originalName === 'Lucky')!;
    expect(lucky.aliases).toEqual(['+91 98765 43210']);
    expect(lucky.messageCount).toBe(2);
    const msgs = await loadMessages(id);
    expect(msgs[0].senderId).toBe(lucky.id);
    expect((await getConversation(id))!.selfParticipantId).toBe(lucky.id);
  });
});

describe('global search', () => {
  it('finds messages across chats case-insensitively, including emoji', async () => {
    freshDb();
    await importText(ANDROID_12H);
    await importText(GROUP);
    expect((await searchAllMessages('HELLO')).map((h) => h.preview).sort()).toEqual(['Hello', 'Hello 🙏']);
    expect(await searchAllMessages('😊')).toHaveLength(1);
    expect(await searchAllMessages('x')).toHaveLength(0); // too short
  });

  it('caps results and honours cancellation', async () => {
    freshDb();
    await importText(syntheticChat(3000));
    expect(await searchAllMessages('needle', 10)).toHaveLength(10);
    expect(await searchAllMessages('needle', 10, { cancelled: true })).toHaveLength(0);
  });
});
