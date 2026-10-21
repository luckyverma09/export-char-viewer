import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer';
import { IconButton } from './IconButton';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 'sheet' slides up from the bottom on phones; 'full' covers the screen. */
  variant?: 'sheet' | 'full';
  wide?: boolean;
  dismissible?: boolean;
}

/**
 * Accessible modal dialog. Closes with Escape, the Android back button, or the
 * close button; keeps focus inside while open and restores it afterwards.
 */
export function Dialog({ open, onClose, title, children, footer, variant = 'sheet', wide, dismissible = true }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBackLayer(open && dismissible, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (n) => !n.hasAttribute('disabled'),
        );
        if (f.length === 0) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;
  const full = variant === 'full';
  return (
    <div
      className={`fixed inset-0 z-[60] flex animate-fade-in bg-black/50 ${full ? '' : 'items-end justify-center sm:items-center sm:p-4'}`}
      onPointerDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex flex-col bg-panel text-ink shadow-pop focus:outline-none ${
          full
            ? 'safe-top safe-bottom h-full w-full sm:m-auto sm:h-[min(92dvh,860px)] sm:max-w-3xl sm:rounded-xl'
            : `safe-bottom max-h-[90dvh] w-full animate-slide-up rounded-t-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`
        }`}
      >
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <h2 id={titleId} className="flex-1 text-lg font-medium">
            {title}
          </h2>
          {dismissible && (
            <IconButton label="Close" onClick={onClose} className="-mr-2">
              <X size={20} />
            </IconButton>
          )}
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = 'text',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'text' | 'primary' | 'danger' | 'outline' }) {
  const styles = {
    text: 'text-brand hover:bg-brand/10',
    primary: 'bg-brand text-white hover:bg-brand-strong dark:text-[#0b141a] dark:hover:bg-brand/90',
    danger: 'bg-danger text-white hover:opacity-90',
    outline: 'border border-line text-brand hover:bg-brand/10',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full px-5 py-2 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
