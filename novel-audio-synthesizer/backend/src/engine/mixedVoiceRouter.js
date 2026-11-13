/**
 * SyncTone — Mixed Paradee-8M + Machine-TTS Multi-Voice Router
 *
 * Implements deterministic cast slot priority for `paradee-mixed` mode:
 * - Slot 1 (Narrator) -> Paradee-8M `bm_fable` (or `bf_isabella` if narrator is female)
 * - Slots 2–4 (Top 3 speaking characters by line count & gender/accent match) ->
 *   Remaining 3 Paradee-8M neural voices (`bf_isabella`, `am_puck`, `af_heart`, `bm_fable`)
 * - Slots 5+ (Extra & supporting characters) -> Distinct non-overlapping `machine-tts`
 *   voices (`mac_reed`, `mac_moira`, `mac_rocko`, `mac_shelley`, `mac_grandpa`,
 *   `mac_flo`, `mac_daniel`, `mac_serena`) with deterministic prosody multipliers (0.94–1.06).
 * - Manual Override: Explicit selection of a Paradee voice (`bm_fable`, `bf_isabella`,
 *   `am_puck`, `af_heart`) or explicit `mac_*` voice in CharacterRoster overrides slot ranking.
 */

const PARADEE_VOICES = [
  { id: 'bm_fable', gender: 'male', accent: 'british', role: 'narrator_or_lead', label: 'Fable (Paradee British Male)' },
  { id: 'bf_isabella', gender: 'female', accent: 'british', role: 'female_lead', label: 'Isabella (Paradee British Female)' },
  { id: 'am_puck', gender: 'male', accent: 'american', role: 'male_lead', label: 'Puck (Paradee American Male)' },
  { id: 'af_heart', gender: 'female', accent: 'american', role: 'female_second', label: 'Heart (Paradee American Female)' },
];

const PARADEE_VOICE_IDS = new Set(PARADEE_VOICES.map((v) => v.id));

const MACHINE_EXTRA_POOL = [
  { id: 'mac_reed', macVoice: 'Reed (English (UK))', webVoiceHint: 'Reed', gender: 'male', rateMultiplier: 0.96, pitchOffset: -0.05 },
  { id: 'mac_moira', macVoice: 'Moira', webVoiceHint: 'Moira', gender: 'female', rateMultiplier: 1.02, pitchOffset: 0.04 },
  { id: 'mac_rocko', macVoice: 'Rocko (English (UK))', webVoiceHint: 'Rocko', gender: 'male', rateMultiplier: 0.94, pitchOffset: -0.08 },
  { id: 'mac_shelley', macVoice: 'Shelley (English (UK))', webVoiceHint: 'Shelley', gender: 'female', rateMultiplier: 1.04, pitchOffset: 0.06 },
  { id: 'mac_grandpa', macVoice: 'Grandpa (English (UK))', webVoiceHint: 'Grandpa', gender: 'male', rateMultiplier: 0.94, pitchOffset: -0.10 },
  { id: 'mac_flo', macVoice: 'Flo (English (UK))', webVoiceHint: 'Flo', gender: 'female', rateMultiplier: 0.95, pitchOffset: -0.04 },
  { id: 'mac_daniel', macVoice: 'Daniel', webVoiceHint: 'Daniel', gender: 'male', rateMultiplier: 1.00, pitchOffset: 0.0 },
  { id: 'mac_serena', macVoice: 'Serena (Premium)', webVoiceHint: 'Serena', gender: 'female', rateMultiplier: 1.00, pitchOffset: 0.02 },
];

const MACHINE_VOICE_MAP = new Map(MACHINE_EXTRA_POOL.map((v) => [v.id, v]));

// Known female voice IDs across Edge, Kokoro, Paradee, and Machine catalogs
const FEMALE_VOICE_HINTS = new Set([
  'bf_isabella',
  'af_heart',
  'bf_emma',
  'af_bella',
  'af_nicole',
  'af_sarah',
  'af_sky',
  'en-GB-LibbyNeural',
  'en-GB-SoniaNeural',
  'en-GB-MaisieNeural',
  'en-IE-EmilyNeural',
  'mac_moira',
  'mac_shelley',
  'mac_flo',
  'mac_serena',
]);

const FEMALE_NAME_HINTS = /\b(ms|mrs|miss|lady|queen|princess|duchess|mother|mom|mum|sister|aunt|hermione|mcgonagall|minerva|petunia|lily|ginny|luna|bellatrix|molly|cho|fleur|irene|adler|mary|helen|alice|elizabeth|jane|emma|sarah|isabella|claire|rachel|leah)\b/i;

function inferGender({ characterId = '', speakerName = '', voiceId = '', gender = '' } = {}) {
  const g = String(gender || '').toLowerCase().trim();
  if (g === 'female' || g === 'f') return 'female';
  if (g === 'male' || g === 'm') return 'male';
  if (FEMALE_VOICE_HINTS.has(voiceId)) return 'female';
  if (String(voiceId).startsWith('af_') || String(voiceId).startsWith('bf_')) return 'female';
  if (String(voiceId).startsWith('am_') || String(voiceId).startsWith('bm_')) return 'male';
  const combined = `${characterId} ${speakerName}`;
  if (FEMALE_NAME_HINTS.test(combined)) return 'female';
  return 'male';
}

function inferAccent(voiceId = '') {
  const v = String(voiceId || '');
  if (
    v.startsWith('en-GB') ||
    v.startsWith('en-IE') ||
    v.startsWith('en-AU') ||
    v.startsWith('en-NZ') ||
    v.startsWith('bm_') ||
    v.startsWith('bf_') ||
    v === 'mac_daniel' ||
    v === 'mac_serena'
  ) {
    return 'british';
  }
  return 'american';
}

/**
 * Deterministically hashes a string to an integer >= 0.
 */
function stableHash(str = '') {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Maps any arbitrary voice ID to the closest Paradee-8M voice ID when running
 * in pure `paradee-tts` mode or for a primary slot in `paradee-mixed`.
 */
function mapToParadeeVoice(voiceId = '', { isNarrator = false, gender = '', accent = '' } = {}) {
  if (PARADEE_VOICE_IDS.has(voiceId)) {
    return voiceId;
  }
  const resolvedGender = inferGender({ voiceId, gender });
  const resolvedAccent = accent || inferAccent(voiceId);

  if (isNarrator) {
    return resolvedGender === 'female' ? 'bf_isabella' : 'bm_fable';
  }

  // Direct mapping from known Edge/Kokoro voices
  const directMap = {
    'en-GB-RyanNeural': 'bm_fable',
    'en-GB-ArthurNeural': 'bm_fable',
    'en-GB-NoahNeural': 'bm_fable',
    'en-US-RogerNeural': 'bm_fable',
    'en-NZ-MitchellNeural': 'bm_fable',
    'bm_george': 'bm_fable',
    'bm_lewis': 'bm_fable',
    'am_george': 'bm_fable',
    'am_adam': 'bm_fable',
    'en-GB-ThomasNeural': 'am_puck',
    'en-GB-AlfieNeural': 'am_puck',
    'en-GB-OliverNeural': 'am_puck',
    'en-IE-ConnorNeural': 'am_puck',
    'en-AU-WilliamMultilingualNeural': 'am_puck',
    'bm_daniel': 'am_puck',
    'am_michael': 'am_puck',
    'am_onyx': 'am_puck',
    'en-GB-LibbyNeural': 'bf_isabella',
    'en-GB-SoniaNeural': 'bf_isabella',
    'en-GB-MaisieNeural': 'bf_isabella',
    'bf_emma': 'bf_isabella',
    'af_sarah': 'bf_isabella',
    'en-IE-EmilyNeural': 'af_heart',
    'af_heart': 'af_heart',
    'af_bella': 'af_heart',
    'af_nicole': 'af_heart',
    'af_sky': 'af_heart',
  };

  if (directMap[voiceId]) {
    return directMap[voiceId];
  }

  if (resolvedGender === 'female') {
    return resolvedAccent === 'british' ? 'bf_isabella' : 'af_heart';
  }
  return resolvedAccent === 'british' ? 'bm_fable' : 'am_puck';
}

/**
 * Builds a complete chapter/novel cast routing plan for `paradee-mixed` mode.
 *
 * @param {Array<object>} segments - Chapter segments array
 * @param {Array<object>} [characters=[]] - Optional character metadata list
 * @returns {Map<string, object>} Map from speaker key (character_id or normalized speaker_name) to routing plan
 */
function buildMixedCastPlan(segments = [], characters = []) {
  const plan = new Map();
  const charMetaById = new Map();

  for (const c of characters || []) {
    const key = String(c.id || c.character_id || c.name || c.canonical_name || '').trim();
    if (key) charMetaById.set(key, c);
    const nameKey = String(c.name || c.canonical_name || '').toLowerCase().trim();
    if (nameKey) charMetaById.set(nameKey, c);
  }

  // Count lines and collect speaker metadata
  const speakerStats = new Map();
  let narratorKey = 'narrator';

  for (const seg of segments || []) {
    if (!seg || seg.type === 'image') continue;
    const rawKey = String(seg.character_id || seg.speaker_id || seg.speaker_name || (seg.type === 'narration' ? 'narrator' : 'unknown')).trim();
    const isNarr =
      seg.type === 'narration' ||
      rawKey.toLowerCase() === 'narrator' ||
      String(seg.speaker_name || '').toLowerCase() === 'narrator';

    const key = isNarr ? 'narrator' : rawKey;
    if (isNarr) narratorKey = key;

    const existing = speakerStats.get(key) || {
      key,
      speakerName: seg.speaker_name || key,
      voiceId: seg.voice_id || seg.assigned_voice_id || '',
      count: 0,
      firstOrder: seg.order ?? 999999,
      isNarrator: isNarr,
      gender: '',
    };
    existing.count += 1;
    if (!existing.voiceId && (seg.voice_id || seg.assigned_voice_id)) {
      existing.voiceId = seg.voice_id || seg.assigned_voice_id;
    }
    const meta = charMetaById.get(key) || charMetaById.get(String(seg.speaker_name || '').toLowerCase().trim());
    if (meta) {
      if (meta.voice_id || meta.assigned_voice_id) {
        existing.voiceId = meta.voice_id || meta.assigned_voice_id;
      }
      if (meta.gender) {
        existing.gender = meta.gender;
      }
    }
    speakerStats.set(key, existing);
  }

  // Also include characters from roster even if they have 0 segments in this specific slice
  for (const c of characters || []) {
    const key = String(c.id || c.character_id || c.name || c.canonical_name || '').trim();
    if (!key || speakerStats.has(key)) continue;
    const isNarr = String(c.role || c.name || key).toLowerCase() === 'narrator';
    speakerStats.set(key, {
      key,
      speakerName: c.name || c.canonical_name || key,
      voiceId: c.voice_id || c.assigned_voice_id || '',
      count: Number(c.dialogue_count || c.segment_count || 0),
      firstOrder: 999999,
      isNarrator: isNarr,
      gender: c.gender || '',
    });
  }

  const usedParadeeVoices = new Set();
  const usedMachineVoices = new Set();

  // Pass 0: Honor explicit manual overrides (`bm_fable`, `bf_isabella`, `am_puck`, `af_heart`, or `mac_*`)
  for (const [key, stat] of speakerStats.entries()) {
    const vId = String(stat.voiceId || '').trim();
    if (MACHINE_VOICE_MAP.has(vId)) {
      const mEntry = MACHINE_VOICE_MAP.get(vId);
      usedMachineVoices.add(mEntry.id);
      plan.set(key, {
        speakerKey: key,
        engine: 'machine-tts',
        voiceId: mEntry.id,
        macVoice: mEntry.macVoice,
        rateMultiplier: mEntry.rateMultiplier,
        pitchOffset: mEntry.pitchOffset,
        slotType: 'manual_machine',
      });
    } else if (
      vId === 'bm_fable' ||
      vId === 'bf_isabella' ||
      vId === 'am_puck' ||
      vId === 'af_heart'
    ) {
      usedParadeeVoices.add(vId);
      const isNarr = stat.isNarrator;
      let rateMultiplier = 1.0;
      if (!isNarr) {
        const rateSteps = [0.94, 0.97, 1.0, 1.03, 1.06];
        rateMultiplier = rateSteps[stableHash(key) % rateSteps.length];
      }
      plan.set(key, {
        speakerKey: key,
        engine: 'paradee-tts',
        voiceId: vId,
        rateMultiplier,
        pitchOffset: 0.0,
        slotType: isNarr ? 'narrator' : 'manual_paradee',
      });
    }
  }

  // Pass 1: Slot 1 — Narrator gets Paradee `bm_fable` (or `bf_isabella` if female)
  const narratorStat = speakerStats.get(narratorKey) || {
    key: 'narrator',
    speakerName: 'Narrator',
    voiceId: 'en-GB-RyanNeural',
    isNarrator: true,
    gender: 'male',
  };
  if (!plan.has(narratorStat.key)) {
    const narrGender = inferGender({
      characterId: narratorStat.key,
      speakerName: narratorStat.speakerName,
      voiceId: narratorStat.voiceId,
      gender: narratorStat.gender,
    });
    const narrParadeeVoice = narrGender === 'female' ? 'bf_isabella' : 'bm_fable';
    usedParadeeVoices.add(narrParadeeVoice);
    plan.set(narratorStat.key, {
      speakerKey: narratorStat.key,
      slotRank: 1,
      engine: 'paradee-tts',
      voiceId: narrParadeeVoice,
      rateMultiplier: 1.0,
      pitchOffset: 0.0,
      slotType: 'narrator',
    });
  }

  // Sort non-narrator speakers descending by segment count, then ascending by first appearance
  const nonNarrators = Array.from(speakerStats.values())
    .filter((s) => !s.isNarrator && s.key !== narratorStat.key && !plan.has(s.key))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.firstOrder - b.firstOrder;
    });

  // Pass 2: Slots 2–4 — Top 3 speaking characters get the remaining 3 Paradee neural voices
  let primaryRank = 2;
  for (const stat of nonNarrators) {
    if (usedParadeeVoices.size < PARADEE_VOICES.length && primaryRank <= 4) {
      const gender = inferGender({
        characterId: stat.key,
        speakerName: stat.speakerName,
        voiceId: stat.voiceId,
        gender: stat.gender,
      });
      const accent = inferAccent(stat.voiceId);
      const preferred = mapToParadeeVoice(stat.voiceId, { isNarrator: false, gender, accent });

      let chosen = null;
      if (!usedParadeeVoices.has(preferred)) {
        chosen = preferred;
      } else {
        // Pick an unused Paradee voice matching gender first, else any unused Paradee voice
        const sameGenderUnused = PARADEE_VOICES.find(
          (v) => !usedParadeeVoices.has(v.id) && v.gender === gender
        );
        const anyUnused = PARADEE_VOICES.find((v) => !usedParadeeVoices.has(v.id));
        chosen = (sameGenderUnused || anyUnused || PARADEE_VOICES[0]).id;
      }

      usedParadeeVoices.add(chosen);

      // Deterministic subtle rate variation so characters don't sound identical
      const rateSteps = [0.94, 0.97, 1.0, 1.03, 1.06];
      const rateMultiplier = rateSteps[stableHash(stat.key) % rateSteps.length];

      plan.set(stat.key, {
        speakerKey: stat.key,
        slotRank: primaryRank,
        engine: 'paradee-tts',
        voiceId: chosen,
        rateMultiplier,
        pitchOffset: 0.0,
        slotType: 'primary_paradee',
      });
      primaryRank += 1;
    } else {
      // Pass 3: Slots 5+ — Extra & supporting characters get distinct `machine-tts` voices + prosody
      const gender = inferGender({
        characterId: stat.key,
        speakerName: stat.speakerName,
        voiceId: stat.voiceId,
        gender: stat.gender,
      });
      const genderPool = MACHINE_EXTRA_POOL.filter((v) => v.gender === gender);
      const unusedGenderPool = genderPool.filter((v) => !usedMachineVoices.has(v.id));
      const unusedAnyPool = MACHINE_EXTRA_POOL.filter((v) => !usedMachineVoices.has(v.id));

      let selectedMachine;
      if (unusedGenderPool.length > 0) {
        selectedMachine = unusedGenderPool[0];
      } else if (unusedAnyPool.length > 0) {
        selectedMachine = unusedAnyPool[0];
      } else {
        const poolToCycle = genderPool.length > 0 ? genderPool : MACHINE_EXTRA_POOL;
        selectedMachine = poolToCycle[stableHash(stat.key) % poolToCycle.length];
      }

      usedMachineVoices.add(selectedMachine.id);

      // Deterministic subtle rate/pitch offset so even overflow beyond 12 characters stays distinct
      const jitterSteps = [-0.04, -0.02, 0.0, 0.02, 0.04];
      const jitter = jitterSteps[stableHash(stat.key) % jitterSteps.length];
      const rateMultiplier = Number(
        Math.min(1.06, Math.max(0.94, selectedMachine.rateMultiplier + jitter)).toFixed(2)
      );

      plan.set(stat.key, {
        speakerKey: stat.key,
        slotRank: primaryRank,
        engine: 'machine-tts',
        voiceId: selectedMachine.id,
        macVoice: selectedMachine.macVoice,
        rateMultiplier,
        pitchOffset: selectedMachine.pitchOffset,
        slotType: 'extra_machine',
      });
      primaryRank += 1;
    }
  }

  return plan;
}

/**
 * Resolves the target sub-engine (`paradee-tts` or `machine-tts`), voice ID,
 * and prosody parameters for a single segment or character in `paradee-mixed` mode.
 */
function resolveMixedVoiceForCharacter({
  characterId = '',
  speakerName = '',
  voiceId = '',
  isNarrator = false,
  castSlot = null,
  castPlan = null,
  gender = '',
} = {}) {
  const vId = String(voiceId || '').trim();

  // 1. Explicit manual override to a `mac_*` voice
  if (MACHINE_VOICE_MAP.has(vId)) {
    const mEntry = MACHINE_VOICE_MAP.get(vId);
    return {
      engine: 'machine-tts',
      voiceId: mEntry.id,
      macVoice: mEntry.macVoice,
      rateMultiplier: mEntry.rateMultiplier,
      pitchOffset: mEntry.pitchOffset,
      slotType: 'manual_machine',
    };
  }

  // 2. Explicit manual override to a Paradee neural voice (`bm_fable`, `bf_isabella`, `am_puck`, `af_heart`)
  if (vId === 'bm_fable' || vId === 'bf_isabella' || vId === 'am_puck' || vId === 'af_heart') {
    const isNarr = Boolean(
      isNarrator ||
      String(characterId).toLowerCase() === 'narrator' ||
      String(speakerName).toLowerCase() === 'narrator'
    );
    let rateMultiplier = 1.0;
    if (!isNarr && (characterId || speakerName)) {
      const rateSteps = [0.94, 0.97, 1.0, 1.03, 1.06];
      rateMultiplier = rateSteps[stableHash(String(characterId || speakerName)) % rateSteps.length];
    }
    return {
      engine: 'paradee-tts',
      voiceId: vId,
      rateMultiplier,
      pitchOffset: 0.0,
      slotType: isNarr ? 'narrator' : 'manual_paradee',
    };
  }

  // 3. Lookup in precomputed chapter `castPlan` if provided
  const lookupKeys = [
    isNarrator ? 'narrator' : '',
    String(characterId || '').trim(),
    String(speakerName || '').trim(),
  ].filter(Boolean);

  if (castPlan instanceof Map) {
    for (const k of lookupKeys) {
      if (castPlan.has(k)) {
        return castPlan.get(k);
      }
    }
  }

  // 4. Explicit numeric castSlot (1..4 -> Paradee, 5+ -> Machine-TTS)
  const numericSlot = Number(castSlot);
  if (Number.isFinite(numericSlot) && numericSlot >= 5) {
    const resolvedGender = inferGender({ characterId, speakerName, voiceId: vId, gender });
    const genderPool = MACHINE_EXTRA_POOL.filter((v) => v.gender === resolvedGender);
    const pool = genderPool.length > 0 ? genderPool : MACHINE_EXTRA_POOL;
    const idx = (numericSlot - 5 + stableHash(characterId || speakerName || vId)) % pool.length;
    const chosen = pool[idx];
    return {
      engine: 'machine-tts',
      voiceId: chosen.id,
      macVoice: chosen.macVoice,
      rateMultiplier: chosen.rateMultiplier,
      pitchOffset: chosen.pitchOffset,
      slotType: 'extra_machine',
    };
  }

  // 5. Default primary / narrator resolution -> Paradee-8M
  const isNarr = Boolean(
    isNarrator ||
    String(characterId).toLowerCase() === 'narrator' ||
    String(speakerName).toLowerCase() === 'narrator'
  );
  const paradeeVoice = mapToParadeeVoice(vId, {
    isNarrator: isNarr,
    gender,
  });

  let rateMultiplier = 1.0;
  if (!isNarr && (characterId || speakerName)) {
    const rateSteps = [0.94, 0.97, 1.0, 1.03, 1.06];
    rateMultiplier = rateSteps[stableHash(String(characterId || speakerName)) % rateSteps.length];
  }

  return {
    engine: 'paradee-tts',
    voiceId: paradeeVoice,
    rateMultiplier,
    pitchOffset: 0.0,
    slotType: isNarr ? 'narrator' : 'primary_paradee',
  };
}

module.exports = {
  PARADEE_VOICES,
  PARADEE_VOICE_IDS,
  MACHINE_EXTRA_POOL,
  MACHINE_VOICE_MAP,
  stableHash,
  mapToParadeeVoice,
  buildMixedCastPlan,
  resolveMixedVoiceForCharacter,
};
