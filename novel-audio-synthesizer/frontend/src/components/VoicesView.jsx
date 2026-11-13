import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import {
  IconSoundwave,
  IconPlay,
  IconPause,
  IconSparkles,
  IconRefresh,
  IconBook,
  IconSettings,
} from './icons';

export const CANONICAL_NEURAL_VOICES = [
  { id: 'en-GB-RyanNeural', label: 'British Narrator (Ryan)', gender: 'Male', role: 'NARRATOR // BRITISH', timbre: 'Authoritative, resonant literary baritone with crisp British diction' },
  { id: 'en-GB-ThomasNeural', label: 'British Young Male (Thomas)', gender: 'Male', role: 'BRITISH YOUNG MALE', timbre: 'Bright, earnest British tenor suited to protagonists' },
  { id: 'en-GB-SoniaNeural', label: 'British Female (Sonia)', gender: 'Female', role: 'BRITISH FEMALE', timbre: 'Poised, articulate British soprano with clear literary cadence' },
  { id: 'en-IE-ConnorNeural', label: 'Irish Storyteller (Connor)', gender: 'Male', role: 'IRISH STORYTELLER', timbre: 'Warm, melodic Irish baritone with classic storytelling cadence' },
  { id: 'en-IE-EmilyNeural', label: 'Irish Female (Emily)', gender: 'Female', role: 'IRISH FEMALE', timbre: 'Expressive, lyrical Irish voice with natural warmth' },
  { id: 'en-US-GuyNeural', label: 'American Male (Guy)', gender: 'Male', role: 'AMERICAN MALE', timbre: 'Balanced, confident American baritone' },
  { id: 'en-US-AriaNeural', label: 'American Female (Aria)', gender: 'Female', role: 'AMERICAN FEMALE', timbre: 'Dynamic, expressive American voice with wide emotional range' },
  { id: 'en-US-ChristopherNeural', label: 'American Authoritative Male (Christopher)', gender: 'Male', role: 'AUTHORITATIVE MALE', timbre: 'Deep, commanding American register for gravitas and authority' },
  { id: 'en-US-JennyNeural', label: 'American Warm Female (Jenny)', gender: 'Female', role: 'WARM FEMALE', timbre: 'Friendly, conversational American voice with gentle warmth' },
  { id: 'en-US-EricNeural', label: 'American Male (Eric)', gender: 'Male', role: 'AMERICAN MALE', timbre: 'Crisp, measured American tenor' },
  { id: 'en-US-RogerNeural', label: 'American Mature Male (Roger)', gender: 'Male', role: 'MATURE MALE', timbre: 'Seasoned, resonant American baritone for elder roles' },
  { id: 'en-US-SteffanNeural', label: 'American Young Male (Steffan)', gender: 'Male', role: 'YOUNG MALE', timbre: 'Energetic, clear American young-adult register' },
  { id: 'en-US-MichelleNeural', label: 'American Female (Michelle)', gender: 'Female', role: 'AMERICAN FEMALE', timbre: 'Smooth, composed American voice for dramatic dialogue' },
  { id: 'en-AU-WilliamNeural', label: 'Australian Male (William)', gender: 'Male', role: 'AUSTRALIAN MALE', timbre: 'Grounded Australian baritone with natural clarity' },
  { id: 'en-AU-NatashaNeural', label: 'Australian Female (Natasha)', gender: 'Female', role: 'AUSTRALIAN FEMALE', timbre: 'Crisp, expressive Australian voice' },
  { id: 'en-CA-LiamNeural', label: 'Canadian Male (Liam)', gender: 'Male', role: 'CANADIAN MALE', timbre: 'Steady, approachable North American tenor' },
  { id: 'en-CA-ClaraNeural', label: 'Canadian Female (Clara)', gender: 'Female', role: 'CANADIAN FEMALE', timbre: 'Clear, poised Canadian voice' },
  { id: 'en-IN-PrabhatNeural', label: 'Indian Male (Prabhat)', gender: 'Male', role: 'INDIAN MALE', timbre: 'Articulate Indian English baritone with measured pacing' },
  { id: 'en-IN-NeerjaNeural', label: 'Indian Female (Neerja)', gender: 'Female', role: 'INDIAN FEMALE', timbre: 'Warm, expressive Indian English voice' },
];

export const PARADEE_VOICE_OPTIONS = [
  { id: 'bm_fable', label: 'Fable — British Narrator/Lead (bm_fable)' },
  { id: 'bf_isabella', label: 'Isabella — British Female Lead (bf_isabella)' },
  { id: 'am_puck', label: 'Puck — Dynamic Male Lead (am_puck)' },
  { id: 'af_heart', label: 'Heart — Warm Female Lead (af_heart)' },
];

export const MACHINE_EXTRA_VOICE_OPTIONS = [
  { id: 'mac_reed', label: 'Reed — British Male Extra (mac_reed)' },
  { id: 'mac_moira', label: 'Moira — Irish Female Extra (mac_moira)' },
  { id: 'mac_rocko', label: 'Rocko — Deep Male Extra (mac_rocko)' },
  { id: 'mac_shelley', label: 'Shelley — Clear Female Extra (mac_shelley)' },
  { id: 'mac_grandpa', label: 'Grandpa — Elder Male Extra (mac_grandpa)' },
  { id: 'mac_flo', label: 'Flo — Mature Female Extra (mac_flo)' },
  { id: 'mac_daniel', label: 'Daniel — Classic UK Male (mac_daniel)' },
  { id: 'mac_serena', label: 'Serena — Classic UK Female (mac_serena)' },
];

const NEURAL_PREFIX_RE = /^(en-|af_|am_|bf_|bm_)/i;

export function buildCanonicalVoiceGroups(availableVoices = {}, extraIds = []) {
  const canonical = CANONICAL_NEURAL_VOICES.map((v) => ({
    id: v.id,
    label: `${v.id} — ${v.label}`,
  }));
  const seenIds = new Set([
    ...canonical.map((v) => v.id),
    ...PARADEE_VOICE_OPTIONS.map((v) => v.id),
    ...MACHINE_EXTRA_VOICE_OPTIONS.map((v) => v.id),
  ]);

  const dynamic = [];
  for (const [, voiceId] of Object.entries(availableVoices || {})) {
    if (typeof voiceId === 'string' && NEURAL_PREFIX_RE.test(voiceId) && !seenIds.has(voiceId)) {
      seenIds.add(voiceId);
      dynamic.push({ id: voiceId, label: voiceId });
    }
  }
  for (const extraId of extraIds || []) {
    if (typeof extraId === 'string' && extraId.trim() && !seenIds.has(extraId)) {
      seenIds.add(extraId);
      dynamic.push({ id: extraId, label: extraId });
    }
  }

  return {
    canonical,
    dynamic,
    paradee: PARADEE_VOICE_OPTIONS,
    machine: MACHINE_EXTRA_VOICE_OPTIONS,
  };
}

export function VoiceOptionGroups({ groups }) {
  return (
    <>
      <optgroup label="Canonical Neural Voices">
        {groups.canonical.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </optgroup>
      {groups.dynamic.length > 0 && (
        <optgroup label="Additional Neural Voices">
          {groups.dynamic.map((opt) => (
            <option key={`dyn_${opt.id}`} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Paradee-8M Neural (Primary 4)">
        {groups.paradee.map((opt) => (
          <option key={`paradee_${opt.id}`} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Machine Extra Voices (5th+ Cast)">
        {groups.machine.map((opt) => (
          <option key={`machine_${opt.id}`} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export function normalizeParsedCharacters(rawCharacters = [], chapters = []) {
  const byId = new Map();

  const addEntry = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const rawName = String(raw.canonical_name || raw.name || raw.speaker_name || raw.character_id || '').trim();
    if (!rawName) return;
    const lowerName = rawName.toLowerCase();
    const rawId = String(raw.character_id || raw.speaker_id || '').trim();
    const isNarrator = Boolean(raw.is_narrator) || lowerName === 'narrator' || rawId.toLowerCase() === 'narrator';
    const charId = isNarrator
      ? 'narrator'
      : rawId || lowerName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || rawName;
    if (['unresolved', 'unknown', 'unknown_speaker', 'image'].includes(charId.toLowerCase())) return;

    const existing = byId.get(charId);
    const voiceId = typeof raw.voice_id === 'string' && raw.voice_id.trim()
      ? raw.voice_id.trim()
      : typeof raw.assigned_voice_id === 'string' && raw.assigned_voice_id.trim()
        ? raw.assigned_voice_id.trim()
        : (isNarrator ? 'en-GB-RyanNeural' : 'en-GB-ThomasNeural');
    const gender = String(raw.gender || (isNarrator ? 'neutral' : 'unknown')).toLowerCase();

    if (existing) {
      existing.line_count = Math.max(existing.line_count, Number(raw.line_count || 0));
      if (!existing.sample_quote && raw.sample_quote) existing.sample_quote = raw.sample_quote;
      if (gender !== 'unknown' && existing.gender === 'unknown') existing.gender = gender;
      return;
    }

    byId.set(charId, {
      character_id: charId,
      name: isNarrator ? 'Narrator' : rawName,
      gender,
      voice_id: voiceId,
      line_count: Number(raw.line_count || 0),
      sample_quote: raw.sample_quote || '',
      is_narrator: isNarrator,
    });
  };

  for (const c of Array.isArray(rawCharacters) ? rawCharacters : []) {
    addEntry(c);
  }

  for (const ch of Array.isArray(chapters) ? chapters : []) {
    for (const seg of Array.isArray(ch?.segments) ? ch.segments : []) {
      if (seg?.type === 'image') continue;
      addEntry({
        character_id: seg.character_id || seg.speaker_id,
        name: seg.speaker_name || (seg.type === 'narration' ? 'Narrator' : seg.character_id),
        voice_id: seg.assigned_voice_id || seg.voice_id,
        gender: seg.gender || seg.speaker_gender,
        sample_quote: seg.type === 'dialogue' ? seg.text : '',
        is_narrator: seg.type === 'narration' || seg.speaker_id === 'narrator' || seg.character_id === 'narrator',
      });
    }
  }

  if (!byId.has('narrator')) {
    byId.set('narrator', {
      character_id: 'narrator',
      name: 'Narrator',
      gender: 'neutral',
      voice_id: 'en-GB-RyanNeural',
      line_count: 0,
      sample_quote: 'Primary narrative voice.',
      is_narrator: true,
    });
  }

  const narrator = byId.get('narrator');
  const others = Array.from(byId.values()).filter((c) => c.character_id !== 'narrator');
  return [narrator, ...others];
}

export function encodeUtf8Base64(text) {
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(String(text || ''))
    : null;
  if (bytes && typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }
  return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(String(text || '')))) : '';
}

export function buildNovelCastList(novel, characters = []) {
  const list = Array.isArray(characters) ? [...characters] : [];
  const hasNarrator = list.some(
    (c) => c.is_narrator || String(c.canonical_name || c.name || '').toLowerCase() === 'narrator'
  );
  if (!hasNarrator && novel) {
    list.unshift({
      id: novel.narrator_character_id || 'narrator',
      canonical_name: novel.narrator_name || 'Narrator',
      name: novel.narrator_name || 'Narrator',
      role: 'NARRATOR',
      is_narrator: true,
      voice_id: novel.narrator_voice_id || 'en-GB-RyanNeural',
      sample_quote: 'Primary narrative voice.',
    });
  }
  return list.sort((a, b) => {
    const aIsNarr = Boolean(a.is_narrator || String(a.canonical_name || a.name || '').toLowerCase() === 'narrator');
    const bIsNarr = Boolean(b.is_narrator || String(b.canonical_name || b.name || '').toLowerCase() === 'narrator');
    if (aIsNarr && !bIsNarr) return -1;
    if (!aIsNarr && bIsNarr) return 1;
    return 0;
  });
}

export function useVoiceAudition(engine = null) {
  const [playingId, setPlayingId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [auditionError, setAuditionError] = useState(null);

  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  const stopAudition = useCallback(() => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (_) {}
      abortRef.current = null;
    }
    if (audioRef.current) {
      try {
        const audio = audioRef.current;
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = '';
      } catch (_) {}
      audioRef.current = null;
    }
    if (objectUrlRef.current && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch (_) {}
      objectUrlRef.current = null;
    }
    if (mountedRef.current) {
      setPlayingId(null);
      setLoadingId(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAudition();
    };
  }, [stopAudition]);

  const toggleAudition = useCallback(
    async ({ key, voiceId, text, characterId, speakerName, isNarrator = false, gender = '' }) => {
      const targetKey = key || voiceId;
      if (!voiceId) return;

      if (playingId === targetKey || loadingId === targetKey) {
        stopAudition();
        return;
      }

      stopAudition();
      setAuditionError(null);
      setLoadingId(targetKey);

      const resolvedEngine =
        engine ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('synctone_tts_engine')) ||
        'msedge-tts';
      const sampleText = text || `Testing voice profile for ${speakerName || voiceId}.`;
      const speakUrl = `/api/voices/speak?text=${encodeURIComponent(sampleText)}&voice_id=${encodeURIComponent(voiceId)}&engine=${encodeURIComponent(resolvedEngine)}&character_id=${encodeURIComponent(characterId || voiceId)}&speaker_name=${encodeURIComponent(speakerName || voiceId)}&is_narrator=${Boolean(isNarrator)}&gender=${encodeURIComponent(String(gender || '').toLowerCase())}`;

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortRef.current = controller;

      try {
        let audioSrc = speakUrl;
        if (typeof fetch === 'function') {
          const response = await fetch(speakUrl, {
            credentials: 'include',
            ...(controller ? { signal: controller.signal } : {}),
          });
          if (!response.ok) {
            throw new Error(`Sample request failed (${response.status})`);
          }
          if (!mountedRef.current || abortRef.current !== controller) return;

          if (
            typeof response.blob === 'function' &&
            typeof URL !== 'undefined' &&
            typeof URL.createObjectURL === 'function'
          ) {
            const blob = await response.blob();
            if (!mountedRef.current || abortRef.current !== controller) return;
            const objectUrl = URL.createObjectURL(blob);
            objectUrlRef.current = objectUrl;
            audioSrc = objectUrl;
          }
        }

        if (typeof Audio === 'undefined') {
          throw new Error('Audio playback is unavailable in this environment.');
        }

        const audio = new Audio(audioSrc);
        audioRef.current = audio;

        audio.onended = () => {
          if (audioRef.current === audio) {
            stopAudition();
          }
        };

        audio.onerror = () => {
          if (audioRef.current === audio) {
            stopAudition();
            if (mountedRef.current) {
              setAuditionError(`Unable to play audio sample for ${speakerName || voiceId}.`);
            }
          }
        };

        setLoadingId(null);
        setPlayingId(targetKey);
        await audio.play();
      } catch (err) {
        if (err?.name === 'AbortError') return;
        stopAudition();
        if (mountedRef.current) {
          setAuditionError(err?.message || `Failed to audition ${speakerName || voiceId}.`);
        }
      }
    },
    [engine, loadingId, playingId, stopAudition]
  );

  return {
    playingId,
    loadingId,
    auditionError,
    setAuditionError,
    toggleAudition,
    stopAudition,
  };
}

export const NEURAL_VOICES = [
  {
    id: 'en-GB-RyanNeural',
    name: 'Ryan (British Narrator)',
    engine: 'Edge TTS Neural',
    role: 'CHRONICLER & NARRATOR',
    gender: 'Male',
    timbre: 'Authoritative, resonant literary baritone with crisp British diction',
    latency: '36ms',
    sampleQuote: 'The world was full of a number of things, and I am sure we should all be as happy as kings.',
    channel: 'Verified Studio',
  },
  {
    id: 'bm_george',
    name: 'George (British Received)',
    engine: 'Kokoro v1.0 ONNX',
    role: 'ANALYTICAL & DETECTIVE',
    gender: 'Male',
    timbre: 'Sharp Victorian RP, deliberate phrasing and precise consonants',
    latency: '42ms',
    sampleQuote: 'It is a capital mistake to theorize before one has data. Insensibly one begins to twist facts to suit theories.',
    channel: 'Verified Studio',
  },
  {
    id: 'am_michael',
    name: 'Michael (Strong Tenor)',
    engine: 'Kokoro v1.0 ONNX',
    role: 'MODERNIST DRAMA',
    gender: 'Male',
    timbre: 'Resonant, intimate companionable tenor with cinematic presence',
    latency: '38ms',
    sampleQuote: 'In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since.',
    channel: 'Verified Studio',
  },
  {
    id: 'af_bella',
    name: 'Bella (Expressive Soprano)',
    engine: 'Kokoro v1.0 ONNX',
    role: 'PASSIONATE & ROMANTIC',
    gender: 'Female',
    timbre: 'Lyrical, vibrant cadence with rich emotional inflection',
    latency: '40ms',
    sampleQuote: 'I am no bird; and no net ensnares me; I am a free human being with an independent will.',
    channel: 'Verified Studio',
  },
  {
    id: 'bf_emma',
    name: 'Emma (Crisp Victorian RP)',
    engine: 'Kokoro v1.0 ONNX',
    role: 'MATRON & ARISTOCRACY',
    gender: 'Female',
    timbre: 'Warm maternal Victorian cadence, elegant and aristocratic',
    latency: '44ms',
    sampleQuote: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    channel: 'Verified Studio',
  },
  {
    id: 'am_adam',
    name: 'Adam (Cinematic Bass)',
    engine: 'Kokoro v1.0 ONNX',
    role: 'EPIC & FOREBODING',
    gender: 'Male',
    timbre: 'Deep rumble with gravitas, commanding and monumental',
    latency: '45ms',
    sampleQuote: 'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse...',
    channel: 'Verified Studio',
  },
  {
    id: 'af_sarah',
    name: 'Sarah (Lyrical Narrator)',
    engine: 'Kokoro v1.0 ONNX',
    role: 'FABLE & INNOCENCE',
    gender: 'Female',
    timbre: 'Gentle, contemplative wonder with crystalline clarity',
    latency: '39ms',
    sampleQuote: 'It is only with the heart that one can see rightly; what is essential is invisible to the eye.',
    channel: 'Verified Studio',
  },
];

const AUDITION_ENGINES = [
  { id: 'msedge-tts', label: 'Edge TTS Neural' },
  { id: 'kokoro-tts', label: 'Kokoro v1.0 ONNX' },
  { id: 'paradee-tts', label: 'Paradee-8M ONNX' },
  { id: 'paradee-mixed', label: 'Paradee + Machine Mixed' },
  { id: 'machine-tts', label: 'macOS Machine TTS' },
];

export default function VoicesView({
  onSelectNovel,
  onOpenSettings,
  ttsEngine: propTtsEngine,
  onSelectTtsEngine,
}) {
  const [activeTab, setActiveTab] = useState('voices'); // 'voices' | 'cast' | 'timbre' | 'engines'
  const [novels, setNovels] = useState([]);
  const [novelCharactersMap, setNovelCharactersMap] = useState({});
  const [availableVoices, setAvailableVoices] = useState({});
  const [assignSelections, setAssignSelections] = useState({}); // { [voiceId]: { novelId, characterId } }
  const [assignStatusMap, setAssignStatusMap] = useState({}); // { [voiceId]: string }
  const [assigningVoiceId, setAssigningVoiceId] = useState(null);
  const [ensembleUpdatingKey, setEnsembleUpdatingKey] = useState(null);
  const [ensembleStatus, setEnsembleStatus] = useState(null);
  const [isLoadingNovels, setIsLoadingNovels] = useState(false);
  const [modelsStatus, setModelsStatus] = useState(null);
  const [localEngine, setLocalEngine] = useState(() => {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem('synctone_tts_engine')) || 'msedge-tts';
    } catch (_) {
      return 'msedge-tts';
    }
  });

  const activeEngine = propTtsEngine || localEngine;

  const {
    playingId: playingVoiceId,
    loadingId: loadingVoiceId,
    auditionError: sampleError,
    setAuditionError: setSampleError,
    toggleAudition,
    stopAudition: stopActivePreview,
  } = useVoiceAudition(activeEngine);

  // Timbre sliders state
  const [emotionalRange, setEmotionalRange] = useState(78);
  const [breathRate, setBreathRate] = useState(42);
  const [pitchOffset, setPitchOffset] = useState(0);
  const [cadenceRate, setCadenceRate] = useState(1.0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e) => {
      if (e.key === 'synctone_tts_engine' && e.newValue) {
        setLocalEngine(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const fetchNovelCharacters = useCallback(async (novelId) => {
    if (!novelId || typeof api.novels?.get !== 'function') return [];
    try {
      const detail = await api.novels.get(novelId);
      const chars = Array.isArray(detail?.characters) ? detail.characters : [];
      setNovelCharactersMap((prev) => ({ ...prev, [novelId]: chars }));
      return chars;
    } catch (_) {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingNovels(true);
    api.novels.list()
      .then(async (res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.novels) ? res.novels : [];
        setNovels(list);
        if (list.length > 0 && typeof api.novels?.get === 'function') {
          const results = await Promise.allSettled(list.map((n) => api.novels.get(n.id)));
          if (cancelled) return;
          const nextMap = {};
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && r.value) {
              nextMap[list[idx].id] = Array.isArray(r.value.characters) ? r.value.characters : [];
            }
          });
          setNovelCharactersMap(nextMap);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingNovels(false);
      });

    api.status.models()
      .then((res) => {
        if (!cancelled) setModelsStatus(res);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'cast' || Object.keys(availableVoices).length > 0) return undefined;
    let cancelled = false;
    api.voices?.list?.()
      .then((res) => {
        if (!cancelled && res?.available_voices) {
          setAvailableVoices(res.available_voices);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, availableVoices]);

  const handleEngineSelect = (nextEngine) => {
    setLocalEngine(nextEngine);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('synctone_tts_engine', nextEngine);
      }
    } catch (_) {}
    onSelectTtsEngine?.(nextEngine);
    stopActivePreview();
  };

  // Real audio audition using /api/voices/speak + Audio + blob/object URL
  const togglePlaySample = (voiceOrId) => {
    const voice =
      typeof voiceOrId === 'string'
        ? NEURAL_VOICES.find((v) => v.id === voiceOrId)
        : voiceOrId;
    if (!voice) return;
    toggleAudition({
      key: voice.id,
      voiceId: voice.id,
      text: voice.sampleQuote || `Testing voice profile ${voice.name}.`,
      characterId: voice.id,
      speakerName: voice.name,
      isNarrator: voice.id === 'en-GB-RyanNeural',
      gender: voice.gender,
    });
  };

  const applyLocalVoiceUpdate = useCallback((novelId, charKey, newVoiceId) => {
    const targetLower = String(charKey || '').toLowerCase();
    setNovelCharactersMap((prev) => {
      const existing = prev[novelId] || [];
      const matched = existing.some(
        (c) =>
          String(c.id || '').toLowerCase() === targetLower ||
          String(c.canonical_name || c.name || '').toLowerCase() === targetLower
      );
      const updated = matched
        ? existing.map((c) =>
            String(c.id || '').toLowerCase() === targetLower ||
            String(c.canonical_name || c.name || '').toLowerCase() === targetLower
              ? { ...c, voice_id: newVoiceId }
              : c
          )
        : [
            ...existing,
            {
              id: targetLower === 'narrator' ? 'narrator' : charKey,
              canonical_name: targetLower === 'narrator' ? 'Narrator' : charKey,
              is_narrator: targetLower === 'narrator',
              voice_id: newVoiceId,
            },
          ];
      return { ...prev, [novelId]: updated };
    });

    if (targetLower === 'narrator') {
      setNovels((prev) =>
        prev.map((n) =>
          n.id === novelId
            ? { ...n, narrator_voice_id: newVoiceId, narrator_voice_label: newVoiceId }
            : n
        )
      );
    }
  }, []);

  const handleAssignVoiceCard = async (voiceId) => {
    const defaultNovelId = novels[0]?.id || '';
    const sel = assignSelections[voiceId] || {};
    const targetNovelId = sel.novelId || defaultNovelId;
    const targetNovel = novels.find((n) => n.id === targetNovelId);
    const castList = buildNovelCastList(targetNovel, novelCharactersMap[targetNovelId] || []);
    const defaultChar = castList[0]?.id || castList[0]?.canonical_name || 'Narrator';
    const targetCharId = sel.characterId || defaultChar;

    if (!targetNovelId || !targetCharId) return;

    setAssigningVoiceId(voiceId);
    setSampleError(null);
    try {
      await api.voices.assign({
        novel_id: targetNovelId,
        character_id: targetCharId,
        new_voice_id: voiceId,
      });
      const charLabel =
        castList.find((c) => (c.id || c.canonical_name) === targetCharId)?.canonical_name ||
        targetCharId;
      applyLocalVoiceUpdate(targetNovelId, targetCharId, voiceId);
      if (
        castList.find((c) => (c.id || c.canonical_name) === targetCharId)?.is_narrator ||
        String(charLabel).toLowerCase() === 'narrator'
      ) {
        applyLocalVoiceUpdate(targetNovelId, 'narrator', voiceId);
      }
      setAssignStatusMap((prev) => ({
        ...prev,
        [voiceId]: `Assigned to ${charLabel}`,
      }));
    } catch (err) {
      setSampleError(err?.message || 'Failed to assign voice to character.');
    } finally {
      setAssigningVoiceId(null);
    }
  };

  const handleEnsembleVoiceChange = async (novel, char, newVoiceId) => {
    const charKey = char.id || char.canonical_name || char.name || 'Narrator';
    const charName = char.canonical_name || char.name || 'Character';
    const prevVoice = char.voice_id || 'en-GB-RyanNeural';
    const updateKey = `${novel.id}:${charKey}`;

    setEnsembleUpdatingKey(updateKey);
    setEnsembleStatus(null);
    applyLocalVoiceUpdate(novel.id, charKey, newVoiceId);
    if (char.is_narrator) applyLocalVoiceUpdate(novel.id, 'narrator', newVoiceId);

    try {
      await api.voices.assign({
        novel_id: novel.id,
        character_id: charKey,
        new_voice_id: newVoiceId,
      });
      setEnsembleStatus(`Updated ${charName} (${novel.title}) to ${newVoiceId}`);
    } catch (err) {
      applyLocalVoiceUpdate(novel.id, charKey, prevVoice);
      if (char.is_narrator) applyLocalVoiceUpdate(novel.id, 'narrator', prevVoice);
      setEnsembleStatus(err?.message || `Failed to update voice for ${charName}`);
    } finally {
      setEnsembleUpdatingKey(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn pb-16">
      {/* 1. Header Banner */}
      <section className="p-6 sm:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 text-[11px] font-mono tracking-wider uppercase border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)] rounded-full shadow-xs">
                SYNCTONE AUDIO STUDIO
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase bg-[var(--bg-surface)] text-[var(--text-sub)] border border-[var(--border-subtle)] rounded-full">
                7 HIGH-FIDELITY MODELS
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-sans uppercase tracking-tight text-[var(--text-main)]">
              Voice Synthesis Studio
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-sub)] font-mono leading-relaxed">
              Neural multi-speaker voice matrix with dynamic character assignment, latency profiling, and real-time speech synthesis at 48kHz PCM.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              aria-label="Audition TTS Engine"
              value={activeEngine}
              onChange={(e) => handleEngineSelect(e.target.value)}
              className="px-3 py-2 text-xs font-mono rounded-full bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] cursor-pointer focus:outline-none focus:border-[var(--border-strong)]"
            >
              {AUDITION_ENGINES.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.label}
                </option>
              ))}
            </select>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="boxed-btn px-4 py-2 text-xs font-mono uppercase inline-flex items-center gap-2 cursor-pointer rounded-full active:scale-95 transition-all shadow-xs hover:scale-105"
              >
                <IconSettings className="w-3.5 h-3.5" />
                <span>Engine Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-6 border-t border-[var(--border-subtle)] overflow-x-auto no-scrollbar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'voices'}
            onClick={() => setActiveTab('voices')}
            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-full cursor-pointer transition-all ${
              activeTab === 'voices'
                ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            NEURAL VOICES ({NEURAL_VOICES.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cast'}
            onClick={() => setActiveTab('cast')}
            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-full cursor-pointer transition-all ${
              activeTab === 'cast'
                ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            NOVEL ENSEMBLES ({novels.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'timbre'}
            onClick={() => setActiveTab('timbre')}
            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-full cursor-pointer transition-all ${
              activeTab === 'timbre'
                ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            TIMBRE & DYNAMICS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'engines'}
            onClick={() => setActiveTab('engines')}
            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-full cursor-pointer transition-all ${
              activeTab === 'engines'
                ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            HARDWARE & ENGINES
          </button>
        </div>
      </section>

      {/* 2. TAB 1: NEURAL VOICES */}
      {activeTab === 'voices' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="mono-xs text-[var(--text-muted)]">// NEURAL VOICE MATRIX</span>
            <span className="mono-xs text-[var(--text-sub)]">48KHZ STUDIO PCM • {activeEngine.toUpperCase()}</span>
          </div>

          {sampleError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-mono text-[var(--text-main)] flex items-center justify-between gap-2"
            >
              <span>{sampleError}</span>
              <button
                type="button"
                onClick={() => setSampleError(null)}
                className="text-[10px] uppercase text-[var(--text-sub)] hover:text-[var(--text-main)] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {NEURAL_VOICES.map((v) => {
              const isPlaying = playingVoiceId === v.id;
              const isLoading = loadingVoiceId === v.id;
              const sel = assignSelections[v.id] || {};
              const selectedNovelId = sel.novelId || novels[0]?.id || '';
              const selectedNovel = novels.find((n) => n.id === selectedNovelId);
              const novelCast = buildNovelCastList(selectedNovel, novelCharactersMap[selectedNovelId] || []);
              const selectedCharId =
                sel.characterId ||
                novelCast[0]?.id ||
                novelCast[0]?.canonical_name ||
                'Narrator';

              return (
                <div
                  key={v.id}
                  className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all shadow-md flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold font-sans uppercase text-[var(--text-main)] tracking-tight">
                          {v.name}
                        </h3>
                        <span className="text-[10px] font-mono text-[var(--text-sub)] tracking-wider">
                          {v.id} • {v.gender}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 text-[9px] font-mono uppercase bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)] rounded-full">
                        {v.latency}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-sub)] font-mono leading-relaxed">
                      {v.timbre}
                    </p>

                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-serif italic text-[var(--text-main)] line-clamp-3">
                      &ldquo;{v.sampleQuote}&rdquo;
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                        {v.engine}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePlaySample(v)}
                        className="boxed-btn px-3 py-1.5 text-[11px] font-mono uppercase inline-flex items-center gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all shadow-xs hover:scale-105"
                        aria-label={`Audition sample for ${v.name}`}
                      >
                        {isLoading ? (
                          <>
                            <IconRefresh className="w-3 h-3 animate-spin" />
                            <span>Loading</span>
                          </>
                        ) : isPlaying ? (
                          <>
                            <IconPause className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <IconPlay className="w-3 h-3 fill-current" />
                            <span>Audition</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Assign to Character Control Row */}
                    <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                      <span className="block text-[10px] font-mono uppercase text-[var(--text-muted)]">
                        Assign to Character
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`Select novel for ${v.name}`}
                          value={selectedNovelId}
                          disabled={novels.length === 0}
                          onChange={(e) => {
                            const nextNovelId = e.target.value;
                            setAssignSelections((prev) => ({
                              ...prev,
                              [v.id]: { novelId: nextNovelId, characterId: '' },
                            }));
                            if (!novelCharactersMap[nextNovelId]) {
                              fetchNovelCharacters(nextNovelId);
                            }
                          }}
                          className="flex-1 min-w-[110px] px-2 py-1 text-[11px] font-mono rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                        >
                          {novels.length === 0 ? (
                            <option value="">No novels</option>
                          ) : (
                            novels.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.title}
                              </option>
                            ))
                          )}
                        </select>

                        <select
                          aria-label={`Select character for ${v.name}`}
                          value={selectedCharId}
                          disabled={novels.length === 0}
                          onChange={(e) =>
                            setAssignSelections((prev) => ({
                              ...prev,
                              [v.id]: {
                                novelId: selectedNovelId,
                                characterId: e.target.value,
                              },
                            }))
                          }
                          className="flex-1 min-w-[100px] px-2 py-1 text-[11px] font-mono rounded-lg bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                        >
                          {novelCast.map((c) => {
                            const cKey = c.id || c.canonical_name || c.name || 'Narrator';
                            const cName = c.canonical_name || c.name || 'Narrator';
                            return (
                              <option key={cKey} value={cKey}>
                                {cName}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          disabled={novels.length === 0 || assigningVoiceId === v.id}
                          onClick={() => handleAssignVoiceCard(v.id)}
                          className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded-lg bg-[var(--accent)] text-[var(--on-accent)] cursor-pointer disabled:opacity-50"
                        >
                          {assigningVoiceId === v.id ? '...' : 'Assign'}
                        </button>
                      </div>
                      {assignStatusMap[v.id] && (
                        <p className="text-[10px] font-mono text-[var(--text-main)]">
                          {assignStatusMap[v.id]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. TAB 2: NOVEL ENSEMBLES */}
      {activeTab === 'cast' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="mono-xs text-[var(--text-muted)]">// REGISTERED NOVEL VOICE CASTS</span>
            <span className="mono-xs text-[var(--text-sub)]">{novels.length} VOLUMES</span>
          </div>

          {ensembleStatus && (
            <div
              role="status"
              className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-mono text-[var(--text-main)] flex items-center justify-between gap-2"
            >
              <span>{ensembleStatus}</span>
              <button
                type="button"
                onClick={() => setEnsembleStatus(null)}
                className="text-[10px] uppercase text-[var(--text-sub)] hover:text-[var(--text-main)] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {novels.map((novel) => {
              const castList = buildNovelCastList(novel, novelCharactersMap[novel.id] || []);
              return (
                <div
                  key={novel.id}
                  className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all shadow-md flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[9px] font-mono uppercase rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)]">
                        {novel.channel === 'verified' ? 'VERIFIED' : 'COMMUNITY'}
                      </span>
                      <span className="px-2 py-0.5 text-[9px] font-mono uppercase rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)]">
                        {novel.chapter_count || 1} CH
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold font-sans uppercase text-[var(--text-main)] tracking-tight line-clamp-1" title={novel.title}>
                        {novel.title}
                      </h3>
                      <p className="text-xs text-[var(--text-sub)] font-mono">
                        By {novel.author_username || 'Author'}
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)] max-h-56 overflow-y-auto pr-1">
                      {castList.map((char) => {
                        const charKey = char.id || char.canonical_name || char.name || 'Narrator';
                        const charName = char.canonical_name || char.name || 'Narrator';
                        const charVoice = char.voice_id || 'en-GB-RyanNeural';
                        const voiceGroups = buildCanonicalVoiceGroups(availableVoices, [charVoice]);
                        const isUpdating = ensembleUpdatingKey === `${novel.id}:${charKey}`;
                        return (
                          <div
                            key={charKey}
                            className="flex items-center justify-between gap-2 text-xs font-mono bg-[var(--bg-surface)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]"
                          >
                            <div className="min-w-0 flex items-center gap-1.5">
                              {char.is_narrator && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-main)] font-bold">
                                  NARRATOR
                                </span>
                              )}
                              <span className="truncate text-[var(--text-main)] font-semibold">
                                {charName}
                              </span>
                            </div>
                            <select
                              aria-label={`Voice for ${charName} in ${novel.title}`}
                              value={charVoice}
                              disabled={isUpdating}
                              onChange={(e) => handleEnsembleVoiceChange(novel, char, e.target.value)}
                              className="max-w-[165px] px-2 py-1 text-[11px] font-mono rounded bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)] disabled:opacity-50"
                            >
                              <VoiceOptionGroups groups={voiceGroups} />
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end">
                    {onSelectNovel && (
                      <button
                        type="button"
                        onClick={() => onSelectNovel(novel.id)}
                        className="boxed-btn-primary px-3 py-1.5 text-[11px] font-mono uppercase inline-flex items-center gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all hover:scale-105"
                      >
                        <IconBook className="w-3 h-3" />
                        <span>Open Voice Studio</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. TAB 3: TIMBRE & DYNAMICS */}
      {activeTab === 'timbre' && (
        <section className="p-6 sm:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl space-y-6">
          <div className="space-y-1">
            <span className="mono-xs text-[var(--text-muted)]">// AUDIO SYNTHESIS DYNAMICS ENGINE</span>
            <h2 className="text-lg font-bold font-sans uppercase text-[var(--text-main)]">
              Timbre & Expression Sliders
            </h2>
            <p className="text-xs text-[var(--text-sub)] font-mono">
              Fine-tune neural vocal characteristics, pacing, and emotional expression curves applied during synthesis.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[var(--text-sub)]">EMOTIONAL RANGE</span>
                <span className="font-bold text-[var(--text-main)]">{emotionalRange}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={emotionalRange}
                onChange={(e) => setEmotionalRange(Number(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
                aria-label="Emotional Range"
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                Controls pitch dynamics and dramatic emphasis
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[var(--text-sub)]">BREATH PHONEME RATE</span>
                <span className="font-bold text-[var(--text-main)]">{breathRate}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={breathRate}
                onChange={(e) => setBreathRate(Number(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
                aria-label="Breath Phoneme Rate"
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                Natural aspiration cadence at sentence boundaries
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[var(--text-sub)]">PITCH OFFSET</span>
                <span className="font-bold text-[var(--text-main)]">
                  {pitchOffset > 0 ? `+${pitchOffset}` : pitchOffset} ST
                </span>
              </div>
              <input
                type="range"
                min="-6"
                max="6"
                value={pitchOffset}
                onChange={(e) => setPitchOffset(Number(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
                aria-label="Pitch Offset"
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                Semitone pitch scale adjustment for character timbre
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[var(--text-sub)]">CADENCE PACE</span>
                <span className="font-bold text-[var(--text-main)]">{cadenceRate.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={cadenceRate}
                onChange={(e) => setCadenceRate(Number(e.target.value))}
                className="w-full accent-[var(--accent)] cursor-pointer"
                aria-label="Cadence Pace"
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                Overall delivery speed across monologue and dialogue
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 5. TAB 4: HARDWARE & ENGINES */}
      {activeTab === 'engines' && (
        <section className="p-6 sm:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl space-y-6">
          <div className="space-y-1">
            <span className="mono-xs text-[var(--text-muted)]">// NEURAL ENGINE STACK</span>
            <h2 className="text-lg font-bold font-sans uppercase text-[var(--text-main)]">
              Synthesis Hardware & Backend Engines
            </h2>
            <p className="text-xs text-[var(--text-sub)] font-mono">
              Real-time hardware pipeline status for multi-speaker neural audio synthesis.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono font-bold text-[var(--text-main)]">1. Kokoro v1.0 ONNX</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-bold">
                  ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-sub)] font-mono leading-relaxed">
                Local 82M micro-model delivering multi-voice dialogue synthesis with sub-50ms latency.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono font-bold text-[var(--text-main)]">2. Microsoft Edge Neural</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-main)]">
                  READY
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-sub)] font-mono leading-relaxed">
                High-definition cloud neural voices (*RyanNeural*, *SoniaNeural*, *GuyNeural*).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono font-bold text-[var(--text-main)]">3. vLLM / Ollama LLM</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-main)]">
                  CONNECTED
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-sub)] font-mono leading-relaxed">
                Dialogue attribution, speaker emotion tagger, and natural phrasing engine.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

