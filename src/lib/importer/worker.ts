/// <reference lib="webworker" />
import { cachedBuffer, extractOp, prepareOp, releaseOp, type PrepareRequest } from './ops';

type Request =
  | { id: number; op: 'prepare'; sourceId: string; req: PrepareRequest }
  | { id: number; op: 'extract'; sourceId: string; file: Blob; paths: string[] }
  | { id: number; op: 'release' };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    if (msg.op === 'prepare') {
      ctx.postMessage({ id: msg.id, ok: true, result: await prepareOp(msg.sourceId, msg.req) });
    } else if (msg.op === 'extract') {
      const map = await extractOp(msg.sourceId, msg.file, msg.paths);
      // Uncompressed entries can be views into the cached archive; copy those
      // so transferring never detaches the archive buffer.
      const owned = new Map<string, Uint8Array>();
      for (const [k, u] of map) {
        owned.set(k, u.byteOffset === 0 && u.byteLength === u.buffer.byteLength && u.buffer !== cachedBuffer() ? u : u.slice());
      }
      ctx.postMessage({ id: msg.id, ok: true, result: owned }, [...owned.values()].map((u) => u.buffer));
    } else {
      releaseOp();
      ctx.postMessage({ id: msg.id, ok: true, result: null });
    }
  } catch (err) {
    // Only the error type and our own user-facing message are sent back;
    // never chat content.
    const e2 = err as Error;
    ctx.postMessage({ id: msg.id, ok: false, error: { name: e2?.name ?? 'Error', message: e2?.message ?? '' } });
  }
};
