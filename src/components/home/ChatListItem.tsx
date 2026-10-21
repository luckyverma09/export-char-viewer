import { AlertTriangle, Users } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { listTimestamp } from '../../lib/format';
import type { Conversation, Participant } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import { Menu, type MenuItem } from '../ui/Menu';

interface Props {
  conversation: Conversation;
  participants: Map<string, Participant>;
  active: boolean;
  onOpen: () => void;
  menuItems: MenuItem[];
}

export const ChatListItem = memo(function ChatListItem({ conversation: c, participants, active, onOpen, menuItems }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout>>();
  const pressed = useRef(false);
  const sender = c.lastMessageSenderId ? participants.get(c.lastMessageSenderId) : undefined;
  const senderLabel = sender ? (sender.id === c.selfParticipantId ? 'You' : sender.displayName.split(' ')[0]) : null;

  return (
    <li
      className={`group relative flex items-center ${active ? 'bg-panel-2' : 'hover:bg-hover'}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <button
        type="button"
        onClick={() => {
          // A long-press opened the menu; don't also open the chat.
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          onOpen();
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          pressed.current = false;
          clearTimeout(longPress.current);
          longPress.current = setTimeout(() => {
            pressed.current = true;
            setMenuOpen(true);
          }, 550);
        }}
        onPointerUp={() => clearTimeout(longPress.current)}
        onPointerLeave={() => clearTimeout(longPress.current)}
        onPointerCancel={() => clearTimeout(longPress.current)}
        className="flex min-w-0 flex-1 items-center gap-3 py-0 pl-3 pr-12 text-left"
        aria-current={active ? 'true' : undefined}
      >
        <Avatar name={c.title} group={c.type === 'group'} size={49} />
        <span className="min-w-0 flex-1 border-b border-line py-3 group-last:border-transparent">
          <span className="flex items-baseline gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[16.5px] text-ink">
              {c.type === 'group' && <Users size={14} className="shrink-0 text-muted" aria-label="Group" />}
              <span className="truncate">{c.title}</span>
            </span>
            <span className="shrink-0 text-[12px] text-muted">{c.latestTs !== null ? listTimestamp(c.latestTs, c.hour12) : ''}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] text-muted">
              {senderLabel && <span>{senderLabel}: </span>}
              {c.lastMessagePreview}
            </span>
            {c.warningCount > 0 && <AlertTriangle size={13} className="shrink-0 text-muted" aria-label={`${c.warningCount} import notes`} />}
            <span className="shrink-0 rounded-full bg-ink/[.07] px-1.5 py-px text-[11px] text-muted" title="Messages">
              {c.messageCount >= 10000 ? `${Math.round(c.messageCount / 1000)}k` : c.messageCount.toLocaleString()}
            </span>
          </span>
        </span>
      </button>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
        <Menu label={`Options for ${c.title}`} items={menuItems} open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
    </li>
  );
});
