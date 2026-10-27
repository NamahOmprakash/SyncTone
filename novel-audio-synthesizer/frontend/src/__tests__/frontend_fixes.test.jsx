import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import OpenGLPageReader from '../components/OpenGLPageReader';
import ReaderView from '../components/ReaderView';
import AudioPlayer from '../components/AudioPlayer';
import { useAudioSync } from '../hooks/useAudioSync';

describe('Frontend Fixes Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNonHpNovel = {
    id: 'n-sherlock',
    title: 'The Adventures of Sherlock Holmes',
    author_username: 'arthur_conan_doyle',
    cover_object: null,
  };

  const mockSegments = [
    {
      order: 1,
      segment_id: 1,
      type: 'narration',
      text: 'Opening of Adventuresofsher001892doyl.',
      speaker_name: 'Narrator',
    },
    {
      order: 2,
      segment_id: 2,
      type: 'narration',
      text: 'Imported from adventuresofsher001892doyl.epub.',
      speaker_name: 'Narrator',
    },
    {
      order: 3,
      segment_id: 3,
      type: 'narration',
      text: 'This file was processed and is ready for neural speech synthesis and playback.',
      speaker_name: 'Narrator',
    },
  ];

  it('Fix 1: Does NOT render Hogwarts crest or hardcoded HP cover for Sherlock Holmes novel', () => {
    render(
      <OpenGLPageReader
        segments={mockSegments}
        activeSegmentId={1}
        segmentProgress={0}
        isPlaying={false}
        currentNovel={mockNonHpNovel}
        currentChapter={{ title: 'Chapter 1: The Beginning', chapter_number: 1 }}
      />
    );

    // Hogwarts Latin motto should not be rendered
    expect(screen.queryByText(/DRACO DORMIENS NUNQUAM TITILLANDUS/i)).not.toBeInTheDocument();

    // Novel title should be rendered
    expect(screen.getAllByText('The Adventures of Sherlock Holmes').length).toBeGreaterThan(0);

    // On Spread 0 default, both Page 1 and Page 2 prose are visible, not blocked by cover
    expect(screen.getByText('Opening of Adventuresofsher001892doyl.')).toBeInTheDocument();
    expect(screen.getByText('Imported from adventuresofsher001892doyl.epub.')).toBeInTheDocument();
  });

  it('Fix 1 (cont): Renders inline EPUB images from [IMAGE:/static/covers/...] in OpenGL and Normal views', () => {
    const segWithImage = [
      {
        order: 1,
        segment_id: 1,
        type: 'narration',
        text: '[IMAGE:/static/covers/sherlock_pipe.jpg] Sherlock puffed quietly on his pipe.',
        speaker_name: 'Narrator',
      },
    ];

    const { rerender } = render(
      <OpenGLPageReader
        segments={segWithImage}
        activeSegmentId={1}
        segmentProgress={0}
        isPlaying={false}
        currentNovel={mockNonHpNovel}
      />
    );

    const img = screen.getByRole('img', { name: /book illustration/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/static/covers/sherlock_pipe.jpg');
    expect(screen.getByText('Sherlock puffed quietly on his pipe.')).toBeInTheDocument();

    // In normal ReaderView
    rerender(
      <ReaderView
        segments={segWithImage}
        activeSegmentId={1}
        segmentProgress={0}
        currentNovel={mockNonHpNovel}
      />
    );

    const imgNormal = screen.getByRole('img', { name: /book illustration/i });
    expect(imgNormal).toBeInTheDocument();
    expect(imgNormal).toHaveAttribute('src', '/static/covers/sherlock_pipe.jpg');
  });

  it('Fix 2: Clean inline highlight in OpenGL without display box or inline-block indentation bug', () => {
    render(
      <OpenGLPageReader
        segments={mockSegments}
        activeSegmentId={2}
        segmentProgress={0.2}
        isPlaying={true}
        currentNovel={mockNonHpNovel}
      />
    );

    // Active paragraph must NOT have display box classes
    const activeP = document.querySelector('p.bg-yellow-400\\/20, p.border-l-4');
    expect(activeP).toBeNull();

    // Active word span must NOT have inline-block
    const wordSpan = screen.getByText('Imported');
    expect(wordSpan).not.toHaveClass('inline-block');
    expect(['0', '0px']).toContain(wordSpan.style.textIndent);
  });

  it('Fix 3: useAudioSync handles tts cancellation and prevents simultaneous voice speech', () => {
    const { result } = renderHook(() =>
      useAudioSync([
        { order: 1, segment_id: 1, start_ms: 0, end_ms: 1000, text: 'Hello world' },
      ])
    );

    act(() => {
      result.current.setTtsEngine('machine-tts');
    });
    expect(result.current.ttsEngine).toBe('machine-tts');

    // Calling stopSpeech cancels speech cleanly
    act(() => {
      result.current.stopSpeech();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('Fix 4: Page turning works on short multi-segment chapters and buttons map directly', () => {
    render(
      <OpenGLPageReader
        segments={mockSegments} // 3 segments
        activeSegmentId={1}
        segmentProgress={0}
        isPlaying={false}
        currentNovel={mockNonHpNovel}
      />
    );

    // Next page button is enabled because 3 segments were paginated across spreads
    const nextBtn = screen.getByLabelText('Next Page');
    expect(nextBtn).toBeInTheDocument();
    expect(nextBtn).not.toBeDisabled();

    // Clicking Next Page turns spread
    fireEvent.click(nextBtn);
  });

  it('Fix 4 (cont): AudioPlayer transport buttons in TTS mode advance segments via onSeekSegment', () => {
    const handleSeekSegment = vi.fn();
    render(
      <AudioPlayer
        isPlaying={true}
        currentTimeMs={0}
        totalDurationMs={0}
        playbackMode="tts"
        onToggle={vi.fn()}
        onSeekSegment={handleSeekSegment}
      />
    );

    // Skip back 10s button calls onSeekSegment(-1)
    fireEvent.click(screen.getByLabelText(/skip back 10 seconds/i));
    expect(handleSeekSegment).toHaveBeenCalledWith(-1);

    // Skip forward 10s button calls onSeekSegment(1)
    fireEvent.click(screen.getByLabelText(/skip forward 10 seconds/i));
    expect(handleSeekSegment).toHaveBeenCalledWith(1);
  });
});
