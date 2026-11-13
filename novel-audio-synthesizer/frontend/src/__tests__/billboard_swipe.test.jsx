import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext';
import NovelCatalog from '../components/NovelCatalog';
import { api } from '../services/api';

const MOCK_NOVELS = [
  {
    id: 'n-1',
    title: 'The Count of Monte Cristo',
    author_username: 'alexandre_dumas',
    chapter_count: 5,
    narrator_name: 'Dr. John Watson',
    synopsis: 'A tale of betrayal and retribution.',
    cover_object: '/covers/count.jpg',
  },
  {
    id: 'n-2',
    title: 'The Picture of Dorian Gray',
    author_username: 'oscar_wilde',
    chapter_count: 3,
    narrator_name: 'Lord Henry',
    synopsis: 'A story of eternal youth and moral decay.',
    cover_object: '/covers/dorian.jpg',
  },
  {
    id: 'n-3',
    title: 'Moby-Dick',
    author_username: 'herman_melville',
    chapter_count: 7,
    narrator_name: 'Ishmael',
    synopsis: 'The epic obsession with the white whale.',
    cover_object: '/covers/moby.jpg',
  },
];

describe('Netflix & Amazon Prime Style 5-Second Billboard Swipe', () => {
  beforeEach(() => {
    vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: MOCK_NOVELS });
    vi.spyOn(api.novels, 'get').mockResolvedValue({
      novel: MOCK_NOVELS[0],
      chapters: [{ id: 'ch-1', chapter_number: 1, title: 'Chapter 1' }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swipes forward with next arrow and backward with previous arrow', async () => {
    render(
      <AuthProvider>
        <NovelCatalog onSelectNovel={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('featured-novel-billboard')).toBeInTheDocument();
    });

    const billboard = screen.getByTestId('featured-novel-billboard');
    expect(within(billboard).getByText(/Alexandre Dumas|ALEXANDRE_DUMAS/i)).toBeInTheDocument();

    // Click Next Chevron
    const nextBtn = screen.getByLabelText('Next featured novel');
    fireEvent.click(nextBtn);
    expect(within(billboard).getByText(/Oscar Wilde|OSCAR_WILDE/i)).toBeInTheDocument();

    // Click Prev Chevron
    const prevBtn = screen.getByLabelText('Previous featured novel');
    fireEvent.click(prevBtn);
    expect(within(billboard).getByText(/Alexandre Dumas|ALEXANDRE_DUMAS/i)).toBeInTheDocument();
  });

  it('supports jumping to specific slides using numbered indicator buttons', async () => {
    render(
      <AuthProvider>
        <NovelCatalog onSelectNovel={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('featured-novel-billboard')).toBeInTheDocument();
    });

    const billboard = screen.getByTestId('featured-novel-billboard');
    const slide3Btn = screen.getByLabelText(/Jump to slide 3/i);
    fireEvent.click(slide3Btn);
    expect(within(billboard).getByText(/Herman Melville|HERMAN_MELVILLE/i)).toBeInTheDocument();
  });

  it('supports touch swipe left to advance and swipe right to rewind', async () => {
    render(
      <AuthProvider>
        <NovelCatalog onSelectNovel={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('featured-novel-billboard')).toBeInTheDocument();
    });

    const billboard = screen.getByTestId('featured-novel-billboard');
    expect(within(billboard).getByText(/Alexandre Dumas|ALEXANDRE_DUMAS/i)).toBeInTheDocument();

    // Swipe left (touchStart at X=300, touchEnd at X=100 -> deltaX = -200)
    fireEvent.touchStart(billboard, {
      touches: [{ clientX: 300, clientY: 150 }],
    });
    fireEvent.touchEnd(billboard, {
      changedTouches: [{ clientX: 100, clientY: 150 }],
    });

    expect(within(billboard).getByText(/Oscar Wilde|OSCAR_WILDE/i)).toBeInTheDocument();

    // Swipe right (touchStart at X=100, touchEnd at X=300 -> deltaX = +200)
    fireEvent.touchStart(billboard, {
      touches: [{ clientX: 100, clientY: 150 }],
    });
    fireEvent.touchEnd(billboard, {
      changedTouches: [{ clientX: 300, clientY: 150 }],
    });

    expect(within(billboard).getByText(/Alexandre Dumas|ALEXANDRE_DUMAS/i)).toBeInTheDocument();
  });

  it('pauses timer ONLY when hovering directly on the book, not on background or other controls', async () => {
    render(
      <AuthProvider>
        <NovelCatalog onSelectNovel={vi.fn()} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('featured-novel-billboard')).toBeInTheDocument();
    });

    const billboard = screen.getByTestId('featured-novel-billboard');
    const bookStage = screen.getByTestId('featured-book-stage');

    // Hovering on the outer billboard does NOT pause the timer
    fireEvent.mouseEnter(billboard);
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();

    // Hovering directly on the book stage pauses the timer
    fireEvent.mouseEnter(bookStage);
    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Mouse leaving the book stage unpauses the timer
    fireEvent.mouseLeave(bookStage);
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
  });
});
