import React, { useState, useEffect, useRef } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { isWebAuthnSupported } from '../utils/webauthn';
import NovelCover from './NovelCover';
import { IconSyncToneLogo, IconX, IconShield } from './icons';

function GoogleLogo({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

function GitHubLogo({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }) {
  const {
    login,
    register,
    loginWithPasskey,
    registerWithPasskey,
    loginWithOAuth,
    loginWithGithub,
    error,
    clearError,
  } = useAuth();

  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [usePasskeySignup, setUsePasskeySignup] = useState(false);
  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [githubToken, setGithubToken] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('reader');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const modalRef = useRef(null);
  const emailInputRef = useRef(null);
  const usernameInputRef = useRef(null);
  const githubInputRef = useRef(null);
  const triggerRef = useRef(null);
  const prefersReduced = useReducedMotion();

  const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
  const panelVariants = prefersReduced
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setUsername('');
    setRole('reader');
    setUsePasskeySignup(false);
    setGithubPanelOpen(false);
    setGithubUsername('');
    setGithubToken('');
    setValidationError('');
    clearError?.();
    onClose();
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
    }
  };

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
    }
  }, [isOpen]);

  useEffect(() => {
    setMode(initialMode);
    setUsePasskeySignup(false);
    setGithubPanelOpen(false);
  }, [initialMode]);

  useEffect(() => {
    if (isOpen) {
      clearError?.();
      setValidationError('');
      setTimeout(() => {
        if (githubPanelOpen) githubInputRef.current?.focus();
        else if (usePasskeySignup && mode === 'register') usernameInputRef.current?.focus();
        else emailInputRef.current?.focus();
      }, 50);
    } else {
      setPassword('');
      setShowPassword(false);
      setUsePasskeySignup(false);
      setGithubPanelOpen(false);
      setValidationError('');
    }
  }, [isOpen, mode, usePasskeySignup, githubPanelOpen, clearError]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen && !isSubmitting && !passkeyBusy) {
        handleClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isSubmitting, passkeyBusy]);

  if (!isOpen) return null;

  const runPasskeyCreation = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUser = username.trim();

    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    if (!trimmedEmail && trimmedUser.length < 3) {
      setValidationError('Enter a username (min 3 characters) or email address to create your Passkey.');
      return;
    }
    if (trimmedUser && (trimmedUser.length < 3 || trimmedUser.length > 50)) {
      setValidationError('Username must be between 3 and 50 characters.');
      return;
    }

    setPasskeyBusy(true);
    try {
      const res = await registerWithPasskey?.({
        email: trimmedEmail || undefined,
        username: trimmedUser || undefined,
        role,
      });
      if (res?.success) {
        handleClose();
      }
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    clearError?.();

    if (mode === 'register' && usePasskeySignup) {
      await runPasskeyCreation();
      return;
    }

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

  const handlePasskeyAction = async () => {
    setValidationError('');
    clearError?.();

    if (mode === 'register') {
      if (!usePasskeySignup && !username.trim() && !email.trim()) {
        setUsePasskeySignup(true);
        setTimeout(() => usernameInputRef.current?.focus(), 40);
        return;
      }
      setUsePasskeySignup(true);
      await runPasskeyCreation();
      return;
    }

    setPasskeyBusy(true);
    try {
      const res = await loginWithPasskey?.(email.trim().toLowerCase());
      if (res?.success) {
        handleClose();
      }
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleGitHubClick = async () => {
    setValidationError('');
    clearError?.();
    const res = await loginWithOAuth?.('github');
    if (res?.needsGithubHandle) {
      setGithubPanelOpen(true);
    }
  };

  const handleGitHubSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    clearError?.();
    const trimmedHandle = githubUsername.trim();
    const trimmedToken = githubToken.trim();
    if (!trimmedToken) {
      setValidationError('Enter a GitHub Personal Access Token (read:user / user:email) to verify your account.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await loginWithGithub?.({ username: trimmedHandle, token: trimmedToken });
      if (res?.success) {
        handleClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = validationError || error;
  const webAuthnReady = isWebAuthnSupported();
  const busy = isSubmitting || passkeyBusy;

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.2 }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) handleClose();
        }}
      >
        <m.div
          ref={modalRef}
          className="w-full max-w-md md:max-w-3xl theme-surface rounded-3xl shadow-2xl border overflow-hidden flex flex-col md:flex-row max-h-[92vh] overflow-y-auto"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Left Column: Multi-Method Authentication Form */}
          <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              {/* Header with Brand Logo & Close Button */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center font-bold shadow-sm">
                    <IconSyncToneLogo className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold theme-heading font-display">SyncTone</h3>
                    <p className="text-[10px] theme-muted font-mono uppercase tracking-wider">Dramatic Audio</p>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
                  aria-label="Close modal"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              {/* Title & Subheading */}
              <div className="mb-4">
                <h2 id="auth-modal-title" className="text-2xl font-bold theme-heading font-serif">
                  {githubPanelOpen
                    ? 'Continue with GitHub'
                    : mode === 'login'
                      ? 'Welcome Back'
                      : 'Join SyncTone'}
                </h2>
                <p className="text-xs theme-sub mt-1 leading-relaxed">
                  {githubPanelOpen
                    ? 'Verify your GitHub handle to sync your profile and avatar.'
                    : mode === 'login'
                      ? 'Sign in to access your saved audio library and synced progress.'
                      : 'Create an account to start listening and assigning character voices.'}
                </p>
              </div>

              {githubPanelOpen ? (
                <>
                  {displayError && (
                    <div className="mb-3 p-3 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-semibold">
                      {displayError}
                    </div>
                  )}

                  <form onSubmit={handleGitHubSubmit} className="space-y-3.5">
                    <div>
                      <label htmlFor="auth-github-username" className="block text-xs font-semibold theme-sub mb-1">
                        GitHub Username or Profile URL
                      </label>
                      <input
                        ref={githubInputRef}
                        id="auth-github-username"
                        type="text"
                        value={githubUsername}
                        onChange={(e) => setGithubUsername(e.target.value)}
                        placeholder="e.g. NamahOmprakash"
                        disabled={busy}
                        className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                      />
                    </div>

                    <div>
                      <label htmlFor="auth-github-token" className="block text-xs font-semibold theme-sub mb-1">
                        GitHub Personal Access Token
                      </label>
                      <input
                        id="auth-github-token"
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_... (read:user / user:email)"
                        disabled={busy}
                        className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3 px-6 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-bold rounded-full shadow-md text-xs transition-all duration-200 hover:scale-[1.02] min-h-[44px] cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? 'Verifying GitHub Profile...' : 'Continue with GitHub'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGithubPanelOpen(false);
                        setValidationError('');
                        clearError?.();
                      }}
                      className="w-full py-2 text-xs theme-muted hover:text-[var(--text-main)] font-mono cursor-pointer"
                    >
                      ← Back to all sign-in options
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {/* Quick Social + Passkey Options */}
                  <div className="space-y-2 mb-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => loginWithOAuth?.('google')}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl theme-card border border-[var(--border-strong)] hover:bg-[var(--bg-hover)] text-xs font-semibold theme-heading transition cursor-pointer disabled:opacity-50"
                      >
                        <GoogleLogo className="w-4 h-4 shrink-0" />
                        <span>Google</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleGitHubClick}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl theme-card border border-[var(--border-strong)] hover:bg-[var(--bg-hover)] text-xs font-semibold theme-heading transition cursor-pointer disabled:opacity-50"
                      >
                        <GitHubLogo className="w-4 h-4 shrink-0" />
                        <span>GitHub</span>
                      </button>
                    </div>

                    {webAuthnReady && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handlePasskeyAction}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                          mode === 'register' && usePasskeySignup
                            ? 'bg-[var(--accent-surface)] border-[var(--text-main)] theme-heading ring-1 ring-[var(--text-main)]'
                            : 'theme-card border-[var(--border-strong)] hover:border-[var(--text-main)] hover:bg-[var(--bg-hover)] theme-heading'
                        }`}
                      >
                        <IconShield className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                        <span>
                          {passkeyBusy
                            ? 'Waiting for Biometric / Security Key...'
                            : mode === 'login'
                              ? 'Sign In with Passkey'
                              : usePasskeySignup
                                ? 'Passkey Signup Selected (No Password Needed)'
                                : 'Create Account with Passkey'}
                        </span>
                      </button>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                      <span className="text-[10px] font-mono uppercase tracking-wider theme-muted">
                        {mode === 'register' && usePasskeySignup
                          ? 'passkey account details'
                          : 'or continue with email'}
                      </span>
                      <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                    </div>
                  </div>

                  {mode === 'register' && usePasskeySignup && (
                    <div className="mb-3 p-3 rounded-xl bg-[var(--accent-surface)] border border-[var(--border-strong)] text-xs theme-heading space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">Passwordless Passkey Setup</span>
                        <button
                          type="button"
                          onClick={() => setUsePasskeySignup(false)}
                          className="text-[10px] font-mono underline theme-muted hover:text-[var(--text-main)] cursor-pointer"
                        >
                          Use password instead
                        </button>
                      </div>
                      <p className="text-[11px] theme-sub">
                        Enter a username (and optional email), then click the button below to confirm with Touch ID, Face ID, or Windows Hello.
                      </p>
                    </div>
                  )}

                  {/* Error Message Box */}
                  {displayError && (
                    <div className="mb-3 p-3 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-semibold">
                      {displayError}
                    </div>
                  )}

                  {/* Email/Password OR Passkey Registration Form */}
                  <form noValidate onSubmit={handleSubmit} className="space-y-3.5">
                    {mode === 'register' && (
                      <div>
                        <label htmlFor="auth-username" className="block text-xs font-semibold theme-sub mb-1">
                          Username
                        </label>
                        <input
                          ref={usernameInputRef}
                          id="auth-username"
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. synctone_reader"
                          autoComplete="username"
                          disabled={busy}
                          className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="auth-email" className="block text-xs font-semibold theme-sub mb-1">
                        {mode === 'register' && usePasskeySignup
                          ? 'Email address (optional for Passkey)'
                          : 'Email address'}
                      </label>
                      <input
                        ref={emailInputRef}
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        disabled={busy}
                        className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                      />
                    </div>

                    {!(mode === 'register' && usePasskeySignup) && (
                      <div>
                        <label htmlFor="auth-password" className="block text-xs font-semibold theme-sub mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            disabled={busy}
                            className="w-full pl-3.5 pr-14 py-2.5 theme-card border rounded-xl text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono theme-muted hover:text-[var(--text-main)] px-1.5 py-0.5 rounded cursor-pointer"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )}

                    {mode === 'register' && (
                      <div>
                        <label htmlFor="auth-role" className="block text-xs font-semibold theme-sub mb-1">
                          Account Type
                        </label>
                        <select
                          id="auth-role"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          disabled={busy}
                          className="w-full px-3.5 py-2.5 theme-card border rounded-xl text-xs focus:outline-none focus:border-[var(--border-focus)] transition"
                        >
                          <option value="reader">Reader (Listen &amp; Read only)</option>
                          <option value="writer">Writer (Upload Novels &amp; Manage Cast)</option>
                        </select>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3 px-6 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-bold rounded-full shadow-md text-xs transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.96] min-h-[44px] cursor-pointer disabled:opacity-50 select-none"
                    >
                      {busy
                        ? 'Connecting...'
                        : mode === 'login'
                          ? 'Sign In to SyncTone'
                          : usePasskeySignup
                            ? 'Continue with Passkey'
                            : 'Join as ' + (role === 'writer' ? 'Writer' : 'Reader')}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Mode Switcher Footer */}
            <div className="mt-5 pt-3 border-t theme-border text-center text-xs theme-muted">
              {mode === 'login' ? (
                <span>
                  New to SyncTone?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setGithubPanelOpen(false);
                      setUsePasskeySignup(false);
                      setMode('register');
                    }}
                    className="text-[var(--accent-text)] hover:underline font-bold cursor-pointer"
                  >
                    Create Account
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setGithubPanelOpen(false);
                      setUsePasskeySignup(false);
                      setMode('login');
                    }}
                    className="text-[var(--accent-text)] hover:underline font-bold cursor-pointer"
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
        </m.div>
      </m.div>
    </LazyMotion>
  );
}
