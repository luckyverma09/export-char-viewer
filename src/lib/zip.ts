import { unzipSync, type UnzipFileInfo } from 'fflate';
import { extensionOf } from './media';

/** Safety limits for untrusted archives. */
export const ZIP_LIMITS = {
  maxArchiveBytes: 1024 * 1024 * 1024, // 1 GB archive
  maxEntries: 50_000,
  maxChatTextBytes: 256 * 1024 * 1024, // 256 MB of chat text
  maxMediaFileBytes: 300 * 1024 * 1024, // 300 MB per media file
  maxTotalMediaBytes: 2 * 1024 * 1024 * 1024, // 2 GB of extracted media
  /** Reject entries that claim an absurd compression ratio (zip bombs). */
  maxCompressionRatio: 1000,
};

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ZipEntryInfo {
  /** Full (validated) path inside the archive. */
  path: string;
  /** Base file name, used to match WhatsApp attachment references. */
  name: string;
  size: number;
  compressedSize: number;
}

/**
 * Validate an archive entry path. Returns the sanitised base name or null if
 * the entry must be ignored. Imported archives are untrusted, so any path that
 * is absolute, escapes upward (`..`), contains control characters, or is
 * OS metadata is rejected. Chatss never writes entries to a filesystem, but
 * names are still sanitised because they are shown in the UI and used for
 * downloads.
 */
export function safeEntryName(path: string): string | null {
  if (!path || path.length > 512) return null;
  // eslint-disable-next-line no-control-regex -- deliberately reject control characters
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  const norm = path.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null;
  const segments = norm.split('/');
  if (segments.some((s) => s === '..')) return null;
  if (norm.endsWith('/')) return null; // directory
  if (segments.some((s) => s === '__MACOSX')) return null;
  const name = segments[segments.length - 1];
  if (!name || name.startsWith('._') || name === '.DS_Store' || name === 'Thumbs.db') return null;
  return name;
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

/** List entries without decompressing anything. */
export function listZip(bytes: Uint8Array): ZipEntryInfo[] {
  if (bytes.length > ZIP_LIMITS.maxArchiveBytes) {
    throw new ZipError('This archive is larger than 1 GB, which is more than Chatss can safely open on this device.');
  }
  if (!looksLikeZip(bytes)) throw new ZipError('This file is not a valid ZIP archive.');
  const entries: ZipEntryInfo[] = [];
  let count = 0;
  try {
    unzipSync(bytes, {
      filter(file: UnzipFileInfo) {
        count++;
        if (count > ZIP_LIMITS.maxEntries) throw new ZipError('The archive contains too many files.');
        const name = safeEntryName(file.name);
        if (name) entries.push({ path: file.name, name, size: file.originalSize, compressedSize: file.size });
        return false; // do not decompress while listing
      },
    });
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError('The archive is damaged or uses an unsupported ZIP format.');
  }
  return entries;
}

function checkRatio(e: ZipEntryInfo) {
  if (e.compressedSize > 0 && e.size / e.compressedSize > ZIP_LIMITS.maxCompressionRatio && e.size > 10 * 1024 * 1024) {
    throw new ZipError(`"${e.name}" has a suspicious compression ratio and was not opened.`);
  }
}

/** Decompress selected entries (by full path), enforcing size limits. */
export function extractEntries(
  bytes: Uint8Array,
  paths: string[],
  maxEach = ZIP_LIMITS.maxMediaFileBytes,
): Map<string, Uint8Array> {
  const wanted = new Set(paths);
  const infos = listZip(bytes).filter((e) => wanted.has(e.path));
  let total = 0;
  for (const e of infos) {
    if (e.size > maxEach) throw new ZipError(`"${e.name}" is too large to import (${Math.round(e.size / 1048576)} MB).`);
    checkRatio(e);
    total += e.size;
  }
  if (total > ZIP_LIMITS.maxTotalMediaBytes) throw new ZipError('The selected attachments are too large to import together.');
  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
  } catch {
    throw new ZipError('The archive is damaged and some files could not be read.');
  }
  const result = new Map<string, Uint8Array>();
  for (const e of infos) {
    const data = out[e.path];
    // Declared sizes can lie; verify the real decompressed size too.
    if (data && data.length <= maxEach) result.set(e.path, data);
  }
  return result;
}

/**
 * Pick the chat text file inside a WhatsApp export archive:
 * `_chat.txt` (iOS) or `WhatsApp Chat with X.txt` (Android), else the largest .txt.
 */
export function findChatEntry(entries: ZipEntryInfo[]): ZipEntryInfo | null {
  const txt = entries.filter((e) => extensionOf(e.name) === 'txt');
  if (txt.length === 0) return null;
  const score = (e: ZipEntryInfo) =>
    (e.name === '_chat.txt' ? 1e15 : 0) + (/whats\s?app|chat/i.test(e.name) ? 1e14 : 0) + e.size;
  return [...txt].sort((a, b) => score(b) - score(a))[0];
}

export function extractChatText(bytes: Uint8Array, entry: ZipEntryInfo): Uint8Array {
  if (entry.size > ZIP_LIMITS.maxChatTextBytes) throw new ZipError('The chat text inside this archive is too large.');
  checkRatio(entry);
  const data = extractEntries(bytes, [entry.path], ZIP_LIMITS.maxChatTextBytes).get(entry.path);
  if (!data) throw new ZipError('The chat text inside the archive could not be read.');
  return data;
}
