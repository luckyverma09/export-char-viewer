import { useCallback, useEffect, useState } from 'react';
import { getPref, setPref, type ThemePref } from '../lib/settings';
import { useMediaQuery } from './useMediaQuery';

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(() => getPref('theme'));
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = pref === 'dark' || (pref === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111b21' : '#ffffff');
  }, [dark]);

  const setTheme = useCallback((t: ThemePref) => {
    setPref('theme', t);
    setPrefState(t);
  }, []);

  return { theme: pref, dark, setTheme };
}
