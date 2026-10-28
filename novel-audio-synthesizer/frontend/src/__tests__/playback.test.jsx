import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { api, ApiError } from '../services/api';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';

const NOVEL_ID = '11111111-2222-3333-4444-555555555555';
const CHAPTER_ID = '66666666-7777-8888-9999-000000000000';
const USER = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', username: 'tester', role: 'reader' };

const MOCK_TIMELINE = [
  { order: 1, segment_id: 1, start_ms: 0, end_ms: 4000 },
  { order: 2, segment_id: 2, start_ms: 4000, end_ms: 10000 },
];

describe('Milestone 5 — Playback Resume & Progress Persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retrieves saved progress and resumes audio position at position_ms', async () => {
    const getProgressSpy = vi.spyOn(api.playback, 'getProgress').mockResolvedValue({
      progress: {
        id: 'hist-1',
        novel_id: NOVEL_ID,
        chapter_id: CHAPTER_ID,
        segment_order: 2,
        position_ms: 6500,
      },
    });

    const mockSeekToTimeMs = vi.fn();
    const mockAudioSync = {
      audioRef: { current: { currentTime: 0 } },
      currentTimeMs: 0,
      isPlaying: false,
      seekToTimeMs: mockSeekToTimeMs,
    };

    const { result } = renderHook(() =>
      usePlaybackProgress({
        novelId: NOVEL_ID,
        chapterId: CHAPTER_ID,
        user: USER,
        audioSync: mockAudioSync,
        timeline: MOCK_TIMELINE,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getProgressSpy).toHaveBeenCalledWith(NOVEL_ID, USER.id);
    expect(mockSeekToTimeMs).toHaveBeenCalledWith(6500, false);
    expect(result.current.resumedAtMs).toBe(6500);
  });

  it('gracefully handles 404 for first-time playback without crashing', async () => {
    vi.spyOn(api.playback, 'getProgress').mockRejectedValue(new ApiError('Not found', 404));

    const mockSeekToTimeMs = vi.fn();
    const mockAudioSync = {
      audioRef: { current: { currentTime: 0 } },
      currentTimeMs: 0,
      isPlaying: false,
      seekToTimeMs: mockSeekToTimeMs,
    };

    const { result } = renderHook(() =>
      usePlaybackProgress({
        novelId: NOVEL_ID,
        chapterId: CHAPTER_ID,
        user: USER,
        audioSync: mockAudioSync,
        timeline: MOCK_TIMELINE,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSeekToTimeMs).not.toHaveBeenCalled();
    expect(result.current.resumedAtMs).toBeNull();
  });

  it('saves progress on pause and seek events with 4NF payload', async () => {
    vi.spyOn(api.playback, 'getProgress').mockResolvedValue({ progress: null });
    const saveProgressSpy = vi.spyOn(api.playback, 'saveProgress').mockResolvedValue({ progress: {} });

    const mockAudioSync = {
      audioRef: { current: { currentTime: 7.2 } },
      currentTimeMs: 7200,
      isPlaying: true,
      seekToTimeMs: vi.fn(),
    };

    const { rerender } = renderHook(
      (props) =>
        usePlaybackProgress({
          novelId: NOVEL_ID,
          chapterId: CHAPTER_ID,
          user: USER,
          audioSync: props.audioSync,
          timeline: MOCK_TIMELINE,
        }),
      { initialProps: { audioSync: mockAudioSync } }
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Simulate audio pause event (isPlaying becomes false)
    const pausedAudioSync = { ...mockAudioSync, isPlaying: false };
    rerender({ audioSync: pausedAudioSync });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveProgressSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        novel_id: NOVEL_ID,
        chapter_id: CHAPTER_ID,
        segment_order: 2,
        position_ms: 7200,
        user_id: USER.id,
      })
    );
  });

  it('silently ignores unauthenticated guests without making progress calls', async () => {
    const getProgressSpy = vi.spyOn(api.playback, 'getProgress');
    const saveProgressSpy = vi.spyOn(api.playback, 'saveProgress');

    const mockAudioSync = {
      audioRef: { current: { currentTime: 0 } },
      currentTimeMs: 0,
      isPlaying: false,
      seekToTimeMs: vi.fn(),
    };

    renderHook(() =>
      usePlaybackProgress({
        novelId: NOVEL_ID,
        chapterId: CHAPTER_ID,
        user: null, // guest
        audioSync: mockAudioSync,
        timeline: MOCK_TIMELINE,
      })
    );

    expect(getProgressSpy).not.toHaveBeenCalled();
    expect(saveProgressSpy).not.toHaveBeenCalled();
  });
});
