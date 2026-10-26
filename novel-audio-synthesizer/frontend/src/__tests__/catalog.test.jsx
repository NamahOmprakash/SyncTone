import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api, ApiError } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import NovelCatalog from '../components/NovelCatalog';
import NovelDetails from '../components/NovelDetails';

const MOCK_NOVELS = [
  {
    id: 'n-1',
    title: "Harry Potter and the Philosopher's Stone",
    synopsis: 'A young wizard discovers his magical heritage.',
    channel: 'verified',
    status: 'published',
    global_tone: 'British Fantasy',
    author_username: 'jk_rowling',
    narrator_name: 'British Narrator',
    narrator_voice_id: 'en-GB-RyanNeural',
    chapter_count: 2,
  },
  {
    id: 'n-2',
    title: 'The Adventures of Sherlock Holmes',
    synopsis: 'Classic detective mysteries in Victorian London.',
    channel: 'community',
    status: 'draft',
    global_tone: 'Victorian Mystery',
    author_username: 'arthur_conan_doyle',
    narrator_name: 'Dr. John Watson',
    narrator_voice_id: 'en-GB-ArthurNeural',
    chapter_count: 1,
  },
];

const MOCK_DETAIL = {
  novel: {
    id: 'n-1',
    title: "Harry Potter and the Philosopher's Stone",
    synopsis: 'A young wizard discovers his magical heritage.',
    channel: 'verified',
    status: 'published',
    global_tone: 'British Fantasy',
    author_username: 'jk_rowling',
    narrator_name: 'British Narrator',
    narrator_voice_id: 'en-GB-RyanNeural',
  },
  characters: [
    {
      id: 'c-1',
      canonical_name: 'Harry Potter',
      gender: 'male',
      age_band: 'young',
      sample_quote: 'I will be in my bedroom, making no noise and pretending I do not exist.',
      voice_id: 'en-GB-ThomasNeural',
      is_narrator: false,
    },
    {
      id: 'c-2',
      canonical_name: 'Narrator',
      gender: 'male',
      age_band: 'adult',
      voice_id: 'en-GB-RyanNeural',
      is_narrator: true,
    },
  ],
  chapters: [
    {
      id: 'ch-1',
      novel_id: 'n-1',
      chapter_number: 1,
      title: 'The Boy Who Lived',
      status: 'completed',
      total_duration_ms: 185000,
    },
  ],
};

describe('Milestone 2 — Novel Catalog & Details', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('NovelCatalog', () => {
    it('fetches novels with channel filter and renders cards with narrator info', async () => {
      const listSpy = vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: MOCK_NOVELS });
      const handleSelect = vi.fn();

      render(
        <AuthProvider>
          <NovelCatalog onSelectNovel={handleSelect} />
        </AuthProvider>
      );

      // Verified channel requested initially
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledWith('verified');
        expect(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]).toBeInTheDocument();
        expect(screen.getAllByText(/By jk_rowling/i)[0]).toBeInTheDocument();
      });

      // Switch to Community channel tab
      fireEvent.click(screen.getByText(/Community Novels/i));
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledWith('community');
      });

      // Clicking a card invokes onSelectNovel
      fireEvent.click(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]);
      expect(handleSelect).toHaveBeenCalledWith('n-1');
    });

    it('filters novels dynamically using the search query', async () => {
      vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: MOCK_NOVELS });

      render(
        <AuthProvider>
          <NovelCatalog onSelectNovel={vi.fn()} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]).toBeInTheDocument();
        expect(screen.getAllByText('The Adventures of Sherlock Holmes')[0]).toBeInTheDocument();
      });

      // Search for "sherlock"
      const searchInput = screen.getByPlaceholderText(/Search by title, author, or narrator/i);
      fireEvent.change(searchInput, { target: { value: 'Sherlock' } });

      expect(screen.getByText('The Adventures of Sherlock Holmes')).toBeInTheDocument();
      expect(screen.queryByText("Harry Potter and the Philosopher's Stone")).not.toBeInTheDocument();
    });

    it('displays error message and allows retry on failure', async () => {
      const listSpy = vi.spyOn(api.novels, 'list')
        .mockRejectedValueOnce(new ApiError('Database connection error', 500))
        .mockResolvedValueOnce({ novels: MOCK_NOVELS });

      render(
        <AuthProvider>
          <NovelCatalog onSelectNovel={vi.fn()} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Database connection error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]).toBeInTheDocument();
      });
    });
  });

  describe('NovelDetails', () => {
    it('renders novel header, chapter directory, and character cast portfolio', async () => {
      vi.spyOn(api.novels, 'get').mockResolvedValue(MOCK_DETAIL);
      const handleBack = vi.fn();
      const handleSelectChapter = vi.fn();

      render(
        <AuthProvider>
          <NovelDetails
            novelId="n-1"
            onBack={handleBack}
            onSelectChapter={handleSelectChapter}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getAllByText("Harry Potter and the Philosopher's Stone")[0]).toBeInTheDocument();
        expect(screen.getByText('The Boy Who Lived')).toBeInTheDocument();
        expect(screen.getByText(/3:05/)).toBeInTheDocument(); // 185000ms = 3m 5s
      });

      // Select chapter invokes callback
      fireEvent.click(screen.getByText(/Read & Listen/i));
      expect(handleSelectChapter).toHaveBeenCalledWith(MOCK_DETAIL.novel, MOCK_DETAIL.chapters[0]);

      // Switch to Character Cast tab
      fireEvent.click(screen.getByText(/Character Cast/i));
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.getByText('en-GB-ThomasNeural')).toBeInTheDocument();

      // Back button
      fireEvent.click(screen.getByText(/Back to Library/i));
      expect(handleBack).toHaveBeenCalled();
    });
  });
});
