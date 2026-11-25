import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch, useAuth } from './AuthContext.tsx';

/* ---------------------------------------------------------------------------
   Appearance

   Two layers of truth:
     1. the account  — users.theme_preference, synced through PATCH /api/auth/me
                       so the same person opens in their palette on a new device
     2. this browser — localStorage, used for the instant paint before the
                       session resolves and for the signed-out login screen

   The account always wins once it is known; a device that has never seen this
   user adopts the saved theme instead of forcing everyone to light.
   --------------------------------------------------------------------------- */

type Theme = 'dark' | 'light';

interface ThemeContextType {
  isDark: boolean;
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

export const THEME_STORAGE_KEY = 'kinfolk_theme';
const DEFAULT_THEME: Theme = 'light';

/* A brand-new browser has no saved palette. The first choice the visitor makes
   is kept so the login screen — and the account they then sign into — opens in
   the theme they actually picked instead of snapping back to light. */
const CHOSEN_KEY = 'kinfolk_theme_chosen';

function markChosen() {
  try {
    localStorage.setItem(CHOSEN_KEY, '1');
  } catch {}
}

/** Read the stored preference; anything missing or unrecognised means light. */
export function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return DEFAULT_THEME;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateProfile } = useAuth();
  const [isDark, setIsDark] = useState<boolean>(() => readStoredTheme() === 'dark');

  /* The last theme this device knows the *account* wants. Used to tell a real
     user choice apart from the context merely re-rendering. */
  const accountThemeRef = useRef<Theme | null>(null);
  const appliedUserIdRef = useRef<string | null>(null);

  // Account -> device. Runs when a session appears or the user switches.
  useEffect(() => {
    if (!user) {
      accountThemeRef.current = null;
      appliedUserIdRef.current = null;
      return;
    }

    const saved = user.themePreference;
    accountThemeRef.current = saved ?? null;

    if (appliedUserIdRef.current !== user.id) {
      // First sight of this account on this device: adopt whatever it saved.
      appliedUserIdRef.current = user.id;
      if (saved) setIsDark(saved === 'dark');
      return;
    }
    // Same account, refreshed user object: follow it if it changed elsewhere.
    if (saved) setIsDark(saved === 'dark');
  }, [user]);

  // Paint the document + persist locally. The server write happens in setTheme.
  useEffect(() => {
    const root = document.documentElement;
    const next: Theme = isDark ? 'dark' : 'light';

    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    const colour = isDark ? '#0a0c14' : '#f7f2e9';
    if (meta) {
      meta.setAttribute('content', colour);
    } else {
      const el = document.createElement('meta');
      el.name = 'theme-color';
      el.content = colour;
      document.head.appendChild(el);
    }

    if (isDark) {
      root.classList.remove('light');
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.colorScheme = 'light';
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
  }, [isDark]);

  /** Remember the choice on the account so every device picks it up. */
  const persist = useCallback(
    (next: Theme) => {
      if (!user) return;
      if (accountThemeRef.current === next) return;
      accountThemeRef.current = next;
      void updateProfile({ themePreference: next });
    },
    [user, updateProfile]
  );

  const setTheme = useCallback(
    (next: Theme) => {
      markChosen();
      setIsDark(next === 'dark');
      persist(next);
    },
    [persist]
  );

  const toggleTheme = useCallback(() => {
    markChosen();
    setIsDark((prev) => {
      const next: Theme = prev ? 'light' : 'dark';
      persist(next);
      return !prev;
    });
  }, [persist]);

  return (
    <ThemeContext.Provider value={{ isDark, theme: isDark ? 'dark' : 'light', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
