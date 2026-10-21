import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Lock,
  Pencil,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useDebounced } from '../../hooks/useMediaQuery';
import { deleteConversation, getConversation, getParticipants, loadMessages, renameConversation, setSelfParticipant } from '../../lib/db/repo';
import { conversationToText, downloadBlob, safeFileName } from '../../lib/exportText';
import { formatDateTime } from '../../lib/format';
import { firstMessageAtOrAfter } from '../../lib/rows';
import { ChatSearchIndex } from '../../lib/search';
import { forgetConversation, getPref, savePosition } from '../../lib/settings';
import type { Message, Participant } from '../../lib/types';
import { ChatInfoDialog } from '../dialogs/ChatInfoDialog';
import { ImageViewer, type ViewerImage } from '../dialogs/ImageViewer';
import { PerspectiveDialog } from '../dialogs/PerspectiveDialog';
import { ConfirmDialog, JumpToDateDialog, TextPromptDialog } from '../dialogs/SimpleDialogs';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { Menu } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import { MessageList, type MessageListHandle } from './MessageList';

interface Props {
  conversationId: string;
  /** Message order to jump to after opening (e.g. from global search). */
  jumpToOrder?: number;
  onBack: () => void;
}

type DialogName = 'perspective' | 'info' | 'rename' | 'delete' | 'date' | null;

export function ChatView({ conversationId, jumpToOrder, onBack }: Props) {
  const toast = useToast();
  // undefined = loading, null = no longer exists (e.g. deleted elsewhere).
  const conversation = useLiveQuery(async () => (await getConversation(conversationId)) ?? null, [conversationId]);
  const participants = useLiveQuery(() => getParticipants(conversationId), [conversationId], [] as Participant[]);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [image, setImage] = useState<ViewerImage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchPos, setMatchPos] = useState(0);
  const list = useRef<MessageListHandle>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // Messages are immutable after import, so they are loaded once per chat.
  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setLoadError(false);
    loadMessages(conversationId)
      .then((ms) => !cancelled && setMessages(ms))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const participantMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const index = useMemo(() => (messages ? new ChatSearchIndex(messages) : null), [messages]);
  const debounced = useDebounced(query, 200);
  const matches = useMemo(() => (index && debounced.trim() ? index.find(debounced) : []), [index, debounced]);

  // Start at the most recent match (like WhatsApp, search goes upwards).
  useEffect(() => {
    setMatchPos(matches.length ? matches.length - 1 : 0);
  }, [matches]);

  useEffect(() => {
    if (matches.length) list.current?.scrollToMessage(matches[matchPos], false);
  }, [matches, matchPos]);

  // Jump to a message requested by global search.
  useEffect(() => {
    if (!messages || jumpToOrder === undefined) return;
    const i = messages.findIndex((m) => m.order === jumpToOrder);
    if (i >= 0) setTimeout(() => list.current?.scrollToMessage(i), 80);
  }, [messages, jumpToOrder]);

  const initialRow = useMemo(() => {
    if (jumpToOrder !== undefined) return undefined;
    const saved = getPref('positions')[conversationId];
    return typeof saved === 'number' ? saved : undefined;
    // Only read once per opened chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const onTopRowChange = useCallback(
    (row: number) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => savePosition(conversationId, row), 400);
    },
    [conversationId],
  );
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-panel p-6 text-center text-muted">
        <p>This chat could not be loaded from local storage.</p>
        <button type="button" onClick={onBack} className="font-medium text-brand">
          Back to chats
        </button>
      </div>
    );
  }
  if (conversation === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-panel p-6 text-center text-muted">
        <p>This chat is no longer on this device.</p>
        <button type="button" onClick={onBack} className="font-medium text-brand">
          Back to chats
        </button>
      </div>
    );
  }

  const self = participants.find((p) => p.id === conversation?.selfParticipantId);
  const others = participants.filter((p) => p.id !== conversation?.selfParticipantId);
  const subtitle = !conversation
    ? ''
    : conversation.type === 'group'
      ? [...others.map((p) => p.displayName), ...(self ? ['You'] : [])].join(', ')
      : self
        ? `Viewing as ${self.displayName}`
        : 'Tap to choose who you are';

  const exportText = () => {
    if (!conversation || !messages) return;
    const text = conversationToText(conversation, participants, messages);
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${safeFileName(conversation.title)}.txt`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* Header */}
      <header className="safe-top z-20 flex min-h-[60px] items-center gap-1 border-b border-line bg-panel px-1 sm:px-2">
        {searchOpen ? (
          <>
            <IconButton label="Close search" onClick={closeSearch}>
              <ArrowLeft size={22} />
            </IconButton>
            <input
              ref={searchInput}
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length) {
                  e.preventDefault();
                  setMatchPos((p) => (e.shiftKey ? (p + 1) % matches.length : (p - 1 + matches.length) % matches.length));
                } else if (e.key === 'Escape') closeSearch();
              }}
              placeholder="Search…"
              aria-label="Search in this chat"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[16px] text-ink placeholder:text-muted focus:outline-none"
            />
            <span className="whitespace-nowrap px-1 text-[13px] text-muted" aria-live="polite">
              {debounced.trim() ? (matches.length ? `${matchPos + 1} of ${matches.length}` : 'No results') : ''}
            </span>
            <IconButton
              label="Previous (older) result"
              disabled={!matches.length}
              onClick={() => setMatchPos((p) => (p - 1 + matches.length) % matches.length)}
            >
              <ChevronUp size={22} />
            </IconButton>
            <IconButton label="Next (newer) result" disabled={!matches.length} onClick={() => setMatchPos((p) => (p + 1) % matches.length)}>
              <ChevronDown size={22} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label="Back to chats" onClick={onBack} className="md:hidden">
              <ArrowLeft size={22} />
            </IconButton>
            <button
              type="button"
              onClick={() => setDialog('info')}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pl-1 pr-2 text-left md:pl-2"
              aria-label="Chat info"
            >
              <Avatar name={conversation?.title ?? ''} group={conversation?.type === 'group'} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-medium text-ink">{conversation?.title ?? ' '}</span>
                <span className="block truncate text-[13px] text-muted">{subtitle}</span>
              </span>
            </button>
            <IconButton label="Search in chat" onClick={() => setSearchOpen(true)} disabled={!messages}>
              <Search size={20} />
            </IconButton>
            <Menu
              label="Chat options"
              items={[
                { label: 'Change who I am', icon: <UserRound size={18} />, onSelect: () => setDialog('perspective') },
                { label: 'Chat info', icon: <Info size={18} />, onSelect: () => setDialog('info') },
                { label: 'Jump to date', icon: <CalendarDays size={18} />, onSelect: () => setDialog('date') },
                { label: 'Rename chat', icon: <Pencil size={18} />, onSelect: () => setDialog('rename') },
                { label: 'Export as text', icon: <Download size={18} />, onSelect: exportText, disabled: !messages },
                { label: 'Delete chat', icon: <Trash2 size={18} />, onSelect: () => setDialog('delete'), danger: true },
              ]}
            />
          </>
        )}
      </header>

      {/* Messages */}
      <div className="chat-wallpaper flex min-h-0 flex-1 flex-col">
        {!messages || !conversation ? (
          <div className="flex flex-1 items-center justify-center" role="status">
            <span className="rounded-lg bg-chip px-4 py-2 text-sm text-chip-ink shadow-bubble">Loading messages…</span>
          </div>
        ) : (
          <MessageList
            key={conversationId}
            ref={list}
            messages={messages}
            participants={participantMap}
            selfId={conversation.selfParticipantId}
            type={conversation.type}
            hour12={conversation.hour12}
            query={searchOpen ? debounced : undefined}
            activeMatch={matches.length ? matches[matchPos] : undefined}
            initialRow={initialRow}
            onTopRowChange={onTopRowChange}
            onOpenImage={(_, fileName, m) =>
              m.media?.attachmentId &&
              setImage({
                attachmentId: m.media.attachmentId,
                fileName,
                caption: m.text || undefined,
                subtitle: `${(m.senderId && participantMap.get(m.senderId)?.displayName) || ''} · ${formatDateTime(m.ts, conversation.hour12)}`,
              })
            }
          />
        )}

        {/* Read-only "composer" area: there is deliberately no send function. */}
        <footer className="safe-bottom flex items-center gap-2 px-2 pb-2 pt-1">
          <div className="flex min-h-[46px] min-w-0 flex-1 items-center gap-2 rounded-full bg-panel px-4 text-[14px] text-muted shadow-bubble">
            <Lock size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">Read-only archive · messages can&apos;t be sent from Chatss</span>
          </div>
          <button
            type="button"
            onClick={() => setDialog('date')}
            aria-label="Jump to date"
            title="Jump to date"
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-panel text-muted shadow-bubble hover:text-ink"
          >
            <CalendarDays size={20} />
          </button>
        </footer>
      </div>

      {conversation && (
        <>
          <PerspectiveDialog
            open={dialog === 'perspective'}
            participants={participants}
            selfId={conversation.selfParticipantId}
            onClose={() => setDialog(null)}
            onSelect={async (id) => {
              await setSelfParticipant(conversation.id, id);
              setDialog(null);
              const p = participants.find((x) => x.id === id);
              toast(p ? `Now viewing as ${p.displayName}` : 'Showing all messages on the left');
            }}
          />
          {messages && (
            <ChatInfoDialog
              open={dialog === 'info'}
              conversation={conversation}
              participants={participants}
              messages={messages}
              onClose={() => setDialog(null)}
              onRename={() => setDialog('rename')}
              onChangePerspective={() => setDialog('perspective')}
              onJumpToMessage={(i) => setTimeout(() => list.current?.scrollToMessage(i), 50)}
            />
          )}
          <TextPromptDialog
            open={dialog === 'rename'}
            title="Rename chat"
            label="Chat name"
            initial={conversation.title}
            onSubmit={(v) => renameConversation(conversation.id, v)}
            onClose={() => setDialog(null)}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            title="Delete this chat?"
            confirmLabel="Delete chat"
            message={
              <>
                <p>
                  “{conversation.title}” and its {conversation.messageCount.toLocaleString()} messages
                  {conversation.attachmentCount ? ` and ${conversation.attachmentCount} attachments` : ''} will be permanently removed from this device.
                </p>
                <p>Your original export file is not affected. This cannot be undone.</p>
              </>
            }
            onClose={() => setDialog(null)}
            onConfirm={async () => {
              await deleteConversation(conversation.id);
              forgetConversation(conversation.id);
              setDialog(null);
              toast('Chat deleted');
              onBack();
            }}
          />
          <JumpToDateDialog
            open={dialog === 'date'}
            min={conversation.earliestTs}
            max={conversation.latestTs}
            onClose={() => setDialog(null)}
            onJump={(ts) => {
              if (!messages?.length) return;
              const i = firstMessageAtOrAfter(messages, ts);
              setTimeout(() => list.current?.scrollToMessage(i), 50);
            }}
          />
        </>
      )}
      <ImageViewer image={image} onClose={() => setImage(null)} />
    </div>
  );
}
