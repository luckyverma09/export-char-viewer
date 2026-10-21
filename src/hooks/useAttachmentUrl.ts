import { useEffect, useState } from 'react';
import { getAttachmentBlob } from '../lib/db/repo';

/**
 * Object URL for a stored attachment. The URL is revoked when the component
 * unmounts (e.g. scrolled out of the virtualised list) to free memory.
 */
export function useAttachmentUrl(attachmentId: string | undefined, enabled = true) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; missing: boolean }>({
    url: null,
    loading: !!attachmentId && enabled,
    missing: !attachmentId,
  });

  useEffect(() => {
    if (!attachmentId || !enabled) {
      setState({ url: null, loading: false, missing: !attachmentId });
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, loading: true, missing: false });
    getAttachmentBlob(attachmentId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setState({ url: null, loading: false, missing: true });
          return;
        }
        url = URL.createObjectURL(blob);
        setState({ url, loading: false, missing: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, loading: false, missing: true });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachmentId, enabled]);

  return state;
}
