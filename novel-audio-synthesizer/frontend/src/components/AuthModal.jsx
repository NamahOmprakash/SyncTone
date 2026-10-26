import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import NovelCover from './NovelCover';
import {
  IconSoundwave,
  IconX,
  IconUser,
  IconLock,
  IconSparkles,
  IconShield,
  IconPlay,
} from './icons';

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }) {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('reader');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef(null);
  const emailInputRef = useRef(null);

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setUsername('');
    setRole('reader');
    setValidationError('');
    clearError();
    onClose();
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (isOpen) {
      clearError();
      setValidationError('');
      setTimeout(() => emailInputRef.current?.focus(), 50);
    } else {
      setPassword('');
      setValidationError('');
    }
  }, [isOpen, mode, clearError]);

  // Handle ESC key to close modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    clearError();

    // Client-side validations
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setValidationError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'register') {
      const trimmedUser = username.trim();
      if (!trimmedUser || trimmedUser.length < 3 || trimmedUser.length > 50) {
        setValidationError('Username must be between 3 and 50 characters.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await login(trimmedEmail, password);
        if (res.success) {
          handleClose();
        }
      } else {
        const res = await register(username.trim(), trimmedEmail, password, role);
        if (res.success) {
          handleClose();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = validationError || error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-scrim-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) handleClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md md:max-w-3xl theme-surface rounded-3xl shadow-2xl border overflow-hidden flex flex-col md:flex-row modal-panel-enter"
      >
        {/* Left Column: Accessible Authentication Form */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            {/* Header with Brand Logo & Close Button */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center font-bold shadow-sm">
                  <IconSoundwave className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold theme-heading font-display">SyncTone</h3>
                  <p className="text-[10px] theme-muted font-mono uppercase tracking-wider">Dramatic Audio</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition"
                aria-label="Close modal"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Title & Subheading */}
            <div className="mb-6">
              <h2 id="auth-modal-title" className="text-2xl font-bold theme-heading font-serif">
                {mode === 'login' ? 'Welcome Back' : 'Join SyncTone'}
              </h2>
              <p className="text-xs theme-sub mt-1 leading-relaxed">
                {mode === 'login'
                  ? 'Sign in to access your saved audio library and synced progress.'
                  : 'Create an account to start listening and assigning character voices.'}
              </p>
            </div>

            {/* Error Message Box */}
            {displayError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {displayError}
              </div>
            )}

            {/* Authentication Form */}
            <form noValidate onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-username" className="block text-xs font-semibold theme-sub mb-1.5">
                    Username
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. synctone_reader"
                    autoComplete="username"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-semibold theme-sub mb-1.5">
                  Email address
                </label>
                <input
                  ref={emailInputRef}
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-xs font-semibold theme-sub mb-1.5">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-role" className="block text-xs font-semibold theme-sub mb-1.5">
                    Account Type
                  </label>
                  <select
                    id="auth-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs focus:outline-none focus:border-[var(--border-focus)] transition"
                  >
                    <option value="reader">Reader (Listen & Read only)</option>
                    <option value="writer">Writer (Upload Novels & Manage Cast)</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-bold rounded-xl shadow-md text-xs transition min-h-[44px] cursor-pointer disabled:opacity-50 select-none"
              >
                {isSubmitting
                  ? 'Connecting...'
                  : mode === 'login'
                  ? 'Sign In to SyncTone'
                  : 'Join as ' + (role === 'writer' ? 'Writer' : 'Reader')}
              </button>
            </form>
          </div>

          {/* Mode Switcher Footer */}
          <div className="mt-6 pt-3 border-t theme-border text-center text-xs theme-muted">
            {mode === 'login' ? (
              <span>
                New to SyncTone?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-[var(--accent)] hover:underline font-bold cursor-pointer"
                >
                  Create Account
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-[var(--accent)] hover:underline font-bold cursor-pointer"
                >
                  Sign In
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Luxury Cinematic Spotlight Showcase (Desktop only) */}
        <div className="hidden md:flex w-1/2 relative bg-[var(--bg-card)] overflow-hidden flex-col justify-end p-8 border-l theme-border">
          <div className="absolute inset-0 opacity-40">
            <NovelCover
              title="Harry Potter"
              author="J.K. Rowling"
              className="w-full h-full object-cover scale-110 blur-sm"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/75 to-transparent" />
          </div>

          {/* Spotlight Card */}
          <div className="relative z-10 theme-surface border rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-status-success font-bold uppercase tracking-wider text-[10px] font-mono">
                <span className="w-2 h-2 rounded-full bg-[var(--color-status-success)] animate-ping" />
                Featured Audio Story
              </span>
              <span className="text-[10px] theme-muted font-mono">Studio Audio</span>
            </div>

            <div>
              <h4 className="text-base font-bold theme-heading font-serif">
                Harry Potter and the Philosopher&apos;s Stone
              </h4>
              <p className="text-[11px] theme-muted font-mono mt-0.5">
                Ch. 1: The Boy Who Lived • Multi-Voice Dramatic Cast
              </p>
            </div>

            <p className="text-xs theme-sub italic border-l-2 border-[var(--accent)] pl-3 font-serif leading-relaxed">
              &ldquo;Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.&rdquo;
            </p>

            <div className="pt-2 border-t theme-border flex items-center justify-between text-[11px] font-mono theme-muted">
              <span>Narrated by a full dramatic cast</span>
              <span className="text-status-success font-bold font-mono">Synchronized Reading</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
