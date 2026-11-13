import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BookShelf3D from '../components/3d/BookShelf3D';

const MOCK_NOVELS = [
  {
    id: 'novel-1',
    title: "Alice's Adventures in Wonderland",
    author_username: 'Lewis Carroll',
    global_tone: 'Philosophical Fable',
    cover_object: '/covers/alices-adventures-in-wonderland-cover.webp',
    synopsis: 'Alice follows a White Rabbit down a rabbit hole into Wonderland.',
    narrator_name: 'Studio Narrator',
  },
  {
    id: 'novel-2',
    title: 'The Great Gatsby',
    author_username: 'F. Scott Fitzgerald',
    global_tone: 'Jazz Age Fiction',
    cover_object: '/covers/the-great-gatsby-cover.webp',
    synopsis: 'A mysterious millionaire obsesses over a former lover.',
    narrator_name: 'Studio Narrator',
  },
];

describe('BookShelf3D Interactive 3D Bookshelf Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders shelf container, volumes, and spine labels', () => {
    render(<BookShelf3D novels={MOCK_NOVELS} />);

    expect(screen.getByText('// INTERACTIVE PHYSICAL BOOKSHELF')).toBeInTheDocument();
    expect(screen.getByLabelText(/Physical Book Spine: Alice's Adventures in Wonderland/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Physical Book Spine: The Great Gatsby/i)).toBeInTheDocument();
  });

  it('pulls book forward into inspector panel when clicked', () => {
    render(<BookShelf3D novels={MOCK_NOVELS} />);

    const spine = screen.getByLabelText(/Physical Book Spine: Alice's Adventures in Wonderland/i);
    fireEvent.click(spine);

    expect(screen.getByText('Alice follows a White Rabbit down a rabbit hole into Wonderland.')).toBeInTheDocument();
    expect(screen.getByText('Listen Now')).toBeInTheDocument();
    expect(screen.getByText('Read Novel')).toBeInTheDocument();
    expect(screen.getByText('Put Back')).toBeInTheDocument();
  });

  it('supports keyboard navigation: Enter key activates book spine', () => {
    render(<BookShelf3D novels={MOCK_NOVELS} />);

    const spine = screen.getByLabelText(/Physical Book Spine: The Great Gatsby/i);
    fireEvent.keyDown(spine, { key: 'Enter' });

    expect(screen.getByText('A mysterious millionaire obsesses over a former lover.')).toBeInTheDocument();
  });

  it('dismisses pulled-forward book when Escape key is pressed', () => {
    render(<BookShelf3D novels={MOCK_NOVELS} />);

    const spine = screen.getByLabelText(/Physical Book Spine: Alice's Adventures in Wonderland/i);
    fireEvent.click(spine);
    expect(screen.getByText('Listen Now')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Listen Now')).not.toBeInTheDocument();
  });

  it('dismisses pulled-forward book when Put Back button is clicked', () => {
    render(<BookShelf3D novels={MOCK_NOVELS} />);

    const spine = screen.getByLabelText(/Physical Book Spine: Alice's Adventures in Wonderland/i);
    fireEvent.click(spine);
    expect(screen.getByText('Listen Now')).toBeInTheDocument();

    const putBackBtn = screen.getByText('Put Back');
    fireEvent.click(putBackBtn);
    expect(screen.queryByText('Listen Now')).not.toBeInTheDocument();
  });

  it('invokes onStartListening and onSelectNovel callbacks from inspector actions', () => {
    const handleListen = vi.fn();
    const handleRead = vi.fn();

    render(
      <BookShelf3D
        novels={MOCK_NOVELS}
        onStartListening={handleListen}
        onSelectNovel={handleRead}
      />
    );

    const spine = screen.getByLabelText(/Physical Book Spine: Alice's Adventures in Wonderland/i);
    fireEvent.click(spine);

    const listenBtn = screen.getByText('Listen Now');
    fireEvent.click(listenBtn);
    expect(handleListen).toHaveBeenCalledWith(MOCK_NOVELS[0]);

    const readBtn = screen.getByText('Read Novel');
    fireEvent.click(readBtn);
    expect(handleRead).toHaveBeenCalledWith('novel-1');
  });
});
