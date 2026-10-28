import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

const MOCK_NOVELS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    title: "Harry Potter and the Philosopher's Stone",
    synopsis: 'A young wizard discovers his magical heritage.',
    channel: 'verified',
    status: 'published',
    author_username: 'jk_rowling',
    narrator_name: 'British Narrator',
    chapter_count: 1,
  },
];

const MOCK_DETAIL = {
  novel: MOCK_NOVELS[0],
  characters: [
    {
      id: 'c-1',
      canonical_name: 'Harry Potter',
      gender: 'male',
      age_band: 'young',
      sample_quote: 'I think I can tell the wrong sort for myself.',
      voice_id: 'en-GB-ThomasNeural',
      is_narrator: false,
    },
  ],
  chapters: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      novel_id: '11111111-1111-1111-1111-111111111111',
      chapter_number: 1,
      title: 'The Boy Who Lived',
      status: 'completed',
      total_duration_ms: 120000,
    },
  ],
};

const MOCK_CHAPTER = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'The Boy Who Lived',
  segments: [
    {
      order: 1,
      segment_id: 1,
      type: 'narration',
      text: 'Mr. and Mrs. Dursley were proud to say they were normal.',
      character_id: 'narrator',
      speaker_name: 'Narrator',
      start_ms: 0,
      end_ms: 3000,
    },
    {
      order: 2,
      segment_id: 2,
      type: 'dialogue',
      text: 'Little tyke!',
      character_id: 'c-1',
      speaker_name: 'Mr. Dursley',
      start_ms: 3000,
      end_ms: 6000,
    },
  ],
  manifest: {
    audio_url: '/api/stream/22222222-2222-2222-2222-222222222222',
    total_duration_ms: 6000,
    timeline: [
      { order: 1, segment_id: 1, start_ms: 0, end_ms: 3000 },
      { order: 2, segment_id: 2, start_ms: 3000, end_ms: 6000 },
    ],
  },
};

describe('Milestone 7 — Full-Stack Frontend Integration (Catalog → Details → Reader)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api.auth, 'me').mockResolvedValue({ user: null });
    vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: MOCK_NOVELS });
    vi.spyOn(api.novels, 'get').mockResolvedValue(MOCK_DETAIL);
    vi.spyOn(api.chapters, 'get').mockResolvedValue(MOCK_CHAPTER);
    vi.spyOn(api.voices, 'list').mockResolvedValue({ available_voices: {} });
    vi.spyOn(api.status, 'models').mockResolvedValue({ primary: 'Edge Neural', fallback: 'Kokoro' });
    vi.spyOn(api.playback, 'getProgress').mockResolvedValue({ progress: null });
  });

  it('navigates end-to-end from catalog to details to reader and displays synchronized text', async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    // 1. In Catalog
    await waitFor(() => {
      expect(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]).toBeInTheDocument();
      expect(screen.getByText('Novel Library')).toBeInTheDocument();
    });

    // 2. Click novel to view details
    fireEvent.click(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]);

    await waitFor(() => {
      expect(screen.getByText('The Boy Who Lived')).toBeInTheDocument();
      expect(screen.getByText('Start Listening (Ch. 1)')).toBeInTheDocument();
    });

    // 3. Click Start Listening to open Reader
    fireEvent.click(screen.getByText('Start Listening (Ch. 1)'));

    await waitFor(() => {
      expect(screen.getByText(/Mr. and Mrs. Dursley were proud/i)).toBeInTheDocument();
      expect(screen.getByText('"Little tyke!"')).toBeInTheDocument();
    });

    // 4. Open and close Cast Roster drawer
    fireEvent.click(screen.getByText('Cast Roster'));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Character Roster/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Close roster'));

    // 5. Open Auth Modal
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    });
  });
});
