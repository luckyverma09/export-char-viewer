import { ChevronDown } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso';
import { dateSeparatorLabel } from '../../lib/format';
import { sideOf } from '../../lib/perspective';
import { buildRows } from '../../lib/rows';
import type { Conversation, Message, Participant } from '../../lib/types';
import { MessageBubble } from './MessageBubble';

export interface MessageListHandle {
  /** Scroll to a message (by index into `messages`) and briefly highlight it. */
  scrollToMessage: (index: number, flash?: boolean) => void;
  scrollToBottom: () => void;
}

interface Props {
  messages: Message[];
  participants: Map<string, Participant>;
  selfId: string | null;
  type: Conversation['type'];
  hour12: boolean;
  query?: string;
  /** Index (into messages) of the current search result. */
  activeMatch?: number;
  /** Initial top row; undefined = start at the latest message. */
  initialRow?: number;
  onTopRowChange?: (row: number) => void;
  preview?: boolean;
  previewAvailableFiles?: Set<string>;
  onOpenImage?: (url: string, fileName: string, message: Message) => void;
}

const LIST_COMPONENTS = { Footer: () => <div className="h-3" /> };

function DateChip({ ts, floating }: { ts: number; floating?: boolean }) {
  return (
    <div className={`flex justify-center ${floating ? '' : 'pb-1 pt-3'}`}>
      <span className="rounded-lg bg-chip px-3 py-1.5 text-[12.5px] font-medium text-chip-ink shadow-bubble">{dateSeparatorLabel(ts)}</span>
    </div>
  );
}

/**
 * Virtualised message list: only the rows near the viewport are in the DOM, so
 * chats with hundreds of thousands of messages stay fast.
 */
export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList(
  {
    messages,
    participants,
    selfId,
    type,
    hour12,
    query,
    activeMatch,
    initialRow,
    onTopRowChange,
    preview,
    previewAvailableFiles,
    onOpenImage,
  },
  ref,
) {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const { rows, rowOfMessage } = useMemo(() => buildRows(messages), [messages]);
  const [atBottom, setAtBottom] = useState(true);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [topRow, setTopRow] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const group = type === 'group' || selfId === null;

  const scrollToMessage = useCallback(
    (index: number, flash = true) => {
      if (index < 0 || index >= messages.length) return;
      virtuoso.current?.scrollToIndex({ index: rowOfMessage[index], align: 'center', behavior: 'auto' });
      if (flash) {
        setFlashIndex(index);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashIndex(null), 1700);
      }
    },
    [messages.length, rowOfMessage],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage,
      scrollToBottom: () => virtuoso.current?.scrollToIndex({ index: rows.length - 1, align: 'end', behavior: 'auto' }),
    }),
    [scrollToMessage, rows.length],
  );

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const onRange = useCallback(
    (r: ListRange) => {
      setTopRow(r.startIndex);
      onTopRowChange?.(r.startIndex);
    },
    [onTopRowChange],
  );

  // Timestamp of the day shown in the floating chip while scrolling.
  const floatingTs = useMemo(() => {
    const row = rows[Math.min(topRow, rows.length - 1)];
    if (!row) return null;
    return row.kind === 'date' ? row.ts : messages[row.index]?.ts ?? null;
  }, [rows, topRow, messages]);

  if (messages.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-muted">No messages</div>;
  }

  const initial = initialRow !== undefined && initialRow < rows.length ? initialRow : rows.length - 1;

  return (
    <div className="relative min-h-0 flex-1">
      <Virtuoso
        ref={virtuoso}
        className="scroll-thin h-full"
        data={rows}
        role="log"
        aria-label="Messages"
        computeItemKey={(_, row) => row.key}
        initialTopMostItemIndex={initialRow !== undefined ? { index: initial, align: 'start' } : { index: initial, align: 'end' }}
        increaseViewportBy={{ top: 800, bottom: 800 }}
        rangeChanged={onRange}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={120}
        isScrolling={setScrolling}
        components={LIST_COMPONENTS}
        itemContent={(_, row) => {
          if (row.kind === 'date') return <DateChip ts={row.ts} />;
          const m = messages[row.index];
          const side = sideOf(m, selfId);
          return (
            <MessageBubble
              message={m}
              side={side}
              first={row.first}
              sender={m.senderId ? participants.get(m.senderId) : undefined}
              showSenderName={group && row.first && side === 'in'}
              hour12={hour12}
              query={query}
              activeMatch={activeMatch === row.index}
              flash={flashIndex === row.index}
              preview={preview}
              previewAvailable={!!m.media?.fileName && !!previewAvailableFiles?.has(m.media.fileName)}
              onOpenImage={onOpenImage}
            />
          );
        }}
      />
      {floatingTs !== null && scrolling && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 animate-fade-in">
          <DateChip ts={floatingTs} floating />
        </div>
      )}
      {!atBottom && (
        <button
          type="button"
          aria-label="Scroll to latest message"
          onClick={() => virtuoso.current?.scrollToIndex({ index: rows.length - 1, align: 'end', behavior: 'smooth' })}
          className="absolute bottom-3 right-3 z-10 flex h-10 w-10 animate-pop-in items-center justify-center rounded-full bg-chip text-muted shadow-pop hover:text-ink"
        >
          <ChevronDown size={22} />
        </button>
      )}
    </div>
  );
});
