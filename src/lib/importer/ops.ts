import type { DateOrder } from '../types';
import { extractEntries } from '../zip';
import { ImportError, prepareFromBytes, prepareFromText, type ImportDraft } from './draft';

/** Operations shared by the worker and the main-thread fallback. */
export interface PrepareRequest {
  file?: Blob;
  name: string;
  text?: string;
  dateOrder?: DateOrder;
}

let cached: { sourceId: string; bytes: Uint8Array } | null = null;

async function bytesFor(sourceId: string, file: Blob): Promise<Uint8Array> {
  if (cached?.sourceId === sourceId) return cached.bytes;
  const bytes = new Uint8Array(await file.arrayBuffer());
  cached = { sourceId, bytes };
  return bytes;
}

export async function prepareOp(sourceId: string, req: PrepareRequest): Promise<ImportDraft> {
  const options = req.dateOrder ? { dateOrder: req.dateOrder } : {};
  if (req.text !== undefined) return prepareFromText(req.text, options);
  if (!req.file) throw new ImportError('No file was selected.');
  return prepareFromBytes(await bytesFor(sourceId, req.file), req.name, options);
}

export async function extractOp(sourceId: string, file: Blob, paths: string[]): Promise<Map<string, Uint8Array>> {
  return extractEntries(await bytesFor(sourceId, file), paths);
}

export function cachedBuffer(): ArrayBufferLike | null {
  return cached?.bytes.buffer ?? null;
}

export function releaseOp(): void {
  cached = null;
}
