import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextType {
  isDark: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (next: 'dark' | 'light') => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = 'kinfolk_theme';
const DEFAULT_THEME: 'dark' | 'light' = 'light';

/** Read the stored preference; anything missing or unrecognised means light. */
function readStoredTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return DEFAULT_THEME;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => readStoredTheme() === 'dark');

  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) {
      meta.setAttribute('content', isDark ? '#0a0c14' : '#f7f2e9');
    } else {
      const el = document.createElement('meta');
      el.name = 'theme-color';
      el.content = isDark ? '#0a0c14' : '#f7f2e9';
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
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {}
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);
  const setTheme = (next: 'dark' | 'light') => setIsDark(next === 'dark');

  return (
    <ThemeContext.Provider value={{ isDark, theme: isDark ? 'dark' : 'light', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
