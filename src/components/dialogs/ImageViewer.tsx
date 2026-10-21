import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useAttachmentUrl } from '../../hooks/useAttachmentUrl';
import { useBackLayer } from '../../hooks/useBackLayer';
import { safeFileName } from '../../lib/exportText';
import { IconButton } from '../ui/IconButton';

export interface ViewerImage {
  attachmentId: string;
  fileName: string;
  caption?: string;
  subtitle?: string;
}

interface Props {
  image: ViewerImage | null;
  onClose: () => void;
}

/**
 * Full-screen viewer for locally stored photos. It loads its own object URL so
 * the image stays valid even if the message scrolls out of the virtual list.
 */
export function ImageViewer({ image, onClose }: Props) {
  useBackLayer(!!image, onClose);
  const { url, loading } = useAttachmentUrl(image?.attachmentId, !!image);
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [image, onClose]);
  if (!image) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Image viewer" className="fixed inset-0 z-[70] flex animate-fade-in flex-col bg-black/95 text-white">
      <div className="safe-top flex items-center gap-2 px-2 py-2">
        <IconButton label="Close image" onClick={onClose} className="text-white hover:bg-white/10">
          <ArrowLeft size={22} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">{image.fileName}</div>
          {image.subtitle && <div className="truncate text-[12.5px] text-white/60">{image.subtitle}</div>}
        </div>
        {url && (
          <a
            href={url}
            download={safeFileName(image.fileName, 'image')}
            aria-label="Save image"
            title="Save image"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          >
            <Download size={20} />
          </a>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={onClose}>
        {loading && <Loader2 className="animate-spin" size={32} aria-label="Loading image" />}
        {url && (
          <img src={url} alt={image.caption || image.fileName} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
      {image.caption && <div className="safe-bottom px-4 py-3 text-center text-[14.5px]">{image.caption}</div>}
    </div>
  );
}
