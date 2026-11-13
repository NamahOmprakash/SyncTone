import { useRef, useState, useCallback, useEffect, useMemo } from 'react';

const PARADEE_VOICE_IDS = new Set(['af_heart', 'am_puck', 'bf_isabella', 'bm_fable']);

const MACHINE_EXTRA_PROFILES = [
  { id: 'mac_reed', matchName: 'reed', gender: 'male', pitch: 0.92, rate: 0.98 },
  { id: 'mac_moira', matchName: 'moira', gender: 'female', pitch: 1.06, rate: 1.0 },
  { id: 'mac_rocko', matchName: 'rocko', gender: 'male', pitch: 0.85, rate: 0.96 },
  { id: 'mac_shelley', matchName: 'shelley', gender: 'female', pitch: 1.1, rate: 1.02 },
  { id: 'mac_grandpa', matchName: 'grandpa', gender: 'male', pitch: 0.8, rate: 0.92 },
  { id: 'mac_flo', matchName: 'flo', gender: 'female', pitch: 1.14, rate: 0.97 },
  { id: 'mac_daniel', matchName: 'daniel', gender: 'male', pitch: 0.96, rate: 1.03 },
  { id: 'mac_serena', matchName: 'serena', gender: 'female', pitch: 1.04, rate: 0.99 },
];

function inferEntryGender(entry) {
  const g = String(entry?.gender || '').toLowerCase();
  if (g === 'female' || g === 'f') return 'female';
  if (g === 'male' || g === 'm') return 'male';
  const v = String(entry?.voice_id || entry?.assigned_voice_id || '').toLowerCase();
  if (
    v.startsWith('af_') ||
    v.startsWith('bf_') ||
    v.includes('sonia') ||
    v.includes('libby') ||
    v.includes('maisie') ||
    v.includes('jenny') ||
    v.includes('aria') ||
    v.includes('natasha') ||
    v.includes('clara') ||
    v.includes('emily') ||
    v.includes('serena') ||
    v.includes('shelley') ||
    v.includes('flo') ||
    v.includes('moira')
  ) {
    return 'female';
  }
  return 'male';
}

export function buildClientMixedCastMap(timeline = []) {
  const castMap = new Map();
  castMap.set('narrator', {
    engine: 'paradee-tts',
    voiceId: 'bm_fable',
    slot: 1,
  });

  const charStats = new Map();
  for (const seg of timeline) {
    const rawKey = String(seg.character_id || seg.speaker_id || seg.speaker_name || 'narrator')
      .trim()
      .toLowerCase();
    if (!rawKey || rawKey === 'narrator' || rawKey === 'unresolved' || seg.type === 'narration') {
      continue;
    }
    const existing = charStats.get(rawKey);
    if (existing) {
      existing.count += 1;
    } else {
      charStats.set(rawKey, {
        key: rawKey,
        count: 1,
        voiceId: seg.assigned_voice_id || seg.voice_id || '',
        gender: inferEntryGender(seg),
      });
    }
  }

  const ranked = Array.from(charStats.values()).sort((a, b) => b.count - a.count);
  const availableParadee = ['bf_isabella', 'am_puck', 'af_heart'];
  const usedParadee = new Set(['bm_fable']);

  // Primary 3 speaking characters -> Paradee-8M neural voices
  const primary = ranked.slice(0, 3);
  primary.forEach((char, idx) => {
    if (PARADEE_VOICE_IDS.has(char.voiceId)) {
      usedParadee.add(char.voiceId);
      castMap.set(char.key, {
        engine: 'paradee-tts',
        voiceId: char.voiceId,
        slot: idx + 2,
      });
      return;
    }
    let chosen = null;
    if (char.gender === 'female') {
      chosen = ['bf_isabella', 'af_heart'].find((v) => !usedParadee.has(v));
    } else {
      chosen = ['am_puck', 'bm_fable'].find((v) => !usedParadee.has(v));
    }
    if (!chosen) {
      chosen = availableParadee.find((v) => !usedParadee.has(v)) || availableParadee[idx % availableParadee.length];
    }
    usedParadee.add(chosen);
    castMap.set(char.key, {
      engine: 'paradee-tts',
      voiceId: chosen,
      slot: idx + 2,
    });
  });

  // 5th+ extra characters -> Machine-TTS extra voice pool
  const extras = ranked.slice(3);
  extras.forEach((char, idx) => {
    const explicitMac = MACHINE_EXTRA_PROFILES.find((p) => p.id === char.voiceId);
    const pool = MACHINE_EXTRA_PROFILES.filter((p) => p.gender === char.gender);
    const profile =
      explicitMac ||
      (pool.length > 0 ? pool[idx % pool.length] : MACHINE_EXTRA_PROFILES[idx % MACHINE_EXTRA_PROFILES.length]);

    castMap.set(char.key, {
      engine: 'machine-tts',
      voiceId: profile.id,
      matchName: profile.matchName,
      pitch: profile.pitch,
      rate: profile.rate,
      castSlot: idx,
      slot: idx + 5,
    });
  });

  return castMap;
}

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

export function useAudioSync(timeline = [], onSegmentChangeOrOptions = null, maybeOnChapterEnded = null) {
  let onSegmentChange = null;
  let onChapterEnded = null;
  let currentNovelId = '';
  let currentChapterId = '';
  let providedCharacters = null;
  let providedCharacterMap = null;

  if (typeof onSegmentChangeOrOptions === 'function') {
    onSegmentChange = onSegmentChangeOrOptions;
    onChapterEnded = maybeOnChapterEnded;
  } else if (onSegmentChangeOrOptions && typeof onSegmentChangeOrOptions === 'object') {
    onSegmentChange = onSegmentChangeOrOptions.onSegmentChange || null;
    onChapterEnded = onSegmentChangeOrOptions.onChapterEnded || null;
    currentNovelId = onSegmentChangeOrOptions.novelId || onSegmentChangeOrOptions.currentNovelId || '';
    currentChapterId = onSegmentChangeOrOptions.chapterId || onSegmentChangeOrOptions.currentChapterId || '';
    providedCharacters = Array.isArray(onSegmentChangeOrOptions.characters)
      ? onSegmentChangeOrOptions.characters
      : null;
    providedCharacterMap =
      onSegmentChangeOrOptions.characterMap && typeof onSegmentChangeOrOptions.characterMap === 'object'
        ? onSegmentChangeOrOptions.characterMap
        : null;
  }

  const novelIdRef = useRef(currentNovelId);
  const chapterIdRef = useRef(currentChapterId);
  const charactersRef = useRef(providedCharacters);
  const characterMapRef = useRef(providedCharacterMap);
  useEffect(() => {
    novelIdRef.current = currentNovelId;
  }, [currentNovelId]);
  useEffect(() => {
    chapterIdRef.current = currentChapterId;
  }, [currentChapterId]);
  useEffect(() => {
    charactersRef.current = providedCharacters;
  }, [providedCharacters]);
  useEffect(() => {
    characterMapRef.current = providedCharacterMap;
  }, [providedCharacterMap]);

  const audioRef = useRef(null);
  const secondaryAudioRef = useRef(null);
  const rafRef = useRef(0);
  const ttsRafRef = useRef(0);
  const speechFallbackTimerRef = useRef(null);
  const playbackRateRef = useRef(1.0);
  const lastActiveSegIdRef = useRef(-1);
  const lastClockUpdateRef = useRef(0);
  const speechCancelledRef = useRef(false);
  const speechGenRef = useRef(0);
  const apiSpeakFailedRef = useRef(false);
  const activeUtteranceRef = useRef(null);

  const [activeSegmentId, setActiveSegmentId] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);

  // Playback mode: 'tts' (Voice TTS read-along) vs 'studio' (stitched audio stream)
  // In real browser: default to 'tts' so every chapter (1-17 & EPUB) has live multi-voice speech!
  // In jsdom/Vitest: default to 'studio' so all existing tests run undisturbed!
  const [playbackMode, setPlaybackMode] = useState(isBrowserEnv ? 'tts' : 'studio');
  const playbackModeRef = useRef(playbackMode);
  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  const ttsReadAlongEnabled = playbackMode === 'tts';

  // 5-Engine Selection: 'msedge-tts' | 'kokoro-tts' | 'paradee-tts' | 'paradee-mixed' | 'machine-tts'
  // Persisted in localStorage so selected engine survives page refresh
  const [ttsEngine, setTtsEngine] = useState(() => {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem('synctone_tts_engine')) || 'msedge-tts';
    } catch (_) {
      return 'msedge-tts';
    }
  });
  const ttsEngineRef = useRef(ttsEngine);
  useEffect(() => {
    ttsEngineRef.current = ttsEngine;
  }, [ttsEngine]);

  // Memoized mixed-mode cast map (Paradee-8M for Narrator + top 3 primary characters; Machine-TTS for 5th+ extras)
  const mixedCastMap = useMemo(() => buildClientMixedCastMap(timeline), [timeline]);

  // Character metadata lookup (gender, cast_slot, voice overrides)
  const resolvedCharacterMap = useMemo(() => {
    const map = new Map();
    const indexEntry = (key, val) => {
      if (!key || !val || typeof val !== 'object') return;
      map.set(String(key).trim().toLowerCase(), val);
    };

    if (providedCharacterMap instanceof Map) {
      providedCharacterMap.forEach((val, key) => indexEntry(key, val));
    } else if (providedCharacterMap && typeof providedCharacterMap === 'object') {
      Object.entries(providedCharacterMap).forEach(([key, val]) => indexEntry(key, val));
    }

    if (Array.isArray(providedCharacters)) {
      providedCharacters.forEach((charObj, idx) => {
        if (!charObj || typeof charObj !== 'object') return;
        const normalized = {
          ...charObj,
          cast_slot:
            charObj.cast_slot !== undefined && charObj.cast_slot !== null
              ? charObj.cast_slot
              : charObj.slot !== undefined && charObj.slot !== null
                ? charObj.slot
                : idx,
        };
        indexEntry(charObj.character_id, normalized);
        indexEntry(charObj.speaker_id, normalized);
        indexEntry(charObj.id, normalized);
        indexEntry(charObj.name, normalized);
        indexEntry(charObj.speaker_name, normalized);
      });
    }

    return map;
  }, [providedCharacters, providedCharacterMap]);

  // Stop any active Web Speech or secondary audio
  const stopSpeech = useCallback(() => {
    speechGenRef.current += 1;
    speechCancelledRef.current = true;
    if (ttsRafRef.current) {
      cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = 0;
    }
    if (speechFallbackTimerRef.current) {
      clearInterval(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    if (secondaryAudioRef.current) {
      try {
        const sec = secondaryAudioRef.current;
        sec.onended = null;
        sec.onerror = null;
        sec.ontimeupdate = null;
        sec.onplay = null;
        sec.onpause = null;
        sec.pause();
        sec.currentTime = 0;
      } catch (_) {}
    }
    if (playbackModeRef.current === 'tts' && audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (_) {}
    }
    activeUtteranceRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (ttsRafRef.current) {
        cancelAnimationFrame(ttsRafRef.current);
        ttsRafRef.current = 0;
      }
      if (speechFallbackTimerRef.current) {
        clearInterval(speechFallbackTimerRef.current);
        speechFallbackTimerRef.current = null;
      }
    };
  }, []);

  // Forward declaration for speaking segment
  const speakActiveSegmentRef = useRef(null);

  // Auto-advance helper to next segment
  const advanceToNextSegment = useCallback(
    (currentSegId, expectedGen = null) => {
      if (speechCancelledRef.current) return;
      if (expectedGen !== null && expectedGen !== speechGenRef.current) return;
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
        if (onChapterEnded) {
          onChapterEnded();
        }
      }
    },
    [timeline, onSegmentChange, onChapterEnded]
  );

  // Speak segment with Web Speech Synthesis (distinct British/English voices & pitch per character)
  const speakWithSpeechSynthesis = useCallback(
    (entry, targetSegId, myGen) => {
      if (
        typeof window === 'undefined' ||
        !window.speechSynthesis ||
        typeof SpeechSynthesisUtterance === 'undefined'
      ) {
        advanceToNextSegment(targetSegId);
        return;
      }

      window.speechSynthesis.cancel();
      if (myGen !== speechGenRef.current || speechCancelledRef.current) return;

      const rawText = entry.text || '';
      const cleanText = rawText.replace(/\[IMAGE:[^\]]*\]/gi, '').trim();
      if (!cleanText) {
        advanceToNextSegment(targetSegId);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      activeUtteranceRef.current = utterance;

      const voices = window.speechSynthesis.getVoices() || [];
      const enVoices = voices.filter((v) => v.lang.startsWith('en'));

      let chosenVoice = null;
      const voiceId = entry.voice_id || '';
      const speakerName = (entry.speaker_name || entry.character_id || 'narrator').toLowerCase();

      // 1. Match voice_id, mac_* profile, or character
      if (entry._matchName) {
        chosenVoice = enVoices.find((v) => v.name.toLowerCase().includes(entry._matchName.toLowerCase()));
      }
      if (!chosenVoice && voiceId) {
        const cleanVoiceMatch = voiceId.replace(/^mac_/i, '').toLowerCase();
        chosenVoice = enVoices.find((v) => v.name.toLowerCase().includes(cleanVoiceMatch));
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
      const globalRate = playbackRateRef.current || 1.0;
      if (typeof entry._pitch === 'number') {
        utterance.pitch = entry._pitch;
        utterance.rate = (typeof entry._rate === 'number' ? entry._rate : 1.0) * globalRate;
      } else if (speakerName.includes('narrator')) {
        utterance.pitch = 1.0;
        utterance.rate = 1.0 * globalRate;
      } else {
        const hash = speakerName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        utterance.pitch = 0.85 + (hash % 7) * 0.06;
        utterance.rate = 1.0 * globalRate;
      }

      const effectiveRate = Math.max(0.25, utterance.rate || 1.0);
      const estDurationSec = Math.max(1.2, cleanText.length / (14 * effectiveRate));
      const startTimeMs = Date.now();
      let lastBoundaryAtMs = startTimeMs;

      const clearFallbackTimer = () => {
        if (speechFallbackTimerRef.current) {
          clearInterval(speechFallbackTimerRef.current);
          speechFallbackTimerRef.current = null;
        }
      };

      // Intra-segment word progress tracking via boundary events
      utterance.onboundary = (e) => {
        if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
        lastBoundaryAtMs = Date.now();
        const denom = cleanText.length || rawText.length;
        if (typeof e.charIndex === 'number' && denom > 0) {
          const prog = Math.min(1, Math.max(0, e.charIndex / denom));
          setSegmentProgress(prog);
          const segDuration = Math.max(200, (entry.end_ms || 0) - (entry.start_ms || 0));
          const estMs = Math.round((entry.start_ms || 0) + prog * segDuration);
          setCurrentTimeMs(estMs);
        }
      };

      // 50ms fallback timer whenever onboundary has not fired in the last 400ms
      clearFallbackTimer();
      const timerId = setInterval(() => {
        if (myGen !== speechGenRef.current || speechCancelledRef.current) {
          clearInterval(timerId);
          if (speechFallbackTimerRef.current === timerId) {
            speechFallbackTimerRef.current = null;
          }
          return;
        }
        const now = Date.now();
        if (now - lastBoundaryAtMs > 400) {
          const elapsedSec = (now - startTimeMs) / 1000;
          const prog = Math.min(0.98, Math.max(0, elapsedSec / estDurationSec));
          setSegmentProgress(prog);
          const segDuration = Math.max(200, (entry.end_ms || 0) - (entry.start_ms || 0));
          const estMs = Math.round((entry.start_ms || 0) + prog * segDuration);
          setCurrentTimeMs(estMs);
        }
      }, 50);
      speechFallbackTimerRef.current = timerId;

      utterance.onend = () => {
        clearFallbackTimer();
        if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
        setSegmentProgress(1.0);
        setCurrentTimeMs(entry.end_ms || entry.start_ms || 0);
        advanceToNextSegment(targetSegId);
      };

      utterance.onerror = () => {
        clearFallbackTimer();
        if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
        advanceToNextSegment(targetSegId);
      };

      window.speechSynthesis.speak(utterance);
    },
    [advanceToNextSegment]
  );

  // Main speech dispatcher: attempts /api/voices/speak -> falls back to window.speechSynthesis
  const speakActiveSegment = useCallback(
    (targetSegId, startFraction = 0) => {
      stopSpeech();
      speechCancelledRef.current = false;
      const myGen = ++speechGenRef.current;

      // Cleanly pause studio audio before playing TTS speech
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (_) {}
      }

      const entryIndex = timeline.findIndex(
        (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === targetSegId
      );
      if (entryIndex === -1) return;
      const entry = timeline[entryIndex];

      const rawText = entry.text || '';
      const cleanText = rawText.replace(/\[IMAGE:[^\]]*\]/gi, '').trim();
      if (!cleanText) {
        advanceToNextSegment(targetSegId);
        return;
      }

      const rawCharId = String(entry.character_id || entry.speaker_id || '').trim();
      const rawCharIdLower = rawCharId.toLowerCase();
      const isNarrator = entry.type === 'narration' || rawCharIdLower === 'narrator';

      // For unattributed dialogue ('unresolved' or empty character_id), alternate speaker keys by dialogue turn index
      let resolvedCharacterId = entry.character_id || '';
      if (!isNarrator && (!rawCharId || rawCharIdLower === 'unresolved')) {
        let dialogueTurnIndex = 0;
        for (let i = 0; i < entryIndex; i += 1) {
          const prev = timeline[i];
          const prevChar = String(prev?.character_id || prev?.speaker_id || '').trim().toLowerCase();
          const prevIsNarrator = prev?.type === 'narration' || prevChar === 'narrator';
          if (!prevIsNarrator) {
            dialogueTurnIndex += 1;
          }
        }
        resolvedCharacterId = dialogueTurnIndex % 2 === 0 ? 'dialogue_turn_even' : 'dialogue_turn_odd';
      }

      const lookupKeys = [resolvedCharacterId, rawCharId, entry.speaker_name]
        .filter(Boolean)
        .map((k) => String(k).trim().toLowerCase());
      let charProfile = null;
      for (const k of lookupKeys) {
        if (resolvedCharacterMap.has(k)) {
          charProfile = resolvedCharacterMap.get(k);
          break;
        }
      }

      const entryGender = entry.gender || charProfile?.gender || '';
      const mixedEntry =
        mixedCastMap.get(rawCharIdLower) ||
        mixedCastMap.get(String(resolvedCharacterId || '').toLowerCase()) ||
        null;
      const resolvedCastSlot =
        entry.cast_slot !== undefined && entry.cast_slot !== null
          ? entry.cast_slot
          : entry.slot !== undefined && entry.slot !== null
            ? entry.slot
            : charProfile?.cast_slot !== undefined && charProfile?.cast_slot !== null
              ? charProfile.cast_slot
              : mixedEntry && mixedEntry.slot !== undefined && mixedEntry.slot !== null
                ? mixedEntry.slot
                : null;

      const currentEngine = ttsEngineRef.current || ttsEngine || 'msedge-tts';
      let targetVoiceId =
        entry.assigned_voice_id || entry.voice_id || charProfile?.voice_id || charProfile?.assigned_voice_id || '';
      let targetEngine = currentEngine;

      if (currentEngine === 'msedge-tts' && !targetVoiceId) {
        targetVoiceId = 'en-GB-RyanNeural';
      } else if ((currentEngine === 'kokoro-tts' || currentEngine === 'paradee-tts') && !targetVoiceId) {
        targetVoiceId = 'bm_fable';
      }

      const novelId = entry.novel_id || novelIdRef.current || currentNovelId || '';
      const chapterId = entry.chapter_id || chapterIdRef.current || currentChapterId || '';
      const effectiveEntry =
        resolvedCharacterId !== (entry.character_id || '') || entryGender !== (entry.gender || '')
          ? { ...entry, character_id: resolvedCharacterId, gender: entryGender || entry.gender }
          : entry;

      // Try /api/voices/speak with selected engine (including machine-tts first; fallback to window.speechSynthesis)
      if (!apiSpeakFailedRef.current && typeof Audio !== 'undefined') {
        const voiceParam = encodeURIComponent(targetVoiceId);
        const textParam = encodeURIComponent(cleanText);
        const engineParam = encodeURIComponent(targetEngine);
        const charIdParam = encodeURIComponent(resolvedCharacterId);
        const speakerNameParam = encodeURIComponent(entry.speaker_name || '');
        const novelIdParam = encodeURIComponent(novelId);
        const chapterIdParam = encodeURIComponent(chapterId);

        let speakUrl = `/api/voices/speak?text=${textParam}&voice_id=${voiceParam}&engine=${engineParam}&character_id=${charIdParam}&speaker_name=${speakerNameParam}&is_narrator=${isNarrator}&novel_id=${novelIdParam}&chapter_id=${chapterIdParam}`;
        if (entryGender) {
          speakUrl += `&gender=${encodeURIComponent(entryGender)}`;
        }
        if (resolvedCastSlot !== null && resolvedCastSlot !== '') {
          speakUrl += `&cast_slot=${encodeURIComponent(String(resolvedCastSlot))}`;
        }

        if (!secondaryAudioRef.current) {
          secondaryAudioRef.current = new Audio();
        }

        const secAudio = secondaryAudioRef.current;
        secAudio.src = speakUrl;
        secAudio.playbackRate = playbackRateRef.current || 1.0;

        let secRafActive = false;
        const cancelSecRaf = () => {
          secRafActive = false;
          if (ttsRafRef.current) {
            cancelAnimationFrame(ttsRafRef.current);
            ttsRafRef.current = 0;
          }
        };

        const tickSecProgress = () => {
          if (
            !secRafActive ||
            myGen !== speechGenRef.current ||
            speechCancelledRef.current ||
            playbackModeRef.current !== 'tts'
          ) {
            cancelSecRaf();
            return;
          }
          if (secAudio.ended) {
            cancelSecRaf();
            return;
          }
          if (secAudio.duration > 0 && !Number.isNaN(secAudio.duration)) {
            const prog = Math.min(1, Math.max(0, secAudio.currentTime / secAudio.duration));
            setSegmentProgress(prog);
            const segDuration = Math.max(200, (entry.end_ms || 0) - (entry.start_ms || 0));
            const estMs = Math.round((entry.start_ms || 0) + prog * segDuration);
            setCurrentTimeMs(estMs);
          }
          ttsRafRef.current = requestAnimationFrame(tickSecProgress);
        };

        const startSecRaf = () => {
          if (secRafActive || myGen !== speechGenRef.current || speechCancelledRef.current) return;
          if (typeof requestAnimationFrame !== 'function') return;
          secRafActive = true;
          ttsRafRef.current = requestAnimationFrame(tickSecProgress);
        };

        secAudio.onplay = () => {
          startSecRaf();
        };

        secAudio.onpause = () => {
          cancelSecRaf();
        };

        secAudio.onerror = () => {
          cancelSecRaf();
          if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
          // Fallback to client synthesis for this utterance as a true offline fallback
          speakWithSpeechSynthesis(effectiveEntry, targetSegId, myGen);
        };

        secAudio.ontimeupdate = () => {
          if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
          if (secAudio.duration > 0) {
            const prog = Math.min(1, Math.max(0, secAudio.currentTime / secAudio.duration));
            setSegmentProgress(prog);
            const segDuration = Math.max(200, (entry.end_ms || 0) - (entry.start_ms || 0));
            const estMs = Math.round((entry.start_ms || 0) + prog * segDuration);
            setCurrentTimeMs(estMs);
          }
        };

        secAudio.onended = () => {
          cancelSecRaf();
          if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
          setSegmentProgress(1.0);
          advanceToNextSegment(targetSegId);
        };

        const playPromise = secAudio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              startSecRaf();
            })
            .catch(() => {
              cancelSecRaf();
              if (myGen !== speechGenRef.current || speechCancelledRef.current) return;
              speakWithSpeechSynthesis(effectiveEntry, targetSegId, myGen);
            });
        } else {
          startSecRaf();
        }
      } else {
        speakWithSpeechSynthesis(effectiveEntry, targetSegId, myGen);
      }
    },
    [
      timeline,
      advanceToNextSegment,
      speakWithSpeechSynthesis,
      ttsEngine,
      currentNovelId,
      currentChapterId,
      stopSpeech,
      resolvedCharacterMap,
      mixedCastMap,
    ]
  );

  speakActiveSegmentRef.current = speakActiveSegment;

  const changeTtsEngine = useCallback(
    (newEngine) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('synctone_tts_engine', newEngine);
        }
      } catch (_) {}
      ttsEngineRef.current = newEngine;
      setTtsEngine(newEngine);
      apiSpeakFailedRef.current = false;
      stopSpeech();
      if (isPlaying && playbackModeRef.current === 'tts' && activeSegmentId !== -1) {
        speakActiveSegmentRef.current?.(activeSegmentId, segmentProgress);
      }
    },
    [stopSpeech, isPlaying, activeSegmentId, segmentProgress]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorageChange = (e) => {
      if (e.key === 'synctone_tts_engine' && e.newValue && e.newValue !== ttsEngineRef.current) {
        changeTtsEngine(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [changeTtsEngine]);

  // Structural timeline identity so in-place voice updates do not reset active playback position
  const timelineIdentity = useMemo(() => {
    if (!Array.isArray(timeline) || timeline.length === 0) return 'empty';
    return timeline
      .map((t, idx) => {
        const id = t.segment_id !== undefined ? t.segment_id : t.order !== undefined ? t.order : idx;
        const charId = t.character_id || t.speaker_id || '';
        const textHead = String(t.text || '').slice(0, 24);
        return `${id}:${charId}:${textHead}`;
      })
      .join('|');
  }, [timeline]);

  const prevTimelineIdentityRef = useRef(timelineIdentity);

  useEffect(() => {
    apiSpeakFailedRef.current = false;
    if (prevTimelineIdentityRef.current === timelineIdentity && timelineIdentity !== 'empty') {
      // Only voice assignments / metadata updated on the current chapter
      return;
    }
    prevTimelineIdentityRef.current = timelineIdentity;
    lastActiveSegIdRef.current = -1;
    setActiveSegmentId(-1);
    setCurrentTimeMs(0);
    setSegmentProgress(0);
    setIsPlaying(false);
    stopSpeech();
  }, [timelineIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronized animation loop (60fps audio clock for Studio Track mode)
  const syncLoop = useCallback(() => {
    if (!audioRef.current || !isPlaying) return;

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

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(syncLoop);
    }
  }, [timeline, onSegmentChange, isPlaying]);

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
    if (onChapterEnded) {
      onChapterEnded();
    }
  }, [stopSpeech, onChapterEnded]);

  const handleAudioError = useCallback(() => {
    // On studio audio failure or 404, immediately switch to 'tts' mode to continue reading uninterrupted
    if (playbackModeRef.current === 'studio') {
      playbackModeRef.current = 'tts';
      setPlaybackMode('tts');
      if (isPlaying) {
        const currentId =
          activeSegmentId !== -1
            ? activeSegmentId
            : timeline[0]?.segment_id ?? timeline[0]?.order ?? 1;
        if (currentId !== -1 && speakActiveSegmentRef.current) {
          speakActiveSegmentRef.current(currentId, 0);
        }
      }
    }
  }, [isPlaying, activeSegmentId, timeline]);

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
        lastActiveSegIdRef.current = segmentId;
        setActiveSegmentId(segmentId);
        setCurrentTimeMs(entry.start_ms);
        setSegmentProgress(0);
        setIsPlaying(true);

        if (playbackModeRef.current === 'tts') {
          // Cleanly pause studio audio before playing TTS speech
          if (audioRef.current) {
            try {
              audioRef.current.pause();
              audioRef.current.currentTime = targetSec;
            } catch (_) {}
          }
          stopSpeech();
          speakActiveSegment(segmentId, 0);
        } else {
          // Cleanly pause secondaryAudioRef before playing studio audio
          stopSpeech();
          if (audioRef.current) {
            audioRef.current.currentTime = targetSec;
            audioRef.current.play().catch(() => {});
          }
        }
      }
    },
    [timeline, stopSpeech, speakActiveSegment]
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
        if (playbackModeRef.current === 'tts') {
          if (audioRef.current) {
            try {
              audioRef.current.pause();
            } catch (_) {}
          }
          if (segId !== -1) {
            stopSpeech();
            speakActiveSegment(segId, 0);
          }
        } else {
          stopSpeech();
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }
      }
    },
    [timeline, stopSpeech, speakActiveSegment]
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    if (playbackModeRef.current === 'tts') {
      // Cleanly pause studio audio before playing TTS speech
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (_) {}
      }
      let targetId = activeSegmentId;
      if (targetId === -1 && timeline.length > 0) {
        targetId = timeline[0].segment_id !== undefined ? timeline[0].segment_id : timeline[0].order;
        setActiveSegmentId(targetId);
        lastActiveSegIdRef.current = targetId;
      }
      if (targetId !== -1) {
        speakActiveSegment(targetId, segmentProgress);
      }
    } else {
      // Cleanly pause secondaryAudioRef before playing studio audio
      stopSpeech();
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [activeSegmentId, timeline, segmentProgress, speakActiveSegment, stopSpeech]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    stopSpeech();
    if (audioRef.current && playbackModeRef.current === 'studio') {
      audioRef.current.pause();
      setCurrentTimeMs(Math.round(audioRef.current.currentTime * 1000));
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
    playbackRateRef.current = rate || 1.0;
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    if (secondaryAudioRef.current) {
      secondaryAudioRef.current.playbackRate = rate;
    }
  }, []);

  const togglePlaybackMode = useCallback((targetMode) => {
    // Never corrupt playbackMode state with event objects
    const validMode =
      typeof targetMode === 'string' && (targetMode === 'tts' || targetMode === 'studio')
        ? targetMode
        : null;

    setPlaybackMode((prev) => {
      const next = validMode || (prev === 'tts' ? 'studio' : 'tts');
      if (next === prev) return prev;

      playbackModeRef.current = next;

      if (next === 'tts') {
        // Switching from Studio Track -> Voice TTS
        // 1. Cleanly pause audioRef before playing TTS speech
        if (audioRef.current) {
          try {
            audioRef.current.pause();
          } catch (_) {}
        }

        // 2. Maintain current timestamp/segment position (do NOT reset clock to 0:00)
        const currentMs =
          audioRef.current && !isNaN(audioRef.current.currentTime) && audioRef.current.currentTime > 0
            ? Math.round(audioRef.current.currentTime * 1000)
            : currentTimeMs;
        setCurrentTimeMs(currentMs);

        const currentSegId =
          activeSegmentId !== -1 ? activeSegmentId : findActiveSegment(timeline, currentMs);
        const targetId =
          currentSegId !== -1 ? currentSegId : (timeline[0]?.segment_id ?? timeline[0]?.order ?? 1);

        if (targetId !== -1) {
          setActiveSegmentId(targetId);
          lastActiveSegIdRef.current = targetId;
          const entry = timeline.find(
            (t) => (t.segment_id !== undefined ? t.segment_id : t.order) === targetId
          );
          if (entry && entry.end_ms > entry.start_ms && currentMs >= entry.start_ms) {
            setSegmentProgress(
              Math.min(1, Math.max(0, (currentMs - entry.start_ms) / (entry.end_ms - entry.start_ms)))
            );
          }
        }

        if (isPlaying && targetId !== -1) {
          speakActiveSegmentRef.current?.(targetId, 0);
        }
      } else {
        // Switching from Voice TTS -> Studio Track
        // 1. Cleanly pause secondaryAudioRef before playing studio audio
        stopSpeech();

        // 2. Maintain current timestamp position in audioRef (do NOT reset clock to 0:00)
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(0, currentTimeMs / 1000);
          if (isPlaying) {
            audioRef.current.play().catch(() => {});
          }
        }
      }

      return next;
    });
  }, [isPlaying, activeSegmentId, timeline, currentTimeMs, stopSpeech]);

  const safeSetPlaybackMode = useCallback(
    (target) => {
      if (typeof target === 'function') {
        const next = target(playbackModeRef.current);
        if (next === 'tts' || next === 'studio') {
          togglePlaybackMode(next);
        }
      } else if (target === 'tts' || target === 'studio') {
        togglePlaybackMode(target);
      }
    },
    [togglePlaybackMode]
  );

  return {
    audioRef,
    secondaryAudioRef,
    activeSegmentId,
    isPlaying,
    currentTimeMs,
    duration,
    segmentProgress,
    playbackMode,
    setPlaybackMode: safeSetPlaybackMode,
    togglePlaybackMode,
    ttsReadAlongEnabled,
    ttsEngine,
    setTtsEngine: changeTtsEngine,
    changeTtsEngine,
    mixedCastMap,
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
    handleAudioError,
    handleError: handleAudioError,
    speakSegment: speakActiveSegment,
    stopSpeech,
  };
}

export default useAudioSync;
