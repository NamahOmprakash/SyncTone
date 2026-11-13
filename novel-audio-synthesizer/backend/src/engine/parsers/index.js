/**
 * SyncTone — Pluggable 4-Engine Manuscript & Chapter Parser Dispatcher
 *
 * Supported engines (configured via output/parser_config.json or runtime options):
 *   1. `heuristic`     — Literary textParser + conversational turn-taking + voiceProfiler
 *   2. `gemini`        — Cloud Gemini AI dialogue speaker attribution
 *   3. `ollama`        — Batched local Ollama LLM dialogue speaker attribution
 *   4. `unlimited-ocr` — Baidu Unlimited-OCR tag stripping / OpenAI-compatible VLM + dialogue attribution
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const { parseChapter, unifyCharacterEntities, inferSpeakerGender } = require('../textParser');
const { voiceProfiler, VOICE_PALETTE, isGenericSpeakerKey, inferGenderFromSpeakerName } = require('../voiceProfiler');
const { parseWithGemini } = require('./geminiParser');
const {
  parseWithUnlimitedOcr,
  checkUnlimitedOcrAvailable,
  stripUnlimitedOcrTags,
} = require('./unlimitedOcrParser');

function getParserConfigPath() {
  return path.join(config.paths.outputDir, 'parser_config.json');
}

function normalizeEngineName(engine) {
  const raw = String(engine || 'heuristic').toLowerCase().trim();
  if (raw === 'ocr' || raw === 'unlimited_ocr') return 'unlimited-ocr';
  if (raw === 'gemini' || raw === 'ollama' || raw === 'unlimited-ocr' || raw === 'heuristic') {
    return raw;
  }
  return 'heuristic';
}

function slugifySpeakerId(name) {
  return String(name || 'unresolved')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'unresolved';
}

/**
 * Load effective runtime parser config by layering:
 *   defaults -> output/parser_config.json -> runtime options overrides
 */
function loadRuntimeParserConfig(options = {}) {
  let fileCfg = {};
  try {
    const cfgPath = options.parserConfigPath || getParserConfigPath();
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        fileCfg = parsed;
      }
    }
  } catch (err) {
    console.warn('[Parsers] Failed to read parser_config.json:', err.message);
  }

  const optCfg =
    (options.parserConfig && typeof options.parserConfig === 'object' && options.parserConfig) ||
    (options.config && typeof options.config === 'object' && options.config) ||
    {};

  const mergeSection = (key, defaults) => ({
    ...defaults,
    ...(fileCfg[key] && typeof fileCfg[key] === 'object' ? fileCfg[key] : {}),
    ...(optCfg[key] && typeof optCfg[key] === 'object' ? optCfg[key] : {}),
    ...(options[key] && typeof options[key] === 'object' ? options[key] : {}),
  });

  const heuristic = mergeSection('heuristic', {
    sensitivity: 'balanced',
    turnTaking: true,
    quoteStyle: 'auto',
  });
  if (options.sensitivity !== undefined) heuristic.sensitivity = options.sensitivity;
  if (options.turnTaking !== undefined) heuristic.turnTaking = Boolean(options.turnTaking);
  if (options.quoteStyle !== undefined) heuristic.quoteStyle = options.quoteStyle;

  const gemini = mergeSection('gemini', {
    apiKey: config.gemini?.apiKey || process.env.GEMINI_API_KEY || '',
    model: config.gemini?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    temperature: 0.1,
  });
  if (options.geminiApiKey !== undefined) gemini.apiKey = options.geminiApiKey;
  if (options.geminiModel !== undefined) gemini.model = options.geminiModel;
  if (options.geminiTemperature !== undefined) gemini.temperature = Number(options.geminiTemperature);
  if (!gemini.apiKey) {
    gemini.apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY || '';
  }

  const ollama = mergeSection('ollama', {
    url: config.ollama?.url || 'http://localhost:11434',
    model: config.ollama?.model || 'llama3:8b',
  });
  if (options.ollamaUrl !== undefined) ollama.url = options.ollamaUrl;
  if (options.ollamaModel !== undefined) ollama.model = options.ollamaModel;
  ollama.url = String(ollama.url || 'http://localhost:11434').replace(/\/+$/, '');

  const ocrDefaults = {
    baseUrl: config.unlimitedOcr?.url || 'http://localhost:8000/v1',
    model: config.unlimitedOcr?.model || 'baidu/Unlimited-OCR',
  };
  const ocrRaw = {
    ...ocrDefaults,
    ...(fileCfg.ocr && typeof fileCfg.ocr === 'object' ? fileCfg.ocr : {}),
    ...(optCfg.ocr && typeof optCfg.ocr === 'object' ? optCfg.ocr : {}),
    ...(optCfg['unlimited-ocr'] && typeof optCfg['unlimited-ocr'] === 'object' ? optCfg['unlimited-ocr'] : {}),
    ...(options.ocr && typeof options.ocr === 'object' ? options.ocr : {}),
  };
  if (options.unlimitedOcrUrl !== undefined) ocrRaw.baseUrl = options.unlimitedOcrUrl;
  if (options.ocrBaseUrl !== undefined) ocrRaw.baseUrl = options.ocrBaseUrl;
  if (options.unlimitedOcrModel !== undefined) ocrRaw.model = options.unlimitedOcrModel;
  if (options.ocrModel !== undefined) ocrRaw.model = options.ocrModel;
  ocrRaw.baseUrl = String(ocrRaw.baseUrl || 'http://localhost:8000/v1').replace(/\/+$/, '');

  const activeEngine = normalizeEngineName(
    options.parserEngine || options.parser_engine || optCfg.activeEngine || fileCfg.activeEngine || 'heuristic'
  );

  return {
    activeEngine,
    heuristic,
    gemini,
    ollama,
    ocr: ocrRaw,
  };
}

function extractVoiceIdString(resolved, fallback = 'en-GB-ThomasNeural') {
  if (typeof resolved === 'string' && resolved.trim()) return resolved.trim();
  if (resolved && typeof resolved === 'object' && typeof resolved.voiceId === 'string' && resolved.voiceId.trim()) {
    return resolved.voiceId.trim();
  }
  return fallback;
}

function ensureSegmentStringVoices(segments) {
  return (segments || []).map((seg) => {
    if (!seg) return seg;
    if (seg.type === 'image') {
      return {
        ...seg,
        voice_id: 'image',
        assigned_voice_id: 'image',
      };
    }
    const isNarr = seg.type === 'narration' || seg.speaker_id === 'narrator';
    const voiceId = isNarr
      ? VOICE_PALETTE.narrator
      : extractVoiceIdString(seg.assigned_voice_id || seg.voice_id, 'en-GB-ThomasNeural');
    return {
      ...seg,
      voice_id: voiceId,
      assigned_voice_id: voiceId,
    };
  });
}

function summarizeCharactersFromSegments(segments, { resolveVoices = true, includeNarrator = true } = {}) {
  const byId = new Map();
  let narrationCount = 0;
  let firstNarrationQuote = '';

  for (const seg of segments || []) {
    if (!seg || seg.type === 'image') continue;
    if (seg.type === 'narration' || seg.speaker_id === 'narrator') {
      narrationCount += 1;
      if (!firstNarrationQuote && seg.text) {
        firstNarrationQuote = String(seg.text).trim().slice(0, 220);
      }
      continue;
    }
    if (seg.type !== 'dialogue') continue;

    const id = seg.speaker_id || slugifySpeakerId(seg.speaker_name);
    if (!id || id === 'narrator' || id === 'image' || isGenericSpeakerKey(id)) continue;

    const displayName = seg.speaker_name && !isGenericSpeakerKey(seg.speaker_name) ? seg.speaker_name : id;
    const gender =
      seg.speaker_gender === 'male' || seg.speaker_gender === 'female'
        ? seg.speaker_gender
        : (seg.gender === 'male' || seg.gender === 'female'
            ? seg.gender
            : inferGenderFromSpeakerName(displayName, inferSpeakerGender(displayName)));

    let segVoice = extractVoiceIdString(seg.assigned_voice_id || seg.voice_id, '');
    if ((!segVoice || segVoice === VOICE_PALETTE.narrator) && resolveVoices) {
      const genderArg = gender === 'male' || gender === 'female' ? gender : null;
      segVoice = extractVoiceIdString(
        voiceProfiler.resolveCharacterVoice(displayName, '', genderArg),
        'en-GB-ThomasNeural'
      );
      if (segVoice === VOICE_PALETTE.narrator) {
        segVoice = 'en-GB-ThomasNeural';
      }
    }

    if (!byId.has(id)) {
      byId.set(id, {
        character_id: id,
        name: displayName,
        speaker_name: displayName,
        gender,
        description: '',
        line_count: 1,
        sample_quote: String(seg.text || '').trim().slice(0, 220),
        voice_id: resolveVoices ? segVoice || 'en-GB-ThomasNeural' : segVoice || null,
      });
    } else {
      const entry = byId.get(id);
      entry.line_count += 1;
      if (!entry.sample_quote && seg.text) {
        entry.sample_quote = String(seg.text).trim().slice(0, 220);
      }
      if ((!entry.voice_id || entry.voice_id === VOICE_PALETTE.narrator) && segVoice) {
        entry.voice_id = segVoice;
      }
    }
  }

  const list = [];
  if (includeNarrator) {
    list.push({
      character_id: 'narrator',
      name: 'Narrator',
      speaker_name: 'Narrator',
      gender: 'male',
      description: 'Primary narrative voice',
      line_count: narrationCount,
      sample_quote: firstNarrationQuote || 'Primary narrative voice.',
      voice_id: VOICE_PALETTE.narrator,
    });
  }
  for (const entry of byId.values()) {
    list.push(entry);
  }
  return list;
}

function parseJsonPayloadSafe(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.attributions)) return parsed.attributions;
    if (Array.isArray(parsed.speakers)) return parsed.speakers;
    if (Array.isArray(parsed.segments)) return parsed.segments;
    if (Array.isArray(parsed.results)) return parsed.results;
  }
  return [];
}

function buildLlmPromptWindow(segments, dialogueBatchIndices, knownSpeakers) {
  const minIdx = Math.max(0, dialogueBatchIndices[0] - 2);
  const maxIdx = Math.min(segments.length - 1, dialogueBatchIndices[dialogueBatchIndices.length - 1] + 2);
  const windowLines = [];
  for (let i = minIdx; i <= maxIdx; i++) {
    const s = segments[i];
    if (!s || s.type === 'image') continue;
    windowLines.push({
      index: i,
      type: s.type,
      heuristic_speaker: s.speaker_name,
      text: String(s.text || '').slice(0, 350),
    });
  }

  return [
    'Identify the exact speaking character for every "dialogue" line in the target indices below.',
    `Target dialogue indices: ${JSON.stringify(dialogueBatchIndices)}`,
    `Known characters so far: ${knownSpeakers.length > 0 ? knownSpeakers.join(', ') : 'Infer from prose context'}.`,
    'Rules:',
    '- Use exact full character names when known (e.g. "Mr. Sherlock Holmes", "Dr. Watson", "Irene Adler").',
    '- Never output "narrator", "unknown", "unresolved", "dialogue", or "character" as a speaker_name unless genuinely unidentifiable.',
    '- First-person spoken tags like "said I" / "cried I" belong to the active narrator-protagonist (e.g. "Dr. Watson" or "Protagonist").',
    'Return ONLY a JSON array of objects: [{"index": number, "speaker_name": "Name", "gender": "male"|"female"|"unknown", "confidence": 0.92}].',
    '',
    JSON.stringify(windowLines),
  ].join('\n');
}

function applyLlmAttributions(segments, attributions, llmSourceName) {
  const byIndex = new Map();
  for (const item of attributions || []) {
    if (!item || typeof item !== 'object') continue;
    const idx = Number(item.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= segments.length) continue;
    byIndex.set(idx, item);
  }

  return segments.map((seg, idx) => {
    if (!seg || seg.type !== 'dialogue' || !byIndex.has(idx)) return seg;
    const match = byIndex.get(idx);
    const candidateName = String(match.speaker_name || '').trim();
    if (!candidateName || isGenericSpeakerKey(candidateName)) {
      return seg;
    }

    // Do not downgrade an already high-confidence regex named match unless currently generic/turn-taken
    const isCurrentlyExplicit =
      (seg.attribution_source === 'regex_rule' || seg.attribution_source === 'regex') &&
      !isGenericSpeakerKey(seg.speaker_id);
    if (isCurrentlyExplicit && candidateName.toLowerCase() === String(seg.speaker_name || '').toLowerCase()) {
      return {
        ...seg,
        attribution_source: llmSourceName,
      };
    }

    const gender =
      match.gender === 'male' || match.gender === 'female'
        ? match.gender
        : inferGenderFromSpeakerName(candidateName, seg.speaker_gender || seg.gender);

    return {
      ...seg,
      speaker_name: candidateName,
      speaker_id: slugifySpeakerId(candidateName),
      gender,
      speaker_gender: gender,
      voice_id: null,
      assigned_voice_id: null,
      attribution_confidence: typeof match.confidence === 'number' ? match.confidence : 0.91,
      attribution_source: llmSourceName,
    };
  });
}

async function resolveSegmentsWithGemini(segments, geminiConfig, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const apiKey = String(geminiConfig.apiKey || '').trim();
  const model = String(geminiConfig.model || 'gemini-2.5-flash').trim();
  const temperature = Number.isFinite(Number(geminiConfig.temperature))
    ? Number(geminiConfig.temperature)
    : 0.1;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const dialogueIndices = [];
  const knownSet = new Set();
  segments.forEach((seg, idx) => {
    if (!seg || seg.type !== 'dialogue') return;
    dialogueIndices.push(idx);
    if (seg.speaker_name && !isGenericSpeakerKey(seg.speaker_id || seg.speaker_name)) {
      knownSet.add(seg.speaker_name);
    }
  });

  if (dialogueIndices.length === 0) {
    return segments;
  }

  const knownSpeakers = Array.from(knownSet);
  const requestedModel = model;
  const fallbackModel = 'gemini-2.5-flash';
  const batchSize = 35;
  let updated = [...segments];

  const callGeminiBatch = async (targetModel, prompt) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    return fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 30000),
    });
  };

  let activeModel = requestedModel;
  for (let i = 0; i < dialogueIndices.length; i += batchSize) {
    const batch = dialogueIndices.slice(i, i + batchSize);
    const prompt = buildLlmPromptWindow(updated, batch, knownSpeakers);

    let res = await callGeminiBatch(activeModel, prompt);
    let errText = '';
    if (!res.ok) {
      errText = await res.text().catch(() => '');
      const isUnsupportedOr404 =
        res.status === 404 ||
        /not found|is not supported|unsupported|invalid model|unknown model/i.test(errText);
      if (isUnsupportedOr404 && activeModel !== fallbackModel) {
        console.warn(`[Parsers] Gemini model '${activeModel}' returned HTTP ${res.status}; falling back to '${fallbackModel}'.`);
        activeModel = fallbackModel;
        res = await callGeminiBatch(activeModel, prompt);
        if (!res.ok) {
          errText = await res.text().catch(() => '');
        }
      }
    }

    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}${errText ? `: ${errText.slice(0, 140)}` : ''}`);
    }

    const data = await res.json();
    const textOut = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '[]';
    const attributions = parseJsonPayloadSafe(textOut);
    updated = applyLlmAttributions(updated, attributions, 'gemini_ai');
  }

  return updated;
}

async function resolveSegmentsWithOllama(segments, ollamaConfig, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const ollamaUrl = String(ollamaConfig.url || 'http://localhost:11434').replace(/\/+$/, '');
  const model = String(ollamaConfig.model || 'llama3:8b').trim();

  const dialogueIndices = [];
  const knownSet = new Set();
  segments.forEach((seg, idx) => {
    if (!seg || seg.type !== 'dialogue') return;
    dialogueIndices.push(idx);
    if (seg.speaker_name && !isGenericSpeakerKey(seg.speaker_id || seg.speaker_name)) {
      knownSet.add(seg.speaker_name);
    }
  });

  if (dialogueIndices.length === 0) {
    return segments;
  }

  const knownSpeakers = Array.from(knownSet);
  const endpoint = `${ollamaUrl}/api/generate`;
  const batchSize = 25;
  let updated = [...segments];

  for (let i = 0; i < dialogueIndices.length; i += batchSize) {
    const batch = dialogueIndices.slice(i, i + batchSize);
    const prompt = buildLlmPromptWindow(updated, batch, knownSpeakers);

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 25000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}${errText ? `: ${errText.slice(0, 140)}` : ''}`);
    }

    const data = await res.json();
    const rawOut = data?.response ?? data?.message?.content ?? '[]';
    const attributions = parseJsonPayloadSafe(rawOut);
    updated = applyLlmAttributions(updated, attributions, 'llm_fallback');
  }

  return updated;
}

async function refineWithOpenAiCompatibleOcr(rawText, ocrConfig, options = {}) {
  if (!options.imageBase64 && (!Array.isArray(options.pageImages) || options.pageImages.length === 0)) {
    return null;
  }

  const fetchImpl = options.fetchImpl || global.fetch;
  const baseUrl = String(ocrConfig.baseUrl || 'http://localhost:8000/v1').replace(/\/+$/, '');
  const model = String(ocrConfig.model || 'baidu/Unlimited-OCR').trim();
  const images = Array.isArray(options.pageImages) ? options.pageImages : [options.imageBase64];
  const texts = [];

  for (const img of images) {
    const imageUrl = String(img).startsWith('data:') ? img : `data:image/png;base64,${img}`;
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribe all prose and dialogue accurately in reading order as clean Markdown.',
              },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.0,
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 30000),
    });

    if (!res.ok) {
      throw new Error(`Unlimited-OCR HTTP ${res.status}`);
    }
    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content || '';
    if (content) texts.push(stripUnlimitedOcrTags(content));
  }

  return texts.join('\n\n').trim() || rawText;
}

/**
 * Parse a single chapter's raw text using the selected engine (`heuristic`, `gemini`, `ollama`, or `unlimited-ocr`)
 * and runtime configuration from `options` or `output/parser_config.json`.
 *
 * @param {string} rawText
 * @param {string} [title='Untitled Chapter']
 * @param {string} [chapterId='ch-1']
 * @param {string|null} [parserEngine=null]
 * @param {object} [options={}]
 */
async function parseChapterWithSelectedEngine(
  rawText,
  title = 'Untitled Chapter',
  chapterId = 'ch-1',
  parserEngine = null,
  options = {}
) {
  if (title && typeof title === 'object') {
    options = title;
    title = options.title || 'Untitled Chapter';
    chapterId = options.chapterId || options.chapter_id || 'ch-1';
    parserEngine = options.engine || options.parserEngine || options.parser_engine || null;
  }

  const runtimeConfig = loadRuntimeParserConfig(options);
  const requestedEngine = normalizeEngineName(parserEngine || runtimeConfig.activeEngine);

  if (options.model) {
    if (requestedEngine === 'gemini') runtimeConfig.gemini.model = options.model;
    else if (requestedEngine === 'ollama') runtimeConfig.ollama.model = options.model;
    else if (requestedEngine === 'unlimited-ocr') runtimeConfig.ocr.model = options.model;
  }

  let textToParse = String(rawText || '');
  let ocrTagsStripped = false;
  let actualEngine = requestedEngine;
  let fallbackReason = null;

  if (requestedEngine === 'unlimited-ocr') {
    const cleanedOcrText = stripUnlimitedOcrTags(textToParse);
    if (cleanedOcrText !== textToParse.trim()) {
      ocrTagsStripped = true;
    }
    textToParse = cleanedOcrText;

    if (options.imageBase64 || (Array.isArray(options.pageImages) && options.pageImages.length > 0)) {
      try {
        const transcribed = await refineWithOpenAiCompatibleOcr(textToParse, runtimeConfig.ocr, options);
        if (transcribed) textToParse = transcribed;
      } catch (ocrErr) {
        if (options.strict) throw ocrErr;
        console.warn(`[Parsers] Unlimited-OCR VLM endpoint unavailable (${ocrErr.message}). Parsing text locally.`);
        fallbackReason = ocrErr.message;
      }
    }
  }

  const baseParsed = parseChapter(textToParse, title, chapterId, runtimeConfig.heuristic);
  let segments = baseParsed.segments || [];

  if (requestedEngine === 'gemini') {
    try {
      segments = await resolveSegmentsWithGemini(segments, runtimeConfig.gemini, options);
      segments = unifyCharacterEntities(segments).segments;
      actualEngine = 'gemini';
    } catch (geminiErr) {
      if (options.strict) throw geminiErr;
      console.warn(`[Parsers] Gemini chapter parsing failed (${geminiErr.message}). Falling back to heuristic.`);
      actualEngine = 'heuristic';
      fallbackReason = geminiErr.message;
    }
  } else if (requestedEngine === 'ollama') {
    try {
      segments = await resolveSegmentsWithOllama(segments, runtimeConfig.ollama, options);
      segments = unifyCharacterEntities(segments).segments;
      actualEngine = 'ollama';
    } catch (ollamaErr) {
      if (options.strict) throw ollamaErr;
      console.warn(`[Parsers] Ollama chapter parsing failed (${ollamaErr.message}). Falling back to heuristic.`);
      actualEngine = 'heuristic';
      fallbackReason = ollamaErr.message;
    }
  } else if (requestedEngine === 'unlimited-ocr') {
    if (ocrTagsStripped || options.imageBase64 || options.pageImages) {
      segments = segments.map((seg) =>
        seg && seg.type === 'dialogue'
          ? { ...seg, attribution_source: seg.attribution_source === 'unresolved' ? 'unlimited_ocr' : seg.attribution_source }
          : seg
      );
    }
    actualEngine = 'unlimited-ocr';
  }

  const shouldApplyVoices = options.applyVoices !== false;
  const finalSegments = shouldApplyVoices
    ? ensureSegmentStringVoices(voiceProfiler.applyVoicesToSegments(segments))
    : segments;

  return {
    chapter_id: chapterId,
    title,
    parser_engine: actualEngine,
    requested_engine: requestedEngine,
    parser_fallback_reason: fallbackReason,
    ocr_tags_stripped: ocrTagsStripped,
    segments: finalSegments,
    characters: summarizeCharactersFromSegments(finalSegments, {
      resolveVoices: shouldApplyVoices,
      includeNarrator: true,
    }),
  };
}

/**
 * Enrich extracted chapters (from local Python extractor, Gemini, or Unlimited-OCR)
 * by running parseChapterWithSelectedEngine on every chapter missing/empty segments,
 * unifying character entities across the manuscript, applying consistent neural voices,
 * and building a deduplicated novel-wide characters[] roster (always including Narrator).
 */
async function enrichExtractedChaptersWithParser(extracted, opts = {}) {
  if (!extracted || typeof extracted !== 'object') return extracted;

  const settings = opts.settings || opts.parserConfig || opts.config || {};
  const engine = normalizeEngineName(
    opts.engine || opts.parserEngine || opts.parser_engine || extracted.parser_engine || 'heuristic'
  );
  const model = opts.model || null;
  const runtimeOptions = {
    ...opts,
    parserConfig: settings && typeof settings === 'object' ? settings : {},
    config: settings && typeof settings === 'object' ? settings : {},
    engine,
    model,
    applyVoices: true,
    strict: false,
  };

  const rawChapters = Array.isArray(extracted.chapters) ? extracted.chapters : [];
  const parsedChapterOutputs = [];
  let fallbackReason = extracted.parser_fallback_reason || null;

  for (let idx = 0; idx < rawChapters.length; idx++) {
    const ch = rawChapters[idx];
    if (!ch || typeof ch !== 'object') {
      parsedChapterOutputs.push(ch);
      continue;
    }

    const hasSegments = Array.isArray(ch.segments) && ch.segments.length > 0;
    if (!hasSegments) {
      const chText = ch.content_text || ch.raw_text || ch.text || ch.content || '';
      if (String(chText).trim()) {
        const parsedCh = await parseChapterWithSelectedEngine(
          String(chText),
          ch.title || `Chapter ${ch.chapter_number || idx + 1}`,
          ch.chapter_id || `ch-${ch.chapter_number || idx + 1}`,
          engine,
          runtimeOptions
        );
        if (parsedCh.parser_fallback_reason && !fallbackReason) {
          fallbackReason = parsedCh.parser_fallback_reason;
        }
        parsedChapterOutputs.push({
          ...ch,
          segments: parsedCh.segments || [],
        });
      } else {
        parsedChapterOutputs.push({
          ...ch,
          segments: [],
        });
      }
    } else {
      parsedChapterOutputs.push({ ...ch });
    }
  }

  const bounds = [];
  const allSegments = [];
  for (const ch of parsedChapterOutputs) {
    const start = allSegments.length;
    const chSegs = Array.isArray(ch?.segments) ? ch.segments : [];
    allSegments.push(...chSegs);
    bounds.push({ start, end: allSegments.length });
  }

  const unified = unifyCharacterEntities(
    allSegments,
    Array.isArray(extracted.characters) ? extracted.characters : []
  );
  const voicedAll = ensureSegmentStringVoices(
    voiceProfiler.applyVoicesToSegments(unified.segments, unified.characters)
  );

  const enrichedChapters = parsedChapterOutputs.map((ch, idx) => {
    if (!ch || typeof ch !== 'object') return ch;
    const { start, end } = bounds[idx];
    const chSegments = voicedAll.slice(start, end).map((seg, sIdx) => ({
      ...seg,
      order: sIdx + 1,
      segment_id: seg.segment_id || sIdx + 1,
    }));
    return {
      ...ch,
      segments: chSegments,
    };
  });

  const voiceByCharId = new Map();
  let narrationCount = 0;
  let firstNarrationQuote = '';
  for (const seg of voicedAll) {
    if (!seg || seg.type === 'image') continue;
    if (seg.type === 'narration' || seg.speaker_id === 'narrator') {
      narrationCount += 1;
      if (!firstNarrationQuote && seg.text) {
        firstNarrationQuote = String(seg.text).trim().slice(0, 220);
      }
      continue;
    }
    if (seg.type === 'dialogue' && seg.speaker_id && !isGenericSpeakerKey(seg.speaker_id)) {
      if (
        !voiceByCharId.has(seg.speaker_id) &&
        typeof seg.voice_id === 'string' &&
        seg.voice_id &&
        seg.voice_id !== VOICE_PALETTE.narrator
      ) {
        voiceByCharId.set(seg.speaker_id, seg.voice_id);
      }
    }
  }

  const finalCharacters = [
    {
      character_id: 'narrator',
      name: 'Narrator',
      gender: 'male',
      description: 'Primary narrative voice',
      line_count: narrationCount,
      sample_quote: firstNarrationQuote || 'Primary narrative voice.',
      voice_id: VOICE_PALETTE.narrator,
    },
  ];

  const seenCharIds = new Set(['narrator']);
  for (const c of unified.characters || []) {
    if (!c || !c.character_id || seenCharIds.has(c.character_id) || isGenericSpeakerKey(c.character_id)) continue;
    seenCharIds.add(c.character_id);

    const charGender =
      c.gender === 'male' || c.gender === 'female'
        ? c.gender
        : inferGenderFromSpeakerName(c.name, inferSpeakerGender(c.name));
    const genderArg = charGender === 'male' || charGender === 'female' ? charGender : null;

    let voiceId =
      voiceByCharId.get(c.character_id) ||
      (typeof c.voice_id === 'string' && c.voice_id && c.voice_id !== VOICE_PALETTE.narrator
        ? c.voice_id
        : null);
    if (!voiceId) {
      voiceId = extractVoiceIdString(
        voiceProfiler.resolveCharacterVoice(c.name, '', genderArg),
        'en-GB-ThomasNeural'
      );
      if (voiceId === VOICE_PALETTE.narrator) {
        voiceId = 'en-GB-ThomasNeural';
      }
    }

    finalCharacters.push({
      character_id: c.character_id,
      name: c.name,
      gender: charGender,
      description: c.description || '',
      line_count: Number(c.line_count) || 0,
      sample_quote: c.sample_quote || '',
      voice_id: voiceId,
    });
  }

  return {
    ...extracted,
    chapters: enrichedChapters,
    characters: finalCharacters,
    parser_fallback_reason: fallbackReason,
  };
}

/**
 * Parse an uploaded EPUB / PDF / TXT manuscript using the configured engine.
 * Preserves existing extractor contracts while enriching chapters and characters across all 4 engines.
 */
async function parseUploadedManuscript(filePath, options = {}) {
  const runtimeConfig = loadRuntimeParserConfig(options);
  const engine = normalizeEngineName(
    options.parserEngine || options.parser_engine || runtimeConfig.activeEngine
  );
  const runLocalExtractor = options.runLocalExtractor;

  if (engine === 'gemini') {
    try {
      const geminiData = await parseWithGemini(filePath, {
        ...options,
        apiKey: options.apiKey || runtimeConfig.gemini.apiKey,
        model: options.model || runtimeConfig.gemini.model,
        temperature: options.temperature ?? runtimeConfig.gemini.temperature,
      });
      return await enrichExtractedChaptersWithParser(geminiData, {
        ...options,
        engine: 'gemini',
        model: options.model || runtimeConfig.gemini.model,
        settings: runtimeConfig,
      });
    } catch (geminiErr) {
      if (options.strict) throw geminiErr;
      console.warn(
        `[Parsers] Gemini parser failed (${geminiErr.message}). Falling back to local heuristic extractor.`
      );
      if (typeof runLocalExtractor === 'function') {
        const fallbackData = await runLocalExtractor(filePath);
        const enrichedFallback = await enrichExtractedChaptersWithParser(fallbackData, {
          ...options,
          engine: 'heuristic',
          settings: runtimeConfig,
        });
        return {
          ...enrichedFallback,
          parser_engine: 'heuristic',
          parser_fallback_reason: geminiErr.message,
        };
      }
      throw geminiErr;
    }
  }

  if (engine === 'unlimited-ocr') {
    try {
      const ocrData = await parseWithUnlimitedOcr(filePath, {
        ...options,
        unlimitedOcrUrl: options.unlimitedOcrUrl || runtimeConfig.ocr.baseUrl,
        unlimitedOcrModel: options.unlimitedOcrModel || runtimeConfig.ocr.model,
      });
      return await enrichExtractedChaptersWithParser(ocrData, {
        ...options,
        engine: 'unlimited-ocr',
        model: options.unlimitedOcrModel || runtimeConfig.ocr.model,
        settings: runtimeConfig,
      });
    } catch (ocrErr) {
      if (options.strict) throw ocrErr;
      console.warn(
        `[Parsers] Unlimited-OCR parser failed (${ocrErr.message}). Falling back to local heuristic extractor.`
      );
      if (typeof runLocalExtractor === 'function') {
        const fallbackData = await runLocalExtractor(filePath);
        const enrichedFallback = await enrichExtractedChaptersWithParser(fallbackData, {
          ...options,
          engine: 'heuristic',
          settings: runtimeConfig,
        });
        return {
          ...enrichedFallback,
          parser_engine: 'heuristic',
          parser_fallback_reason: ocrErr.message,
        };
      }
      throw ocrErr;
    }
  }

  if (typeof runLocalExtractor !== 'function') {
    throw new Error(`runLocalExtractor callback is required for ${engine} parser.`);
  }

  const heuristicData = await runLocalExtractor(filePath);

  if (engine === 'ollama') {
    const fetchImpl = options.fetchImpl || global.fetch;
    let ollamaReachable = false;
    let fallbackReason = null;

    try {
      const res = await fetchImpl(`${runtimeConfig.ollama.url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(options.probeTimeoutMs || 1500),
      });
      ollamaReachable = Boolean(res && res.ok);
      if (!ollamaReachable) {
        fallbackReason = `Ollama endpoint returned HTTP ${res?.status || 'error'}`;
      }
    } catch (err) {
      ollamaReachable = false;
      fallbackReason = err.message;
    }

    if (!ollamaReachable) {
      if (options.strict) {
        throw new Error(`Ollama is unreachable at ${runtimeConfig.ollama.url}: ${fallbackReason}`);
      }
      console.warn(
        `[Parsers] Ollama unreachable (${fallbackReason}). Falling back to local heuristic chapters.`
      );
      const enrichedFallback = await enrichExtractedChaptersWithParser(heuristicData, {
        ...options,
        engine: 'heuristic',
        settings: runtimeConfig,
      });
      return {
        ...enrichedFallback,
        parser_engine: 'heuristic',
        parser_fallback_reason: fallbackReason,
      };
    }

    const enrichedOllama = await enrichExtractedChaptersWithParser(heuristicData, {
      ...options,
      engine: 'ollama',
      model: options.ollamaModel || runtimeConfig.ollama.model,
      settings: runtimeConfig,
    });
    return {
      ...enrichedOllama,
      parser_engine:
        enrichedOllama.parser_fallback_reason &&
        enrichedOllama.chapters.every((c) => !c.segments || c.segments.length === 0)
          ? 'heuristic'
          : 'ollama',
    };
  }

  const enrichedHeuristic = await enrichExtractedChaptersWithParser(heuristicData, {
    ...options,
    engine: 'heuristic',
    settings: runtimeConfig,
  });
  return {
    ...enrichedHeuristic,
    parser_engine: 'heuristic',
  };
}

async function getParsersStatus(options = {}) {
  const runtimeConfig = loadRuntimeParserConfig(options);
  const geminiConfigured = Boolean(String(runtimeConfig.gemini.apiKey || '').trim());
  const geminiModel = runtimeConfig.gemini.model || 'gemini-2.5-flash';

  const unlimitedOcrStatus = await checkUnlimitedOcrAvailable({
    ...options,
    unlimitedOcrUrl: runtimeConfig.ocr.baseUrl,
    unlimitedOcrModel: runtimeConfig.ocr.model,
  });

  let ollamaAvailable = false;
  try {
    const fetchImpl = options.fetchImpl || global.fetch;
    const res = await fetchImpl(`${runtimeConfig.ollama.url}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(1200),
    });
    ollamaAvailable = Boolean(res && res.ok);
  } catch (_) {
    ollamaAvailable = false;
  }

  const ocrStatus = {
    available: unlimitedOcrStatus.available,
    reachable: unlimitedOcrStatus.available,
    url: unlimitedOcrStatus.url || runtimeConfig.ocr.baseUrl,
    model: unlimitedOcrStatus.model || runtimeConfig.ocr.model,
    label: 'Baidu Unlimited-OCR (Self-Hosted vLLM)',
  };

  return {
    heuristic: {
      available: true,
      reachable: true,
      sensitivity: runtimeConfig.heuristic.sensitivity,
      turnTaking: runtimeConfig.heuristic.turnTaking,
      quoteStyle: runtimeConfig.heuristic.quoteStyle,
      label: 'Fast Local Heuristic (EPUB / PDF / TXT)',
    },
    gemini: {
      available: geminiConfigured,
      reachable: geminiConfigured,
      configured: geminiConfigured,
      model: geminiModel,
      temperature: runtimeConfig.gemini.temperature,
      label: `Google Gemini Multimodal (${geminiModel})`,
    },
    unlimited_ocr: ocrStatus,
    'unlimited-ocr': ocrStatus,
    ollama: {
      available: ollamaAvailable,
      reachable: ollamaAvailable,
      url: runtimeConfig.ollama.url,
      model: runtimeConfig.ollama.model,
      label: 'Local Ollama Engine',
    },
  };
}

module.exports = {
  parseUploadedManuscript,
  parseChapterWithSelectedEngine,
  enrichExtractedChaptersWithParser,
  getParsersStatus,
  loadRuntimeParserConfig,
  getParserConfigPath,
};
