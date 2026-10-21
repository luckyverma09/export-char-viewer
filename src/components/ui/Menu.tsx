import { EllipsisVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface Props {
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  align?: 'left' | 'right';
  /** Open programmatically (e.g. on long-press); parent controls position. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  buttonClassName?: string;
}

/** Overflow ("⋮") menu with keyboard support and outside-click dismissal. */
export function Menu({ label, items, trigger, align = 'right', open: controlled, onOpenChange, buttonClassName }: Props) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const setOpen = (v: boolean) => {
    setUncontrolled(v);
    onOpenChange?.(v);
  };
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    listRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={buttonClassName}
      >
        {trigger ?? <EllipsisVertical size={20} />}
      </IconButton>
      {open && (
        <ul
          ref={listRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onListKey}
          className={`absolute top-11 z-50 min-w-[13rem] animate-pop-in rounded-lg bg-panel py-2 shadow-pop ${
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          }`}
        >
          {visible.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] hover:bg-hover focus:bg-hover focus:outline-none disabled:opacity-40 ${
                  item.danger ? 'text-danger' : 'text-ink'
                }`}
              >
                {item.icon && <span className="text-muted">{item.icon}</span>}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
