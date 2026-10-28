import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import {
  IconSoundwave,
  IconBook,
  IconPlus,
  IconSettings,
  IconUser,
  IconMoon,
  IconSun,
  IconScroll,
} from './icons';

export default function SidebarNav({
  currentView,
  onNavigate,
  onOpenSettings,
  onOpenAuth,
  onOpenAddNovel,
}) {
  const { user, role, isAuthenticated, isWriterOrAdmin, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();

  const ThemeIcon = theme === 'dark' ? IconMoon : IconSun;
  const themeLabel = theme === 'dark' ? 'Atelier Dark' : 'Editorial Light';

  return (
    <>
      {/* Desktop Left Rail (Editorial 72px Navigation) */}
      <aside
        className="hidden md:flex fixed top-0 left-0 bottom-0 w-[72px] z-50 flex-col items-center justify-between py-6 theme-surface border-r shadow-xl transition-colors duration-200"
        aria-label="Sidebar Navigation"
      >
        {/* Top: Brand Mark & Primary Navigation */}
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Logo Mark */}
          <button
            onClick={() => onNavigate('catalog')}
            className="group relative flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--accent)] text-white shadow-md hover:scale-105 transition-transform"
            title="SyncTone Home"
            aria-label="SyncTone Home"
          >
            <IconSoundwave className="w-5 h-5 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[var(--bg-surface)]" />
          </button>

          {/* Navigation Links */}
          <nav className="flex flex-col items-center gap-2 w-full px-2" aria-label="Main Navigation">
            {/* Library / Catalog */}
            <button
              onClick={() => onNavigate('catalog')}
              className={`group relative flex items-center justify-center w-11 h-11 rounded-xl transition ${
                currentView === 'catalog'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
              }`}
              title="Novel Library"
              aria-label="Novel Library"
            >
              <IconBook className="w-5 h-5" />
              {currentView === 'catalog' && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
              )}
            </button>

            {/* Studio / Add Novel (Writers & Admins) */}
            {isWriterOrAdmin && onOpenAddNovel && (
              <button
                onClick={onOpenAddNovel}
                className="group relative flex items-center justify-center w-11 h-11 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
                title="Create New Novel"
                aria-label="Create New Novel"
              >
                <IconPlus className="w-5 h-5" />
              </button>
            )}

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="group relative flex items-center justify-center w-11 h-11 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
              title="Settings & Preferences"
              aria-label="Settings"
            >
              <IconSettings className="w-5 h-5" />
            </button>
          </nav>
        </div>

        {/* Bottom Actions: Theme Switcher & Account Profile */}
        <div className="flex flex-col items-center gap-3 w-full px-2">
          {/* Tri-Theme Switcher */}
          <button
            onClick={cycleTheme}
            className="flex items-center justify-center w-10 h-10 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-subtle)] transition"
            title={`Switch Theme (${themeLabel})`}
            aria-label={`Switch Theme: ${themeLabel}`}
          >
            <ThemeIcon className="w-5 h-5" />
          </button>

          {/* User Account / Sign In */}
          {isAuthenticated ? (
            <div className="relative group">
              <button
                onClick={logout}
                className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold uppercase shadow-sm hover:scale-105 transition"
                title={`${user?.username} (${role}) — Click to sign out`}
                aria-label="User Account"
              >
                {user?.username?.[0] || 'U'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => onOpenAuth('login')}
              className="w-10 h-10 rounded-xl theme-card flex items-center justify-center theme-muted hover:text-[var(--text-main)] border hover:border-[var(--border-focus)] transition"
              title="Sign in / Register"
              aria-label="Account / Sign In"
            >
              <IconUser className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (Hidden in Reader View for Immersive Reading) */}
      <nav
        className={`md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 theme-surface border-t items-center justify-around px-4 shadow-xl ${
          currentView === 'reader' ? 'hidden' : 'flex'
        }`}
        aria-label="Mobile Navigation"
      >
        <button
          onClick={() => onNavigate('catalog')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium transition ${
            currentView === 'catalog' ? 'text-[var(--accent)] font-semibold' : 'theme-muted'
          }`}
          aria-label="Library"
        >
          <IconBook className="w-5 h-5" />
          <span>Library</span>
        </button>

        {isWriterOrAdmin && onOpenAddNovel && (
          <button
            onClick={onOpenAddNovel}
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium theme-muted hover:text-[var(--text-main)] transition"
            aria-label="Add Novel"
          >
            <IconPlus className="w-5 h-5" />
            <span>Studio</span>
          </button>
        )}

        <button
          onClick={cycleTheme}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium theme-muted hover:text-[var(--text-main)] transition"
          aria-label="Switch Theme"
        >
          <ThemeIcon className="w-5 h-5" />
          <span className="capitalize">{theme}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium theme-muted hover:text-[var(--text-main)] transition"
          aria-label="Settings"
        >
          <IconSettings className="w-5 h-5" />
          <span>Settings</span>
        </button>

        {isAuthenticated ? (
          <button
            onClick={logout}
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium theme-muted hover:text-rose-400 transition"
            aria-label="Sign Out"
          >
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center font-bold">
              {user?.username?.[0] || 'U'}
            </span>
            <span>Sign Out</span>
          </button>
        ) : (
          <button
            onClick={() => onOpenAuth('login')}
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium theme-muted hover:text-[var(--text-main)] transition"
            aria-label="Mobile Sign In"
          >
            <IconUser className="w-5 h-5" />
            <span>Sign In</span>
          </button>
        )}
      </nav>
    </>
  );
}
