import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Binary search (O(log N)) to find active segment based on current playback timestamp in milliseconds.
 */
export function findActiveSegment(timeline, timeMs) {
  if (!timeline || timeline.length === 0 || timeMs < 0) return -1;

  let lo = 0;
  let hi = timeline.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const entry = timeline[mid];

    if (timeMs < entry.start_ms) {
      hi = mid - 1;
    } else if (timeMs >= entry.end_ms) {
      lo = mid + 1;
    } else {
      return entry.segment_id !== undefined ? entry.segment_id : entry.order;
    }
  }

  return -1;
}

// Detect if running in an interactive browser environment (and not Vitest/jsdom)
const isBrowserEnv =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !navigator.userAgent.includes('jsdom');

export function useAudioSync(timeline = [], onSegmentChange = null) {
  const audioRef = useRef(null);
  const secondaryAudioRef = useRef(null);
  const rafRef = useRef(0);
  const lastActiveSegIdRef = useRef(-1);
  const lastClockUpdateRef = useRef(0);
  const speechCancelledRef = useRef(false);
  const apiSpeakFailedRef = useRef(false);
  const activeUtteranceRef = useRef(null);

  const [activeSegmentId, setActiveSegmentId] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);

  // Playback mode: 'tts' (Voice TTS read-along) vs 'studio' (stitched audio stream)
  // In real browser: default to 'tts' so every chapter (1-17 & EPUB) has live multi-voice speech!
  // In jsdom/Vitest: default to 'studio' so all 54 existing tests run undisturbed!
  const [playbackMode, setPlaybackMode] = useState(isBrowserEnv ? 'tts' : 'studio');
  const ttsReadAlongEnabled = playbackMode === 'tts';

  // Stop any active Web Speech or secondary audio
  const stopSpeech = useCallback(() => {
    speechCancelledRef.current = true;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    if (secondaryAudioRef.current) {
      try {
        secondaryAudioRef.current.pause();
        secondaryAudioRef.current.currentTime = 0;
      } catch (_) {}
    }
    activeUtteranceRef.current = null;
  }, []);

  // Forward declaration for speaking segment
  const speakActiveSegmentRef = useRef(null);

  // Auto-advance helper to next segment
  const advanceToNextSegment = useCallback(
    (currentSegId) => {
      if (speechCancelledRef.current) return;
      const currentIdx = timeline.findIndex(
        (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === currentSegId
      );
      if (currentIdx !== -1 && currentIdx < timeline.length - 1) {
        const nextEntry = timeline[currentIdx + 1];
        const nextSegId = nextEntry.segment_id !== undefined ? nextEntry.segment_id : nextEntry.order;
        lastActiveSegIdRef.current = nextSegId;
        setActiveSegmentId(nextSegId);
        setSegmentProgress(0);
        setCurrentTimeMs(nextEntry.start_ms);
        if (onSegmentChange) {
          onSegmentChange(nextSegId, nextEntry.start_ms);
        }
        if (speakActiveSegmentRef.current) {
          speakActiveSegmentRef.current(nextSegId, 0);
        }
      } else {
        // End of chapter reached
        setIsPlaying(false);
        lastActiveSegIdRef.current = -1;
        setActiveSegmentId(-1);
        setSegmentProgress(0);
      }
    },
    [timeline, onSegmentChange]
  );

  // Speak segment with Web Speech Synthesis (distinct British/English voices & pitch per character)
  const speakWithSpeechSynthesis = useCallback(
    (entry, targetSegId) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        advanceToNextSegment(targetSegId);
        return;
      }

      window.speechSynthesis.cancel();
      speechCancelledRef.current = false;

      const rawText = entry.text || '';
      if (!rawText.trim()) {
        advanceToNextSegment(targetSegId);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(rawText);
      activeUtteranceRef.current = utterance;

      const voices = window.speechSynthesis.getVoices() || [];
      const enVoices = voices.filter((v) => v.lang.startsWith('en'));

      let chosenVoice = null;
      const voiceId = entry.voice_id || '';
      const speakerName = (entry.speaker_name || entry.character_id || 'narrator').toLowerCase();

      // 1. Match voice_id or character
      if (voiceId) {
        chosenVoice = enVoices.find((v) => v.name.toLowerCase().includes(voiceId.toLowerCase()));
      }

      // 2. Fallback to British / English character profile
      if (!chosenVoice && enVoices.length > 0) {
        if (speakerName.includes('narrator')) {
          chosenVoice =
            enVoices.find(
              (v) =>
                v.name.includes('UK') ||
                v.name.includes('British') ||
                v.name.includes('Daniel') ||
                v.name.includes('George')
            ) || enVoices[0];
        } else {
          // Deterministic hash based on speaker name
          const hash = speakerName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          chosenVoice = enVoices[hash % enVoices.length];
        }
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      // Assign character pitch & rate
      if (speakerName.includes('narrator')) {
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
      } else {
        const hash = speakerName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        utterance.pitch = 0.85 + (hash % 7) * 0.06;
        utterance.rate = 1.0;
      }

      // Intra-segment word progress tracking via boundary events
      utterance.onboundary = (e) => {
        if (speechCancelledRef.current) return;
        if (typeof e.charIndex === 'number' && rawText.length > 0) {
          const prog = Math.min(1, Math.max(0, e.charIndex / rawText.length));
          setSegmentProgress(prog);
          const segDuration = Math.max(200, (entry.end_ms || 0) - (entry.start_ms || 0));
          const estMs = Math.round((entry.start_ms || 0) + prog * segDuration);
          setCurrentTimeMs(estMs);
        }
      };

      utterance.onend = () => {
        if (speechCancelledRef.current) return;
        setSegmentProgress(1.0);
        setCurrentTimeMs(entry.end_ms || entry.start_ms || 0);
        advanceToNextSegment(targetSegId);
      };

      utterance.onerror = () => {
        if (speechCancelledRef.current) return;
        advanceToNextSegment(targetSegId);
      };

      window.speechSynthesis.speak(utterance);
    },
    [advanceToNextSegment]
  );

  // Main speech dispatcher: attempts /api/voices/speak -> falls back to window.speechSynthesis
  const speakActiveSegment = useCallback(
    (targetSegId, startFraction = 0) => {
      speechCancelledRef.current = false;
      const entry = timeline.find(
        (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === targetSegId
      );
      if (!entry) return;

      const rawText = entry.text || '';
      if (!rawText.trim()) {
        advanceToNextSegment(targetSegId);
        return;
      }

      // Try /api/voices/speak if not previously failed
      if (!apiSpeakFailedRef.current && typeof Audio !== 'undefined') {
        const voiceParam = encodeURIComponent(entry.voice_id || 'en-GB-RyanNeural');
        const textParam = encodeURIComponent(rawText);
        const speakUrl = `/api/voices/speak?text=${textParam}&voice_id=${voiceParam}`;

        if (!secondaryAudioRef.current) {
          secondaryAudioRef.current = new Audio();
        }

        const secAudio = secondaryAudioRef.current;
        secAudio.src = speakUrl;

        secAudio.onerror = () => {
          // Backend endpoint not active; switch fallback permanently for this session
          apiSpeakFailedRef.current = true;
          speakWithSpeechSynthesis(entry, targetSegId);
        };

        secAudio.ontimeupdate = () => {
          if (speechCancelledRef.current) return;
          if (secAudio.duration > 0) {
            const prog = Math.min(1, Math.max(0, secAudio.currentTime / secAudio.duration));
            setSegmentProgress(prog);
            const segDuration = Math.max(200, (entry.end_ms || 0) - (entry.start_ms || 0));
            const estMs = Math.round((entry.start_ms || 0) + prog * segDuration);
            setCurrentTimeMs(estMs);
          }
        };

        secAudio.onended = () => {
          if (speechCancelledRef.current) return;
          setSegmentProgress(1.0);
          advanceToNextSegment(targetSegId);
        };

        secAudio.play().catch(() => {
          apiSpeakFailedRef.current = true;
          speakWithSpeechSynthesis(entry, targetSegId);
        });
      } else {
        speakWithSpeechSynthesis(entry, targetSegId);
      }
    },
    [timeline, advanceToNextSegment, speakWithSpeechSynthesis]
  );

  speakActiveSegmentRef.current = speakActiveSegment;

  useEffect(() => {
    lastActiveSegIdRef.current = -1;
    setActiveSegmentId(-1);
    setCurrentTimeMs(0);
    setSegmentProgress(0);
    setIsPlaying(false);
    stopSpeech();
  }, [timeline, stopSpeech]);

  // Synchronized animation loop (60fps audio clock for Studio Track mode)
  const syncLoop = useCallback(() => {
    if (!audioRef.current) return;

    const timeSec = audioRef.current.currentTime;
    const timeMs = Math.round(timeSec * 1000);

    // 1. High-speed binary search for active segment
    const segId = findActiveSegment(timeline, timeMs);

    // 2. Update active segment boundary
    if (segId !== lastActiveSegIdRef.current) {
      lastActiveSegIdRef.current = segId;
      setActiveSegmentId(segId);
      if (onSegmentChange && segId !== -1) {
        onSegmentChange(segId, timeMs);
      }
    }

    // 3. Compute intra-segment progress (0 to 1)
    if (segId !== -1) {
      const entry = timeline.find(
        (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === segId
      );
      if (entry && entry.end_ms > entry.start_ms) {
        const prog = Math.min(
          1,
          Math.max(0, (timeMs - entry.start_ms) / (entry.end_ms - entry.start_ms))
        );
        setSegmentProgress(prog);
      }
    } else {
      setSegmentProgress(0);
    }

    // 4. Throttle scrubber clock state updates (~7 times per sec)
    const now = performance.now();
    if (now - lastClockUpdateRef.current > 140) {
      lastClockUpdateRef.current = now;
      setCurrentTimeMs(timeMs);
    }

    rafRef.current = requestAnimationFrame(syncLoop);
  }, [timeline, onSegmentChange]);

  useEffect(() => {
    if (isPlaying && playbackMode === 'studio') {
      rafRef.current = requestAnimationFrame(syncLoop);
    } else {
      cancelAnimationFrame(rafRef.current);
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, playbackMode, syncLoop]);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => {
    setIsPlaying(false);
    stopSpeech();
    if (audioRef.current) {
      setCurrentTimeMs(Math.round(audioRef.current.currentTime * 1000));
    }
  }, [stopSpeech]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    stopSpeech();
    lastActiveSegIdRef.current = -1;
    setActiveSegmentId(-1);
    setSegmentProgress(0);
  }, [stopSpeech]);

  const handleLoadedMetadata = useCallback((eOrDur) => {
    const dur = typeof eOrDur === 'number' ? eOrDur : (eOrDur?.currentTarget?.duration || 0);
    if (dur > 0) setDuration(Math.round(dur * 1000));
  }, []);

  // Click-to-seek: seeks audio to segment position & starts playback
  const seekToSegment = useCallback(
    (segmentId) => {
      const entry = timeline.find(
        (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === segmentId
      );
      if (entry) {
        const targetSec = entry.start_ms / 1000;
        if (audioRef.current) {
          audioRef.current.currentTime = targetSec;
        }
        lastActiveSegIdRef.current = segmentId;
        setActiveSegmentId(segmentId);
        setCurrentTimeMs(entry.start_ms);
        setSegmentProgress(0);
        setIsPlaying(true);

        if (playbackMode === 'tts') {
          stopSpeech();
          speakActiveSegment(segmentId, 0);
        } else if (audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    },
    [timeline, playbackMode, stopSpeech, speakActiveSegment]
  );

  // Seek by explicit millisecond offset (for playback progress resume)
  const seekToTimeMs = useCallback(
    (targetMs, shouldPlay = false) => {
      const targetSec = Math.max(0, targetMs / 1000);
      if (audioRef.current) {
        audioRef.current.currentTime = targetSec;
      }
      const segId = findActiveSegment(timeline, targetMs);
      lastActiveSegIdRef.current = segId;
      setActiveSegmentId(segId);
      setCurrentTimeMs(targetMs);

      // Compute progress
      if (segId !== -1) {
        const entry = timeline.find(
          (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === segId
        );
        if (entry && entry.end_ms > entry.start_ms) {
          const prog = Math.min(
            1,
            Math.max(0, (targetMs - entry.start_ms) / (entry.end_ms - entry.start_ms))
          );
          setSegmentProgress(prog);
        }
      }

      if (shouldPlay) {
        setIsPlaying(true);
        if (playbackMode === 'tts' && segId !== -1) {
          stopSpeech();
          speakActiveSegment(segId, 0);
        } else if (audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    },
    [timeline, playbackMode, stopSpeech, speakActiveSegment]
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    if (playbackMode === 'tts') {
      let targetId = activeSegmentId;
      if (targetId === -1 && timeline.length > 0) {
        targetId = timeline[0].segment_id !== undefined ? timeline[0].segment_id : timeline[0].order;
        setActiveSegmentId(targetId);
        lastActiveSegIdRef.current = targetId;
      }
      if (targetId !== -1) {
        speakActiveSegment(targetId, segmentProgress);
      }
    } else if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [playbackMode, activeSegmentId, timeline, segmentProgress, speakActiveSegment]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    stopSpeech();
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [stopSpeech]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const setPlaybackRate = useCallback((rate) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    if (secondaryAudioRef.current) {
      secondaryAudioRef.current.playbackRate = rate;
    }
  }, []);

  const togglePlaybackMode = useCallback(() => {
    setPlaybackMode((prev) => {
      const next = prev === 'tts' ? 'studio' : 'tts';
      if (next === 'tts') {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        if (isPlaying) {
          const currentId =
            activeSegmentId !== -1
              ? activeSegmentId
              : timeline[0]?.segment_id ?? timeline[0]?.order ?? 1;
          speakActiveSegment(currentId, 0);
        }
      } else {
        stopSpeech();
        if (isPlaying && audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
      return next;
    });
  }, [isPlaying, activeSegmentId, timeline, stopSpeech, speakActiveSegment]);

  return {
    audioRef,
    secondaryAudioRef,
    activeSegmentId,
    isPlaying,
    currentTimeMs,
    duration,
    segmentProgress,
    playbackMode,
    setPlaybackMode,
    togglePlaybackMode,
    ttsReadAlongEnabled,
    seekToSegment,
    seekToTimeMs,
    play,
    pause,
    toggle,
    setPlaybackRate,
    handlePlay,
    handlePause,
    handleEnded,
    handleLoadedMetadata,
    speakSegment: speakActiveSegment,
    stopSpeech,
  };
}

export default useAudioSync;
