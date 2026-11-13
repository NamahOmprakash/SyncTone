import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { preloadAuthModal, preloadAddNovelModal, preloadSettingsModal } from '../App';
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

export const Icon = React.memo(function Icon({ name, className = 'w-4 h-4', ...props }) {
  switch (name) {
    case 'soundwave':
      return <IconSoundwave className={className} {...props} />;
    case 'book':
      return <IconBook className={className} {...props} />;
    case 'plus':
      return <IconPlus className={className} {...props} />;
    case 'settings':
      return <IconSettings className={className} {...props} />;
    case 'user':
      return <IconUser className={className} {...props} />;
    case 'moon':
      return <IconMoon className={className} {...props} />;
    case 'sun':
      return <IconSun className={className} {...props} />;
    case 'scroll':
      return <IconScroll className={className} {...props} />;
    default:
      return null;
  }
});

export default function SidebarNav({
  currentView,
  onNavigate,
  onOpenSettings,
  onOpenAuth,
  onOpenAddNovel,
}) {
  const { user, role, isAuthenticated, isWriterOrAdmin, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();

  const themeLabel = theme === 'dark' ? 'Dark Stage' : 'Light Stage';

  return (
    <>
      {/* Mobile Bottom Navigation Bar (Hidden in Reader View for Immersive Reading) */}
      <nav
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-[var(--bg-bar)] border-t border-[var(--border-subtle)] items-center justify-around px-4 ${
          currentView === 'reader' ? 'hidden' : 'flex'
        }`}
        aria-label="Mobile Navigation"
      >
        <button
          onClick={() => onNavigate('catalog')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-mono uppercase tracking-wider transition-all duration-100 ease-out active:scale-95 cursor-pointer ${
            currentView === 'catalog' ? 'text-[var(--text-main)] font-bold' : 'text-[var(--text-sub)]'
          }`}
          aria-label="Library"
        >
          <Icon name="book" className="w-4 h-4" />
          <span>Library</span>
        </button>

        {isWriterOrAdmin && onOpenAddNovel && (
          <button
            onClick={onOpenAddNovel}
            className="flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-mono uppercase tracking-wider text-[var(--text-sub)] hover:text-[var(--text-main)] transition-all duration-100 ease-out active:scale-95 cursor-pointer"
            aria-label="Upload Studio"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Upload Studio</span>
          </button>
        )}

        <button
          onClick={cycleTheme}
          className="flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-mono uppercase tracking-wider text-[var(--text-sub)] hover:text-[var(--text-main)] transition-all duration-100 ease-out active:scale-95 cursor-pointer"
          aria-label={`Switch Theme (${theme})`}
          aria-pressed={theme === 'dark'}
          title={`Switch Theme (${themeLabel})`}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} className="w-4 h-4" />
          <span className="capitalize">{theme}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-mono uppercase tracking-wider text-[var(--text-sub)] hover:text-[var(--text-main)] transition-all duration-100 ease-out active:scale-95 cursor-pointer"
          aria-label="Settings"
        >
          <Icon name="settings" className="w-4 h-4" />
          <span>Settings</span>
        </button>

        {isAuthenticated ? (
          <button
            onClick={logout}
            className="flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-mono uppercase tracking-wider text-[var(--text-sub)] hover:text-[var(--text-main)] transition-all duration-100 ease-out active:scale-95 cursor-pointer"
            aria-label="Sign Out"
          >
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[9px] font-mono flex items-center justify-center font-bold shadow-xs">
              {user?.username?.[0] || 'U'}
            </span>
            <span>Sign Out</span>
          </button>
        ) : (
          <button
            onClick={() => onOpenAuth('login')}
            className="flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-mono uppercase tracking-wider text-[var(--text-sub)] hover:text-[var(--text-main)] transition-all duration-100 ease-out active:scale-95 cursor-pointer"
            aria-label="Mobile Sign In"
          >
            <Icon name="user" className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        )}
      </nav>
    </>
  );
}
