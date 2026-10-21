import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { pwaStore } from './lib/pwaStore';

createRoot(document.getElementById('root')!).render(<App />);

// Register the service worker (production builds only). It caches the static
// app shell for offline use; chat data lives in IndexedDB, never in the SW cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        pwaStore.setUpdateReady(() => updateSW(true));
      },
      onOfflineReady() {
        pwaStore.setOfflineReady();
      },
    });
  });
}
