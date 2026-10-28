import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api, ApiError } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';
import AuthModal from '../components/AuthModal';

// Helper component to test useAuth within provider
function TestAuthConsumer({ onAuthReady }) {
  const auth = useAuth();
  React.useEffect(() => {
    if (onAuthReady) onAuthReady(auth);
  }, [auth, onAuthReady]);

  return (
    <div>
      <div data-testid="auth-status">{auth.isAuthenticated ? 'authenticated' : 'guest'}</div>
      <div data-testid="user-role">{auth.role || 'none'}</div>
      <div data-testid="is-writer-or-admin">{auth.isWriterOrAdmin ? 'true' : 'false'}</div>
      <button onClick={() => auth.login('test@example.com', 'password123')}>Login</button>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  );
}

describe('Milestone 1 — API Client & Cookie Authentication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('api.js client', () => {
    it('always passes credentials: "include" and handles JSON payloads', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'healthy' }),
      });

      const res = await api.status.health();
      expect(res).toEqual({ status: 'healthy' });
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/health',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('throws ApiError on 401 Unauthorized with correct status and message', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid email or password.' }),
      });

      await expect(api.auth.login('bad@example.com', 'wrongpass')).rejects.toThrow(ApiError);
    });
  });

  describe('AuthContext & useAuth hook', () => {
    it('restores authenticated session on mount when cookie is valid', async () => {
      vi.spyOn(api.auth, 'me').mockResolvedValueOnce({
        user: { id: 'u-1', username: 'alice', email: 'alice@synctone.io', role: 'writer' },
      });

      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('user-role')).toHaveTextContent('writer');
        expect(screen.getByTestId('is-writer-or-admin')).toHaveTextContent('true');
      });
    });

    it('defaults to guest session when me() returns 401 unauthenticated', async () => {
      vi.spyOn(api.auth, 'me').mockRejectedValueOnce(
        new ApiError('Unauthorized', 401, null)
      );

      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('guest');
        expect(screen.getByTestId('user-role')).toHaveTextContent('none');
        expect(screen.getByTestId('is-writer-or-admin')).toHaveTextContent('false');
      });
    });

    it('updates authentication state upon login and clears it upon logout', async () => {
      vi.spyOn(api.auth, 'me').mockRejectedValueOnce(new ApiError('Unauthorized', 401));
      vi.spyOn(api.auth, 'login').mockResolvedValueOnce({
        user: { id: 'u-2', username: 'bob', email: 'bob@synctone.io', role: 'admin' },
      });
      vi.spyOn(api.auth, 'logout').mockResolvedValueOnce({ message: 'Logged out' });

      render(
        <AuthProvider>
          <TestAuthConsumer />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('guest');
      });

      fireEvent.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
        expect(screen.getByTestId('user-role')).toHaveTextContent('admin');
        expect(screen.getByTestId('is-writer-or-admin')).toHaveTextContent('true');
      });

      fireEvent.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('guest');
        expect(screen.getByTestId('user-role')).toHaveTextContent('none');
      });
    });
  });

  describe('AuthModal component', () => {
    it('validates client-side form requirements and toggles modes', async () => {
      vi.spyOn(api.auth, 'me').mockResolvedValue({ user: null });
      const handleClose = vi.fn();

      render(
        <AuthProvider>
          <AuthModal isOpen={true} onClose={handleClose} initialMode="login" />
        </AuthProvider>
      );

      expect(screen.getByText('Welcome Back')).toBeInTheDocument();

      // Submit invalid email
      fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
        target: { value: 'notanemail' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: '123456' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Sign In to SyncTone/i }));

      expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();

      // Switch to register tab
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
      expect(screen.getByText('Join SyncTone')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. synctone_reader')).toBeInTheDocument();

      // Verify role selection defaults to reader and does NOT offer admin escalation
      const roleSelect = screen.getByRole('combobox');
      expect(roleSelect).toHaveValue('reader');
      const options = Array.from(roleSelect.querySelectorAll('option')).map((o) => o.value);
      expect(options).toContain('reader');
      expect(options).toContain('writer');
      expect(options).not.toContain('admin');
    });
  });
});
