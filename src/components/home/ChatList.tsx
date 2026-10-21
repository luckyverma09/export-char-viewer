import {
  ArrowDownUp,
  ArrowLeft,
  DatabaseBackup,
  Download,
  FileDown,
  MessageSquarePlus,
  Moon,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useDebounced } from '../../hooks/useMediaQuery';
import { getAllParticipants, listConversations, loadMessages, getParticipants, searchAllMessages, type GlobalHit } from '../../lib/db/repo';
import { conversationToText, downloadBlob, safeFileName } from '../../lib/exportText';
import { listTimestamp } from '../../lib/format';
import { normalizeForSearch } from '../../lib/search';
import { getPref, setPref, type SortPref } from '../../lib/settings';
import type { Conversation, Participant } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { Menu } from '../ui/Menu';
import { ChatListItem } from './ChatListItem';
import { PRIVACY_NOTICE } from '../../lib/constants';

export type ChatAction = 'rename' | 'perspective' | 'delete';

interface Props {
  activeId: string | null;
  onOpen: (id: string, jumpToOrder?: number) => void;
  onImport: () => void;
  onSettings: () => void;
  onToggleTheme: () => void;
  onChatAction: (action: ChatAction, conversation: Conversation) => void;
}

type Filter = 'all' | 'individual' | 'group';

const SORT_LABEL: Record<SortPref, string> = { recent: 'Most recent', name: 'Name', size: 'Most messages' };

export function ChatList({ activeId, onOpen, onImport, onSettings, onToggleTheme, onChatAction }: Props) {
  const conversations = useLiveQuery(listConversations, [], null as Conversation[] | null);
  const participants = useLiveQuery(getAllParticipants, [], [] as Participant[]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSortState] = useState<SortPref>(() => getPref('sort'));
  const [hits, setHits] = useState<GlobalHit[] | null>(null);
  const debounced = useDebounced(query, 350);

  const participantMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const byConversation = useMemo(() => {
    const m = new Map<string, Participant[]>();
    for (const p of participants) m.set(p.conversationId, [...(m.get(p.conversationId) ?? []), p]);
    return m;
  }, [participants]);

  const setSort = (s: SortPref) => {
    setSortState(s);
    setPref('sort', s);
  };

  const visible = useMemo(() => {
    if (!conversations) return [];
    const q = normalizeForSearch(query.trim());
    let list = conversations.filter((c) => filter === 'all' || c.type === filter);
    if (q) {
      list = list.filter(
        (c) =>
          normalizeForSearch(c.title).includes(q) ||
          (byConversation.get(c.id) ?? []).some((p) => normalizeForSearch(p.displayName).includes(q)),
      );
    }
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'size') sorted.sort((a, b) => b.messageCount - a.messageCount);
    else sorted.sort((a, b) => (b.latestTs ?? 0) - (a.latestTs ?? 0) || b.importedAt - a.importedAt);
    return sorted;
  }, [conversations, query, filter, sort, byConversation]);

  // Message search across all chats (debounced, cancellable, capped).
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const signal = { cancelled: false };
    setHits(null);
    searchAllMessages(q, 60, signal)
      .then((h) => !signal.cancelled && setHits(h))
      .catch(() => !signal.cancelled && setHits([]));
    return () => {
      signal.cancelled = true;
    };
  }, [debounced]);

  const convById = useMemo(() => new Map((conversations ?? []).map((c) => [c.id, c])), [conversations]);

  const exportChat = async (c: Conversation) => {
    const [ps, ms] = await Promise.all([getParticipants(c.id), loadMessages(c.id)]);
    downloadBlob(new Blob([conversationToText(c, ps, ms)], { type: 'text/plain;charset=utf-8' }), `${safeFileName(c.title)}.txt`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <header className="safe-top z-10 bg-panel">
        {searching ? (
          <div className="flex h-[60px] items-center gap-1 px-2">
            <IconButton
              label="Close search"
              onClick={() => {
                setSearching(false);
                setQuery('');
              }}
            >
              <ArrowLeft size={22} />
            </IconButton>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats and messages…"
              aria-label="Search chats and messages"
              className="min-w-0 flex-1 bg-transparent px-2 text-[16px] text-ink placeholder:text-muted focus:outline-none"
            />
            {query && (
              <IconButton label="Clear search" onClick={() => setQuery('')}>
                <X size={20} />
              </IconButton>
            )}
          </div>
        ) : (
          <div className="flex h-[60px] items-center gap-1 pl-4 pr-1">
            <h1 className="flex-1 text-[22px] font-semibold tracking-tight text-brand">Chatss</h1>
            <IconButton label="Import chat" onClick={onImport}>
              <FileDown size={21} />
            </IconButton>
            <IconButton label="Search" onClick={() => setSearching(true)}>
              <Search size={21} />
            </IconButton>
            <Menu
              label="Main menu"
              items={[
                { label: 'Import chat', icon: <FileDown size={18} />, onSelect: onImport },
                { label: 'Backup & restore', icon: <DatabaseBackup size={18} />, onSelect: onSettings },
                { label: 'Toggle dark mode', icon: <Moon size={18} />, onSelect: onToggleTheme },
                { label: 'Settings & privacy', icon: <Settings size={18} />, onSelect: onSettings },
              ]}
            />
          </div>
        )}

        {/* Filters + sort */}
        <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2" role="toolbar" aria-label="Filter chats">
          {(['all', 'individual', 'group'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-[14px] transition-colors ${
                filter === f ? 'bg-brand/15 font-medium text-brand' : 'bg-panel-2 text-muted hover:bg-hover'
              }`}
            >
              {f === 'all' ? 'All' : f === 'individual' ? 'Individual' : 'Groups'}
            </button>
          ))}
          <div className="ml-auto">
            <Menu
              label={`Sort: ${SORT_LABEL[sort]}`}
              trigger={<ArrowDownUp size={18} />}
              items={(Object.keys(SORT_LABEL) as SortPref[]).map((s) => ({
                label: `${sort === s ? '✓ ' : ''}${SORT_LABEL[s]}`,
                onSelect: () => setSort(s),
              }))}
            />
          </div>
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {conversations === null ? (
          <div className="p-8 text-center text-muted" role="status">
            Loading…
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState onImport={onImport} />
        ) : (
          <>
            {visible.length === 0 && !query && <p className="p-8 text-center text-[14px] text-muted">No chats in this filter.</p>}
            {visible.length > 0 && (
              <ul aria-label="Chats">
                {visible.map((c) => (
                  <ChatListItem
                    key={c.id}
                    conversation={c}
                    participants={participantMap}
                    active={c.id === activeId}
                    onOpen={() => onOpen(c.id)}
                    menuItems={[
                      { label: 'Change who I am', icon: <UserRound size={18} />, onSelect: () => onChatAction('perspective', c) },
                      { label: 'Rename', icon: <Pencil size={18} />, onSelect: () => onChatAction('rename', c) },
                      { label: 'Export as text', icon: <Download size={18} />, onSelect: () => void exportChat(c) },
                      { label: 'Delete chat', icon: <Trash2 size={18} />, danger: true, onSelect: () => onChatAction('delete', c) },
                    ]}
                  />
                ))}
              </ul>
            )}

            {debounced.trim().length >= 2 && (
              <section aria-label="Messages" className="pb-24">
                <h2 className="px-4 pb-1 pt-4 text-[14px] font-medium text-brand">Messages</h2>
                {hits === null ? (
                  <p className="px-4 py-3 text-[14px] text-muted" role="status">
                    Searching…
                  </p>
                ) : hits.length === 0 ? (
                  <p className="px-4 py-3 text-[14px] text-muted">No messages found.</p>
                ) : (
                  <ul>
                    {hits.map((h) => {
                      const c = convById.get(h.conversationId);
                      if (!c) return null;
                      const sender = h.senderId ? participantMap.get(h.senderId) : undefined;
                      return (
                        <li key={h.messageId}>
                          <button
                            type="button"
                            onClick={() => onOpen(c.id, h.order)}
                            className="flex w-full items-center gap-3 px-3 text-left hover:bg-hover"
                          >
                            <Avatar name={c.title} group={c.type === 'group'} size={42} />
                            <span className="min-w-0 flex-1 border-b border-line py-2.5">
                              <span className="flex items-baseline gap-2">
                                <span className="flex-1 truncate text-[15px] text-ink">{c.title}</span>
                                <span className="shrink-0 text-[12px] text-muted">{listTimestamp(h.ts, c.hour12)}</span>
                              </span>
                              <span className="block truncate text-[13.5px] text-muted">
                                {sender && <span>{sender.id === c.selfParticipantId ? 'You' : sender.displayName}: </span>}
                                <HighlightedPreview text={h.preview} query={debounced} />
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {hits.length >= 60 && <li className="px-4 py-3 text-[13px] text-muted">Showing the first 60 matches. Refine your search or search inside a chat.</li>}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Floating import button (WhatsApp's "new chat" position) */}
      <button
        type="button"
        onClick={onImport}
        aria-label="Import WhatsApp chat"
        title="Import WhatsApp chat"
        className="absolute bottom-5 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-pop transition-transform hover:brightness-95 active:scale-95"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <MessageSquarePlus size={24} />
      </button>
    </div>
  );
}

function HighlightedPreview({ text, query }: { text: string; query: string }) {
  const q = normalizeForSearch(query.trim());
  const lower = normalizeForSearch(text);
  const i = lower.length === text.length ? lower.indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  // Keep the match visible in the truncated one-line preview.
  const start = Math.max(0, i - 30);
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, i)}
      <mark className="hl">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-12 text-center">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-20 w-20" />
      <h2 className="text-[20px] font-medium text-ink">Welcome to Chatss</h2>
      <p className="text-[14.5px] text-muted">
        Import a chat you exported from WhatsApp to read it here, just like on your phone — even offline.
      </p>
      <button
        type="button"
        onClick={onImport}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand px-6 font-medium text-white hover:bg-brand-strong dark:text-[#0b141a]"
      >
        <FileDown size={18} /> Import WhatsApp chat
      </button>
      <p className="flex items-start gap-2 rounded-xl bg-panel-2 p-3 text-left text-[13px] text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />
        {PRIVACY_NOTICE}
      </p>
    </div>
  );
}
