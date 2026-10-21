import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BackupError, createBackup, inspectBackup, restoreBackup } from '../src/lib/db/backup';
import { getAttachmentBlob, getParticipants, listConversations, loadMessages } from '../src/lib/db/repo';
import { decodeChatBytes } from '../src/lib/decode';
import { ImportError, prepareFromBytes, prepareFromText, titleFromFileName } from '../src/lib/importer/draft';
import { conversationToText } from '../src/lib/exportText';
import { findChatEntry, listZip, safeEntryName, ZipError } from '../src/lib/zip';
import { ANDROID_12H, IOS } from './fixtures/chats';
import { freshDb, importText, importZip, makeZip } from './helpers';

const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

/** jsdom's Blob is only readable through FileReader. */
function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

describe('text decoding', () => {
  it('strips a UTF-8 BOM and keeps emoji', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8('12/05/26, 10:30 - A: hi 🎉')]);
    const d = decodeChatBytes(bytes);
    expect(d.hadBom).toBe(true);
    expect(d.text).toBe('12/05/26, 10:30 - A: hi 🎉');
  });

  it('reads UTF-16LE with BOM', () => {
    const s = '12/05/26, 10:30 - A: hé';
    const buf = new Uint8Array(2 + s.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < s.length; i++) {
      buf[2 + i * 2] = s.charCodeAt(i) & 0xff;
      buf[3 + i * 2] = s.charCodeAt(i) >> 8;
    }
    expect(decodeChatBytes(buf).text).toBe(s);
  });
});

describe('ZIP validation', () => {
  it('rejects path traversal, absolute paths and OS metadata', () => {
    expect(safeEntryName('../evil.txt')).toBeNull();
    expect(safeEntryName('a/../../evil.txt')).toBeNull();
    expect(safeEntryName('/etc/passwd')).toBeNull();
    expect(safeEntryName('C:/x.txt')).toBeNull();
    expect(safeEntryName('__MACOSX/._chat.txt')).toBeNull();
    expect(safeEntryName('folder/')).toBeNull();
    expect(safeEntryName('chat/_chat.txt')).toBe('_chat.txt');
  });

  it('ignores unsafe entries when listing', () => {
    const zip = makeZip({ '_chat.txt': IOS, '../evil.txt': 'x', '__MACOSX/._chat.txt': 'x' });
    expect(listZip(zip).map((e) => e.name)).toEqual(['_chat.txt']);
  });

  it('rejects non-ZIP and corrupt data', () => {
    expect(() => listZip(strToU8('not a zip'))).toThrow(ZipError);
    const zip = makeZip({ '_chat.txt': IOS });
    expect(() => listZip(zip.slice(0, zip.length - 30))).toThrow(ZipError);
  });

  it('prefers _chat.txt / "WhatsApp Chat" text files', () => {
    const entries = listZip(makeZip({ 'notes.txt': 'x'.repeat(500), '_chat.txt': IOS }));
    expect(findChatEntry(entries)?.name).toBe('_chat.txt');
  });
});

describe('import pipeline', () => {
  it('derives the title from the export file name', () => {
    expect(titleFromFileName('WhatsApp Chat with Lucky.txt')).toBe('Lucky');
    expect(titleFromFileName('WhatsApp Chat - Trip Group.zip')).toBe('Trip Group');
    expect(titleFromFileName('_chat.txt')).toBeNull();
  });

  it('explains clearly when a file is not a WhatsApp export', () => {
    expect(() => prepareFromText('hello\nworld')).toThrow(ImportError);
    expect(() => prepareFromText('')).toThrow(/No messages/);
    expect(() => prepareFromBytes(strToU8('PK\u0003\u0004garbage'), 'x.zip')).toThrow(ImportError);
    expect(() => prepareFromBytes(makeZip({ 'photo.jpg': FAKE_JPEG }), 'x.zip')).toThrow(/No chat text/);
  });

  it('imports a ZIP, stores matched media and marks missing media honestly', async () => {
    freshDb();
    const chat = [
      '12/05/26, 10:30 - Lucky: IMG-20260512-WA0001.jpg (file attached)',
      'Sunset',
      '12/05/26, 10:31 - Mansi: VID-20260512-WA0002.mp4 (file attached)',
      '12/05/26, 10:32 - Mansi: <Media omitted>',
    ].join('\n');
    const zip = makeZip({ 'WhatsApp Chat with Lucky.txt': chat, 'IMG-20260512-WA0001.jpg': FAKE_JPEG, 'unrelated.png': FAKE_JPEG });
    const { id, draft } = await importZip(zip);
    expect(draft.referencedFiles).toBe(2);
    expect(Object.keys(draft.matchedFiles)).toEqual(['IMG-20260512-WA0001.jpg']);
    expect(draft.unreferencedArchiveFiles).toBe(1);

    const msgs = await loadMessages(id);
    expect(msgs[0].media).toMatchObject({ kind: 'image', fileName: 'IMG-20260512-WA0001.jpg' });
    expect(msgs[0].text).toBe('Sunset');
    const blob = await getAttachmentBlob(msgs[0].media!.attachmentId!);
    expect(blob?.type).toBe('image/jpeg');
    expect(await blobBytes(blob!)).toEqual(FAKE_JPEG);
    expect(msgs[1].media?.attachmentId).toBeUndefined(); // video not in archive
    expect(msgs[2].media).toMatchObject({ omitted: true });
    expect((await listConversations())[0].attachmentCount).toBe(1);
  });
});

describe('backup and restore', () => {
  it('round-trips chats, perspective and media', async () => {
    freshDb();
    const zip = makeZip({ '_chat.txt': '12/05/26, 10:30 - Lucky: IMG-1.jpg (file attached)\n12/05/26, 10:31 - Mansi: ok', 'IMG-1.jpg': FAKE_JPEG });
    const { id } = await importZip(zip, 'WhatsApp Chat - Lucky.zip');
    await importText(ANDROID_12H);
    const backup = await blobBytes(await createBackup());

    freshDb(); // a new, empty device
    const plan = await inspectBackup(backup);
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((i) => !i.conflict)).toBe(true);
    const result = await restoreBackup(backup, Object.fromEntries(plan.items.map((i) => [i.id, 'restore'])));
    expect(result).toEqual({ restored: 2, skipped: 0 });

    const restored = (await listConversations()).find((c) => c.id === id)!;
    expect(restored.title).toBe('Lucky');
    const ps = await getParticipants(id);
    expect(restored.selfParticipantId).toBe(ps.find((p) => p.originalName === 'Lucky')!.id);
    const msgs = await loadMessages(id);
    expect(await blobBytes((await getAttachmentBlob(msgs[0].media!.attachmentId!))!)).toEqual(FAKE_JPEG);
  });

  it('never overwrites: conflicts are skipped or restored as a copy', async () => {
    freshDb();
    const { id } = await importText(ANDROID_12H);
    const backup = await blobBytes(await createBackup());
    const plan = await inspectBackup(backup);
    expect(plan.items[0].conflict).toBe(true);

    expect(await restoreBackup(backup, { [id]: 'restore' })).toEqual({ restored: 0, skipped: 1 });
    expect(await listConversations()).toHaveLength(1);

    expect(await restoreBackup(backup, { [id]: 'copy' })).toEqual({ restored: 1, skipped: 0 });
    const all = await listConversations();
    expect(all).toHaveLength(2);
    const copy = all.find((c) => c.id !== id)!;
    expect(copy.title).toMatch(/restored/);
    expect((await loadMessages(copy.id)).length).toBe(9);
    expect((await loadMessages(id)).length).toBe(9);
  });

  it('validates before writing anything', async () => {
    freshDb();
    await importText(ANDROID_12H);
    const good = await blobBytes(await createBackup());
    const files = unzipSync(good);
    const convPath = Object.keys(files).find((k) => k.startsWith('conversations/'))!;
    const bundle = JSON.parse(new TextDecoder().decode(files[convPath]));
    bundle.messages[0].senderId = 'nobody';
    files[convPath] = strToU8(JSON.stringify(bundle));
    const bad = zipSync(files);

    freshDb();
    await expect(inspectBackup(bad)).rejects.toBeInstanceOf(BackupError);
    await expect(restoreBackup(bad, {})).rejects.toBeInstanceOf(BackupError);
    expect(await listConversations()).toHaveLength(0);

    await expect(inspectBackup(makeZip({ 'manifest.json': '{"format":"other"}' }))).rejects.toThrow(/not a Chatss backup/);
    await expect(inspectBackup(makeZip({ 'manifest.json': '{"format":"chatss-backup","version":99,"conversations":[]}' }))).rejects.toThrow(/newer version/);
    await expect(inspectBackup(strToU8('garbage'))).rejects.toBeInstanceOf(BackupError);
  });
});

describe('text export', () => {
  it('re-creates a WhatsApp-style export using original timestamps', async () => {
    freshDb();
    const { id, records } = await importText(ANDROID_12H);
    const text = conversationToText(records.conversation, await getParticipants(id), await loadMessages(id));
    const lines = text.split('\n');
    expect(lines[1]).toBe('12/05/26, 10:30 pm - Lucky: Hello');
    expect(text).toContain('IMG-20260513-WA0001.jpg (file attached)\nLook at this view');
    expect(text).toContain('See you tomorrow <This message was edited>');
    // The export can be parsed again.
    expect(prepareFromText(text).parse.messages).toHaveLength(9);
  });
});
