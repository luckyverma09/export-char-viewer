import { AlertTriangle, Ban, Lock, Phone, PhoneMissed, Video } from 'lucide-react';
import { memo, type CSSProperties } from 'react';
import { formatDateTime, formatTime } from '../../lib/format';
import type { Side } from '../../lib/perspective';
import { isJumboEmoji } from '../../lib/richText';
import type { Message, Participant } from '../../lib/types';
import { MediaContent } from './MediaContent';
import { RichText } from './RichText';

export interface BubbleProps {
  message: Message;
  side: Side;
  /** First message of a run by the same sender: draws the tail. */
  first: boolean;
  sender?: Participant;
  showSenderName: boolean;
  hour12: boolean;
  query?: string;
  activeMatch?: boolean;
  flash?: boolean;
  preview?: boolean;
  previewAvailable?: boolean;
  onOpenImage?: (url: string, fileName: string, message: Message) => void;
}

export function SystemNotice({ message, query }: { message: Message; query?: string }) {
  const encryption = message.systemEvent === 'encryption';
  return (
    <div className="flex justify-center px-6 py-1" data-side="center">
      <div
        className={`max-w-[min(90%,560px)] rounded-lg px-3 py-1.5 text-center text-[12.5px] leading-snug shadow-bubble ${
          encryption ? 'bg-notice text-notice-ink' : 'bg-chip text-chip-ink'
        }`}
      >
        {encryption && <Lock size={11} className="mr-1 inline -translate-y-px" aria-hidden="true" />}
        <RichText text={message.text} query={query} />
      </div>
    </div>
  );
}

function UnparsedNotice({ message }: { message: Message }) {
  return (
    <div className="flex justify-center px-6 py-1" data-side="center">
      <div className="max-w-[min(90%,560px)] rounded-lg border border-dashed border-muted/50 bg-chip/90 px-3 py-2 text-[13px] text-chip-ink">
        <div className="mb-1 flex items-center gap-1 font-medium">
          <AlertTriangle size={13} aria-hidden="true" /> Unrecognised text from the export
        </div>
        <div className="msg-text">{message.text}</div>
      </div>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message: m,
  side,
  first,
  sender,
  showSenderName,
  hour12,
  query,
  activeMatch,
  flash,
  preview,
  previewAvailable,
  onOpenImage,
}: BubbleProps) {
  if (m.type === 'system') return <SystemNotice message={m} query={query} />;
  if (m.type === 'unparsed' && !m.senderId) return <UnparsedNotice message={m} />;

  const out = side === 'out';
  const time = m.tsText ? formatTime(m.ts, hour12) : '';
  const jumbo = m.type === 'text' && isJumboEmoji(m.text);
  const isSticker = m.type === 'media' && m.media?.kind === 'sticker' && !!m.media.attachmentId && !preview;
  const plainBubble = jumbo || isSticker;
  const senderStyle = sender ? ({ '--sender-color': `var(--sender-${sender.color})` } as CSSProperties) : undefined;
  const senderLabel = sender?.displayName ?? m.rawSender ?? 'Unknown sender';
  const hasWarnings = !!m.warnings?.length;

  // Spacer reserving room for the floating time stamp at the end of the text.
  const metaWidth = (m.edited ? 52 : 0) + (hasWarnings ? 18 : 0) + (hour12 ? 64 : 42);

  const meta = (
    <span
      className={`pointer-events-none absolute bottom-1 right-2 flex items-center gap-1 whitespace-nowrap text-[11px] leading-none ${
        plainBubble ? 'rounded-full bg-chip/90 px-1.5 py-1 text-chip-ink' : 'text-bubble-meta'
      }`}
    >
      {hasWarnings && <AlertTriangle size={11} aria-label={`Import warning: ${m.warnings!.join(', ')}`} />}
      {m.edited && <span>Edited</span>}
      <time dateTime={new Date(m.ts).toISOString().slice(0, 19)} title={m.tsText ? `${formatDateTime(m.ts, hour12)} (${m.tsText})` : undefined}>
        {time}
      </time>
    </span>
  );

  let body: React.ReactNode;
  switch (m.type) {
    case 'deleted':
      body = (
        <span className="msg-text italic text-muted">
          <Ban size={14} className="mr-1 inline -translate-y-px" aria-hidden="true" />
          {m.text || 'This message was deleted'}
        </span>
      );
      break;
    case 'call': {
      const missed = /missed/i.test(m.text);
      const Icon = missed ? PhoneMissed : /video/i.test(m.text) ? Video : Phone;
      body = (
        <span className="flex items-center gap-2 py-1">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${missed ? 'bg-danger/15 text-danger' : 'bg-ink/10 text-muted'}`}>
            <Icon size={16} />
          </span>
          <RichText text={m.text} query={query} activeHighlight={activeMatch} />
        </span>
      );
      break;
    }
    case 'media':
      body = (
        <>
          {m.media && (
            <MediaContent
              media={m.media}
              out={out}
              preview={preview}
              previewAvailable={previewAvailable}
              onOpenImage={(url, name) => onOpenImage?.(url, name, m)}
            />
          )}
          {m.text && (
            <div className="msg-text mt-1 px-0.5">
              <RichText text={m.text} query={query} activeHighlight={activeMatch} />
            </div>
          )}
        </>
      );
      break;
    default:
      body = (
        <span className={`msg-text ${jumbo ? 'block py-1 text-[44px] leading-[1.15]' : ''}`}>
          <RichText text={m.text} query={query} activeHighlight={activeMatch} />
        </span>
      );
  }

  return (
    <div
      className={`flex px-[3%] md:px-[5%] lg:px-[7%] ${out ? 'justify-end' : 'justify-start'} ${first ? 'pt-2.5' : 'pt-[3px]'}`}
      data-side={side}
      data-message-id={m.id}
    >
      <div
        className={`relative max-w-[85%] text-[14.2px] leading-[19px] text-ink sm:max-w-[75%] lg:max-w-[65%] ${
          plainBubble
            ? 'pb-6'
            : `rounded-lg px-[7px] pb-2 pt-1.5 shadow-bubble ${out ? 'bg-bubble-out' : 'bg-bubble-in'} ${
                first ? (out ? 'tail-out rounded-tr-none' : 'tail-in rounded-tl-none') : ''
              }`
        } ${flash ? 'animate-flash' : ''}`}
      >
        {showSenderName && !out && (
          <div className="sender-color mb-0.5 truncate px-0.5 text-[12.8px] font-medium leading-[22px]" style={senderStyle}>
            {senderLabel}
            {sender && sender.displayName !== sender.originalName && (
              <span className="ml-2 font-normal text-muted">~{sender.originalName}</span>
            )}
          </div>
        )}
        {body}
        {!plainBubble && m.type !== 'media' && <span aria-hidden="true" className="inline-block" style={{ width: metaWidth }} />}
        {m.type === 'media' && !plainBubble && <div className="h-3" aria-hidden="true" />}
        {meta}
      </div>
    </div>
  );
});
