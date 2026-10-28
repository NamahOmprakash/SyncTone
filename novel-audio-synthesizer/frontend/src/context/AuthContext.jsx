import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, ApiError } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore session via GET /api/auth/me on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const data = await api.auth.me();
        if (isMounted && data?.user) {
          setUser(data.user);
        }
      } catch (err) {
        // 401 Unauthorized simply means unauthenticated guest, not an unexpected error
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const data = await api.auth.login(email, password);
      if (data?.user) {
        setUser(data.user);
        return { success: true, user: data.user };
      }
      throw new Error('Login succeeded but user profile was missing');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Login failed';
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const register = useCallback(async (username, email, password, role = 'reader') => {
    setError(null);
    try {
      const data = await api.auth.register(username, email, password, role);
      // Automatically log in with credentials upon successful registration
      const loginRes = await login(email, password);
      if (!loginRes.success) {
        // Even if auto-login fails, return the registered user
        return { success: true, user: data.user, note: 'Registered successfully. Please log in.' };
      }
      return { success: true, user: loginRes.user };
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Registration failed';
      setError(msg);
      return { success: false, error: msg };
    }
  }, [login]);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await api.auth.logout();
    } catch (err) {
      console.warn('[Auth] Logout warning:', err.message);
    } finally {
      setUser(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const role = user?.role || null;
  const isAuthenticated = !!user;
  const isWriterOrAdmin = role === 'writer' || role === 'admin';
  const isAdmin = role === 'admin';

  const value = useMemo(
    () => ({
      user,
      role,
      isAuthenticated,
      isWriterOrAdmin,
      isAdmin,
      isLoading,
      error,
      login,
      register,
      logout,
      clearError,
    }),
    [user, role, isAuthenticated, isWriterOrAdmin, isAdmin, isLoading, error, login, register, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
