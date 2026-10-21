import { decodeChatBytes } from '../decode';
import { Fingerprint } from '../hash';
import { parseChat, type ParseOptions } from '../parser/parseChat';
import type { ConversationType, ParseResult } from '../types';
import { extractChatText, findChatEntry, listZip, ZipError, type ZipEntryInfo } from '../zip';

export const MAX_TEXT_BYTES = 256 * 1024 * 1024;

export type SourceKind = 'txt' | 'zip' | 'paste';

export interface ImportDraft {
  source: { kind: SourceKind; name: string; size: number };
  parse: ParseResult;
  suggestedTitle: string;
  suggestedType: ConversationType;
  encoding: string;
  /** Archive files that match an attachment reference: file name -> archive path. */
  matchedFiles: Record<string, { path: string; size: number }>;
  referencedFiles: number;
  unreferencedArchiveFiles: number;
  fingerprint: string;
  /** Human-readable problems that do not stop the import. */
  notices: string[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** "WhatsApp Chat with Lucky.txt" -> "Lucky" */
export function titleFromFileName(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.(txt|zip)$/i, '').trim();
  const m = /^WhatsApp[\s-]?Chat\s*(?:with|mit|con|avec|com|met|-|–)\s*(.+)$/i.exec(base);
  if (m) return m[1].replace(/\s*\(\d+\)$/, '').trim() || null;
  if (!base || base === '_chat' || /^chat$/i.test(base)) return null;
  return null;
}

function computeFingerprint(parse: ParseResult): string {
  const fp = new Fingerprint();
  const msgs = parse.messages;
  fp.update(String(msgs.length));
  const pick = msgs.length <= 600 ? msgs : [...msgs.slice(0, 300), ...msgs.slice(-300)];
  for (const m of pick) fp.update(`\u0001${m.tsText}\u0002${m.sender ?? ''}\u0003${m.text}`);
  return fp.digest();
}

export function buildDraft(
  text: string,
  source: ImportDraft['source'],
  encoding: string,
  options: ParseOptions,
  archive?: ZipEntryInfo[],
  extraNotices: string[] = [],
): ImportDraft {
  const parse = parseChat(text, options);
  const notices = [...extraNotices];
  if (parse.messages.length === 0) {
    throw new ImportError(
      'No messages were found. Make sure this is a WhatsApp chat export (.txt or .zip created with "Export chat").',
    );
  }
  if (!parse.messages.some((m) => m.type !== 'unparsed')) {
    throw new ImportError(
      'This file does not look like a WhatsApp chat export: no lines start with a recognised date and time.',
    );
  }

  const referenced = new Set<string>();
  for (const m of parse.messages) if (m.media?.fileName && !m.media.omitted) referenced.add(m.media.fileName);

  const matchedFiles: ImportDraft['matchedFiles'] = {};
  let unreferenced = 0;
  if (archive) {
    const byName = new Map<string, ZipEntryInfo>();
    for (const e of archive) if (!byName.has(e.name)) byName.set(e.name, e);
    for (const name of referenced) {
      const e = byName.get(name);
      if (e) matchedFiles[name] = { path: e.path, size: e.size };
    }
    unreferenced = archive.filter((e) => !referenced.has(e.name) && !/\.txt$/i.test(e.name)).length;
    if (unreferenced > 0) {
      notices.push(
        `${unreferenced} file${unreferenced === 1 ? ' in the archive is' : 's in the archive are'} not referenced by any message and will not be imported.`,
      );
    }
  }

  const realSenders = parse.senders.length;
  const suggestedType: ConversationType = realSenders > 2 || parse.groupEvents ? 'group' : 'individual';
  const fromName = titleFromFileName(source.name);
  const suggestedTitle =
    fromName ??
    (parse.senders.length > 0
      ? parse.senders
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ')
      : 'Imported chat');

  return {
    source,
    parse,
    suggestedTitle,
    suggestedType,
    encoding,
    matchedFiles,
    referencedFiles: referenced.size,
    unreferencedArchiveFiles: unreferenced,
    fingerprint: computeFingerprint(parse),
    notices,
  };
}

/** Prepare a draft from raw bytes (TXT or ZIP) or pasted text. */
export function prepareFromBytes(
  bytes: Uint8Array,
  name: string,
  options: ParseOptions = {},
): ImportDraft {
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.zip$/i.test(name)) {
    let entries: ZipEntryInfo[];
    try {
      entries = listZip(bytes);
    } catch (e) {
      throw new ImportError(e instanceof ZipError ? e.message : 'The archive could not be opened.');
    }
    const chat = findChatEntry(entries);
    if (!chat) throw new ImportError('No chat text file (.txt) was found inside this archive.');
    let textBytes: Uint8Array;
    try {
      textBytes = extractChatText(bytes, chat);
    } catch (e) {
      throw new ImportError(e instanceof ZipError ? e.message : 'The chat text could not be read from the archive.');
    }
    const decoded = decodeChatBytes(textBytes);
    const notices = encodingNotices(decoded.replacements, decoded.encoding);
    const otherTxt = entries.filter((e) => /\.txt$/i.test(e.name) && e !== chat).length;
    if (otherTxt > 0) notices.push(`The archive contains ${otherTxt + 1} text files; "${chat.name}" was used as the chat.`);
    return buildDraft(decoded.text, { kind: 'zip', name, size: bytes.length }, decoded.encoding, options, entries, notices);
  }
  if (bytes.length > MAX_TEXT_BYTES) throw new ImportError('This text file is larger than 256 MB and cannot be imported.');
  const decoded = decodeChatBytes(bytes);
  return buildDraft(
    decoded.text,
    { kind: 'txt', name, size: bytes.length },
    decoded.encoding,
    options,
    undefined,
    encodingNotices(decoded.replacements, decoded.encoding),
  );
}

export function prepareFromText(text: string, options: ParseOptions = {}): ImportDraft {
  if (text.length > MAX_TEXT_BYTES) throw new ImportError('The pasted text is too large.');
  return buildDraft(text, { kind: 'paste', name: 'Pasted chat', size: text.length }, 'utf-8', options);
}

function encodingNotices(replacements: number, encoding: string): string[] {
  const out: string[] = [];
  if (encoding === 'windows-1252') out.push('The file is not valid UTF-8; it was read using a legacy Western encoding. Some characters may look wrong.');
  else if (replacements > 0) out.push(`${replacements} character${replacements === 1 ? '' : 's'} could not be decoded and are shown as "\ufffd".`);
  return out;
}
