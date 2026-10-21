import {
  Contact,
  Download,
  ExternalLink,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Mic,
  Music,
  Smile,
  type LucideIcon,
} from 'lucide-react';
import { useAttachmentUrl } from '../../hooks/useAttachmentUrl';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { getAttachment, getAttachmentBlob } from '../../lib/db/repo';
import { safeFileName } from '../../lib/exportText';
import { formatBytes, isInlineSafeMime, MEDIA_LABEL } from '../../lib/media';
import type { MediaKind, MediaRef } from '../../lib/types';

const ICONS: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  voice: Mic,
  document: FileText,
  sticker: Smile,
  gif: Film,
  contact: Contact,
  unknown: FileText,
};

interface Props {
  media: MediaRef & { attachmentId?: string };
  out: boolean;
  /** Import preview: attachments are not stored yet. */
  preview?: boolean;
  previewAvailable?: boolean;
  onOpenImage?: (url: string, fileName: string) => void;
}

/** Honest placeholder for media that is referenced but not available locally. */
function Unavailable({ media, out, note }: { media: MediaRef; out: boolean; note: string }) {
  const Icon = ICONS[media.kind];
  return (
    <div
      className={`my-0.5 flex min-w-[220px] max-w-[300px] items-center gap-3 rounded-md px-3 py-2.5 ${
        out ? 'bg-black/[.05] dark:bg-black/20' : 'bg-ink/[.05] dark:bg-black/20'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/15 text-muted">
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{media.fileName ?? MEDIA_LABEL[media.kind]}</span>
        <span className="block text-[12.5px] text-bubble-meta">{note}</span>
      </span>
    </div>
  );
}

export function MediaContent({ media, out, preview, previewAvailable, onOpenImage }: Props) {
  const attachment = useLiveQuery(
    () => (media.attachmentId && !preview ? getAttachment(media.attachmentId) : undefined),
    [media.attachmentId, preview],
  );
  const inline = !!attachment && isInlineSafeMime(attachment.mimeType);
  const isDoc = !!attachment && !inline;
  // Documents are only loaded when the user asks for them.
  const { url, loading, missing } = useAttachmentUrl(media.attachmentId, !preview && inline);

  if (preview) {
    return (
      <Unavailable
        media={media}
        out={out}
        note={
          previewAvailable
            ? 'File found in archive - will be imported'
            : media.omitted || !media.fileName
              ? `${MEDIA_LABEL[media.kind]} not included in the export`
              : 'File not included in the export'
        }
      />
    );
  }

  if (!media.attachmentId || (attachment && attachment.status !== 'available')) {
    return (
      <Unavailable
        media={media}
        out={out}
        note={media.omitted || !media.fileName ? `${MEDIA_LABEL[media.kind]} not included in the export` : 'File not included in the export'}
      />
    );
  }

  if (isDoc && attachment) {
    return <DocumentCard attachmentId={attachment.id} fileName={attachment.fileName} size={attachment.size} mime={attachment.mimeType} out={out} />;
  }

  if (loading || attachment === undefined) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-md bg-ink/5">
        <Loader2 className="animate-spin text-muted" size={24} aria-label="Loading media" />
      </div>
    );
  }
  if (missing || !url || !attachment) return <Unavailable media={media} out={out} note="File could not be loaded" />;

  const name = attachment.fileName;
  switch (attachment.kind) {
    case 'image':
    case 'gif':
    case 'sticker':
      if (!attachment.mimeType.startsWith('image/')) break;
      return (
        <button
          type="button"
          onClick={() => onOpenImage?.(url, name)}
          className="block overflow-hidden rounded-md"
          aria-label={`Open ${MEDIA_LABEL[attachment.kind].toLowerCase()} ${name}`}
        >
          <img
            src={url}
            alt={MEDIA_LABEL[attachment.kind]}
            loading="lazy"
            decoding="async"
            className={attachment.kind === 'sticker' ? 'h-40 w-40 object-contain' : 'max-h-[330px] w-full min-w-[200px] max-w-[330px] object-cover'}
          />
        </button>
      );
    case 'video':
      if (!attachment.mimeType.startsWith('video/')) break;
      return <video src={url} controls preload="metadata" playsInline className="max-h-[330px] w-full max-w-[330px] rounded-md bg-black" />;
    case 'audio':
    case 'voice':
      if (!attachment.mimeType.startsWith('audio/')) break;
      return (
        <div className="flex min-w-[240px] items-center gap-2 py-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            {attachment.kind === 'voice' ? <Mic size={20} /> : <Music size={20} />}
          </span>
          <audio src={url} controls preload="metadata" className="h-10 w-full min-w-0 max-w-[260px]" />
        </div>
      );
  }
  return <DocumentCard attachmentId={attachment.id} fileName={name} size={attachment.size} mime={attachment.mimeType} out={out} />;
}

function DocumentCard({ attachmentId, fileName, size, mime, out }: { attachmentId: string; fileName: string; size: number; mime: string; out: boolean }) {
  const open = async (download: boolean) => {
    const blob = await getAttachmentBlob(attachmentId);
    if (!blob) return;
    // Only PDFs may be opened in a tab; everything else is downloaded as an
    // opaque file so imported HTML/SVG/scripts can never execute.
    const canView = !download && mime === 'application/pdf';
    const safe = canView ? blob : new Blob([blob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(safe);
    if (canView) {
      window.open(url, '_blank', 'noopener');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeFileName(fileName, 'attachment');
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <div className={`my-0.5 flex min-w-[230px] max-w-[300px] items-center gap-3 rounded-md px-3 py-2.5 ${out ? 'bg-black/[.05] dark:bg-black/20' : 'bg-ink/[.05] dark:bg-black/20'}`}>
      <FileText size={30} className="shrink-0 text-[#e5574d]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{fileName}</span>
        <span className="block text-[12px] text-bubble-meta">{formatBytes(size)}</span>
      </span>
      {mime === 'application/pdf' && (
        <button type="button" className="rounded-full p-2 text-muted hover:bg-ink/10" aria-label={`Open ${fileName}`} onClick={() => void open(false)}>
          <ExternalLink size={18} />
        </button>
      )}
      <button type="button" className="rounded-full p-2 text-muted hover:bg-ink/10" aria-label={`Save ${fileName}`} onClick={() => void open(true)}>
        <Download size={18} />
      </button>
    </div>
  );
}
