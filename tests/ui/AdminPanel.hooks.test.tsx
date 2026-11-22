/**
 * Regression test for React error #310 ("Rendered more hooks than during the previous render").
 *
 * AdminPanel used to call ~20 hooks AFTER an early `return null` for non-admins. As soon as the
 * auth state changed from "not admin" to "admin" (or the other way round) React threw and the
 * whole app showed the "Something slipped" screen.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const auth = { user: null as null | { id: string; role: string; displayName: string }, isAdmin: false };

vi.mock('../../src/context/AuthContext.tsx', () => ({
  useAuth: () => auth,
  apiFetch: vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
}));

import { AdminPanel } from '../../src/components/AdminPanel.tsx';

beforeEach(() => {
  cleanup();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AdminPanel hook order', () => {
  it('renders nothing for non-admins', () => {
    auth.user = { id: 'u1', role: 'member', displayName: 'Maya' };
    auth.isAdmin = false;
    const { container } = render(<AdminPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('does not crash when a user becomes admin between renders', () => {
    auth.user = { id: 'u1', role: 'member', displayName: 'Sam' };
    auth.isAdmin = false;
    const view = render(<AdminPanel />);

    auth.user = { id: 'u1', role: 'admin', displayName: 'Sam' };
    auth.isAdmin = true;
    expect(() => view.rerender(<AdminPanel />)).not.toThrow();

    auth.user = { id: 'u1', role: 'member', displayName: 'Sam' };
    auth.isAdmin = false;
    expect(() => view.rerender(<AdminPanel />)).not.toThrow();
  });
});
