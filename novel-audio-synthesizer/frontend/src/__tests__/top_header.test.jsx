import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import TopHeader from '../components/TopHeader';

function renderTopHeader(props = {}, authValue = {}, themeValue = {}) {
  const defaultAuth = {
    user: null,
    role: 'reader',
    isAuthenticated: false,
    isWriterOrAdmin: false,
    logout: vi.fn(),
    ...authValue,
  };

  const defaultTheme = {
    theme: 'dark',
    cycleTheme: vi.fn(),
    setTheme: vi.fn(),
    ...themeValue,
  };

  return render(
    <AuthContext.Provider value={defaultAuth}>
      <ThemeContext.Provider value={defaultTheme}>
        <TopHeader
          view="reader"
          currentNovel={{ id: 'novel-1', title: 'Test Novel' }}
          currentChapter={{ id: 'ch-1', title: 'Chapter 1' }}
          onNavigate={vi.fn()}
          onOpenArchive={vi.fn()}
          onOpenReader={vi.fn()}
          onOpenVoices={vi.fn()}
          showRoster={false}
          onToggleRoster={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenAuth={vi.fn()}
          onOpenAddNovel={vi.fn()}
          {...props}
        />
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

describe('TopHeader Navigation & Cast Roster Decoupling', () => {
  it('strictly navigates to /voices when + VOICES is clicked from reader view and does not toggle roster', () => {
    const handleNavigate = vi.fn();
    const handleToggleRoster = vi.fn();

    renderTopHeader({
      view: 'reader',
      onNavigate: handleNavigate,
      onToggleRoster: handleToggleRoster,
    });

    const voicesButton = screen.getByRole('button', { name: '+ VOICES' });
    fireEvent.click(voicesButton);

    expect(handleNavigate).toHaveBeenCalledWith('voices');
    expect(handleToggleRoster).not.toHaveBeenCalled();
  });

  it('keeps + VOICES inactive and + READER active when in reader view even if showRoster is true', () => {
    renderTopHeader({
      view: 'reader',
      showRoster: true,
    });

    const readerButton = screen.getByRole('button', { name: '+ READER' });
    const voicesButton = screen.getByRole('button', { name: '+ VOICES' });
    const castRosterButton = screen.getByRole('button', { name: 'Toggle Cast Roster' });

    // + READER is active
    expect(readerButton).toHaveAttribute('aria-current', 'page');
    expect(readerButton.className).toContain('bg-[var(--accent)]');

    // + VOICES is strictly inactive
    expect(voicesButton).not.toHaveAttribute('aria-current');
    expect(voicesButton.className).not.toContain('bg-[var(--accent)]');
    expect(voicesButton.className).toContain('text-[var(--text-sub)]');

    // Cast Roster toggle has active styling and aria-expanded
    expect(castRosterButton).toHaveAttribute('aria-expanded', 'true');
    expect(castRosterButton.className).toContain('bg-[var(--accent)]');
  });

  it('marks + VOICES active with aria-current="page" only when view is voices', () => {
    renderTopHeader({
      view: 'voices',
      showRoster: false,
    });

    const voicesButton = screen.getByRole('button', { name: '+ VOICES' });
    expect(voicesButton).toHaveAttribute('aria-current', 'page');
    expect(voicesButton.className).toContain('bg-[var(--accent)]');
  });

  it('toggles roster solely via dedicated CAST ROSTER button in reader view', () => {
    const handleToggleRoster = vi.fn();
    renderTopHeader({
      view: 'reader',
      showRoster: false,
      onToggleRoster: handleToggleRoster,
    });

    const castRosterButton = screen.getByRole('button', { name: 'Toggle Cast Roster' });
    expect(castRosterButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(castRosterButton);
    expect(handleToggleRoster).toHaveBeenCalledTimes(1);
  });

  it('does not render CAST ROSTER button when outside reader view', () => {
    renderTopHeader({
      view: 'catalog',
      showRoster: false,
    });

    expect(screen.queryByRole('button', { name: 'Toggle Cast Roster' })).not.toBeInTheDocument();
  });

  it('maintains Theme toggle and Sign In buttons visible and interactive', () => {
    const cycleTheme = vi.fn();
    const handleOpenAuth = vi.fn();

    renderTopHeader(
      {
        view: 'reader',
        showRoster: true,
        onOpenAuth: handleOpenAuth,
      },
      { isAuthenticated: false },
      { theme: 'dark', cycleTheme }
    );

    const themeButton = screen.getByRole('button', { name: /Switch Theme/i });
    fireEvent.click(themeButton);
    expect(cycleTheme).toHaveBeenCalledTimes(1);

    const signInButton = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.click(signInButton);
    expect(handleOpenAuth).toHaveBeenCalledWith('login');
  });

  it('falls back to onOpenVoices when onNavigate is not supplied', () => {
    const handleOpenVoices = vi.fn();
    renderTopHeader({
      view: 'reader',
      onNavigate: undefined,
      onOpenVoices: handleOpenVoices,
    });

    const voicesButton = screen.getByRole('button', { name: '+ VOICES' });
    fireEvent.click(voicesButton);
    expect(handleOpenVoices).toHaveBeenCalledTimes(1);
  });

  it('falls back to onOpenArchive when onNavigate is not supplied', () => {
    const handleOpenArchive = vi.fn();
    renderTopHeader({
      view: 'catalog',
      onNavigate: undefined,
      onOpenArchive: handleOpenArchive,
    });

    const archiveButton = screen.getByRole('button', { name: '+ ARCHIVE' });
    fireEvent.click(archiveButton);
    expect(handleOpenArchive).toHaveBeenCalledTimes(1);
  });

  it('renders + UPLOAD STUDIO nav button and triggers navigation to upload view', () => {
    const handleNavigate = vi.fn();
    renderTopHeader({
      view: 'catalog',
      onNavigate: handleNavigate,
    });

    const uploadStudioButton = screen.getByRole('button', { name: '+ UPLOAD STUDIO' });
    expect(uploadStudioButton).toBeInTheDocument();
    fireEvent.click(uploadStudioButton);
    expect(handleNavigate).toHaveBeenCalledWith('upload');
  });

  it('marks + UPLOAD STUDIO active with aria-current="page" when view is upload', () => {
    renderTopHeader({
      view: 'upload',
    });

    const uploadStudioButton = screen.getByRole('button', { name: '+ UPLOAD STUDIO' });
    expect(uploadStudioButton).toHaveAttribute('aria-current', 'page');
    expect(uploadStudioButton.className).toContain('bg-[var(--accent)]');
  });
});
