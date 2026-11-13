import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NovelDetails from '../components/NovelDetails';
import NovelCatalog from '../components/NovelCatalog';
import { AuthProvider } from '../context/AuthContext';
import { api, ApiError } from '../services/api';
import * as authHooks from '../hooks/useAuth';

describe('Permanent Deletion Protection & Absence of Delete Novel UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('NovelDetails Page', () => {
    const mockNovelData = {
      novel: {
        id: '11111111-2222-3333-4444-555555555555',
        title: 'Adventures in Wonderland',
        synopsis: 'A classic tale of curiosity and tea parties.',
        channel: 'verified',
        author_username: 'Lewis Carroll',
      },
      chapters: [
        { id: 'ch-1', chapter_number: 1, title: 'Down the Rabbit Hole' },
      ],
      characters: [
        { id: 'char-1', canonical_name: 'Alice', voice_id: 'en-GB-SoniaNeural' },
      ],
    };

    it('asserts delete novel button and delete confirmation modal are completely absent for anonymous readers', async () => {
      vi.spyOn(api.novels, 'get').mockResolvedValue(mockNovelData);

      render(
        <AuthProvider>
          <NovelDetails
            novelId={mockNovelData.novel.id}
            onBack={vi.fn()}
            onSelectChapter={vi.fn()}
            onOpenUploadChapter={vi.fn()}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Adventures in Wonderland')).toBeInTheDocument();
      });

      // Assert delete button is completely absent from DOM
      expect(screen.queryByTestId('delete-novel-btn')).not.toBeInTheDocument();
      expect(screen.queryByText(/delete novel/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/delete novel/i)).not.toBeInTheDocument();

      // Assert delete confirmation modal is completely absent from DOM
      expect(screen.queryByTestId('confirm-delete-novel-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-delete-novel-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('confirm-delete-novel-btn')).not.toBeInTheDocument();

      // Assert primary actions remain intact
      expect(screen.getByText('LISTEN')).toBeInTheDocument();
      expect(screen.getByText('OPEN READER')).toBeInTheDocument();
      expect(screen.getByText('VOICE STUDIO')).toBeInTheDocument();
      expect(screen.getByText('+ ADD TO LIBRARY')).toBeInTheDocument();
    });

    it('asserts delete novel button is absent even for authenticated writers and administrators', async () => {
      vi.spyOn(api.novels, 'get').mockResolvedValue(mockNovelData);
      vi.spyOn(authHooks, 'useAuth').mockReturnValue({
        user: { id: 'admin-id', username: 'admin_user', role: 'admin' },
        role: 'admin',
        isAuthenticated: true,
        isWriterOrAdmin: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <NovelDetails
          novelId={mockNovelData.novel.id}
          onBack={vi.fn()}
          onSelectChapter={vi.fn()}
          onOpenUploadChapter={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Adventures in Wonderland')).toBeInTheDocument();
      });

      // Zero delete novel buttons or modals allowed for admins/writers
      expect(screen.queryByTestId('delete-novel-btn')).not.toBeInTheDocument();
      expect(screen.queryByText(/delete novel/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/delete novel/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('confirm-delete-novel-modal')).not.toBeInTheDocument();

      // Admin has access to upload chapter action
      expect(screen.getByText('UPLOAD CHAPTER')).toBeInTheDocument();
    });
  });

  describe('NovelCatalog Page', () => {
    const mockNovels = [
      {
        id: 'aaaa1111-bbbb-2222-cccc-333344445555',
        title: 'Mysterious Manor',
        synopsis: 'A dark mystery inside an old Victorian mansion.',
        channel: 'verified',
        author_username: 'Arthur Conan',
        narrator_name: 'Dr. John Watson',
        chapter_count: 5,
      },
    ];

    it('asserts delete button and delete modal are completely absent from catalog', async () => {
      vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: mockNovels });

      render(
        <AuthProvider>
          <NovelCatalog
            onSelectNovel={vi.fn()}
            onSelectChapter={vi.fn()}
            onOpenAddNovel={vi.fn()}
            onOpenSettings={vi.fn()}
            onOpenAuth={vi.fn()}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getAllByText('Mysterious Manor').length).toBeGreaterThan(0);
      });

      // Assert delete button is completely absent from card and catalog
      expect(screen.queryByTestId(`delete-novel-${mockNovels[0].id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-novel-btn')).not.toBeInTheDocument();
      expect(screen.queryByText(/delete novel/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/delete volume/i)).not.toBeInTheDocument();

      // Assert delete confirmation modal is completely absent
      expect(screen.queryByTestId('confirm-delete-novel-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-delete-novel-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('confirm-delete-novel-btn')).not.toBeInTheDocument();

      // Novel card preserves Play and Read buttons
      expect(screen.getAllByText('Play').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Read').length).toBeGreaterThan(0);
    });

    it('asserts delete buttons remain absent in catalog for admin/writer roles', async () => {
      vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: mockNovels });
      vi.spyOn(authHooks, 'useAuth').mockReturnValue({
        user: { id: 'admin-id', username: 'admin_user', role: 'admin' },
        role: 'admin',
        isAuthenticated: true,
        isWriterOrAdmin: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <NovelCatalog
          onSelectNovel={vi.fn()}
          onSelectChapter={vi.fn()}
          onOpenAddNovel={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText('Mysterious Manor').length).toBeGreaterThan(0);
      });

      expect(screen.queryByTestId('delete-novel-btn')).not.toBeInTheDocument();
      expect(screen.queryByText(/delete novel/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/delete volume/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('confirm-delete-novel-modal')).not.toBeInTheDocument();
    });
  });

  describe('Permanent Deletion Disabled API Invariant', () => {
    it('rejects api.novels.delete with 403 ApiError to prevent permanent data destruction', async () => {
      let thrownError = null;
      try {
        await api.novels.delete('test-novel-uuid');
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(ApiError);
      expect(thrownError.status).toBe(403);
      expect(thrownError.data).toEqual({ code: 'PERMANENT_DELETION_DISABLED' });
      expect(thrownError.message).toMatch(/Permanent deletion of novels is prohibited/i);
    });

    it('rejects raw api.delete endpoints targeting novels with 403 ApiError', async () => {
      let thrown1 = null;
      try {
        await api.delete('/novels/some-novel-id');
      } catch (err) {
        thrown1 = err;
      }
      expect(thrown1).toBeInstanceOf(ApiError);
      expect(thrown1.status).toBe(403);
      expect(thrown1.data?.code).toBe('PERMANENT_DELETION_DISABLED');

      let thrown2 = null;
      try {
        await api.delete('/api/novels');
      } catch (err) {
        thrown2 = err;
      }
      expect(thrown2).toBeInstanceOf(ApiError);
      expect(thrown2.status).toBe(403);
      expect(thrown2.data?.code).toBe('PERMANENT_DELETION_DISABLED');
    });
  });
});
