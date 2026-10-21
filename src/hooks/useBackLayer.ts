import { useEffect, useRef } from 'react';

/**
 * Integrates overlays (open chat, dialogs, viewers) with the browser / Android
 * back button. Each open layer corresponds to one history entry holding only a
 * depth number - never chat content or ids - and Back closes the top layer.
 *
 * Invariant: history.state.chatssDepth === stack.length. Layers can open and
 * close in the same React commit (e.g. the import wizard closes as the new chat
 * opens), so history is reconciled once, after the commit, instead of pushing
 * and popping eagerly.
 */
interface Layer {
  close: () => void;
}

const stack: Layer[] = [];
let listening = false;
let expectingPop = false;
let scheduled = false;

const depthOf = (state: unknown) => (state as { chatssDepth?: number } | null)?.chatssDepth ?? 0;

function sync() {
  const current = depthOf(window.history.state);
  const target = stack.length;
  if (current < target) {
    for (let d = current + 1; d <= target; d++) window.history.pushState({ chatssDepth: d }, '');
  } else if (current > target && !expectingPop) {
    expectingPop = true;
    window.history.go(target - current);
  }
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    sync();
  }, 0);
}

function onPop(e: PopStateEvent) {
  if (expectingPop) {
    // Our own history.go() after a layer was closed from the UI.
    expectingPop = false;
  } else {
    const depth = depthOf(e.state);
    while (stack.length > depth) stack.pop()!.close();
  }
  scheduleSync();
}

// History entries survive a reload but our layer stack does not: mark the
// current entry as the base so Back closes layers opened after the reload.
if (typeof window !== 'undefined' && depthOf(window.history.state)) {
  window.history.replaceState({ ...window.history.state, chatssDepth: 0 }, '');
}

export function useBackLayer(active: boolean, close: () => void): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    if (!listening) {
      window.addEventListener('popstate', onPop);
      listening = true;
    }
    const layer: Layer = { close: () => closeRef.current() };
    stack.push(layer);
    scheduleSync();
    return () => {
      const idx = stack.indexOf(layer);
      if (idx !== -1) {
        // Closed from the UI rather than Back: drop its history entry too.
        stack.splice(idx, 1);
        scheduleSync();
      }
    };
  }, [active]);
}
