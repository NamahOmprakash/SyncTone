import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import UploadView from '../components/UploadView';

function renderUploadView(authOverrides = {}, viewProps = {}) {
  // Mock api.auth.me based on authOverrides
  const currentUser = authOverrides.user || null;
  vi.spyOn(api.auth, 'me').mockResolvedValue({ user: currentUser });

  return render(
    <AuthProvider>
      <UploadView
        onNovelCreated={vi.fn()}
        onSelectChapter={vi.fn()}
        onOpenAuth={vi.fn()}
        onNavigate={vi.fn()}
        {...viewProps}
      />
    </AuthProvider>
  );
}

describe('Upload Studio (UploadView) Manuscript Publishing Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Upload Studio publishing portal heading, dropzone, and specifications', async () => {
    renderUploadView();

    expect(screen.getByText('Upload Studio')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHING PORTAL')).toBeInTheDocument();
    expect(screen.getByText(/Drag & Drop Manuscript Here/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse File/i)).toBeInTheDocument();
    expect(screen.getByText('Volume Information')).toBeInTheDocument();
    expect(screen.getByText(/Publish & Synthesize Audio/i)).toBeInTheDocument();
  });

  it('shows Quick Demo Writer button and guest advisory when unauthenticated', async () => {
    renderUploadView();

    expect(screen.getByRole('button', { name: /Quick Demo Writer/i })).toBeInTheDocument();
    expect(screen.getByText(/Browsing as Guest/i)).toBeInTheDocument();
  });

  it('validates that title is required before submission', async () => {
    const createSpy = vi.spyOn(api.novels, 'create').mockResolvedValue({});
    renderUploadView({ user: { id: 'w-1', username: 'author1', role: 'writer' } });

    const submitBtn = screen.getByText(/Publish & Synthesize Audio/i);
    fireEvent.click(submitBtn);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('guards against unauthenticated submission and triggers login modal', async () => {
    const onOpenAuth = vi.fn();
    const createSpy = vi.spyOn(api.novels, 'create').mockResolvedValue({});

    renderUploadView({}, { onOpenAuth });

    // Enter title
    const titleInput = screen.getByPlaceholderText(/e\.g\. The Picture of Dorian Gray/i);
    fireEvent.change(titleInput, { target: { value: 'Test Unauth Manuscript' } });

    const submitBtn = screen.getByText(/Publish & Synthesize Audio/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Authentication required/i)).toBeInTheDocument();
      expect(onOpenAuth).toHaveBeenCalledWith('login');
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  it('submits novel manuscript with preserved chapter prose and calls onNovelCreated', async () => {
    const onNovelCreated = vi.fn();
    const mockCreatedNovel = {
      id: 'nov-test-123',
      title: 'The Great Gatsby',
      channel: 'community',
      author_username: 'fitzgerald',
    };
    const mockFirstChapter = {
      id: 'ch-test-1',
      title: 'Chapter 1',
      chapter_number: 1,
    };

    const createSpy = vi.spyOn(api.novels, 'create').mockResolvedValue({
      novel: mockCreatedNovel,
      chapters: [mockFirstChapter],
    });

    renderUploadView(
      { user: { id: 'w-fitz', username: 'fitzgerald', role: 'writer' } },
      { onNovelCreated }
    );

    // Wait for AuthProvider session to resolve
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Quick Demo Writer/i })).not.toBeInTheDocument();
    });

    // Fill in novel title and blurb
    const titleInput = screen.getByPlaceholderText(/e\.g\. The Picture of Dorian Gray/i);
    fireEvent.change(titleInput, { target: { value: 'The Great Gatsby' } });

    const synopsisInput = screen.getByPlaceholderText(/A short overview of the narrative/i);
    fireEvent.change(synopsisInput, { target: { value: 'In my younger and more vulnerable years...' } });

    const submitBtn = screen.getByRole('button', { name: /Publish & Synthesize Audio/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'The Great Gatsby',
          synopsis: 'In my younger and more vulnerable years...',
          chapters: expect.arrayContaining([
            expect.objectContaining({
              chapter_number: 1,
              title: expect.any(String),
              raw_text: expect.any(String),
              content: expect.any(String),
            }),
          ]),
        })
      );
      expect(screen.getByText(/Novel uploaded and registered successfully!/i)).toBeInTheDocument();
      expect(onNovelCreated).toHaveBeenCalledWith(mockCreatedNovel, mockFirstChapter);
    });
  });

  it('invokes demo writer login when Quick Demo Writer CTA is clicked', async () => {
    const loginSpy = vi.spyOn(api.auth, 'login').mockResolvedValue({
      user: { id: 'w-demo', username: 'demo_writer', role: 'writer' },
    });

    renderUploadView();

    const quickLoginBtn = screen.getByRole('button', { name: /Quick Demo Writer/i });
    fireEvent.click(quickLoginBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('demo_writer@synctone.internal', 'demo1234');
    });
  });
});
