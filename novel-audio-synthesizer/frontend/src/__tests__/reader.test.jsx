import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { findActiveSegment, useAudioSync } from '../hooks/useAudioSync';
import ReaderView from '../components/ReaderView';
import { getSpeakerColor, NARRATOR_COLOR } from '../utils/speakerColors';

const MOCK_TIMELINE = [
  { order: 1, segment_id: 1, start_ms: 0, end_ms: 2500, character_id: 'narrator' },
  { order: 2, segment_id: 2, start_ms: 2500, end_ms: 6000, character_id: 'harry_potter' },
  { order: 3, segment_id: 3, start_ms: 6000, end_ms: 9500, character_id: 'ron_weasley' },
];

const MOCK_SEGMENTS = [
  {
    order: 1,
    segment_id: 1,
    type: 'narration',
    text: 'Mr. and Mrs. Dursley were proud to say that they were perfectly normal.',
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
  {
    order: 3,
    segment_id: 3,
    type: 'dialogue',
    text: 'Are you really Harry Potter?',
    character_id: 'ron_weasley',
    speaker_name: 'Ron Weasley',
  },
];

describe('Milestone 3 — Reader View & 60fps Audio Synchronization', () => {
  describe('Binary Search Timeline Lookup (findActiveSegment)', () => {
    it('accurately resolves active segment at boundary and intermediate millisecond offsets', () => {
      // Before start of first segment
      expect(findActiveSegment(MOCK_TIMELINE, -100)).toBe(-1);

      // In first segment
      expect(findActiveSegment(MOCK_TIMELINE, 0)).toBe(1);
      expect(findActiveSegment(MOCK_TIMELINE, 1250)).toBe(1);
      expect(findActiveSegment(MOCK_TIMELINE, 2499)).toBe(1);

      // Boundary to second segment
      expect(findActiveSegment(MOCK_TIMELINE, 2500)).toBe(2);
      expect(findActiveSegment(MOCK_TIMELINE, 5999)).toBe(2);

      // Boundary to third segment
      expect(findActiveSegment(MOCK_TIMELINE, 6000)).toBe(3);
      expect(findActiveSegment(MOCK_TIMELINE, 9499)).toBe(3);

      // Beyond end
      expect(findActiveSegment(MOCK_TIMELINE, 9500)).toBe(-1);
      expect(findActiveSegment([], 1000)).toBe(-1);
    });
  });

  describe('Speaker Color Utilities', () => {
    it('returns standard neutral palette for narrator and deterministic colors for characters', () => {
      const narrator = getSpeakerColor('narrator');
      expect(narrator.bg).toBe(NARRATOR_COLOR.bg);

      const harry1 = getSpeakerColor('harry_potter');
      const harry2 = getSpeakerColor('harry_potter');
      expect(harry1).toEqual(harry2);

      const ron = getSpeakerColor('ron_weasley');
      expect(harry1).not.toBeNull();
      expect(ron).not.toBeNull();
    });
  });

  describe('useAudioSync Hook', () => {
    it('manages audio clock, click-to-seek, and seekToTimeMs accurately', () => {
      const { result } = renderHook(() => useAudioSync(MOCK_TIMELINE));

      // Mock audioRef
      const mockAudio = {
        currentTime: 0,
        playbackRate: 1.0,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
      };
      result.current.audioRef.current = mockAudio;

      // Click to seek to segment 2 (starts at 2500ms -> 2.5s)
      act(() => {
        result.current.seekToSegment(2);
      });

      expect(mockAudio.currentTime).toBe(2.5);
      expect(result.current.activeSegmentId).toBe(2);
      expect(result.current.isPlaying).toBe(true);

      // Seek by milliseconds (e.g. playback resume)
      act(() => {
        result.current.seekToTimeMs(7000);
      });

      expect(mockAudio.currentTime).toBe(7.0);
      expect(result.current.activeSegmentId).toBe(3);
    });
  });

  describe('ReaderView Component', () => {
    it('renders segments, applies speaker badges, and triggers onSegmentClick for seek', () => {
      const handleSegmentClick = vi.fn();

      render(
        <ReaderView
          segments={MOCK_SEGMENTS}
          activeSegmentId={2}
          onSegmentClick={handleSegmentClick}
        />
      );

      // Narration rendered
      expect(screen.getByText(/Mr. and Mrs. Dursley were proud/i)).toBeInTheDocument();

      // Dialogue rendered with speaker badge and quotes
      expect(screen.getByText('Harry Potter')).toBeInTheDocument();
      expect(screen.getByText('"I think I can tell the wrong sort for myself, thanks."')).toBeInTheDocument();

      // Active indicator on active segment (segment 2)
      expect(screen.getByText('Playing')).toBeInTheDocument();

      // Click-to-seek
      fireEvent.click(screen.getByText('"Are you really Harry Potter?"'));
      expect(handleSegmentClick).toHaveBeenCalledWith(3);
    });

    it('scrolls active element smoothly without thrashing on unmount', () => {
      const scrollIntoViewMock = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

      const { rerender } = render(
        <ReaderView segments={MOCK_SEGMENTS} activeSegmentId={1} onSegmentClick={vi.fn()} />
      );

      expect(scrollIntoViewMock).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth', block: 'center' })
      );

      // Rerender with same activeSegmentId should NOT trigger scroll again
      scrollIntoViewMock.mockClear();
      rerender(
        <ReaderView segments={MOCK_SEGMENTS} activeSegmentId={1} onSegmentClick={vi.fn()} />
      );
      expect(scrollIntoViewMock).not.toHaveBeenCalled();

      // Rerender with changed activeSegmentId triggers scroll
      rerender(
        <ReaderView segments={MOCK_SEGMENTS} activeSegmentId={2} onSegmentClick={vi.fn()} />
      );
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});
