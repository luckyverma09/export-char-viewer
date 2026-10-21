export interface StorageInfo {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

/** Report whether storage is persistent and how much is used (if supported). */
export async function getStorageInfo(): Promise<StorageInfo> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm) return { supported: false, persisted: null, usage: null, quota: null };
  const [persisted, estimate] = await Promise.all([
    sm.persisted ? sm.persisted().catch(() => null) : Promise.resolve(null),
    sm.estimate ? sm.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return {
    supported: true,
    persisted,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  };
}

/**
 * Ask the browser to keep Chatss data even under storage pressure. Browsers may
 * grant this silently, prompt, or refuse; it is never a guarantee that data is
 * kept forever (clearing site data or uninstalling still removes it).
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm?.persist) return null;
  try {
    if (sm.persisted && (await sm.persisted())) return true;
    return await sm.persist();
  } catch {
    return null;
  }
}
