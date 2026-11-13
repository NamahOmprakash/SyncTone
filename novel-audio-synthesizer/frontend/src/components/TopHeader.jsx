import React from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  IconSoundwave,
  IconUsers,
  IconSettings,
  IconUser,
  IconShield,
  IconArrowLeft,
} from './icons';

export default function TopHeader({
  view,
  currentNovel,
  currentChapter,
  onNavigate,
  showRoster,
  onToggleRoster,
  onOpenSettings,
  onOpenAuth,
}) {
  const { user, role, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 glass-header border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Breadcrumbs */}
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <button
            onClick={() => onNavigate('catalog')}
            className="flex items-center gap-2.5 group text-left outline-none flex-shrink-0 cursor-pointer"
            aria-label="SyncTone Home"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-surface)] border border-[var(--border-focus)] text-[var(--accent)] flex items-center justify-center transition-colors">
              <IconSoundwave className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-[var(--text-main)] font-display">
                SyncTone
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono tracking-wide bg-[var(--accent-surface)] text-[var(--accent)] rounded-md border border-[var(--border-subtle)]">
                Full Cast Audio
              </span>
            </div>
          </button>

          {/* Breadcrumb Navigation */}
          <nav className="hidden md:flex items-center gap-2 text-xs theme-muted font-medium min-w-0" aria-label="Breadcrumb">
            <span className="theme-muted opacity-50">/</span>
            <button
              onClick={() => onNavigate('catalog')}
              className={`hover:text-[var(--text-main)] transition flex-shrink-0 cursor-pointer ${
                view === 'catalog' ? 'text-[var(--text-main)] font-semibold' : ''
              }`}
            >
              Library
            </button>
            {view !== 'catalog' && currentNovel && (
              <>
                <span className="theme-muted opacity-50">/</span>
                <button
                  onClick={() => onNavigate('details')}
                  className={`hover:text-[var(--text-main)] transition truncate max-w-[180px] cursor-pointer ${
                    view === 'details' ? 'text-[var(--text-main)] font-semibold' : ''
                  }`}
                  title={currentNovel.title}
                >
                  {currentNovel.title}
                </button>
              </>
            )}
            {view === 'reader' && currentChapter && (
              <>
                <span className="theme-muted opacity-50">/</span>
                <span
                  className="text-[var(--text-main)] font-semibold truncate max-w-[200px]"
                  title={currentChapter.title}
                >
                  {currentChapter.title}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Cast Roster Toggle (active only in reader view) */}
          {view === 'reader' && (
            <button
              onClick={onToggleRoster}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                showRoster
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] shadow-sm'
                  : 'theme-card hover:border-[var(--border-focus)]'
              }`}
              aria-label="Toggle Cast Roster"
            >
              <IconUsers className="w-4 h-4" />
              <span>Cast Roster</span>
            </button>
          )}

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2.5 theme-muted hover:text-[var(--text-main)] rounded-xl hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-subtle)] transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Settings & Preferences"
            aria-label="Settings"
          >
            <IconSettings className="w-4 h-4" />
          </button>

          {/* User Session / Auth Trigger */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono tracking-wide uppercase rounded-md theme-card border">
                <IconShield className="w-3 h-3 text-[var(--accent)]" />
                {role}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-xs theme-muted hover:text-rose-400 rounded-lg hover:bg-[var(--bg-hover)] transition font-medium cursor-pointer"
                title="Sign out of SyncTone"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
              <button
                onClick={() => onOpenAuth('login')}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] shadow-sm transition flex items-center gap-1.5 cursor-pointer min-h-[36px]"
              >
                <IconUser className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
