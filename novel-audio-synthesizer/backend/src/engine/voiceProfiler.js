/**
 * SyncTone Engine - Character Voice Profiling & Registry Manager
 *
 * Maps named speakers to distinct, persistent Edge-TTS neural voices (and Kokoro/Paradee fallbacks)
 * while enforcing strict protections against registry poisoning, narrator-voice leakage,
 * and same-chapter cast collisions.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('../config');

/**
 * Legacy voice ID aliases mapped to currently available Edge-TTS voices.
 * Remaps deprecated Edge voices that fail synthesis on modern endpoints.
 */
const LEGACY_VOICE_ALIASES = {
  'en-GB-AlfieNeural': 'en-NZ-MitchellNeural',
  'en-GB-ArthurNeural': 'en-IE-ConnorNeural',
  'en-GB-NoahNeural': 'en-AU-WilliamMultilingualNeural',
  'en-GB-OliverNeural': 'en-GB-ThomasNeural',
  'en-GB-ElliotNeural': 'en-US-ChristopherNeural',
  'en-GB-EthanNeural': 'en-US-AndrewNeural',
  'en-GB-BellaNeural': 'en-GB-LibbyNeural',
  'en-GB-HollieNeural': 'en-GB-MaisieNeural',
  'en-GB-AbbiNeural': 'en-AU-NatashaNeural',
  'en-GB-OliviaNeural': 'en-US-AvaNeural',
  'en-US-Guy24kNeural': 'en-US-GuyNeural',
  'en-AU-WilliamNeural': 'en-AU-WilliamMultilingualNeural',
  'am_adam': 'en-GB-ThomasNeural',
};

/**
 * Generic placeholder/structural speaker keys that must NEVER be persisted
 * to voice_registry.json.
 */
const GENERIC_SPEAKER_KEYS = new Set([
  '',
  'unresolved',
  'unknown',
  'unknown_speaker',
  'dialogue_speaker',
  'speaker',
  'character',
  'speaker_a',
  'speaker_b',
  'dialogue_turn_even',
  'dialogue_turn_odd',
  'image',
  'illustration',
  'narrator',
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'st',
  'prof',
  'rev',
]);

/**
 * Unified Dual-Engine Voice Catalog (Microsoft Edge-TTS primary + Kokoro/Paradee fallback).
 * VOICE_PALETTE.narrator ('en-GB-RyanNeural') is strictly reserved for narration segments.
 */
const VOICE_CATALOG = {
  // Primary Narrator (exclusively reserved for narration segments)
  narrator: { primary: 'en-GB-RyanNeural', fallback: 'bm_george', gender: 'male', accent: 'British' },

  // Named Literary Archetypes
  harry: { primary: 'en-GB-ThomasNeural', fallback: 'bm_daniel', gender: 'male', accent: 'British' },
  hermione: { primary: 'en-GB-SoniaNeural', fallback: 'bf_emma', gender: 'female', accent: 'British' },
  ron: { primary: 'en-NZ-MitchellNeural', fallback: 'bm_lewis', gender: 'male', accent: 'Commonwealth' },
  dumbledore: { primary: 'en-IE-ConnorNeural', fallback: 'bm_fable', gender: 'male', accent: 'British/Irish' },
  snape: { primary: 'en-US-RogerNeural', fallback: 'am_onyx', gender: 'male', accent: 'Deep/Stern' },
  mcgonagall: { primary: 'en-GB-LibbyNeural', fallback: 'bf_alice', gender: 'female', accent: 'British' },
  draco: { primary: 'en-AU-WilliamMultilingualNeural', fallback: 'am_eric', gender: 'male', accent: 'Aristocratic' },
  hagrid: {
    primary: 'en-US-SteffanNeural',
    fallback: 'am_onyx',
    gender: 'male',
    accent: 'Heavy/Gruff',
    prosody: { rate: '-5%', pitch: '-25%' },
  },

  // Generic / Expanded Character Cast Archetypes (all verified live Edge-TTS voices)
  young_male: { primary: 'en-GB-ThomasNeural', fallback: 'bm_daniel', gender: 'male', accent: 'British' },
  calm_female: { primary: 'en-GB-LibbyNeural', fallback: 'af_bella', gender: 'female', accent: 'British' },
  energetic_female: { primary: 'en-GB-MaisieNeural', fallback: 'af_sarah', gender: 'female', accent: 'British' },
  deep_male: { primary: 'en-US-RogerNeural', fallback: 'am_michael', gender: 'male', accent: 'American' },
  british_male: { primary: 'en-CA-LiamNeural', fallback: 'bm_fable', gender: 'male', accent: 'Commonwealth' },
  lively_female: { primary: 'en-GB-SoniaNeural', fallback: 'bf_emma', gender: 'female', accent: 'British' },
  irish_female: { primary: 'en-IE-EmilyNeural', fallback: 'bf_lily', gender: 'female', accent: 'Irish' },
  kiwi_male: { primary: 'en-NZ-MitchellNeural', fallback: 'bm_lewis', gender: 'male', accent: 'New Zealand' },
  aussie_male: { primary: 'en-AU-WilliamMultilingualNeural', fallback: 'am_eric', gender: 'male', accent: 'Australian' },
  irish_male: { primary: 'en-IE-ConnorNeural', fallback: 'am_puck', gender: 'male', accent: 'Irish' },

  // Expanded Cast Slots for Large Chapters
  american_male_warm: { primary: 'en-US-ChristopherNeural', fallback: 'am_adam', gender: 'male', accent: 'American' },
  american_male_clear: { primary: 'en-US-AndrewNeural', fallback: 'am_michael', gender: 'male', accent: 'American' },
  american_male_crisp: { primary: 'en-US-EricNeural', fallback: 'am_eric', gender: 'male', accent: 'American' },
  american_male_steady: { primary: 'en-US-GuyNeural', fallback: 'am_fenrir', gender: 'male', accent: 'American' },
  american_male_calm: { primary: 'en-US-BrianNeural', fallback: 'bm_daniel', gender: 'male', accent: 'American' },

  aussie_female: { primary: 'en-AU-NatashaNeural', fallback: 'bf_isabella', gender: 'female', accent: 'Australian' },
  kiwi_female: { primary: 'en-NZ-MollyNeural', fallback: 'af_nova', gender: 'female', accent: 'New Zealand' },
  canadian_female: { primary: 'en-CA-ClaraNeural', fallback: 'af_sarah', gender: 'female', accent: 'Canadian' },
  american_female_clear: { primary: 'en-US-AriaNeural', fallback: 'af_heart', gender: 'female', accent: 'American' },
  american_female_warm: { primary: 'en-US-AvaNeural', fallback: 'af_bella', gender: 'female', accent: 'American' },
  american_female_soft: { primary: 'en-US-EmmaNeural', fallback: 'bf_emma', gender: 'female', accent: 'American' },
  american_female_bright: { primary: 'en-US-JennyNeural', fallback: 'af_nicole', gender: 'female', accent: 'American' },
  american_female_poised: { primary: 'en-US-MichelleNeural', fallback: 'bf_alice', gender: 'female', accent: 'American' },
};

// Backwards-compatible map of character archetype keys -> primary voice IDs
const VOICE_PALETTE = Object.fromEntries(
  Object.entries(VOICE_CATALOG).map(([key, val]) => [key, val.primary])
);

const MALE_VOICE_POOL = [
  'en-GB-ThomasNeural',
  'en-NZ-MitchellNeural',
  'en-IE-ConnorNeural',
  'en-AU-WilliamMultilingualNeural',
  'en-US-RogerNeural',
  'en-CA-LiamNeural',
  'en-US-ChristopherNeural',
  'en-US-AndrewNeural',
  'en-US-EricNeural',
  'en-US-GuyNeural',
  'en-US-BrianNeural',
  'en-US-SteffanNeural',
];

const FEMALE_VOICE_POOL = [
  'en-GB-SoniaNeural',
  'en-GB-LibbyNeural',
  'en-GB-MaisieNeural',
  'en-IE-EmilyNeural',
  'en-AU-NatashaNeural',
  'en-NZ-MollyNeural',
  'en-CA-ClaraNeural',
  'en-US-AriaNeural',
  'en-US-AvaNeural',
  'en-US-EmmaNeural',
  'en-US-JennyNeural',
  'en-US-MichelleNeural',
];

const ALL_CHARACTER_VOICE_POOL = [
  'en-GB-ThomasNeural',
  'en-GB-SoniaNeural',
  'en-NZ-MitchellNeural',
  'en-GB-LibbyNeural',
  'en-IE-ConnorNeural',
  'en-GB-MaisieNeural',
  'en-AU-WilliamMultilingualNeural',
  'en-IE-EmilyNeural',
  'en-US-RogerNeural',
  'en-AU-NatashaNeural',
  'en-CA-LiamNeural',
  'en-NZ-MollyNeural',
  'en-US-ChristopherNeural',
  'en-CA-ClaraNeural',
  'en-US-AndrewNeural',
  'en-US-AriaNeural',
  'en-US-EricNeural',
  'en-US-AvaNeural',
  'en-US-GuyNeural',
  'en-US-EmmaNeural',
  'en-US-BrianNeural',
  'en-US-JennyNeural',
  'en-US-SteffanNeural',
  'en-US-MichelleNeural',
];

// Deterministic cross-engine fallback mapping: Edge-TTS voice -> Kokoro voice
const EDGE_TO_KOKORO_MAP = {
  'en-GB-RyanNeural': 'bm_george',
  'en-GB-ThomasNeural': 'bm_daniel',
  'en-NZ-MitchellNeural': 'bm_lewis',
  'en-IE-ConnorNeural': 'bm_fable',
  'en-US-RogerNeural': 'am_onyx',
  'en-AU-WilliamMultilingualNeural': 'am_eric',
  'en-CA-LiamNeural': 'bm_fable',
  'en-US-ChristopherNeural': 'am_adam',
  'en-US-AndrewNeural': 'am_michael',
  'en-US-EricNeural': 'am_eric',
  'en-US-GuyNeural': 'am_fenrir',
  'en-US-BrianNeural': 'bm_daniel',
  'en-US-SteffanNeural': 'am_onyx',
  'en-GB-SoniaNeural': 'bf_emma',
  'en-GB-LibbyNeural': 'bf_alice',
  'en-GB-MaisieNeural': 'af_sarah',
  'en-IE-EmilyNeural': 'bf_lily',
  'en-AU-NatashaNeural': 'bf_isabella',
  'en-NZ-MollyNeural': 'af_nova',
  'en-CA-ClaraNeural': 'af_sarah',
  'en-US-AriaNeural': 'af_heart',
  'en-US-AvaNeural': 'af_bella',
  'en-US-EmmaNeural': 'bf_emma',
  'en-US-JennyNeural': 'af_nicole',
  'en-US-MichelleNeural': 'bf_alice',
};

// Paradee-8M (4 neural slots: Narrator + top 3 characters)
const PARADEE_VOICE_LIST = [
  'bm_fable',
  'bf_emma',
  'bm_daniel',
  'af_bella',
];

// Machine-TTS (Edge-TTS extra pool for 5th+ characters in paradee-mixed mode)
const MACHINE_EXTRA_VOICE_LIST = [
  ...MALE_VOICE_POOL,
  ...FEMALE_VOICE_POOL,
];

const FEMALE_KEYWORDS_LIST = [
  'hermione', 'granger', 'mcgonagall', 'petunia', 'lily', 'ginny', 'luna', 'molly',
  'irene', 'adler', 'hudson', 'mary', 'alice', 'elizabeth', 'jane', 'emma',
  'mrs', 'ms', 'miss', 'lady', 'aunt', 'mother', 'sister', 'queen', 'princess',
  'clara', 'helen', 'violet', 'margaret', 'catherine', 'anne', 'charlotte', 'eleanor',
  'sophia', 'grace', 'rose', 'lucy', 'martha', 'hannah', 'emily', 'rachel',
  'rebecca', 'laura', 'anna', 'kate', 'julia', 'edith', 'elsie', 'hatty',
];

const MALE_KEYWORDS_LIST = [
  'sherlock', 'holmes', 'watson', 'lestrade', 'moriarty', 'mycroft', 'jabez',
  'harry', 'potter', 'ron', 'weasley', 'dumbledore', 'albus', 'snape', 'severus',
  'draco', 'malfoy', 'hagrid', 'rubeus', 'neville', 'vernon', 'dudley',
  'mr', 'sir', 'lord', 'uncle', 'father', 'brother', 'king', 'prince', 'inspector',
  'john', 'henry', 'charles', 'arthur', 'james', 'william', 'edward', 'george',
  'fred', 'frank', 'peter', 'paul', 'david', 'michael', 'robert', 'richard',
  'thomas', 'daniel', 'joseph', 'victor', 'simon', 'gregory', 'wilson',
];

// Named character speaker_name matching ONLY (never matched against spoken quote text)
const KEYWORD_MAP = [
  ['harry potter', VOICE_CATALOG.harry],
  ['harry', VOICE_CATALOG.harry],
  ['hermione granger', VOICE_CATALOG.hermione],
  ['hermione', VOICE_CATALOG.hermione],
  ['ron weasley', VOICE_CATALOG.ron],
  ['ron', VOICE_CATALOG.ron],
  ['albus dumbledore', VOICE_CATALOG.dumbledore],
  ['dumbledore', VOICE_CATALOG.dumbledore],
  ['severus snape', VOICE_CATALOG.snape],
  ['snape', VOICE_CATALOG.snape],
  ['professor mcgonagall', VOICE_CATALOG.mcgonagall],
  ['mcgonagall', VOICE_CATALOG.mcgonagall],
  ['draco malfoy', VOICE_CATALOG.draco],
  ['malfoy', VOICE_CATALOG.draco],
  ['draco', VOICE_CATALOG.draco],
  ['rubeus hagrid', VOICE_CATALOG.hagrid],
  ['hagrid', VOICE_CATALOG.hagrid],
  ['mr. sherlock holmes', VOICE_CATALOG.british_male],
  ['sherlock holmes', VOICE_CATALOG.british_male],
  ['sherlock', VOICE_CATALOG.british_male],
  ['holmes', VOICE_CATALOG.british_male],
  ['dr. watson', VOICE_CATALOG.irish_male],
  ['john watson', VOICE_CATALOG.irish_male],
  ['watson', VOICE_CATALOG.irish_male],
  ['irene adler', VOICE_CATALOG.lively_female],
  ['mrs. hudson', VOICE_CATALOG.calm_female],
  ['inspector lestrade', VOICE_CATALOG.deep_male],
  ['lestrade', VOICE_CATALOG.deep_male],
  ['professor moriarty', VOICE_CATALOG.snape],
  ['moriarty', VOICE_CATALOG.snape],
  ['vernon', VOICE_CATALOG.snape],
  ['petunia', VOICE_CATALOG.calm_female],
  ['aunt petunia', VOICE_CATALOG.calm_female],
  ['mrs. dursley', VOICE_CATALOG.calm_female],
  ['mr. dursley', VOICE_CATALOG.snape],
  ['dudley', VOICE_CATALOG.young_male],
  ['uncle vernon', VOICE_CATALOG.snape],
];

const SORTED_KEYWORDS = [...KEYWORD_MAP].sort((a, b) => b[0].length - a[0].length);

function normalizeSpeakerKey(speakerNameOrId) {
  return String(speakerNameOrId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function isGenericSpeakerKey(speakerNameOrId) {
  const key = normalizeSpeakerKey(speakerNameOrId);
  return GENERIC_SPEAKER_KEYS.has(key);
}

/**
 * Matches keyword with exact word-boundaries to avoid partial substring hits
 * (e.g. "ron" must not match "iron").
 */
function matchesKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function inferGenderFromSpeakerName(speakerName, explicitHint = null) {
  if (explicitHint === 'male' || explicitHint === 'female') {
    return explicitHint;
  }
  const lower = String(speakerName || '').toLowerCase();
  if (!lower) return 'unknown';

  if (FEMALE_KEYWORDS_LIST.some((kw) => matchesKeyword(lower, kw))) {
    return 'female';
  }
  if (MALE_KEYWORDS_LIST.some((kw) => matchesKeyword(lower, kw))) {
    return 'male';
  }
  return 'unknown';
}

function normalizeVoiceId(voiceId) {
  if (!voiceId) return null;
  return LEGACY_VOICE_ALIASES[voiceId] || voiceId;
}

class VoiceProfiler {
  constructor() {
    this.registryPath = path.join(config.paths.outputDir, 'voice_registry.json');
    this.registry = {};
    this.load();
  }

  load() {
    let dirty = false;
    try {
      if (fs.existsSync(this.registryPath)) {
        const raw = fs.readFileSync(this.registryPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [rawKey, entry] of Object.entries(parsed)) {
            const normKey = normalizeSpeakerKey(rawKey);
            const charId = normalizeSpeakerKey(entry?.character_id || rawKey);

            // Clean any existing poisoned generic entries on load
            if (isGenericSpeakerKey(normKey) || isGenericSpeakerKey(charId)) {
              dirty = true;
              continue;
            }

            if (entry && typeof entry === 'object') {
              const normalizedVoice = normalizeVoiceId(entry.voice_id);
              const patchedEntry = { ...entry };
              if (normalizedVoice && normalizedVoice !== entry.voice_id) {
                patchedEntry.voice_id = normalizedVoice;
                dirty = true;
              }
              this.registry[normKey || rawKey] = patchedEntry;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[VoiceProfiler] Failed to load registry, starting fresh:', err.message);
      this.registry = {};
    }

    if (dirty) {
      this.save();
    }
  }

  save() {
    try {
      const dir = path.dirname(this.registryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Double-guard against writing generic speaker keys to disk
      const sanitized = {};
      for (const [k, v] of Object.entries(this.registry)) {
        if (!isGenericSpeakerKey(k) && !isGenericSpeakerKey(v?.character_id)) {
          sanitized[k] = v;
        }
      }
      this.registry = sanitized;
      fs.writeFileSync(this.registryPath, JSON.stringify(sanitized, null, 2), 'utf-8');
    } catch (err) {
      console.error('[VoiceProfiler] Failed to save registry:', err.message);
    }
  }

  _hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  _pickUnusedVoiceForGender(gender, usedSet, seedStr) {
    const preferredPool =
      gender === 'female'
        ? FEMALE_VOICE_POOL
        : gender === 'male'
          ? MALE_VOICE_POOL
          : ALL_CHARACTER_VOICE_POOL;

    for (const candidate of preferredPool) {
      if (!usedSet.has(candidate)) {
        return candidate;
      }
    }

    // Overflow across all verified character voices before ever reusing a voice in-chapter
    for (const candidate of ALL_CHARACTER_VOICE_POOL) {
      if (!usedSet.has(candidate)) {
        return candidate;
      }
    }

    // Only reuse after exhausting all 24 character voices (never returning narrator)
    const idx = this._hashString(seedStr) % preferredPool.length;
    return preferredPool[idx];
  }

  /**
   * Resolve or assign an Edge-TTS voice for a single character name.
   * Never reads spoken quote text (`contextSnippet`) to hijack named speakers,
   * and never persists generic speaker keys into voice_registry.json.
   */
  resolveCharacterVoice(speakerName, _contextSnippet = '', genderHint = null) {
    const cleanName = String(speakerName || '').trim();
    const charId = normalizeSpeakerKey(cleanName);

    if (!charId || charId === 'narrator') {
      return { voiceId: VOICE_PALETTE.narrator, prosody: null };
    }

    // Generic placeholders must NOT be persisted in registry
    if (isGenericSpeakerKey(charId)) {
      const genericVoice =
        charId === 'speaker_b' || charId === 'dialogue_turn_odd'
          ? VOICE_PALETTE.lively_female
          : VOICE_PALETTE.young_male;
      return { voiceId: genericVoice, prosody: null };
    }

    // 1. Check persisted character registry
    if (this.registry[charId]) {
      const existing = this.registry[charId];
      let resolvedVoice = normalizeVoiceId(existing.voice_id);
      // Do not allow narrator voice to remain hijacked by a character entry
      if (!resolvedVoice || (resolvedVoice === VOICE_PALETTE.narrator && !existing.manual)) {
        const gender = inferGenderFromSpeakerName(cleanName, existing.gender || genderHint);
        const existingUsed = new Set([
          VOICE_PALETTE.narrator,
          ...Object.values(this.registry).map((r) => normalizeVoiceId(r.voice_id)).filter(Boolean),
        ]);
        resolvedVoice = this._pickUnusedVoiceForGender(gender, existingUsed, charId);
        existing.voice_id = resolvedVoice;
        this.save();
      } else if (resolvedVoice !== existing.voice_id) {
        existing.voice_id = resolvedVoice;
        this.save();
      }
      return {
        voiceId: resolvedVoice,
        prosody: existing.prosody || null,
      };
    }

    // 2. Match explicit character name ONLY against SORTED_KEYWORDS (never quote content!)
    const nameLower = cleanName.toLowerCase();
    let matchedProfile = null;
    for (const [kw, entry] of SORTED_KEYWORDS) {
      if (matchesKeyword(nameLower, kw)) {
        matchedProfile = entry;
        break;
      }
    }

    const inferredGender = inferGenderFromSpeakerName(
      cleanName,
      genderHint || matchedProfile?.gender
    );

    const usedInRegistry = new Set([
      VOICE_PALETTE.narrator,
      ...Object.values(this.registry)
        .map((r) => normalizeVoiceId(r.voice_id))
        .filter(Boolean),
    ]);

    let voiceId = matchedProfile ? normalizeVoiceId(matchedProfile.primary) : null;
    let prosody = matchedProfile?.prosody || null;

    if (!voiceId || voiceId === VOICE_PALETTE.narrator || usedInRegistry.has(voiceId)) {
      voiceId = this._pickUnusedVoiceForGender(inferredGender, usedInRegistry, charId);
    }

    this.registry[charId] = {
      character_id: charId,
      name: cleanName,
      voice_id: voiceId,
      gender: inferredGender,
      prosody: prosody || undefined,
      assigned_at: new Date().toISOString(),
    };
    this.save();

    return { voiceId, prosody };
  }

  /**
   * Manually assign a specific voice ID to a named character.
   */
  assignVoice(characterId, voiceId, metadata = {}) {
    const charId = normalizeSpeakerKey(characterId);
    if (!charId || isGenericSpeakerKey(charId)) {
      return { rejected: true, reason: 'generic_speaker_key_not_persisted' };
    }

    const normalized = normalizeVoiceId(voiceId) || voiceId;
    const prev = this.registry[charId] || {};
    this.registry[charId] = {
      ...prev,
      ...metadata,
      character_id: charId,
      name: metadata.name || prev.name || characterId,
      voice_id: normalized,
      manual: metadata.manual !== undefined ? Boolean(metadata.manual) : prev.manual,
      updated_at: new Date().toISOString(),
    };
    this.save();
    return this.registry[charId];
  }

  getAllCharacters() {
    return Object.values(this.registry).filter(
      (entry) => entry && !isGenericSpeakerKey(entry.character_id || entry.name)
    );
  }

  getCharacter(characterId) {
    const key = normalizeSpeakerKey(characterId);
    if (isGenericSpeakerKey(key)) return null;
    return this.registry[key] || null;
  }

  getAvailableVoices() {
    return { ...VOICE_PALETTE };
  }

  getAllAssignments() {
    const cleanAssignments = {};
    for (const [k, v] of Object.entries(this.registry)) {
      if (v && !isGenericSpeakerKey(k) && !isGenericSpeakerKey(v.character_id || v.name)) {
        cleanAssignments[k] = v;
      }
    }
    return cleanAssignments;
  }

  /**
   * Apply voice assignments across all segments of a chapter while guaranteeing:
   * 1. VOICE_PALETTE.narrator ('en-GB-RyanNeural') is strictly exclusive to narration.
   * 2. Each distinct named character in the chapter gets an unused gender-appropriate voice.
   * 3. Unresolved/generic dialogue lines alternate voices by dialogue turn index without
   *    polluting voice_registry.json.
   */
  applyVoicesToSegments(segments) {
    if (!Array.isArray(segments)) return [];

    // Reserve narrator voice exclusively for narration segments
    const usedCharacterVoices = new Set([VOICE_PALETTE.narrator]);
    const chapterCharacterVoices = new Map(); // charId -> { voiceId, prosody }
    const turnVoices = { even: null, odd: null };
    let dialogueTurnIndex = 0;
    let registryModified = false;

    const result = segments.map((seg) => {
      if (!seg) return seg;

      if (seg.type === 'image') {
        return {
          ...seg,
          speaker_id: 'image',
          assigned_voice_id: 'image',
        };
      }

      if (seg.type === 'narration') {
        return {
          ...seg,
          speaker_id: 'narrator',
          speaker_name: 'narrator',
          assigned_voice_id: VOICE_PALETTE.narrator,
        };
      }

      // Dialogue segment
      const rawSpeakerName = seg.speaker_name || seg.speaker_id || 'Unresolved';
      const charId = normalizeSpeakerKey(seg.speaker_id || rawSpeakerName) || 'unresolved';

      // Respect explicit manual override when non-narrator
      if (
        seg.attribution_source === 'manual' &&
        seg.assigned_voice_id &&
        seg.assigned_voice_id !== VOICE_PALETTE.narrator &&
        !isGenericSpeakerKey(charId)
      ) {
        const manualVoice = normalizeVoiceId(seg.assigned_voice_id) || seg.assigned_voice_id;
        usedCharacterVoices.add(manualVoice);
        chapterCharacterVoices.set(charId, { voiceId: manualVoice, prosody: seg.prosody || null });
        dialogueTurnIndex++;
        return {
          ...seg,
          speaker_id: charId,
          assigned_voice_id: manualVoice,
        };
      }

      // Generic or unresolved dialogue segments alternate turn-by-turn and NEVER write to registry
      if (isGenericSpeakerKey(charId)) {
        const parity =
          charId === 'speaker_a' || charId === 'dialogue_turn_even'
            ? 'even'
            : charId === 'speaker_b' || charId === 'dialogue_turn_odd'
              ? 'odd'
              : dialogueTurnIndex % 2 === 0
                ? 'even'
                : 'odd';

        if (!turnVoices[parity]) {
          const picked =
            parity === 'even'
              ? this._pickUnusedVoiceForGender('male', usedCharacterVoices, 'dialogue_turn_even')
              : this._pickUnusedVoiceForGender('female', usedCharacterVoices, 'dialogue_turn_odd');
          usedCharacterVoices.add(picked);
          turnVoices[parity] = picked;
        }

        dialogueTurnIndex++;
        return {
          ...seg,
          speaker_id: charId === 'speaker_a' || charId === 'speaker_b' ? charId : `dialogue_turn_${parity}`,
          assigned_voice_id: turnVoices[parity],
          prosody: null,
        };
      }

      // Named character in this chapter
      if (chapterCharacterVoices.has(charId)) {
        const cached = chapterCharacterVoices.get(charId);
        dialogueTurnIndex++;
        return {
          ...seg,
          speaker_id: charId,
          assigned_voice_id: cached.voiceId,
          prosody: cached.prosody || null,
        };
      }

      const nameLower = String(rawSpeakerName).toLowerCase();
      let matchedKeyword = null;
      for (const [kw, entry] of SORTED_KEYWORDS) {
        if (matchesKeyword(nameLower, kw)) {
          matchedKeyword = entry;
          break;
        }
      }

      const regEntry = this.registry[charId];
      const gender = inferGenderFromSpeakerName(
        rawSpeakerName,
        seg.speaker_gender || regEntry?.gender || matchedKeyword?.gender
      );

      let chosenVoice = null;
      let chosenProsody = regEntry?.prosody || matchedKeyword?.prosody || null;

      // 1. Prefer existing registry voice if unused in this chapter and not narrator
      const regVoice = regEntry ? normalizeVoiceId(regEntry.voice_id) : null;
      if (regVoice && !usedCharacterVoices.has(regVoice)) {
        chosenVoice = regVoice;
      }

      // 2. Else try curated character archetype voice if unused
      if (!chosenVoice && matchedKeyword) {
        const kwVoice = normalizeVoiceId(matchedKeyword.primary);
        if (kwVoice && !usedCharacterVoices.has(kwVoice)) {
          chosenVoice = kwVoice;
        }
      }

      // 3. Otherwise guarantee an unused gender-appropriate voice for this chapter
      if (!chosenVoice) {
        chosenVoice = this._pickUnusedVoiceForGender(gender, usedCharacterVoices, charId);
      }

      usedCharacterVoices.add(chosenVoice);
      chapterCharacterVoices.set(charId, { voiceId: chosenVoice, prosody: chosenProsody });

      if (!this.registry[charId]) {
        this.registry[charId] = {
          character_id: charId,
          name: rawSpeakerName,
          voice_id: chosenVoice,
          gender,
          prosody: chosenProsody || undefined,
          assigned_at: new Date().toISOString(),
        };
        registryModified = true;
      } else if (
        this.registry[charId].voice_id === VOICE_PALETTE.narrator &&
        !this.registry[charId].manual
      ) {
        this.registry[charId].voice_id = chosenVoice;
        registryModified = true;
      }

      dialogueTurnIndex++;
      return {
        ...seg,
        speaker_id: charId,
        assigned_voice_id: chosenVoice,
        prosody: chosenProsody || null,
      };
    });

    if (registryModified) {
      this.save();
    }

    return result;
  }
}

const voiceProfiler = new VoiceProfiler();

module.exports = {
  voiceProfiler,
  VoiceProfiler,
  VOICE_PALETTE,
  VOICE_CATALOG,
  LEGACY_VOICE_ALIASES,
  GENERIC_SPEAKER_KEYS,
  MALE_VOICE_POOL,
  FEMALE_VOICE_POOL,
  ALL_CHARACTER_VOICE_POOL,
  KEYWORD_MAP,
  SORTED_KEYWORDS,
  matchesKeyword,
  isGenericSpeakerKey,
  inferGenderFromSpeakerName,
  EDGE_TO_KOKORO_MAP,
  PARADEE_VOICE_LIST,
  MACHINE_EXTRA_VOICE_LIST,
};
