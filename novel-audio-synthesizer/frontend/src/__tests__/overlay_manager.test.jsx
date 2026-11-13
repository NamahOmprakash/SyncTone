import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import TopHeader from '../components/TopHeader';
import CharacterRoster from '../components/CharacterRoster';

function TestOverlayHarness() {
  const [view, setView] = React.useState('reader');
  const [showRoster, setShowRoster] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showAuth, setShowAuth] = React.useState(false);

  return (
    <div>
      <TopHeader
        view={view}
        showRoster={showRoster}
        onToggleRoster={() => {
          setShowSettings(false);
          setShowAuth(false);
          setShowRoster((prev) => !prev);
        }}
        onOpenSettings={() => {
          setShowRoster(false);
          setShowAuth(false);
          setShowSettings(true);
        }}
        onOpenAuth={() => {
          setShowRoster(false);
          setShowSettings(false);
          setShowAuth(true);
        }}
        onNavigate={(newView) => {
          setView(newView);
          setShowRoster(false);
        }}
      />
      {showRoster && view === 'reader' && (
        <CharacterRoster
          chapterId="ch-1"
          segments={[
            {
              order: 1,
              type: 'dialogue',
              speaker_name: 'Sherlock Holmes',
              character_id: 'holmes',
              text: 'Elementary, my dear Watson.',
            },
          ]}
          onClose={() => setShowRoster(false)}
        />
      )}
      {showSettings && <div data-testid="settings-overlay">Settings Modal</div>}
      {showAuth && <div data-testid="auth-overlay">Auth Modal</div>}
    </div>
  );
}

describe('Overlay Manager Mutual Exclusion & Focus Management', () => {
  it('toggles roster open and closed with the CAST button', () => {
    render(
      <AuthContext.Provider value={{ isAuthenticated: false, role: 'reader' }}>
        <ThemeContext.Provider value={{ theme: 'dark', cycleTheme: vi.fn() }}>
          <TestOverlayHarness />
        </ThemeContext.Provider>
      </AuthContext.Provider>
    );

    const castBtn = screen.getByRole('button', { name: /Toggle Cast/i });
    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();

    // Open roster
    fireEvent.click(castBtn);
    expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();

    // Toggle same button closes roster
    fireEvent.click(castBtn);
    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();
  });

  it('opening Settings closes Character Roster immediately', () => {
    render(
      <AuthContext.Provider value={{ isAuthenticated: false, role: 'reader' }}>
        <ThemeContext.Provider value={{ theme: 'dark', cycleTheme: vi.fn() }}>
          <TestOverlayHarness />
        </ThemeContext.Provider>
      </AuthContext.Provider>
    );

    const castBtn = screen.getByRole('button', { name: /Toggle Cast/i });
    fireEvent.click(castBtn);
    expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();

    const settingsBtn = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(settingsBtn);

    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-overlay')).toBeInTheDocument();
  });

  it('opening Auth modal closes Character Roster immediately', () => {
    render(
      <AuthContext.Provider value={{ isAuthenticated: false, role: 'reader' }}>
        <ThemeContext.Provider value={{ theme: 'dark', cycleTheme: vi.fn() }}>
          <TestOverlayHarness />
        </ThemeContext.Provider>
      </AuthContext.Provider>
    );

    const castBtn = screen.getByRole('button', { name: /Toggle Cast/i });
    fireEvent.click(castBtn);
    expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();

    const signInBtn = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.click(signInBtn);

    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-overlay')).toBeInTheDocument();
  });

  it('navigating to /voices closes Character Roster', () => {
    render(
      <AuthContext.Provider value={{ isAuthenticated: false, role: 'reader' }}>
        <ThemeContext.Provider value={{ theme: 'dark', cycleTheme: vi.fn() }}>
          <TestOverlayHarness />
        </ThemeContext.Provider>
      </AuthContext.Provider>
    );

    const castBtn = screen.getByRole('button', { name: /Toggle Cast/i });
    fireEvent.click(castBtn);
    expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();

    const voicesNavBtn = screen.getByRole('button', { name: '+ VOICES' });
    fireEvent.click(voicesNavBtn);

    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();
  });

  it('dismisses Character Roster when backdrop scrim is clicked', () => {
    render(
      <AuthContext.Provider value={{ isAuthenticated: false, role: 'reader' }}>
        <ThemeContext.Provider value={{ theme: 'dark', cycleTheme: vi.fn() }}>
          <TestOverlayHarness />
        </ThemeContext.Provider>
      </AuthContext.Provider>
    );

    const castBtn = screen.getByRole('button', { name: /Toggle Cast/i });
    fireEvent.click(castBtn);
    expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();

    const scrim = screen.getByTestId('roster-scrim');
    fireEvent.click(scrim);

    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();
  });

  it('dismisses Character Roster when Escape is pressed', () => {
    render(
      <AuthContext.Provider value={{ isAuthenticated: false, role: 'reader' }}>
        <ThemeContext.Provider value={{ theme: 'dark', cycleTheme: vi.fn() }}>
          <TestOverlayHarness />
        </ThemeContext.Provider>
      </AuthContext.Provider>
    );

    const castBtn = screen.getByRole('button', { name: /Toggle Cast/i });
    fireEvent.click(castBtn);
    expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /Character Roster/i })).not.toBeInTheDocument();
  });
});

