import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextType {
  isDark: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (next: 'dark' | 'light') => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('kinfolk_theme');
    if (saved) return saved === 'dark';
    return true; // Default to dark mode matching user prototype
  });

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
      localStorage.setItem('kinfolk_theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('kinfolk_theme', 'light');
    }
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
