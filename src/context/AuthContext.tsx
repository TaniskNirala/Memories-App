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
  switchUser: (username: string) => Promise<boolean>;
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
  switchUser: async () => false,
});

export function getAuthToken(): string | null {
  return localStorage.getItem('kinfolk_auth_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('kinfolk_auth_token', token);
  } else {
    localStorage.removeItem('kinfolk_auth_token');
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit, retries: number = 2): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const res = await fetch(input, {
      ...init,
      headers,
      credentials: 'include',
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
      if (data.token) {
        setAuthToken(data.token);
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
      if (data.token) {
        setAuthToken(data.token);
      }
      setUser(data.user);
      return { success: true, isPending: data.isPending };
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  const switchUser = async (username: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setAuthToken(data.token);
        }
        setUser(data.user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setAuthToken(null);
      setUser(null);
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
        switchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
