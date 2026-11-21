import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types/index.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isPending: boolean;
  isSuspended: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; isPending?: boolean }>;
  register: (username: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string; isPending?: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Patch the signed-in user's profile and refresh local state */
  updateProfile: (patch: {
    displayName?: string;
    username?: string;
    avatarColor?: string;
    currentPassword?: string;
    themePreference?: 'dark' | 'light';
  }) => Promise<{ success: boolean; error?: string; message?: string }>;
  /** Upload a profile photo from the device */
  uploadAvatar: (file: File) => Promise<{ success: boolean; error?: string }>;
  /** Remove the uploaded photo and fall back to the colour avatar */
  removeAvatar: () => Promise<{ success: boolean; error?: string }>;
}

/* The theme picked on the login card, when this browser has no account yet.
   ThemeContext owns the flags; read them lazily to avoid an import cycle. */
function readPendingThemeChoice(): 'dark' | 'light' | null {
  try {
    if (localStorage.getItem('kinfolk_theme_chosen') !== '1') return null;
    const saved = localStorage.getItem('kinfolk_theme');
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isPending: false,
  isSuspended: false,
  isAdmin: false,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: async () => {},
  refreshUser: async () => {},
  updateProfile: async () => ({ success: false }),
  uploadAvatar: async () => ({ success: false }),
  removeAvatar: async () => ({ success: false }),
});

// Sessions live in an httpOnly cookie that scripts cannot read. Remove any token left in
// localStorage by older versions of the app.
try {
  localStorage.removeItem('kinfolk_auth_token');
} catch {}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit, retries: number = 2): Promise<Response> {
  try {
    const res = await fetch(input, {
      ...init,
      credentials: 'same-origin',
    });
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return apiFetch(input, init, retries - 1);
    }
    throw err;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch current user:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error, isPending: data.isPending };
      }
      // This device's first-ever theme choice wins for an account that has not
      // saved one yet, so picking dark on the login card is not undone by login.
      const pending = readPendingThemeChoice();
      if (pending && !data.user?.themePreference) {
        data.user.themePreference = pending;
        void apiFetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ themePreference: pending }),
        }).catch(() => {});
      }
      setUser(data.user);
      return { success: true, isPending: data.isPending };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const register = async (username: string, password: string, displayName: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      const pending = readPendingThemeChoice();
      if (pending && !data.user?.themePreference) {
        data.user.themePreference = pending;
        void apiFetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ themePreference: pending }),
        }).catch(() => {});
      }
      setUser(data.user);
      return { success: true, isPending: data.isPending };
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
    }
  };

  const updateProfile = async (patch: {
    displayName?: string;
    username?: string;
    avatarColor?: string;
    currentPassword?: string;
    themePreference?: 'dark' | 'light';
  }) => {
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || 'Could not save your profile' };
      if (data.user) setUser(data.user);
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not save your profile' };
    }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const body = new FormData();
      body.append('avatar', file);
      const res = await apiFetch('/api/auth/avatar', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || 'Could not upload that image' };
      if (data.user) {
        setUser(data.user);
      } else {
        setUser((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not upload that image' };
    }
  };

  const removeAvatar = async () => {
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeAvatar: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || 'Could not remove your photo' };
      if (data.user) {
        setUser(data.user);
      } else {
        setUser((prev) => (prev ? { ...prev, avatarUrl: undefined } : prev));
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not remove your photo' };
    }
  };

  const isPending = user?.role === 'pending';
  const isSuspended = user?.status === 'suspended';
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isPending,
        isSuspended,
        isAdmin,
        login,
        register,
        logout,
        refreshUser,
        updateProfile,
        uploadAvatar,
        removeAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
