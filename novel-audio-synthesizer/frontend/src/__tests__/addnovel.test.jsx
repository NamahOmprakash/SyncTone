import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api, ApiError } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import AddNovelModal from '../components/AddNovelModal';

describe('AddNovelModal with Drag-and-Drop Dropzone & Read Now', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal when open and shows dropzone for novel files', () => {
    render(
      <AuthProvider>
        <AddNovelModal isOpen={true} onClose={vi.fn()} onNovelCreated={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.getByText('Add New Novel')).toBeInTheDocument();
    expect(screen.getByLabelText(/Novel file dropzone/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop your novel manuscript here/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse Files/i)).toBeInTheDocument();
  });

  it('provides Quick Demo Author Login button for unauthenticated users', async () => {
    const loginSpy = vi.spyOn(api.auth, 'login').mockResolvedValue({
      user: { id: 'u-writer', username: 'demo_author', role: 'writer' },
    });

    render(
      <AuthProvider>
        <AddNovelModal isOpen={true} onClose={vi.fn()} onNovelCreated={vi.fn()} />
      </AuthProvider>
    );

    const demoLoginBtn = screen.getByText('Quick Demo Author Login');
    expect(demoLoginBtn).toBeInTheDocument();

    fireEvent.click(demoLoginBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith(
        'demo_author@synctone.internal',
        'DemoPass2026!'
      );
    });
  });

  it('handles file selection, parses chapters, and populates form fields', async () => {
    vi.spyOn(api.novels, 'parseFile').mockResolvedValue({
      title: 'The Sign of the Four',
      synopsis: 'Sherlock Holmes investigates the disappearance of Mary Morstan father.',
      chapters: [
        {
          chapter_number: 1,
          title: 'Chapter 1: The Science of Deduction',
          raw_text: 'Sherlock Holmes took his bottle from the corner of the mantelpiece...',
        },
        {
          chapter_number: 2,
          title: 'Chapter 2: The Statement of the Case',
          raw_text: 'Miss Morstan entered the room with a firm step and an outward composure...',
        },
      ],
    });

    render(
      <AuthProvider>
        <AddNovelModal isOpen={true} onClose={vi.fn()} onNovelCreated={vi.fn()} />
      </AuthProvider>
    );

    const file = new File(
      ['dummy novel manuscript content'],
      'the_sign_of_the_four.epub',
      { type: 'application/epub+zip' }
    );

    const fileInput = screen.getByTestId('novel-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('EPUB')).toBeInTheDocument();
      expect(screen.getByText('the_sign_of_the_four.epub')).toBeInTheDocument();
      expect(screen.getByText(/2 chapters ready to read/i)).toBeInTheDocument();
    });

    // Check that title was automatically filled
    const titleInput = screen.getByDisplayValue('The Sign of the Four');
    expect(titleInput).toBeInTheDocument();

    // Check preview button
    const previewBtn = screen.getByText('Preview Text');
    fireEvent.click(previewBtn);

    expect(screen.getByText('Chapter 1: The Science of Deduction')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2: The Statement of the Case')).toBeInTheDocument();
    expect(screen.getByText('Create & Read Now')).toBeInTheDocument();
  });

  it('submits form with parsed chapters and invokes onSelectChapter for Create & Read Now', async () => {
    vi.spyOn(api.novels, 'parseFile').mockResolvedValue({
      title: 'A Study in Scarlet',
      synopsis: 'The first appearance of Sherlock Holmes and Dr. Watson.',
      chapters: [
        {
          chapter_number: 1,
          title: 'Chapter 1: Mr. Sherlock Holmes',
          raw_text: 'In the year 1878 I took my degree of Doctor of Medicine of the University of London...',
        },
      ],
    });

    const createSpy = vi.spyOn(api.novels, 'create').mockResolvedValue({
      novel: {
        id: 'n-new',
        title: 'A Study in Scarlet',
        synopsis: 'The first appearance of Sherlock Holmes and Dr. Watson.',
        channel: 'verified',
      },
      chapters: [
        {
          id: 'ch-new-1',
          novel_id: 'n-new',
          chapter_number: 1,
          title: 'Chapter 1: Mr. Sherlock Holmes',
        },
      ],
    });

    // Authenticate user as writer
    vi.spyOn(api.auth, 'me').mockResolvedValue({
      user: { id: 'u-1', username: 'writer_arthur', role: 'writer' },
    });

    const handleSelectChapter = vi.fn();
    const handleClose = vi.fn();

    render(
      <AuthProvider>
        <AddNovelModal
          isOpen={true}
          onClose={handleClose}
          onNovelCreated={vi.fn()}
          onSelectChapter={handleSelectChapter}
        />
      </AuthProvider>
    );

    // Wait for auth to resolve
    await waitFor(() => {
      expect(screen.queryByText(/Sign in with an author account/i)).not.toBeInTheDocument();
    });

    const file = new File(['Chapter 1\nSome text'], 'a_study_in_scarlet.txt', {
      type: 'text/plain',
    });
    const fileInput = screen.getByTestId('novel-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Create & Read Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create & Read Now'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'A Study in Scarlet',
          chapters: expect.arrayContaining([
            expect.objectContaining({ chapter_number: 1 }),
          ]),
        })
      );
      expect(handleSelectChapter).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'n-new' }),
        expect.objectContaining({ id: 'ch-new-1' })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('supports client-side parser fallback if parseFile backend API is unavailable', async () => {
    vi.spyOn(api.novels, 'parseFile').mockRejectedValue(new Error('Network error / 404'));

    render(
      <AuthProvider>
        <AddNovelModal isOpen={true} onClose={vi.fn()} onNovelCreated={vi.fn()} />
      </AuthProvider>
    );

    const txtContent = `Chapter 1: The Beginning\nIt was the best of times, it was the worst of times.\n\nChapter 2: The Mail\nIt was the Dover road that lay, on a Friday night late in November.`;
    const file = new File([txtContent], 'a_tale_of_two_cities.txt', { type: 'text/plain' });

    const fileInput = screen.getByTestId('novel-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('TXT')).toBeInTheDocument();
      expect(screen.getByText(/2 chapters ready to read/i)).toBeInTheDocument();
    });

    // Check title auto-populated from filename
    expect(screen.getByDisplayValue('A Tale Of Two Cities')).toBeInTheDocument();

    // Check removing the file
    const removeBtn = screen.getByLabelText('Remove uploaded file');
    fireEvent.click(removeBtn);

    expect(screen.queryByText('TXT')).not.toBeInTheDocument();
    expect(screen.getByText(/Drag & drop your novel manuscript here/i)).toBeInTheDocument();
  });
});
