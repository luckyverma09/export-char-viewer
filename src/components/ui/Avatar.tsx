import { Users } from 'lucide-react';
import type { CSSProperties } from 'react';
import { colorIndexFor, initialsFor } from '../../lib/avatar';

interface Props {
  name: string;
  color?: number;
  group?: boolean;
  size?: number;
  className?: string;
}

/** Generated avatar: coloured initials, or a group glyph for group chats. */
export function Avatar({ name, color, group, size = 49, className = '' }: Props) {
  const idx = color ?? colorIndexFor(name);
  const style = { '--sender-color': `var(--sender-${idx})`, width: size, height: size } as CSSProperties;
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`avatar-color flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${className}`}
    >
      {group ? (
        <Users size={Math.round(size * 0.5)} strokeWidth={2} />
      ) : (
        <span style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}>{initialsFor(name)}</span>
      )}
    </div>
  );
}
