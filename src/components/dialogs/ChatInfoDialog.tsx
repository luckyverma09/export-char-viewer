import { AlertTriangle, Check, Pencil, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { renameParticipant } from '../../lib/db/repo';
import { formatDateTime, formatFullDate } from '../../lib/format';
import type { Conversation, Message, Participant } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';

interface Props {
  open: boolean;
  conversation: Conversation;
  participants: Participant[];
  messages: Message[];
  onClose: () => void;
  onRename: () => void;
  onChangePerspective: () => void;
  onJumpToMessage: (index: number) => void;
}

function ParticipantRow({ p, isSelf }: { p: Participant; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.displayName);
  const save = async () => {
    if (value.trim()) await renameParticipant(p.id, value);
    setEditing(false);
  };
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={p.displayName} color={p.color} size={40} />
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            aria-label={`Display name for ${p.originalName}`}
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 border-b-2 border-brand bg-transparent py-1 text-[15px] focus:outline-none"
          />
          <IconButton label="Save name" type="submit">
            <Check size={18} />
          </IconButton>
          <IconButton
            label="Cancel"
            onClick={() => {
              setValue(p.displayName);
              setEditing(false);
            }}
          >
            <X size={18} />
          </IconButton>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] text-ink">
              {p.displayName}
              {isSelf && <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-medium text-brand">You</span>}
            </span>
            <span className="block truncate text-[12.5px] text-muted">
              {p.messageCount.toLocaleString()} messages
              {p.displayName !== p.originalName && ` · “${p.originalName}” in export`}
              {p.aliases.length > 0 && ` · also “${p.aliases.join('”, “')}”`}
            </span>
          </span>
          <IconButton label={`Edit display name of ${p.displayName}`} onClick={() => setEditing(true)}>
            <Pencil size={17} />
          </IconButton>
        </>
      )}
    </li>
  );
}

export function ChatInfoDialog({ open, conversation: c, participants, messages, onClose, onRename, onChangePerspective, onJumpToMessage }: Props) {
  const warned = useMemo(() => {
    const out: number[] = [];
    messages.forEach((m, i) => {
      if (m.warnings?.length) out.push(i);
    });
    return out;
  }, [messages]);
  const self = participants.find((p) => p.id === c.selfParticipantId);
  const stats: Array<[string, string]> = [
    ['Messages', c.messageCount.toLocaleString()],
    ['Participants', participants.length.toLocaleString()],
    ['Date range', c.earliestTs !== null && c.latestTs !== null ? `${formatFullDate(c.earliestTs)} – ${formatFullDate(c.latestTs)}` : '—'],
    ['Stored attachments', c.attachmentCount.toLocaleString()],
    ['Imported from', `${c.sourceName} (${c.sourceFormat === 'ios' ? 'iPhone' : c.sourceFormat === 'android' ? 'Android' : c.sourceFormat} format)`],
    ['Imported on', formatDateTime(c.importedAt - new Date(c.importedAt).getTimezoneOffset() * 60000, true)],
    ['Date format', c.dateOrder === 'DMY' ? 'Day/Month/Year' : c.dateOrder === 'MDY' ? 'Month/Day/Year' : 'Year-Month-Day'],
  ];
  return (
    <Dialog open={open} onClose={onClose} title={c.type === 'group' ? 'Group info' : 'Chat info'} wide>
      <div className="flex flex-col items-center gap-2 pb-4 pt-2 text-center">
        <Avatar name={c.title} group={c.type === 'group'} size={84} />
        <div className="text-xl text-ink">{c.title}</div>
        <button type="button" onClick={onRename} className="text-sm font-medium text-brand hover:underline">
          Rename
        </button>
      </div>

      <section className="rounded-xl bg-panel-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[13px] text-muted">Viewing as</div>
            <div className="text-[15px] text-ink">{self ? self.displayName : 'Nobody (all messages on the left)'}</div>
          </div>
          <button type="button" onClick={onChangePerspective} className="rounded-full px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10">
            Change
          </button>
        </div>
      </section>

      <section className="mt-4">
        <h3 className="mb-1 text-[13.5px] font-medium text-brand">{participants.length} participants</h3>
        <ul className="divide-y divide-line">
          {participants.map((p) => (
            <ParticipantRow key={p.id} p={p} isSelf={p.id === c.selfParticipantId} />
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <h3 className="mb-2 text-[13.5px] font-medium text-brand">Details</h3>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
          {stats.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {warned.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-2 flex items-center gap-1 text-[13.5px] font-medium text-[#b26b00] dark:text-notice-ink">
            <AlertTriangle size={15} /> {warned.length} message{warned.length === 1 ? '' : 's'} with import warnings
          </h3>
          <ul className="space-y-1 text-[13px]">
            {warned.slice(0, 50).map((i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full truncate rounded px-2 py-1 text-left hover:bg-hover"
                  onClick={() => {
                    onClose();
                    onJumpToMessage(i);
                  }}
                >
                  <span className="text-muted">{messages[i].tsText || 'Start of file'} · </span>
                  <span className="text-ink">{messages[i].warnings!.join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
