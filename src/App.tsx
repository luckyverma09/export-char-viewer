import { Lock, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ChatView } from './components/chat/ChatView';
import { PerspectiveDialog } from './components/dialogs/PerspectiveDialog';
import { ConfirmDialog, TextPromptDialog } from './components/dialogs/SimpleDialogs';
import { ChatList, type ChatAction } from './components/home/ChatList';
import { ImportWizard } from './components/import/ImportWizard';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ToastProvider, useToast } from './components/ui/Toast';
import { useBackLayer } from './hooks/useBackLayer';
import { useLiveQuery } from './hooks/useLiveQuery';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useTheme } from './hooks/useTheme';
import { PRIVACY_NOTICE } from './lib/constants';
import { cleanupIncompleteImports, deleteConversation, getConversation, getParticipants, renameConversation, setSelfParticipant } from './lib/db/repo';
import { pwaStore } from './lib/pwaStore';
import { forgetConversation, getPref, setPref } from './lib/settings';
import type { Conversation, Participant } from './lib/types';

function ListActionDialogs({ action, conversation, onClose }: { action: ChatAction | null; conversation: Conversation | null; onClose: () => void }) {
  const toast = useToast();
  const participants = useLiveQuery(
    () => (conversation ? getParticipants(conversation.id) : ([] as Participant[])),
    [conversation?.id],
    [] as Participant[],
  );
  if (!conversation) return null;
  return (
    <>
      <PerspectiveDialog
        open={action === 'perspective'}
        participants={participants}
        selfId={conversation.selfParticipantId}
        onClose={onClose}
        onSelect={async (id) => {
          await setSelfParticipant(conversation.id, id);
          onClose();
          const p = participants.find((x) => x.id === id);
          toast(p ? `Now viewing “${conversation.title}” as ${p.displayName}` : 'Showing all messages on the left');
        }}
      />
      <TextPromptDialog
        open={action === 'rename'}
        title="Rename chat"
        label="Chat name"
        initial={conversation.title}
        onSubmit={(v) => renameConversation(conversation.id, v)}
        onClose={onClose}
      />
      <ConfirmDialog
        open={action === 'delete'}
        title="Delete this chat?"
        confirmLabel="Delete chat"
        message={
          <>
            <p>
              “{conversation.title}” and its {conversation.messageCount.toLocaleString()} messages will be permanently removed from this device.
            </p>
            <p>Your original export file is not affected. This cannot be undone.</p>
          </>
        }
        onClose={onClose}
        onConfirm={async () => {
          await deleteConversation(conversation.id);
          forgetConversation(conversation.id);
          onClose();
          toast('Chat deleted');
        }}
      />
    </>
  );
}

function UpdateBanner() {
  const pwa = useSyncExternalStore(pwaStore.subscribe, pwaStore.get);
  if (!pwa.updateReady) return null;
  return (
    <div role="status" className="safe-top fixed inset-x-0 top-0 z-[90] flex items-center gap-3 bg-brand px-4 py-2 text-[14px] text-white">
      <RefreshCw size={16} />
      <span className="flex-1">A new version of Chatss is ready.</span>
      <button type="button" className="rounded-full bg-white/20 px-3 py-1 font-medium hover:bg-white/30" onClick={() => void pwaStore.update()}>
        Update
      </button>
      <button type="button" aria-label="Dismiss" onClick={() => pwaStore.dismissUpdate()}>
        <X size={18} />
      </button>
    </div>
  );
}

function Shell() {
  const { theme, dark, setTheme } = useTheme();
  const toast = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [active, setActive] = useState<{ id: string; jumpToOrder?: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listAction, setListAction] = useState<{ action: ChatAction; conversation: Conversation } | null>(null);
  const [dragging, setDragging] = useState(false);

  const closeChat = useCallback(() => setActive(null), []);
  useBackLayer(!!active, closeChat);

  // Housekeeping + reopen the last chat.
  useEffect(() => {
    // Read before any await: the effect below rewrites the pref on mount.
    const last = getPref('lastConversationId');
    void (async () => {
      await cleanupIncompleteImports().catch(() => 0);
      if (last) {
        const c = await getConversation(last).catch(() => undefined);
        if (c?.status === 'complete') setActive((cur) => cur ?? { id: last });
      }
    })();
  }, []);

  useEffect(() => {
    setPref('lastConversationId', active?.id ?? null);
  }, [active?.id]);

  const openChat = useCallback((id: string, jumpToOrder?: number) => setActive({ id, jumpToOrder }), []);

  const openImport = useCallback((file?: File) => {
    setDroppedFile(file ?? null);
    setImportOpen(true);
  }, []);

  const showList = isDesktop || !active;
  const showChat = isDesktop || !!active;

  return (
    <div
      className="app-frame relative flex overflow-hidden bg-app md:p-0"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files') && !importOpen) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0];
        setDragging(false);
        if (f && !importOpen) {
          e.preventDefault();
          openImport(f);
        }
      }}
    >
      <UpdateBanner />
      {showList && (
        <aside
          className={`relative flex h-full flex-col ${isDesktop ? 'w-[min(420px,40%)] min-w-[320px] border-r border-line' : 'w-full'}`}
          aria-label="Chat list"
        >
          <ChatList
            activeId={active?.id ?? null}
            onOpen={openChat}
            onImport={() => openImport()}
            onSettings={() => setSettingsOpen(true)}
            onToggleTheme={() => setTheme(dark ? 'light' : 'dark')}
            onChatAction={(action, conversation) => setListAction({ action, conversation })}
          />
        </aside>
      )}
      {showChat && (
        <main className="flex h-full min-w-0 flex-1 flex-col">
          {active ? (
            <ChatView key={active.id} conversationId={active.id} jumpToOrder={active.jumpToOrder} onBack={closeChat} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 border-b-[6px] border-brand bg-panel-2 p-8 text-center">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-24 w-24 opacity-90" />
              <h2 className="text-[28px] font-light text-ink">Chatss</h2>
              <p className="max-w-md text-[14px] text-muted">
                Read your exported WhatsApp chats on any device — offline. Select a chat on the left, or drop an export file anywhere in this window.
              </p>
              <p className="mt-6 flex items-center gap-1.5 text-[13px] text-muted">
                <Lock size={13} /> {PRIVACY_NOTICE}
              </p>
            </div>
          )}
        </main>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center bg-brand/20 backdrop-blur-[1px]">
          <div className="rounded-2xl bg-panel px-8 py-6 text-[17px] font-medium text-ink shadow-pop">Drop the WhatsApp export to import it</div>
        </div>
      )}

      <ImportWizard
        open={importOpen}
        initialFile={droppedFile}
        onClose={() => {
          setImportOpen(false);
          setDroppedFile(null);
        }}
        onImported={(id) => {
          setImportOpen(false);
          setDroppedFile(null);
          toast('Chat imported and saved on this device');
          openChat(id);
        }}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} onTheme={setTheme} />
      <ListActionDialogs action={listAction?.action ?? null} conversation={listAction?.conversation ?? null} onClose={() => setListAction(null)} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
