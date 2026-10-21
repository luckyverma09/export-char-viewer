import { Check, EyeOff } from 'lucide-react';
import type { Participant } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import { Dialog } from '../ui/Dialog';

interface Props {
  open: boolean;
  participants: Participant[];
  selfId: string | null;
  onSelect: (participantId: string | null) => void;
  onClose: () => void;
}

/** "Who are you in this conversation?" - changes only the viewing perspective. */
export function PerspectiveDialog({ open, participants, selfId, onSelect, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title="Who are you in this conversation?">
      <p className="mb-3 text-[13.5px] text-muted">
        Your messages appear on the right in green. Everyone else&apos;s appear on the left. You can change this any time; messages are not changed.
      </p>
      <ul role="radiogroup" aria-label="Choose your participant" className="-mx-2">
        {participants.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selfId === p.id}
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover"
            >
              <Avatar name={p.displayName} color={p.color} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] text-ink">{p.displayName}</span>
                <span className="block text-[12.5px] text-muted">
                  {p.messageCount.toLocaleString()} message{p.messageCount === 1 ? '' : 's'}
                  {p.displayName !== p.originalName ? ` · “${p.originalName}” in export` : ''}
                </span>
              </span>
              {selfId === p.id && <Check className="text-brand" size={22} aria-hidden="true" />}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            role="radio"
            aria-checked={selfId === null}
            onClick={() => onSelect(null)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/10 text-muted">
              <EyeOff size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-[15.5px] text-ink">None of these</span>
              <span className="block text-[12.5px] text-muted">Show every message on the left</span>
            </span>
            {selfId === null && <Check className="text-brand" size={22} aria-hidden="true" />}
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
