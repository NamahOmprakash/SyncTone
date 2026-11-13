import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api, ApiError } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import CharacterRoster from '../components/CharacterRoster';

const MOCK_SEGMENTS = [
  {
    order: 0,
    segment_id: 0,
    type: 'narration',
    text: 'The Hogwarts Express rattled north through the rain.',
    character_id: 'narrator',
    speaker_name: 'Narrator',
    assigned_voice_id: 'en-GB-RyanNeural',
  },
  {
    order: 1,
    segment_id: 1,
    type: 'dialogue',
    text: 'Can I have some chocolate frogs?',
    character_id: 'harry_potter',
    speaker_name: 'Harry Potter',
    assigned_voice_id: 'en-GB-ThomasNeural',
  },
  {
    order: 2,
    segment_id: 2,
    type: 'dialogue',
    text: 'Every flavour beans? You want to be careful with those.',
    character_id: 'ron_weasley',
    speaker_name: 'Ron Weasley',
    assigned_voice_id: 'en-GB-AlfieNeural',
  },
  {
    order: 3,
    segment_id: 3,
    type: 'dialogue',
    text: 'Take whatever you like.',
    character_id: 'harry_potter',
    speaker_name: 'Harry Potter',
    assigned_voice_id: 'en-GB-ThomasNeural',
  },
];

const MOCK_VOICES = {
  available_voices: {
    narrator: 'en-GB-RyanNeural',
    harry: 'en-GB-ThomasNeural',
    ron: 'en-GB-AlfieNeural',
    hermione: 'en-GB-SoniaNeural',
  },
};

function renderRosterWithAuth(authValue, props = {}) {
  const defaultAuth = {
    user: null,
    role: 'reader',
    isAuthenticated: false,
    isWriterOrAdmin: false,
    ...authValue,
  };

  return render(
    <AuthContext.Provider value={defaultAuth}>
      <CharacterRoster
        chapterId="ch-100"
        segments={MOCK_SEGMENTS}
        onClose={vi.fn()}
        {...props}
      />
    </AuthContext.Provider>
  );
}

describe('Milestone 4 — Character Roster & Voice Overrides', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.voices, 'list').mockResolvedValue(MOCK_VOICES);
  });

  it('aggregates characters with narrator pinned, dialogue counts, and sample quotes', async () => {
    renderRosterWithAuth({ isWriterOrAdmin: false });

    await waitFor(() => {
      expect(screen.getByText('Narrator')).toBeInTheDocument();
      expect(screen.getByText('NARRATOR')).toBeInTheDocument();
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.getByText('Ron Weasley')).toBeInTheDocument();
      expect(screen.getByText('2 lines')).toBeInTheDocument();
      expect(screen.getAllByText('1 line').length).toBe(2);
      expect(screen.getByText('"Can I have some chocolate frogs?"')).toBeInTheDocument();
    });
  });

  it('unlocks voice selection dropdowns and + ADD CHARACTER for reader role', async () => {
    renderRosterWithAuth({ isWriterOrAdmin: false, role: 'reader' });

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(3);
      expect(selects[0]).toHaveAttribute('aria-label', 'Voice for Narrator');
      expect(screen.queryByText(/Sign in as writer\/admin to override voices/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ ADD CHARACTER/i })).toBeInTheDocument();
    });
  });

  it('enables canonical neural voice selection dropdown for writer/admin and posts assignment', async () => {
    const assignSpy = vi.spyOn(api.voices, 'assign').mockResolvedValue({ message: 'Success' });
    const handleVoiceChange = vi.fn();

    renderRosterWithAuth(
      { isWriterOrAdmin: true, role: 'writer', isAuthenticated: true },
      { onVoiceChange: handleVoiceChange }
    );

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(3);
      expect(screen.getAllByText(/British Narrator \(Ryan\)/i).length).toBe(3);
      expect(screen.getAllByText(/Irish Storyteller \(Connor\)/i).length).toBe(3);
    });

    const harrySelect = screen.getByLabelText(/Voice for Harry Potter/i);
    fireEvent.change(harrySelect, { target: { value: 'en-IE-ConnorNeural' } });

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith({
        character_id: 'harry_potter',
        new_voice_id: 'en-IE-ConnorNeural',
        chapter_id: 'ch-100',
      });
      expect(handleVoiceChange).toHaveBeenCalledWith('harry_potter', 'en-IE-ConnorNeural');
      expect(screen.getByText(/Updated voice for harry_potter/i)).toBeInTheDocument();
    });
  });

  it('handles assignment error safely and rolls back selection', async () => {
    vi.spyOn(api.voices, 'assign').mockRejectedValue(new ApiError('Permission Denied', 403));

    renderRosterWithAuth({ isWriterOrAdmin: true, role: 'writer' });

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBe(3);
      expect(screen.getAllByText(/Irish Storyteller \(Connor\)/i).length).toBe(3);
    });

    const harrySelect = screen.getByLabelText(/Voice for Harry Potter/i);
    fireEvent.change(harrySelect, { target: { value: 'en-IE-ConnorNeural' } });

    await waitFor(() => {
      expect(screen.getByText(/Permission Denied/i)).toBeInTheDocument();
      // Reverted back to original voice
      expect(harrySelect.value).toBe('en-GB-ThomasNeural');
    });
  });

  it('dismisses when backdrop scrim is clicked', async () => {
    const handleClose = vi.fn();
    renderRosterWithAuth({ isWriterOrAdmin: false }, { onClose: handleClose });
    await waitFor(() => {
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
    });
    const scrim = screen.getByTestId('roster-scrim');
    fireEvent.click(scrim);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses when Escape key is pressed', async () => {
    const handleClose = vi.fn();
    renderRosterWithAuth({ isWriterOrAdmin: false }, { onClose: handleClose });
    await waitFor(() => {
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('has topbar clearance and bottom dock spacing for reader viewport', async () => {
    renderRosterWithAuth({ isWriterOrAdmin: false });
    await waitFor(() => {
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
    });
    const drawer = screen.getByRole('dialog', { name: /Character Roster/i });
    expect(drawer).toHaveStyle({
      top: 'var(--topbar-h, 3.5rem)',
      bottom: 'var(--dock-safe-bottom, 4.5rem)',
    });
    const scrim = screen.getByTestId('roster-scrim');
    expect(scrim).toHaveStyle({
      top: 'var(--topbar-h, 3.5rem)',
    });
  });
});
