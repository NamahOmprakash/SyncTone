import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../services/api';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THROTTLE_INTERVAL_MS = 8000; // Throttle periodic progress writes to every 8s

export function usePlaybackProgress({
  novelId,
  chapterId,
  user,
  audioSync,
  timeline = [],
}) {
  const [resumedAtMs, setResumedAtMs] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedPositionMsRef = useRef(0);
  const lastSavedTimeRef = useRef(0);
  const hasAttemptedResumeRef = useRef(false);
  const pendingResumeMsRef = useRef(null);

  const audioSyncRef = useRef(audioSync);
  audioSyncRef.current = audioSync;
  const wasPlayingRef = useRef(Boolean(audioSync?.isPlaying));

  const isValidNovel = novelId && UUID_REGEX.test(novelId);
  const isValidChapter = chapterId && UUID_REGEX.test(chapterId);
  const isAuthenticated = !!(user?.id && UUID_REGEX.test(user.id));

  // Reset resume attempt state when novel or chapter changes
  useEffect(() => {
    hasAttemptedResumeRef.current = false;
    pendingResumeMsRef.current = null;
    setResumedAtMs(null);
  }, [novelId, chapterId]);

  // 1. Save progress helper with throttling and duplicate write guards
  const saveCurrentProgress = useCallback(
    async (overrideMs = null, force = false) => {
      if (!isValidNovel || !isValidChapter || !isAuthenticated) return;

      const currentAudioSync = audioSyncRef.current;
      const currentMs =
        overrideMs !== null
          ? overrideMs
          : Math.round(currentAudioSync?.audioRef?.current?.currentTime * 1000 || currentAudioSync?.currentTimeMs || 0);

      const now = Date.now();
      const timeSinceLastSave = now - lastSavedTimeRef.current;
      const positionDiff = Math.abs(currentMs - lastSavedPositionMsRef.current);

      // Guard: skip if unchanged position or too frequent unless forced (e.g. pause/seek)
      if (!force && timeSinceLastSave < THROTTLE_INTERVAL_MS && positionDiff < 3000) {
        return;
      }

      // Determine segment order for 4NF playback_positions
      const activeSeg = timeline.find((t) => currentMs >= t.start_ms && currentMs < t.end_ms);
      const segmentOrder = activeSeg?.order ?? activeSeg?.segment_id ?? 0;

      lastSavedTimeRef.current = now;
      lastSavedPositionMsRef.current = currentMs;

      setIsSaving(true);
      try {
        await api.playback.saveProgress({
          novel_id: novelId,
          chapter_id: chapterId,
          segment_order: segmentOrder,
          position_ms: currentMs,
          user_id: user.id,
        });
      } catch (err) {
        // Safe logging without interrupting playback
        console.warn('[PlaybackProgress] Could not persist progress:', err.message);
      } finally {
        setIsSaving(false);
      }
    },
    [isValidNovel, isValidChapter, isAuthenticated, novelId, chapterId, user?.id, timeline]
  );

  const saveCurrentProgressRef = useRef(saveCurrentProgress);
  saveCurrentProgressRef.current = saveCurrentProgress;

  // 2. Resume progress on chapter open
  useEffect(() => {
    if (!isValidNovel || !isValidChapter || !isAuthenticated || hasAttemptedResumeRef.current) {
      return;
    }

    hasAttemptedResumeRef.current = true;
    let isMounted = true;

    async function loadProgress() {
      try {
        const res = await api.playback.getProgress(novelId, user.id);
        const prog = res?.progress;

        if (isMounted && prog && prog.chapter_id === chapterId && prog.position_ms > 500) {
          lastSavedPositionMsRef.current = prog.position_ms;
          setResumedAtMs(prog.position_ms);

          if (audioSyncRef.current?.audioRef?.current) {
            audioSyncRef.current.seekToTimeMs(prog.position_ms, false);
          } else {
            // Audio ref not yet mounted: stash for deferred execution
            pendingResumeMsRef.current = prog.position_ms;
          }
        }
      } catch (err) {
        // 404 simply means first-time reader, start from beginning
        if (err.status !== 404) {
          console.warn('[PlaybackProgress] Resume check warning:', err.message);
        }
      }
    }

    loadProgress();

    return () => {
      isMounted = false;
    };
  }, [isValidNovel, isValidChapter, isAuthenticated, novelId, chapterId, user?.id]);

  // Apply pending deferred seek as soon as the audio element mounts and is ready
  useEffect(() => {
    if (pendingResumeMsRef.current && audioSync?.audioRef?.current) {
      const target = pendingResumeMsRef.current;
      pendingResumeMsRef.current = null;
      audioSync.seekToTimeMs(target, false);
    }
  }, [audioSync?.audioRef?.current, audioSync?.duration]);

  // 3. Periodic timer to save progress every 8 seconds while playing
  useEffect(() => {
    if (!audioSync?.isPlaying || !isAuthenticated) return;

    const intervalId = setInterval(() => {
      saveCurrentProgressRef.current(null, false);
    }, THROTTLE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [audioSync?.isPlaying, isAuthenticated]);

  // 4. Save progress on pause
  useEffect(() => {
    const isPlaying = Boolean(audioSync?.isPlaying);
    if (wasPlayingRef.current && !isPlaying && hasAttemptedResumeRef.current) {
      saveCurrentProgressRef.current(null, true);
    }
    wasPlayingRef.current = isPlaying;
  }, [audioSync?.isPlaying]);

  // Save once on unmount if user had made progress
  useEffect(() => {
    return () => {
      if (hasAttemptedResumeRef.current && lastSavedPositionMsRef.current > 0) {
        saveCurrentProgressRef.current?.(null, true);
      }
    };
  }, []);

  return {
    resumedAtMs,
    isSaving,
    saveCurrentProgress,
    dismissResumeBanner: () => setResumedAtMs(null),
  };
}

export default usePlaybackProgress;
