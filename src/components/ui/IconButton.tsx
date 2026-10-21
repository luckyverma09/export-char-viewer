import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  active?: boolean;
}

/** Round, touch-friendly (40px+) icon button with an accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, className = '', active, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/10 active:bg-ink/15 disabled:opacity-40 ${
        active ? 'bg-ink/10' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
