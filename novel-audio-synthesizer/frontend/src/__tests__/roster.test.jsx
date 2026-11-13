import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api, ApiError } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import CharacterRoster from '../components/CharacterRoster';

const MOCK_SEGMENTS = [
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
    'British Young Hero': 'en-GB-ThomasNeural',
    'British Sidekick': 'en-GB-AlfieNeural',
    'British Wise Elder': 'en-GB-ArthurNeural',
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

  it('aggregates characters with dialogue counts and sample quotes', async () => {
    renderRosterWithAuth({ isWriterOrAdmin: false });

    await waitFor(() => {
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.getByText('Ron Weasley')).toBeInTheDocument();
      expect(screen.getByText('2 lines')).toBeInTheDocument();
      expect(screen.getByText('1 line')).toBeInTheDocument();
      expect(screen.getByText('"Can I have some chocolate frogs?"')).toBeInTheDocument();
    });
  });

  it('shows read-only view for reader role and restricts dropdown', async () => {
    renderRosterWithAuth({ isWriterOrAdmin: false });

    await waitFor(() => {
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('en-GB-ThomasNeural')).toBeInTheDocument();
      expect(screen.getAllByText(/Sign in as writer\/admin to override voices/i).length).toBeGreaterThan(0);
    });
  });

  it('enables voice selection dropdown for writer/admin and posts assignment', async () => {
    const assignSpy = vi.spyOn(api.voices, 'assign').mockResolvedValue({ message: 'Success' });
    const handleVoiceChange = vi.fn();

    renderRosterWithAuth(
      { isWriterOrAdmin: true, role: 'writer', isAuthenticated: true },
      { onVoiceChange: handleVoiceChange }
    );

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(2);
    });

    const harrySelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(harrySelect, { target: { value: 'en-GB-ArthurNeural' } });

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith({
        character_id: 'harry_potter',
        new_voice_id: 'en-GB-ArthurNeural',
        chapter_id: 'ch-100',
      });
      expect(handleVoiceChange).toHaveBeenCalledWith('harry_potter', 'en-GB-ArthurNeural');
      expect(screen.getByText(/Updated voice for harry_potter/i)).toBeInTheDocument();
    });
  });

  it('handles assignment error safely and rolls back selection', async () => {
    vi.spyOn(api.voices, 'assign').mockRejectedValue(new ApiError('Permission Denied', 403));

    renderRosterWithAuth({ isWriterOrAdmin: true, role: 'writer' });

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBe(2);
    });

    const harrySelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(harrySelect, { target: { value: 'en-GB-ArthurNeural' } });

    await waitFor(() => {
      expect(screen.getByText(/Permission Denied/i)).toBeInTheDocument();
      // Reverted back to original voice
      expect(harrySelect.value).toBe('en-GB-ThomasNeural');
    });
  });
});
