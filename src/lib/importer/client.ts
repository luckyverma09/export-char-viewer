import { createId } from '../ids';
import { ImportError, type ImportDraft } from './draft';
import type { PrepareRequest } from './ops';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const USER_FACING = new Set(['ImportError', 'ZipError']);

function toError(e: { name: string; message: string }): Error {
  if (USER_FACING.has(e.name)) return new ImportError(e.message);
  return new ImportError('The file could not be read. It may be damaged or too large for this device.');
}

/**
 * Runs parsing and archive extraction in a Web Worker so the UI stays
 * responsive. Falls back to the main thread when workers are unavailable.
 */
export class ImportClient {
  readonly sourceId = createId();
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(useWorker = typeof Worker !== 'undefined') {
    if (useWorker) {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
          const { id, ok, result, error } = e.data as { id: number; ok: boolean; result: unknown; error: { name: string; message: string } };
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          if (ok) p.resolve(result);
          else p.reject(toError(error));
        };
        this.worker.onerror = () => {
          for (const p of this.pending.values()) p.reject(new ImportError('The import worker stopped unexpectedly.'));
          this.pending.clear();
        };
      } catch {
        this.worker = null;
      }
    }
  }

  private call<T>(msg: Record<string, unknown>): Promise<T> {
    const worker = this.worker!;
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...msg, id });
    });
  }

  async prepare(req: PrepareRequest): Promise<ImportDraft> {
    if (this.worker) return this.call<ImportDraft>({ op: 'prepare', sourceId: this.sourceId, req });
    const { prepareOp } = await import('./ops');
    try {
      return await prepareOp(this.sourceId, req);
    } catch (e) {
      throw toError(e as Error);
    }
  }

  async extract(file: Blob, paths: string[]): Promise<Map<string, Uint8Array>> {
    if (this.worker) return this.call<Map<string, Uint8Array>>({ op: 'extract', sourceId: this.sourceId, file, paths });
    const { extractOp } = await import('./ops');
    return extractOp(this.sourceId, file, paths);
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    } else {
      void import('./ops').then((m) => m.releaseOp());
    }
    for (const p of this.pending.values()) p.reject(new ImportError('Import cancelled.'));
    this.pending.clear();
  }
}
