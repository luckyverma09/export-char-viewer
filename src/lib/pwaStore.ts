/**
 * Tiny observable store for PWA lifecycle events: a waiting app update and the
 * browser's install prompt. Kept free of the `virtual:pwa-register` module so
 * components can be tested without the service worker plugin.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  updateReady: boolean;
  offlineReady: boolean;
  canInstall: boolean;
  installed: boolean;
}

let state: PwaState = {
  updateReady: false,
  offlineReady: false,
  canInstall: false,
  installed: typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches,
};
let applyUpdate: (() => Promise<void>) | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const pwaStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  setUpdateReady(update: () => Promise<void>) {
    applyUpdate = update;
    set({ updateReady: true });
  },
  setOfflineReady() {
    set({ offlineReady: true });
  },
  dismissUpdate() {
    set({ updateReady: false });
  },
  async update() {
    await applyUpdate?.();
  },
  async install(): Promise<boolean> {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    installEvent = null;
    set({ canInstall: false, installed: choice.outcome === 'accepted' });
    return choice.outcome === 'accepted';
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => set({ installed: true, canInstall: false }));
}
