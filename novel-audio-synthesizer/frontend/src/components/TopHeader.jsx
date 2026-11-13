import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { preloadAuthModal, preloadSettingsModal, preloadCharacterRoster } from '../App';
import {
  IconSettings,
  IconShield,
  IconSyncToneLogo,
} from './icons';

export default function TopHeader({
  view,
  currentNovel,
  currentChapter,
  onNavigate,
  onOpenArchive,
  onOpenReader,
  onOpenVoices,
  showRoster,
  onToggleRoster,
  onOpenSettings,
  onOpenAuth,
  onOpenAddNovel,
}) {
  const { user, role, isAuthenticated, isWriterOrAdmin, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-bar)] border-b border-[var(--border-subtle)] h-14 backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-2 sm:px-8 h-full flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand & Primary Navigation Links */}
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          {/* Brand Logo */}
          <button
            onClick={() => onNavigate('catalog')}
            className="flex items-center gap-2.5 group text-left outline-none flex-shrink-0 cursor-pointer active:scale-95 transition-all duration-200"
            aria-label="SyncTone Home"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--text-main)] text-[var(--bg-page)] flex items-center justify-center shadow-md group-hover:scale-105 group-hover:shadow-lg transition-all duration-200 border border-[var(--border-subtle)]">
              <IconSyncToneLogo className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-mono font-bold tracking-[0.18em] uppercase text-[var(--text-main)] group-hover:opacity-90 transition-opacity leading-none">
                SYNCTONE
              </span>
              <span className="text-[8px] font-mono tracking-[0.22em] uppercase text-[var(--text-sub)] leading-tight mt-0.5 hidden xs:inline">
                AUDIO STUDIO
              </span>
            </div>
          </button>

          {/* Monospace Editorial Nav Links */}
          <nav className="hidden sm:flex items-center gap-1.5 text-xs font-mono tracking-wider min-w-0" aria-label="Main Navigation">
            <button
              onClick={() => onNavigate?.('catalog')}
              aria-current={view === 'catalog' ? 'page' : undefined}
              className={`transition-all duration-200 px-3 py-1 rounded-full cursor-pointer uppercase ${
                view === 'catalog'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                  : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              + LIBRARY
            </button>
            <button
              onClick={() => {
                if (onNavigate) onNavigate('archive');
                else if (onOpenArchive) onOpenArchive();
              }}
              aria-current={view === 'archive' ? 'page' : undefined}
              className={`transition-all duration-200 px-3 py-1 rounded-full cursor-pointer uppercase ${
                view === 'archive'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                  : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              + ARCHIVE
            </button>
            <button
              onClick={() => {
                if (onNavigate) onNavigate('voices');
                else if (onOpenVoices) onOpenVoices();
              }}
              aria-current={view === 'voices' ? 'page' : undefined}
              className={`transition-all duration-200 px-3 py-1 rounded-full cursor-pointer uppercase ${
                view === 'voices'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                  : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              + VOICES
            </button>
            <button
              onClick={() => {
                if (onOpenReader) onOpenReader();
                else if (currentChapter?.id) onNavigate?.('reader', currentChapter.id);
                else onNavigate?.('reader');
              }}
              aria-current={view === 'reader' ? 'page' : undefined}
              className={`transition-all duration-200 px-3 py-1 rounded-full cursor-pointer uppercase ${
                view === 'reader'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                  : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              + READER
            </button>
            <button
              onClick={() => onNavigate?.('upload')}
              aria-current={view === 'upload' ? 'page' : undefined}
              className={`transition-all duration-200 px-3 py-1 rounded-full cursor-pointer uppercase ${
                view === 'upload'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                  : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
              title="Upload Studio"
            >
              + UPLOAD STUDIO
            </button>
          </nav>
        </div>

        {/* Right Action Controls: Cast Roster, Theme Toggle, Settings & Auth */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          {/* Cast Toggle (active only in reader view) */}
          {view === 'reader' && (
            <button
              onClick={onToggleRoster}
              onMouseEnter={preloadCharacterRoster}
              onFocus={preloadCharacterRoster}
              aria-expanded={Boolean(showRoster)}
              aria-controls="character-roster-drawer"
              className={`boxed-btn px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-mono flex items-center gap-1 sm:gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all ${
                showRoster
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] font-bold'
                  : 'bg-[var(--bg-card)] text-[var(--text-main)] border-[var(--border-strong)] hover:border-[var(--text-main)]'
              }`}
              aria-label="Toggle Cast Roster"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>CAST</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={cycleTheme}
            className="boxed-btn px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-mono uppercase text-[var(--text-sub)] hover:text-[var(--text-main)] bg-[var(--bg-card)] border-[var(--border-strong)] hover:border-[var(--text-main)] flex items-center gap-1 sm:gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all"
            title={`Switch Theme (currently ${theme})`}
            aria-label={`Switch Theme: ${theme.toUpperCase()}`}
            aria-pressed={theme === 'dark'}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span className="hidden sm:inline">THEME: </span>
            <span>{theme.toUpperCase()}</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            onMouseEnter={preloadSettingsModal}
            onFocus={preloadSettingsModal}
            className="boxed-btn p-1.5 text-[var(--text-sub)] hover:text-[var(--text-main)] bg-[var(--bg-card)] border-[var(--border-strong)] hover:border-[var(--text-main)] active:scale-95 cursor-pointer flex items-center justify-center min-w-[32px] min-h-[32px] rounded-full transition-all"
            title="Settings & Preferences"
            aria-label="Settings"
          >
            <IconSettings className="w-3.5 h-3.5" />
          </button>

          {/* User Session / Auth Trigger */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-mono uppercase bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-sub)] rounded-full">
                <IconShield className="w-3 h-3 text-[var(--text-main)]" />
                {role}
              </span>
              <button
                onClick={logout}
                className="boxed-btn px-3 py-1 text-[11px] font-mono uppercase text-[var(--text-sub)] hover:text-[var(--text-main)] bg-[var(--bg-card)] border-[var(--border-strong)] hover:border-[var(--text-main)] active:scale-95 cursor-pointer rounded-full transition-all"
                title="Sign out of SyncTone"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-1 sm:pl-2 sm:border-l sm:border-[var(--border-subtle)]">
              <button
                onClick={() => onOpenAuth('login')}
                onMouseEnter={preloadAuthModal}
                onFocus={preloadAuthModal}
                className="boxed-btn-primary px-3.5 py-1 text-[11px] font-mono uppercase flex items-center gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all shadow-none"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>Sign In</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
