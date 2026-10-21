import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(text: string, action?: ToastItem['action']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((text: string, action?: ToastItem['action']) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, text, action }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), action ? 8000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-md animate-slide-up items-center gap-4 rounded-lg bg-[#323739] px-4 py-3 text-sm text-white shadow-pop"
          >
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold uppercase tracking-wide text-[#21c063]"
                onClick={() => {
                  t.action!.run();
                  setItems((xs) => xs.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(Ctx);
}
