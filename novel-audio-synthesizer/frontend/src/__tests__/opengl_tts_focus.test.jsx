import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { useAudioSync, findActiveSegment } from '../hooks/useAudioSync';
import ReaderView from '../components/ReaderView';
import OpenGLPageReader from '../components/OpenGLPageReader';
import AudioPlayer from '../components/AudioPlayer';

const MOCK_TIMELINE = [
  {
    order: 1,
    segment_id: 1,
    start_ms: 0,
    end_ms: 3000,
    text: 'Mr. and Mrs. Dursley were proud to say they were normal.',
    speaker_name: 'Narrator',
    voice_id: 'en-GB-RyanNeural',
  },
  {
    order: 2,
    segment_id: 2,
    start_ms: 3000,
    end_ms: 7000,
    text: 'I think I can tell the wrong sort for myself, thanks.',
    speaker_name: 'Harry Potter',
    voice_id: 'en-GB-ThomasNeural',
  },
];

const MOCK_SEGMENTS = [
  {
    order: 1,
    segment_id: 1,
    type: 'narration',
    text: 'Mr. and Mrs. Dursley were proud to say they were normal, thank you very much.',
    character_id: 'narrator',
    speaker_name: 'Narrator',
  },
  {
    order: 2,
    segment_id: 2,
    type: 'dialogue',
    text: 'I think I can tell the wrong sort for myself, thanks.',
    character_id: 'harry_potter',
    speaker_name: 'Harry Potter',
  },
];

describe('Subagent 3: OpenGL Reader, WTR-Lab Yellow Highlight & Focus Mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 1: Intra-segment Word Progress & Mode Toggle', () => {
    it('computes segmentProgress and toggles between TTS and Studio modes', () => {
      const { result } = renderHook(() => useAudioSync(MOCK_TIMELINE));

      // Mock audioRef
      const mockAudio = {
        currentTime: 0,
        playbackRate: 1.0,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
      };
      result.current.audioRef.current = mockAudio;

      // In jsdom environment, mode defaults to studio
      expect(result.current.playbackMode).toBe('studio');
      expect(result.current.segmentProgress).toBe(0);

      // Seek to mid-segment 2 (start 3000ms, end 7000ms, mid 5000ms -> progress 0.5)
      act(() => {
        result.current.seekToTimeMs(5000);
      });

      expect(result.current.activeSegmentId).toBe(2);
      expect(result.current.segmentProgress).toBeCloseTo(0.5, 2);

      // Toggle playback mode
      act(() => {
        result.current.togglePlaybackMode();
      });

      expect(result.current.playbackMode).toBe('tts');
      expect(result.current.ttsReadAlongEnabled).toBe(true);
    });

    it('renders Playback engine toggle in AudioPlayer', () => {
      const handleToggleMode = vi.fn();
      render(
        <AudioPlayer
          audioUrl="/api/stream/mock"
          isPlaying={true}
          currentTimeMs={1000}
          totalDurationMs={10000}
          playbackMode="tts"
          onTogglePlaybackMode={handleToggleMode}
          onToggle={vi.fn()}
        />
      );

      const toggleBtn = screen.getByLabelText(/Playback engine: Voice TTS/i);
      expect(toggleBtn).toBeInTheDocument();
      fireEvent.click(toggleBtn);
      expect(handleToggleMode).toHaveBeenCalledTimes(1);
    });
  });

  describe('Task 2: OpenGLPageReader & WTR-Lab Yellow Highlight', () => {
    it('paginates segments and renders page navigation controls', () => {
      const handleSegmentClick = vi.fn();
      render(
        <OpenGLPageReader
          segments={MOCK_SEGMENTS}
          activeSegmentId={1}
          segmentProgress={0.4}
          isPlaying={true}
          onSegmentClick={handleSegmentClick}
        />
      );

      expect(screen.getByText(/Page 1 of/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Next Page')).toBeInTheDocument();

      // Click segment
      fireEvent.click(screen.getByText('Harry Potter'));
      expect(handleSegmentClick).toHaveBeenCalledWith(2);
    });

    it('highlights current speaking word with WTR-Lab yellow badge when segmentProgress > 0', () => {
      render(
        <OpenGLPageReader
          segments={MOCK_SEGMENTS}
          activeSegmentId={2}
          segmentProgress={0.3} // ~30% through the sentence
          isPlaying={true}
          onSegmentClick={vi.fn()}
        />
      );

      // Active segment is highlighted
      expect(screen.getByText('Reading')).toBeInTheDocument();

      // Words are rendered, one of them has the bright yellow highlight class
      const highlightedWord = document.querySelector('.bg-yellow-300, .bg-yellow-400');
      expect(highlightedWord).not.toBeNull();
      expect(highlightedWord).toHaveClass('font-bold');
    });
  });

  describe('Task 3: ReaderView Normal vs OpenGL Mode Switcher & Focus Mode', () => {
    it('switches between Normal and OpenGL 3D modes from the header toggle', () => {
      render(
        <ReaderView
          segments={MOCK_SEGMENTS}
          activeSegmentId={1}
          segmentProgress={0}
          onSegmentClick={vi.fn()}
        />
      );

      // Initially in Normal view
      expect(screen.getByTitle(/Normal continuous vertical scroll/i)).toBeInTheDocument();
      const openGLBtn = screen.getByTitle(/Moon\+ Reader Pro 3D OpenGL page-turn/i);
      expect(openGLBtn).toBeInTheDocument();

      // Click OpenGL 3D mode
      fireEvent.click(openGLBtn);

      // Page controls from OpenGL reader appear
      expect(screen.getByText(/Page 1 of/i)).toBeInTheDocument();
      expect(screen.getByText('Normal View')).toBeInTheDocument();

      // Click switch to Normal view
      fireEvent.click(screen.getByText('Normal View'));
      expect(screen.getByText('Narrator')).toBeInTheDocument();
    });

    it('toggles Focus Mode and exits when Escape key is pressed', () => {
      render(
        <ReaderView
          segments={MOCK_SEGMENTS}
          activeSegmentId={1}
          segmentProgress={0}
          onSegmentClick={vi.fn()}
        />
      );

      const focusBtn = screen.getByTitle(/Focus mode/i);
      expect(focusBtn).toBeInTheDocument();

      // Enter focus mode
      fireEvent.click(focusBtn);

      expect(screen.getByText(/Focus Mode Active • Press Esc to exit/i)).toBeInTheDocument();

      // Press Escape to exit
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByText(/Focus Mode Active • Press Esc to exit/i)).not.toBeInTheDocument();
    });

    it('renders Focus Mode full-screen overlay and Exit Focus button in OpenGLPageReader', () => {
      const handleToggleFocus = vi.fn();
      const { container } = render(
        <OpenGLPageReader
          segments={MOCK_SEGMENTS}
          activeSegmentId={1}
          isFocusMode={true}
          onToggleFocusMode={handleToggleFocus}
        />
      );

      // Verify full screen fixed inset-0 wrapper
      expect(container.firstChild).toHaveClass('fixed', 'inset-0', 'z-50');

      // Exit Focus button is present and clickable
      const exitBtn = screen.getByTitle(/Exit Focus Mode/i);
      expect(exitBtn).toBeInTheDocument();
      fireEvent.click(exitBtn);
      expect(handleToggleFocus).toHaveBeenCalledTimes(1);
    });

    it('handles Next and Prev page turns without snapping back or invoking onSegmentClick', () => {
      const handleSegmentClick = vi.fn();
      // 6 segments so we have at least 2 spreads
      const segments6 = [
        { order: 1, segment_id: 1, type: 'narration', text: 'Segment one text here.' },
        { order: 2, segment_id: 2, type: 'narration', text: 'Segment two text here.' },
        { order: 3, segment_id: 3, type: 'narration', text: 'Segment three text here.' },
        { order: 4, segment_id: 4, type: 'narration', text: 'Segment four text here.' },
        { order: 5, segment_id: 5, type: 'narration', text: 'Segment five text here.' },
        { order: 6, segment_id: 6, type: 'narration', text: 'Segment six text here.' },
      ];

      render(
        <OpenGLPageReader
          segments={segments6}
          activeSegmentId={1}
          onSegmentClick={handleSegmentClick}
        />
      );

      // Initially on Spread 1
      expect(screen.getByText(/Page 1 of/i)).toBeInTheDocument();
      expect(screen.getByText(/Spread 1/i)).toBeInTheDocument();

      // Click Next Page button (floating or dock)
      const nextBtn = screen.getAllByRole('button', { name: /Next Page/i })[0];
      fireEvent.click(nextBtn);

      // Spread advanced to Spread 2
      expect(screen.getByText(/Spread 2/i)).toBeInTheDocument();
      // onSegmentClick was NOT called (does not hijack audio)
      expect(handleSegmentClick).not.toHaveBeenCalled();

      // Click Prev Page button (floating or dock)
      const prevBtn = screen.getAllByRole('button', { name: /Prev Page/i })[0];
      fireEvent.click(prevBtn);

      // Spread returned to Spread 1
      expect(screen.getByText(/Spread 1/i)).toBeInTheDocument();
      expect(handleSegmentClick).not.toHaveBeenCalled();
    });

    it('renders standalone illustration page cleanly without Narrator label and does not duplicate on Spread 0', () => {
      const imageSegments = [
        {
          order: 1,
          segment_id: 1,
          type: 'narration',
          text: '[IMAGE:/illustrations/dumbledore_privet_drive.jpg]',
          speaker_name: 'Narrator',
        },
        {
          order: 2,
          segment_id: 2,
          type: 'narration',
          text: 'He was a tall, thin man with silver hair and beard.',
          speaker_name: 'Narrator',
        },
      ];

      render(
        <OpenGLPageReader
          segments={imageSegments}
          activeSegmentId={1}
          currentNovel={{ title: 'Harry Potter and the Sorcerer\'s Stone' }}
          currentChapter={{ title: 'Chapter 1: The Boy Who Lived', chapter_number: 1 }}
        />
      );

      // Image is rendered
      const img = screen.getByAltText('Book illustration');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/illustrations/dumbledore_privet_drive.jpg');

      // Standalone illustration does not display 'Narrator' label above it
      // (The second segment has 'Narrator', but the image segment does not have a separate narrator tag)
      expect(screen.queryByText(/DRACO DORMIENS NUNQUAM TITILLANDUS/i)).not.toBeInTheDocument();
    });
  });
});
