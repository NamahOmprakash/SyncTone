import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReaderView from '../components/ReaderView';

describe('ReaderView & Chapter Playback Regression Suite', () => {
  it('opens and renders Harry Potter Chapter 1 segments with character dialogue', () => {
    const hpChapter1Segments = [
      {
        order: 1,
        segment_id: 1,
        type: 'narration',
        text: 'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.',
        speaker_name: 'British Narrator',
      },
      {
        order: 2,
        segment_id: 2,
        type: 'dialogue',
        text: 'Fancy seeing you here, Professor McGonagall.',
        speaker_name: 'Albus Dumbledore',
      },
    ];

    render(
      <ReaderView
        segments={hpChapter1Segments}
        activeSegmentId={1}
        currentNovel={{ title: "Harry Potter and the Philosopher's Stone" }}
        currentChapter={{ title: 'The Boy Who Lived' }}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(/Mr. and Mrs. Dursley/i)).toBeInTheDocument();
    expect(screen.getByText(/Fancy seeing you here/i)).toBeInTheDocument();
    expect(screen.getByText('Albus Dumbledore')).toBeInTheDocument();
    expect(screen.getByText('Narrator')).toBeInTheDocument();
  });

  it('opens and renders The Great Gatsby Chapter 1 segments', () => {
    const gatsbySegments = [
      {
        order: 1,
        segment_id: 1,
        type: 'narration',
        text: 'In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since.',
        speaker_name: 'Nick Carraway',
      },
      {
        order: 2,
        segment_id: 2,
        type: 'dialogue',
        text: "I'm stiff, I've been lying on that sofa for as long as I can remember.",
        speaker_name: 'Daisy Buchanan',
      },
    ];

    render(
      <ReaderView
        segments={gatsbySegments}
        activeSegmentId={1}
        currentNovel={{ title: 'The Great Gatsby' }}
        currentChapter={{ title: 'In My Younger and More Vulnerable Years' }}
        onBack={vi.fn()}
      />
    );

    expect(screen.getAllByText(/In my younger and more vulnerable years/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/I've been lying on that sofa/i)).toBeInTheDocument();
    expect(screen.getByText('Daisy Buchanan')).toBeInTheDocument();
  });

  it('opens and renders Sherlock Holmes Chapter 1 (A Scandal in Bohemia)', () => {
    const sherlockSegments = [
      {
        order: 1,
        segment_id: 1,
        type: 'narration',
        text: 'To Sherlock Holmes she is always THE woman.',
        speaker_name: 'Dr. John Watson',
      },
      {
        order: 2,
        segment_id: 2,
        type: 'dialogue',
        text: 'You see, but you do not observe. The distinction is clear.',
        speaker_name: 'Sherlock Holmes',
      },
    ];

    render(
      <ReaderView
        segments={sherlockSegments}
        activeSegmentId={2}
        currentNovel={{ title: 'The Adventures of Sherlock Holmes' }}
        currentChapter={{ title: 'A Scandal in Bohemia' }}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(/To Sherlock Holmes she is always THE woman/i)).toBeInTheDocument();
    expect(screen.getByText(/You see, but you do not observe/i)).toBeInTheDocument();
    expect(screen.getByText('Sherlock Holmes')).toBeInTheDocument();
  });

  it('opens and renders Sherlock Holmes Chapter 2 (The Red-Headed League)', () => {
    const redHeadedSegments = [
      {
        order: 1,
        segment_id: 1,
        type: 'narration',
        text: 'I had called upon my friend, Mr. Sherlock Holmes...',
        speaker_name: 'Dr. John Watson',
      },
      {
        order: 2,
        segment_id: 2,
        type: 'dialogue',
        text: 'The Red-headed League is dissolved, announced Mr. Wilson in a mournful voice.',
        speaker_name: 'Jabez Wilson',
      },
    ];

    render(
      <ReaderView
        segments={redHeadedSegments}
        activeSegmentId={-1}
        currentNovel={{ title: 'The Adventures of Sherlock Holmes' }}
        currentChapter={{ title: 'The Red-Headed League' }}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(/I had called upon my friend/i)).toBeInTheDocument();
    expect(screen.getByText(/The Red-headed League is dissolved/i)).toBeInTheDocument();
    expect(screen.getByText('Jabez Wilson')).toBeInTheDocument();
  });

  it('displays calm benefit-driven "This chapter isn\'t ready yet" state when segments are empty', () => {
    const handleBack = vi.fn();
    const handleRetry = vi.fn();

    render(
      <ReaderView
        segments={[]}
        currentNovel={{ title: "Harry Potter and the Philosopher's Stone" }}
        currentChapter={{ title: 'The Vanishing Glass' }}
        onBack={handleBack}
        onRetry={handleRetry}
      />
    );

    // Confirms no raw technical error or developer string is shown
    expect(screen.queryByText(/No chapter prose segments loaded/i)).not.toBeInTheDocument();
    expect(screen.getByText(/This chapter isn't ready yet/i)).toBeInTheDocument();
    expect(screen.getByText(/The narration for this chapter is being prepared by our cast/i)).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: /Back to Chapters/i });
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);

    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
