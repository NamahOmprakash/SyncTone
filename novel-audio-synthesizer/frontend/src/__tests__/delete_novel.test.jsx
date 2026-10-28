import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NovelDetails from '../components/NovelDetails';
import NovelCatalog from '../components/NovelCatalog';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../services/api';

describe('Delete Novel Feature (Local Development)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('NovelDetails Delete Flow', () => {
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

    it('renders the delete novel button and opens confirmation modal', async () => {
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

      const deleteBtn = screen.getByTestId('delete-novel-btn');
      expect(deleteBtn).toBeInTheDocument();
      expect(screen.getByText(/Delete Novel \(Dev\)/i)).toBeInTheDocument();

      // Click delete button to open confirmation modal
      fireEvent.click(deleteBtn);

      expect(screen.getByTestId('confirm-delete-novel-modal')).toBeInTheDocument();
      expect(screen.getByText(/Permanently remove this novel/i)).toBeInTheDocument();

      // Test cancel button
      const cancelBtn = screen.getByTestId('cancel-delete-novel-btn');
      fireEvent.click(cancelBtn);

      expect(screen.queryByTestId('confirm-delete-novel-modal')).not.toBeInTheDocument();
    });

    it('calls api.novels.delete and triggers onNovelDeleted on confirm', async () => {
      vi.spyOn(api.novels, 'get').mockResolvedValue(mockNovelData);
      const deleteSpy = vi.spyOn(api.novels, 'delete').mockResolvedValue({
        message: 'Novel deleted successfully',
        deleted_id: mockNovelData.novel.id,
      });
      const onNovelDeleted = vi.fn();

      render(
        <AuthProvider>
          <NovelDetails
            novelId={mockNovelData.novel.id}
            onBack={vi.fn()}
            onSelectChapter={vi.fn()}
            onOpenUploadChapter={vi.fn()}
            onNovelDeleted={onNovelDeleted}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Adventures in Wonderland')).toBeInTheDocument();
      });

      // Open confirmation modal
      fireEvent.click(screen.getByTestId('delete-novel-btn'));

      // Click confirm delete
      const confirmBtn = screen.getByTestId('confirm-delete-novel-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith(mockNovelData.novel.id);
        expect(onNovelDeleted).toHaveBeenCalledWith(mockNovelData.novel.id);
      });
    });
  });

  describe('NovelCatalog Delete Flow', () => {
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

    it('renders delete icon button on novel card and deletes upon confirmation', async () => {
      const listSpy = vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: mockNovels });
      const deleteSpy = vi.spyOn(api.novels, 'delete').mockResolvedValue({
        message: 'Novel deleted successfully',
        deleted_id: mockNovels[0].id,
      });
      const onNovelDeleted = vi.fn();

      render(
        <AuthProvider>
          <NovelCatalog
            onSelectNovel={vi.fn()}
            onSelectChapter={vi.fn()}
            onOpenAddNovel={vi.fn()}
            onOpenSettings={vi.fn()}
            onOpenAuth={vi.fn()}
            onNovelDeleted={onNovelDeleted}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getAllByText('Mysterious Manor').length).toBeGreaterThan(0);
      });

      const cardDeleteBtn = screen.getByTestId(`delete-novel-${mockNovels[0].id}`);
      expect(cardDeleteBtn).toBeInTheDocument();

      // Open confirm modal from card
      fireEvent.click(cardDeleteBtn);

      expect(screen.getByTestId('confirm-delete-novel-modal')).toBeInTheDocument();

      // Confirm deletion
      const confirmBtn = screen.getByTestId('confirm-delete-novel-btn');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith(mockNovels[0].id);
        expect(onNovelDeleted).toHaveBeenCalledWith(mockNovels[0].id);
      });
    });
  });
});
