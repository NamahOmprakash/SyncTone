const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// Unified Multi-Voice Catalog (Edge Neural TTS primary + Kokoro fallback)
const VOICE_CATALOG = {
  // Harry Potter Cast
  narrator: {
    primary: 'en-GB-RyanNeural',
    fallback: 'bm_george',
    label: 'Narrator (British Storyteller)',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
  harry: {
    primary: 'en-GB-ThomasNeural',
    fallback: 'bm_george',
    label: 'Harry Potter (Earnest British Youth)',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
  hermione: {
    primary: 'en-GB-LibbyNeural',
    fallback: 'bf_emma',
    label: 'Hermione Granger (Articulate British Girl)',
    prosody: { rate: '+5%', pitch: '+0%' },
  },
  ron: {
    primary: 'en-GB-AlfieNeural',
    fallback: 'bm_daniel',
    label: 'Ron Weasley (Expressive British Youth)',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
  dumbledore: {
    primary: 'en-GB-ArthurNeural',
    fallback: 'am_george',
    label: 'Albus Dumbledore (Dignified British Elder)',
    prosody: { rate: '-5%', pitch: '-5%' },
  },
  snape: {
    primary: 'en-GB-NoahNeural',
    fallback: 'am_michael',
    label: 'Severus Snape (Deep Deliberate British)',
    prosody: { rate: '-10%', pitch: '-15%' },
  },
  mcgonagall: {
    primary: 'en-GB-SoniaNeural',
    fallback: 'af_sarah',
    label: 'Prof. McGonagall (Stern British Academic)',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
  draco: {
    primary: 'en-GB-OliverNeural',
    fallback: 'bm_george',
    label: 'Draco Malfoy (Haughty British Youth)',
    prosody: { rate: '+0%', pitch: '+5%' },
  },
  hagrid: {
    primary: 'en-GB-RyanNeural',
    fallback: 'am_onyx',
    label: 'Rubeus Hagrid (Deep Booming Voice)',
    prosody: { rate: '-5%', pitch: '-25%' },
  },

  // General Archetypes
  young_male: {
    primary: 'en-GB-ThomasNeural',
    fallback: 'am_adam',
    label: 'Young British Male',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
  calm_female: {
    primary: 'en-GB-SoniaNeural',
    fallback: 'af_heart',
    label: 'Calm British Female',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
  energetic_female: {
    primary: 'en-GB-LibbyNeural',
    fallback: 'af_bella',
    label: 'Energetic British Female',
    prosody: { rate: '+5%', pitch: '+0%' },
  },
  deep_male: {
    primary: 'en-GB-ArthurNeural',
    fallback: 'am_onyx',
    label: 'Deep British Male',
    prosody: { rate: '-5%', pitch: '-10%' },
  },
  british_male: {
    primary: 'en-GB-RyanNeural',
    fallback: 'bm_george',
    label: 'British Male Storyteller',
    prosody: { rate: '+0%', pitch: '+0%' },
  },
};

// Flat palette for easy UI selection and backwards-compatibility
const VOICE_PALETTE = Object.fromEntries(
  Object.entries(VOICE_CATALOG).map(([key, v]) => [key, v.primary])
);

// Character name & keyword mapping to specific voices
const KEYWORD_MAP = {
  // Harry Potter character triggers
  harry: 'harry',
  potter: 'harry',
  hermione: 'hermione',
  granger: 'hermione',
  ron: 'ron',
  weasley: 'ron',
  dumbledore: 'dumbledore',
  albus: 'dumbledore',
  snape: 'snape',
  severus: 'snape',
  mcgonagall: 'mcgonagall',
  minerva: 'mcgonagall',
  draco: 'draco',
  malfoy: 'draco',
  hagrid: 'hagrid',
  rubeus: 'hagrid',

  // Archetype triggers
  vernon: 'deep_male',
  dursley: 'deep_male',
  uncle: 'deep_male',
  captain: 'deep_male',
  commander: 'deep_male',
  general: 'deep_male',
  king: 'dumbledore',
  lord: 'deep_male',
  beast: 'hagrid',
  giant: 'hagrid',
  warrior: 'deep_male',
  knight: 'deep_male',
  professor: 'snape',
  headmaster: 'dumbledore',
  man: 'young_male',
  boy: 'harry',
  prince: 'young_male',
  lad: 'ron',
  sir: 'british_male',
  gentleman: 'dumbledore',
  butler: 'british_male',
  lady: 'mcgonagall',
  woman: 'calm_female',
  queen: 'mcgonagall',
  mother: 'calm_female',
  maiden: 'calm_female',
  girl: 'hermione',
  princess: 'energetic_female',
  child: 'young_male',
  lass: 'energetic_female',
};

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Sorted by descending length so compound keywords match before short roots
const SORTED_KEYWORDS = Object.entries(KEYWORD_MAP).sort(
  (a, b) => b[0].length - a[0].length
);

function matchesKeyword(text, kw) {
  if (!text) return false;
  const regex = new RegExp(`(?:^|[^a-z0-9])${kw}(?:$|[^a-z0-9])`, 'i');
  return regex.test(text);
}

class VoiceProfiler {
  constructor() {
    this.persistPath = path.resolve(config.paths.outputDir, 'voice_registry.json');
    this.registry = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = fs.readFileSync(this.persistPath, 'utf-8');
        this.registry = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[VoiceProfiler] Could not load registry:', err.message);
    }
  }

  save() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify(this.registry, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[VoiceProfiler] Could not save registry:', err.message);
    }
  }

  resolveCharacterVoice(name, contextSnippet = '') {
    const charId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (this.registry[charId]) {
      return this.registry[charId];
    }

    if (charId === 'narrator' || name.toLowerCase() === 'narrator') {
      return VOICE_PALETTE.narrator;
    }

    // 1. Direct name match (highest priority: prevents dialogue contents from hijacking speaker identity)
    const nameLower = name.toLowerCase().trim();
    for (const [kw, archetype] of SORTED_KEYWORDS) {
      if (matchesKeyword(nameLower, kw)) {
        const voiceId = VOICE_PALETTE[archetype];
        this.registry[charId] = voiceId;
        this.save();
        return voiceId;
      }
    }

    // 2. Context snippet keywords (fallback for unnamed characters like 'the beast')
    const snippetLower = contextSnippet.toLowerCase();
    for (const [kw, archetype] of SORTED_KEYWORDS) {
      if (matchesKeyword(snippetLower, kw)) {
        const voiceId = VOICE_PALETTE[archetype];
        this.registry[charId] = voiceId;
        this.save();
        return voiceId;
      }
    }

    const available = [
      VOICE_PALETTE.harry,
      VOICE_PALETTE.hermione,
      VOICE_PALETTE.ron,
      VOICE_PALETTE.dumbledore,
      VOICE_PALETTE.snape,
      VOICE_PALETTE.mcgonagall,
      VOICE_PALETTE.draco,
    ];
    const index = simpleHash(charId) % available.length;
    const voiceId = available[index];
    this.registry[charId] = voiceId;
    this.save();
    return voiceId;
  }

  applyVoicesToSegments(segments) {
    return segments.map((seg) => {
      if (seg.type === 'narration' || seg.speaker_id === 'narrator') {
        return { ...seg, assigned_voice_id: VOICE_PALETTE.narrator };
      }
      const voiceId = this.resolveCharacterVoice(seg.speaker_name, seg.text);
      return { ...seg, assigned_voice_id: voiceId };
    });
  }

  getAvailableVoices() {
    return { ...VOICE_PALETTE };
  }

  getAllAssignments() {
    return { ...this.registry };
  }

  assignVoice(characterId, newVoiceId) {
    this.registry[characterId] = newVoiceId;
    this.save();
  }
}

const EDGE_TO_KOKORO_MAP = {
  'en-GB-RyanNeural': 'bm_george',
  'en-GB-ThomasNeural': 'am_adam',
  'en-GB-LibbyNeural': 'bf_emma',
  'en-GB-AlfieNeural': 'bm_daniel',
  'en-GB-ArthurNeural': 'am_george',
  'en-GB-NoahNeural': 'am_michael',
  'en-GB-SoniaNeural': 'af_sarah',
  'en-GB-OliverNeural': 'bm_george',
};

const voiceProfiler = new VoiceProfiler();

module.exports = {
  voiceProfiler,
  VOICE_PALETTE,
  VOICE_CATALOG,
  EDGE_TO_KOKORO_MAP,
};
