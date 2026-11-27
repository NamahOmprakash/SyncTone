const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { Chapter } = require('../models');
const { parseChapter } = require('../engine/textParser');
const parsers = require('../engine/parsers');
const { attributionEngine } = require('../engine/attribution');
const { voiceProfiler } = require('../engine/voiceProfiler');
const { ttsEngine } = require('../engine/ttsEngine');
const { audioStitcher } = require('../engine/audioStitcher');
const { eventDispatcher } = require('../engine/eventDispatcher');
const { validateAudioBuffer } = require('../engine/audioValidator');
const { broadcastProgress } = require('../websocket');
const { config } = require('../config');
const { authenticateUser, requireRole } = require('../middleware/auth');
const { getSwiftAuth } = require('./swift');
const { storageService, parseByteRange, pipeStreamSafe } = require('../services/storageService');
const statusRouter = require('./status');
const voicesRouter = require('./voices');

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

// Ensure Mongoose manifest schema accepts engine, studio_engine, engines_used, and resolved_voice_id
try {
  if (Chapter.schema?.paths?.['manifest']?.schema) {
    const mSchema = Chapter.schema.paths['manifest'].schema;
    if (!mSchema.paths['engine']) {
      mSchema.add({
        engine: { type: String, default: 'auto' },
        studio_engine: { type: String, default: 'auto' },
        engines_used: { type: [String], default: [] },
      });
    }
    if (!mSchema.paths['healed_unresolved_engine']) {
      mSchema.add({
        healed_unresolved_engine: { type: String, default: null },
      });
    }
    if (mSchema.paths['timeline']?.schema) {
      const tSchema = mSchema.paths['timeline'].schema;
      if (!tSchema.paths['resolved_voice_id']) {
        tSchema.add({ resolved_voice_id: { type: String, default: null } });
      }
    }
  }
} catch (_) {}

function persistChapterToDisk(chapterId, title, text) {
  try {
    const chapterDir = path.join(config.paths.chaptersDir, chapterId);
    if (!fs.existsSync(chapterDir)) {
      fs.mkdirSync(chapterDir, { recursive: true });
    }
    fs.writeFileSync(path.join(chapterDir, 'raw.txt'), text, 'utf-8');
    fs.writeFileSync(
      path.join(chapterDir, 'metadata.json'),
      JSON.stringify({ title, chapter_id: chapterId }),
      'utf-8'
    );
  } catch (err) {
    console.warn('[Chapters] Failed to write disk backup:', err.message);
  }
}

async function getOrCreateDefaultNovel(ownerId) {
  if (!ownerId || !UUID_REGEX.test(String(ownerId))) {
    throw { status: 401, message: 'Authentication required to select or create a novel.' };
  }
  const existingOwned = await pool.query(
    'SELECT id FROM novels WHERE added_by = $1 ORDER BY created_at ASC LIMIT 1',
    [ownerId]
  );
  if (existingOwned.rows.length > 0) {
    return existingOwned.rows[0].id;
  }
  const novelRes = await pool.query(
    `
    INSERT INTO novels (title, synopsis, channel, added_by)
    VALUES ('Uploaded Chapters', 'Default novel for direct chapter uploads.', 'community', $1)
    RETURNING id;
  `,
    [ownerId]
  );
  return novelRes.rows[0].id;
}

const DEAD_LEGACY_VOICES = new Set([
  'en-GB-ArthurNeural',
  'en-GB-AlfieNeural',
  'en-GB-NoahNeural',
  'en-GB-OliverNeural',
  'en-GB-BellaNeural',
  'en-US-Guy24kNeural',
  'en-AU-WilliamNeural',
]);

const DEAD_LEGACY_ARRAY = Array.from(DEAD_LEGACY_VOICES);

const BARE_HONORIFIC_NAMES = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'sir',
  'lord',
  'lady',
  'madam',
]);

const STALE_GENERIC_SPEAKER_NAMES = new Set([
  ...BARE_HONORIFIC_NAMES,
  'unknown',
  'unresolved',
  'dialogue_speaker',
  'speaker_a',
  'speaker_b',
  'dialogue_turn_even',
  'dialogue_turn_odd',
]);

const STALE_GENERIC_NAMES_ARRAY = Array.from(STALE_GENERIC_SPEAKER_NAMES);

const VALID_MONGO_SOURCES = new Set([
  'regex_rule',
  'dependency_tree',
  'llm_fallback',
  'gemini_ai',
  'unlimited_ocr',
  'context_alternation',
  'context_continuation',
  'narrator_default',
  'manual',
  'unresolved',
  'image',
]);

function sanitizeSegmentSource(rawSource, isImage, isNarrator, characterId) {
  if (isImage) return 'image';
  const src = String(rawSource || '').trim().toLowerCase();
  if (VALID_MONGO_SOURCES.has(src)) return src;
  if (src === 'gemini' || src.startsWith('gemini')) return 'gemini_ai';
  if (src === 'ocr' || src === 'unlimited-ocr' || src.includes('ocr')) return 'unlimited_ocr';
  if (src === 'ollama' || src === 'llm') return 'llm_fallback';
  if (isNarrator) return 'narrator_default';
  if (characterId === 'unresolved' || characterId === 'unknown') return 'unresolved';
  return 'regex_rule';
}

function mapVoicedSegmentsToManifest(voicedSegments = [], chapterId = '1', existingVoiceMap = null) {
  let currentMs = 0;
  const mappedSegments = voicedSegments.map((s, segIdx) => {
    const isImage = s.type === 'image' || (s.text && s.text.startsWith('[IMAGE:'));
    const words = (s.text || '').trim().split(/\s+/).filter(Boolean).length;
    const durationMs = isImage ? 1000 : Math.max(800, Math.round((words / 2.8) * 1000));
    const start_ms = currentMs;
    const end_ms = start_ms + durationMs;
    currentMs = end_ms + 250;

    const speakerId = isImage
      ? 'image'
      : (s.speaker_id || s.character_id || (s.type === 'narration' ? 'narrator' : 'unknown'));
    const isNarr = speakerId === 'narrator' || s.type === 'narration';
    const speakerName = isImage
      ? 'Illustration'
      : (s.speaker_name || (isNarr ? 'Narrator' : 'Unknown'));

    const rawVoice = s.assigned_voice_id || s.voice_id;
    const normalizedVoice = DEAD_LEGACY_VOICES.has(rawVoice) ? null : rawVoice;
    const overrideVoice =
      !isImage && existingVoiceMap && (existingVoiceMap.get(speakerName.toLowerCase()) || existingVoiceMap.get(speakerId.toLowerCase()));
    const voiceId = overrideVoice || normalizedVoice || (isNarr ? 'en-GB-RyanNeural' : 'en-GB-ThomasNeural');

    return {
      order: segIdx + 1,
      segment_id: segIdx + 1,
      type: isImage ? 'image' : (isNarr ? 'narration' : 'dialogue'),
      text: s.text,
      image_url: s.image_url || (isImage && s.text ? (s.text.match(/\[IMAGE:([^\]]+)\]/) || [])[1] : null),
      character_id: speakerId,
      speaker_id: speakerId,
      speaker_name: speakerName,
      voice_id: voiceId,
      assigned_voice_id: voiceId,
      start_ms,
      end_ms,
      confidence:
        typeof s.attribution_confidence === 'number'
          ? s.attribution_confidence
          : (typeof s.confidence === 'number' ? s.confidence : 1.0),
      source: sanitizeSegmentSource(s.attribution_source || s.source, isImage, isNarr, speakerId),
      needs_review: Boolean(s.needs_review),
    };
  });

  const totalDurationMs = mappedSegments.length > 0 ? mappedSegments[mappedSegments.length - 1].end_ms : 0;
  const timeline = mappedSegments.map((s) => ({
    order: s.order,
    segment_id: s.segment_id,
    start_ms: s.start_ms,
    end_ms: s.end_ms,
    character_id: s.character_id,
    voice_id: s.voice_id,
    text: s.text,
    type: s.type,
    image_url: s.image_url || null,
  }));

  return {
    mappedSegments,
    totalDurationMs,
    timeline,
  };
}

function buildParsedSegmentsAndManifest(rawText, chapterTitle, chapterId) {
  const parsedData = parseChapter(rawText || '', chapterTitle || 'Chapter', String(chapterId || '1'));
  const voicedSegments = voiceProfiler.applyVoicesToSegments(parsedData.segments || []);
  return mapVoicedSegmentsToManifest(voicedSegments, chapterId);
}

async function fetchPgCharacterVoiceMap(pgPool, novelId) {
  const map = new Map();
  if (!pgPool || !novelId) return map;
  try {
    const res = await pgPool.query(
      'SELECT canonical_name, voice_id, is_narrator FROM characters WHERE novel_id = $1 AND voice_id IS NOT NULL',
      [novelId]
    );
    for (const row of res.rows || []) {
      const name = String(row.canonical_name || '').trim();
      const v = String(row.voice_id || '').trim();
      if (!name || !v) continue;
      if (DEAD_LEGACY_VOICES.has(v)) continue;
      if (STALE_GENERIC_SPEAKER_NAMES.has(name.toLowerCase())) continue;
      if (!row.is_narrator && v === 'en-GB-RyanNeural') continue;
      map.set(name.toLowerCase(), v);
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (slug) map.set(slug, v);
    }
  } catch (_) {}
  return map;
}

async function upsertDiscoveredCharactersPg(pgPool, novelId, mappedSegments = [], { pruneStale = false } = {}) {
  if (!pgPool || !novelId) return [];
  const discovered = new Map();

  let hasExistingNarrator = false;
  try {
    const narrCheck = await pgPool.query(
      'SELECT id FROM characters WHERE novel_id = $1 AND is_narrator = true LIMIT 1',
      [novelId]
    );
    hasExistingNarrator = narrCheck.rows.length > 0;
  } catch (_) {}

  if (!hasExistingNarrator) {
    discovered.set('narrator', {
      canonicalName: 'Narrator',
      voiceId: 'en-GB-RyanNeural',
      isNarrator: true,
      sampleQuote: 'Primary narrative voice.',
    });
  }

  for (const s of mappedSegments) {
    if (!s || s.type === 'image') continue;
    const sid = String(s.speaker_id || s.character_id || '').trim();
    const sname = String(s.speaker_name || '').trim();
    if (
      !sid ||
      sid === 'narrator' ||
      sid === 'unresolved' ||
      sid === 'unknown' ||
      sid === 'unknown_speaker' ||
      sid === 'dialogue_speaker' ||
      sid === 'dialogue_turn_even' ||
      sid === 'dialogue_turn_odd' ||
      sid === 'speaker_a' ||
      sid === 'speaker_b' ||
      sid === 'image' ||
      !sname ||
      sname === 'Narrator' ||
      sname === 'Unknown' ||
      STALE_GENERIC_SPEAKER_NAMES.has(sname.toLowerCase())
    ) {
      continue;
    }
    const rawVoiceId = s.assigned_voice_id || s.voice_id || 'en-GB-ThomasNeural';
    const voiceId = DEAD_LEGACY_VOICES.has(rawVoiceId) ? 'en-GB-ThomasNeural' : rawVoiceId;
    const key = sname.toLowerCase();
    if (!discovered.has(key)) {
      discovered.set(key, {
        canonicalName: sname,
        voiceId,
        isNarrator: false,
        sampleQuote: String(s.text || '').slice(0, 220),
      });
    }
  }

  const savedNames = [];
  for (const entry of discovered.values()) {
    try {
      await pgPool.query(
        `INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator)
         VALUES ($1, $2, 'other', 'adult', 'en-us', $3)
         ON CONFLICT (id) DO NOTHING`,
        [entry.voiceId, entry.voiceId, entry.isNarrator]
      );
      await pgPool.query(
        `INSERT INTO characters (novel_id, canonical_name, gender, age_band, temperament, sample_quote, voice_id, speed_multiplier, is_narrator, source)
         VALUES ($1, $2, 'unknown', 'adult', 'calm', $3, $4, 1.0, $5, 'manual')
         ON CONFLICT (novel_id, canonical_name)
         DO UPDATE SET
           voice_id = CASE
             WHEN characters.voice_id IS NULL OR characters.voice_id = ANY($6::text[]) THEN EXCLUDED.voice_id
             ELSE characters.voice_id
           END,
           updated_at = now()`,
        [novelId, entry.canonicalName, entry.sampleQuote, entry.voiceId, entry.isNarrator, DEAD_LEGACY_ARRAY]
      );
      savedNames.push(entry.canonicalName);
    } catch (err) {
      console.warn(`[Chapters] Non-fatal character upsert warning for '${entry.canonicalName}': ${err.message}`);
    }
  }

  if (pruneStale) {
    try {
      const discoveredLower = Array.from(discovered.keys());
      await pgPool.query(
        `DELETE FROM characters
         WHERE novel_id = $1
           AND is_narrator = false
           AND (
             LOWER(TRIM(canonical_name)) = ANY($2::text[])
             OR (canonical_name ~ '^[A-Za-z. ]+\\s+[a-z]+ly$' AND NOT (LOWER(TRIM(canonical_name)) = ANY($3::text[])))
           )`,
        [novelId, STALE_GENERIC_NAMES_ARRAY, discoveredLower]
      );
      // Replace any dead legacy voices on other characters in the novel with en-US-RogerNeural
      await pgPool.query(
        `INSERT INTO voices (id, label, gender, age_band, language, reserved_narrator)
         VALUES ('en-US-RogerNeural', 'en-US-RogerNeural', 'male', 'adult', 'en-us', false)
         ON CONFLICT (id) DO NOTHING`
      );
      await pgPool.query(
        `UPDATE characters
         SET voice_id = CASE
           WHEN voice_id = 'en-GB-ArthurNeural' THEN 'en-US-RogerNeural'
           WHEN voice_id = 'en-GB-NoahNeural' THEN 'en-AU-WilliamMultilingualNeural'
           WHEN voice_id = 'en-GB-AlfieNeural' THEN 'en-NZ-MitchellNeural'
           WHEN voice_id = 'en-GB-OliverNeural' THEN 'en-GB-ThomasNeural'
           WHEN voice_id = 'en-GB-BellaNeural' THEN 'en-GB-LibbyNeural'
           ELSE 'en-US-RogerNeural'
         END,
         updated_at = now()
         WHERE novel_id = $1 AND voice_id = ANY($2::text[])`,
        [novelId, DEAD_LEGACY_ARRAY]
      );
    } catch (pruneErr) {
      console.warn(`[Chapters] Non-fatal stale character cleanup warning: ${pruneErr.message}`);
    }
  }
  return savedNames;
}

function toVoiceIdString(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const inner = value.voiceId || value.voice_id || null;
    return typeof inner === 'string' && !DEAD_LEGACY_VOICES.has(inner.trim()) ? inner.trim() : null;
  }
  const str = String(value).trim();
  return str && !DEAD_LEGACY_VOICES.has(str) ? str : null;
}

async function runSelectedChapterParser(
  rawText,
  chapterTitle,
  chapterId,
  parserEngine = null,
  parserConfig = null,
  onProgress = null,
  voiceMap = null
) {
  const savedConfig = typeof statusRouter.loadParserConfig === 'function' ? statusRouter.loadParserConfig() : {};
  const mergedConfig = {
    ...savedConfig,
    ...(parserConfig && typeof parserConfig === 'object' ? parserConfig : {}),
  };
  const selectedEngine = String(parserEngine || mergedConfig.activeEngine || 'heuristic').toLowerCase().trim();
  const normalizedEngine = selectedEngine === 'unlimited-ocr' ? 'ocr' : selectedEngine;

  let parsedData = null;
  let usedEngine = 'heuristic';

  if (typeof parsers.parseChapterWithSelectedEngine === 'function') {
    const parserArg = normalizedEngine === 'ocr' ? 'unlimited-ocr' : normalizedEngine;
    const engineSpecificConfig = mergedConfig[normalizedEngine] || {};
    const result = await parsers.parseChapterWithSelectedEngine(
      rawText || '',
      chapterTitle || 'Chapter',
      String(chapterId || '1'),
      parserArg,
      {
        parserEngine: parserArg,
        parserConfig: mergedConfig,
        config: mergedConfig,
        engineConfig: engineSpecificConfig,
        heuristic: mergedConfig.heuristic,
        gemini: mergedConfig.gemini,
        ollama: mergedConfig.ollama,
        ocr: mergedConfig.ocr,
        applyVoices: false,
      }
    );
    if (result && Array.isArray(result.segments)) {
      parsedData = result;
      usedEngine = result.parser_engine || parserArg;
    }
  }

  if (!parsedData) {
    const parsed = parseChapter(rawText || '', chapterTitle || 'Chapter', String(chapterId || '1'));
    if (onProgress) onProgress(parsed.segments.length);
    const knownChars = Array.from(
      new Set(
        (parsed.segments || [])
          .filter((s) => s.speaker_name && s.speaker_id !== 'unresolved' && s.speaker_id !== 'narrator')
          .map((s) => s.speaker_name)
      )
    );
    if (knownChars.length > 0 && attributionEngine?.resolveUnattributed) {
      parsed.segments = await attributionEngine.resolveUnattributed(parsed.segments, knownChars);
    }
    parsedData = parsed;
    usedEngine = 'heuristic';
  }

  const parsedCharacters = Array.isArray(parsedData.characters) ? parsedData.characters : [];
  let segments = voiceProfiler.applyVoicesToSegments(parsedData.segments || [], parsedCharacters, voiceMap);

  if (voiceMap && voiceMap.size > 0) {
    segments = segments.map((s) => {
      if (!s || s.type === 'image') return s;
      const sid = String(s.speaker_id || s.character_id || '').toLowerCase();
      const sname = String(s.speaker_name || '').toLowerCase();
      const isNarr = s.type === 'narration' || sid === 'narrator' || sname === 'narrator';
      const override = isNarr
        ? voiceMap.get('narrator')
        : (voiceMap.get(sname) || voiceMap.get(sid));
      if (override) {
        return { ...s, assigned_voice_id: override, voice_id: override };
      }
      return s;
    });
  }

  // Normalize segments & collect resolved string voice_ids per character
  const segStatsByKey = new Map();
  let narratorVoice = toVoiceIdString(voiceMap?.get('narrator')) || 'en-GB-RyanNeural';
  let narratorCount = 0;
  let narratorQuote = '';

  segments = segments.map((s) => {
    if (!s || s.type === 'image') return s;
    const isNarr = s.type === 'narration' || String(s.speaker_id || s.character_id || '').toLowerCase() === 'narrator';
    const resolvedVoice =
      toVoiceIdString(s.assigned_voice_id) ||
      toVoiceIdString(s.voice_id) ||
      (isNarr ? narratorVoice : 'en-GB-ThomasNeural');

    if (isNarr) {
      narratorVoice = resolvedVoice;
      narratorCount += 1;
      if (!narratorQuote && s.text) narratorQuote = String(s.text).slice(0, 220);
      return { ...s, assigned_voice_id: resolvedVoice, voice_id: resolvedVoice };
    }

    const sid = String(s.speaker_id || s.character_id || '').trim();
    const sname = String(s.speaker_name || sid || '').trim();
    const slug = sname.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const keys = [sid.toLowerCase(), sname.toLowerCase(), slug].filter(Boolean);
    for (const k of keys) {
      const prev = segStatsByKey.get(k);
      if (!prev) {
        segStatsByKey.set(k, {
          character_id: sid || slug || sname.toLowerCase(),
          name: sname,
          gender: s.speaker_gender || s.gender || 'unknown',
          voice_id: resolvedVoice,
          line_count: 1,
          sample_quote: s.text ? String(s.text).slice(0, 220) : '',
        });
      } else {
        prev.line_count += 1;
      }
    }
    return { ...s, assigned_voice_id: resolvedVoice, voice_id: resolvedVoice };
  });

  parsedData.segments = segments;

  const updatedCharsMap = new Map();
  const existingNarr = parsedCharacters.find((c) => {
    const cid = String(c?.character_id || '').toLowerCase();
    const cname = String(c?.name || c?.speaker_name || '').toLowerCase();
    return cid === 'narrator' || cname === 'narrator';
  });
  updatedCharsMap.set('narrator', {
    ...(existingNarr || {}),
    character_id: 'narrator',
    name: 'Narrator',
    gender: existingNarr?.gender || 'male',
    line_count: existingNarr?.line_count ?? narratorCount,
    sample_quote: existingNarr?.sample_quote || narratorQuote || 'Primary narrative voice.',
    voice_id: narratorVoice,
    is_narrator: true,
  });

  for (const c of parsedCharacters) {
    if (!c) continue;
    const cname = String(c.name || c.speaker_name || c.character_id || '').trim();
    const cid = String(c.character_id || cname.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).trim();
    const cidLower = cid.toLowerCase();
    const cnameLower = cname.toLowerCase();
    if (!cname || cidLower === 'narrator' || cnameLower === 'narrator' || cidLower === 'image') continue;
    if (STALE_GENERIC_SPEAKER_NAMES.has(cidLower) || STALE_GENERIC_SPEAKER_NAMES.has(cnameLower)) continue;

    const stat = segStatsByKey.get(cidLower) || segStatsByKey.get(cnameLower);
    const resolvedCharVoice =
      stat?.voice_id ||
      toVoiceIdString(voiceMap?.get(cnameLower) || voiceMap?.get(cidLower)) ||
      toVoiceIdString(c.voice_id) ||
      toVoiceIdString(voiceProfiler.resolveCharacterVoice(cname, '', c.gender)) ||
      'en-GB-ThomasNeural';

    const mapKey = cidLower || cnameLower;
    if (!updatedCharsMap.has(mapKey)) {
      updatedCharsMap.set(mapKey, {
        ...c,
        character_id: cid || mapKey,
        name: cname,
        gender: c.gender || stat?.gender || 'unknown',
        line_count: typeof c.line_count === 'number' ? c.line_count : (stat?.line_count || 0),
        sample_quote: c.sample_quote || stat?.sample_quote || '',
        voice_id: resolvedCharVoice,
      });
    }
  }

  for (const s of segments) {
    if (!s || s.type !== 'dialogue') continue;
    const sid = String(s.speaker_id || s.character_id || '').trim();
    const sname = String(s.speaker_name || '').trim();
    const sidLower = sid.toLowerCase();
    const snameLower = sname.toLowerCase();
    if (!sidLower || sidLower === 'narrator' || sidLower === 'image' || sidLower === 'unknown_speaker') continue;
    if (STALE_GENERIC_SPEAKER_NAMES.has(sidLower) || STALE_GENERIC_SPEAKER_NAMES.has(snameLower)) continue;
    if (!sname || snameLower === 'unknown') continue;

    const mapKey = sidLower;
    if (!updatedCharsMap.has(mapKey)) {
      const stat = segStatsByKey.get(sidLower) || segStatsByKey.get(snameLower);
      updatedCharsMap.set(mapKey, {
        character_id: sid,
        name: sname,
        gender: s.speaker_gender || stat?.gender || 'unknown',
        line_count: stat?.line_count || 1,
        sample_quote: stat?.sample_quote || String(s.text || '').slice(0, 220),
        voice_id: stat?.voice_id || toVoiceIdString(s.assigned_voice_id || s.voice_id) || 'en-GB-ThomasNeural',
      });
    }
  }

  parsedData.characters = Array.from(updatedCharsMap.values());

  return { parsedData, usedEngine, mergedConfig };
}

async function buildParsedSegmentsAndManifestAsync(rawText, chapterTitle, chapterId, options = {}) {
  const existingVoiceMap =
    options.existingVoiceMap ||
    (options.novelId ? await fetchPgCharacterVoiceMap(options.pgPool || pool, options.novelId) : null);
  const { parsedData, usedEngine } = await runSelectedChapterParser(
    rawText,
    chapterTitle,
    chapterId,
    options.parserEngine,
    options.parserConfig,
    options.onProgress,
    existingVoiceMap
  );
  const voicedSegments = parsedData.segments || [];
  const manifestData = mapVoicedSegmentsToManifest(voicedSegments, chapterId, existingVoiceMap);
  return {
    ...manifestData,
    parsedData,
    usedEngine,
    voicedSegments,
  };
}

function hasStaleSpeakerArtifacts(segments = []) {
  return segments.some((s) => {
    const sname = String(s?.speaker_name || '').trim();
    const cid = String(s?.character_id || s?.speaker_id || '').toLowerCase().trim();
    return (
      BARE_HONORIFIC_NAMES.has(sname.toLowerCase()) ||
      (cid !== 'narrator' && /^[A-Za-z. ]+\s+[a-z]+ly$/.test(sname))
    );
  });
}

function needsSelfHealingReparse(chapterDoc) {
  if (!chapterDoc || !chapterDoc.raw_text || !String(chapterDoc.raw_text).trim()) {
    return false;
  }
  const segments = Array.isArray(chapterDoc.segments) ? chapterDoc.segments : [];
  if (segments.length === 0) {
    return true;
  }

  // Trigger immediate self-healing if any segment or timeline entry uses a retired/dead legacy Edge voice
  const timeline = Array.isArray(chapterDoc.manifest?.timeline) ? chapterDoc.manifest.timeline : [];
  if (
    segments.some((s) => DEAD_LEGACY_VOICES.has(s?.voice_id) || DEAD_LEGACY_VOICES.has(s?.assigned_voice_id)) ||
    timeline.some((t) => DEAD_LEGACY_VOICES.has(t?.voice_id))
  ) {
    return true;
  }

  const savedConfig = typeof statusRouter.loadParserConfig === 'function' ? statusRouter.loadParserConfig() : {};
  const currentEngine = String(savedConfig.activeEngine || 'heuristic').toLowerCase();

  // Trigger self-healing if stale generic honorific or malformed adverb-suffixed speaker artifacts exist
  if (hasStaleSpeakerArtifacts(segments) && chapterDoc.manifest?.healed_unresolved_engine !== currentEngine) {
    return true;
  }

  const dialogueSegs = segments.filter((s) => s && s.type === 'dialogue');
  if (dialogueSegs.length === 0) {
    const rawQuotes = (String(chapterDoc.raw_text).match(/["“][^"”\n]{6,}["”]/g) || []).length;
    if (rawQuotes >= 2 && segments.every((s) => s.type === 'narration')) {
      return chapterDoc.manifest?.healed_unresolved_engine !== currentEngine;
    }
    return false;
  }

  const unresolvedCount = dialogueSegs.filter((s) => {
    const cid = String(s.character_id || s.speaker_id || '').toLowerCase().trim();
    const sname = String(s.speaker_name || '').toLowerCase().trim();
    return !cid || cid === 'unresolved' || cid === 'unknown' || cid === 'dialogue_speaker' || sname === 'unknown';
  }).length;

  if (unresolvedCount / dialogueSegs.length > 0.5) {
    return chapterDoc.manifest?.healed_unresolved_engine !== currentEngine;
  }

  const narratorVoices = new Set(['en-GB-RyanNeural', 'bm_george', 'bm_fable', 'Daniel']);
  const narrSeg = segments.find((s) => s && (s.character_id === 'narrator' || s.speaker_id === 'narrator'));
  if (narrSeg && (narrSeg.assigned_voice_id || narrSeg.voice_id)) {
    narratorVoices.add(narrSeg.assigned_voice_id || narrSeg.voice_id);
  }
  const allShareNarratorVoice = dialogueSegs.every((s) => {
    const v = s.assigned_voice_id || s.voice_id;
    const cid = String(s.character_id || s.speaker_id || '').toLowerCase();
    return cid === 'narrator' || (v && narratorVoices.has(v));
  });

  if (allShareNarratorVoice) {
    return chapterDoc.manifest?.healed_unresolved_engine !== currentEngine;
  }

  return false;
}

const healingInFlight = new Map();

async function healChapterDocument(chapterDoc, novelIdHint = null, pgPool = pool) {
  if (!chapterDoc || !chapterDoc.raw_text) return chapterDoc;
  const chapterId = String(chapterDoc.pg_chapter_id || chapterDoc._id || '1');
  if (healingInFlight.has(chapterId)) {
    return healingInFlight.get(chapterId);
  }

  const runHeal = async () => {
    let novelId = novelIdHint || chapterDoc.novel_id || null;
    if (!novelId && pgPool && UUID_REGEX.test(chapterId)) {
      try {
        const chRow = await pgPool.query('SELECT novel_id FROM chapters WHERE id = $1', [chapterId]);
        if (chRow.rows.length > 0) novelId = chRow.rows[0].novel_id;
      } catch (_) {}
    }

    const { mappedSegments, totalDurationMs, timeline, usedEngine } = await buildParsedSegmentsAndManifestAsync(
      chapterDoc.raw_text,
      chapterDoc.title || 'Chapter',
      chapterId,
      { novelId, pgPool }
    );

    const dialogueAfter = mappedSegments.filter((s) => s.type === 'dialogue');
    const unresolvedAfter = dialogueAfter.filter((s) => {
      const cid = String(s.character_id || s.speaker_id || '').toLowerCase().trim();
      return !cid || cid === 'unresolved' || cid === 'unknown' || cid === 'dialogue_speaker';
    }).length;
    const stillUnresolved = dialogueAfter.length > 0 && unresolvedAfter / dialogueAfter.length > 0.5;
    const stillHasStale = hasStaleSpeakerArtifacts(mappedSegments);

    chapterDoc.segments = mappedSegments;
    const prevManifest = chapterDoc.manifest?.toObject ? chapterDoc.manifest.toObject() : (chapterDoc.manifest || {});
    const hasExistingSynth =
      Boolean(prevManifest.engine || prevManifest.studio_engine) &&
      Array.isArray(prevManifest.timeline) &&
      prevManifest.timeline.length > 0;
    chapterDoc.manifest = {
      ...prevManifest,
      total_duration_ms: hasExistingSynth ? (prevManifest.total_duration_ms || totalDurationMs) : totalDurationMs,
      audio_url: prevManifest.audio_url || `/api/stream/${chapterId}`,
      timeline: hasExistingSynth ? prevManifest.timeline : timeline,
      healed_unresolved_engine: (stillUnresolved || stillHasStale) ? usedEngine : undefined,
    };
    if (typeof chapterDoc.markModified === 'function') {
      chapterDoc.markModified('segments');
      chapterDoc.markModified('manifest');
    }
    if (mongoose.connection.readyState === 1 && typeof chapterDoc.save === 'function') {
      await chapterDoc.save().catch((err) => {
        console.warn(`[Chapters] Self-healing Mongo save warning for ${chapterId}: ${err.message}`);
      });
    }
    if (pgPool && UUID_REGEX.test(chapterId) && novelId && UUID_REGEX.test(String(novelId))) {
      await pgPool.query(
        `
        INSERT INTO chapter_documents (pg_chapter_id, novel_id, chapter_number, title, raw_text, segments, manifest)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        ON CONFLICT (pg_chapter_id) DO UPDATE SET
          raw_text = EXCLUDED.raw_text,
          segments = EXCLUDED.segments,
          manifest = EXCLUDED.manifest,
          updated_at = now();
        `,
        [
          chapterId,
          novelId,
          chapterDoc.chapter_number || 1,
          chapterDoc.title || 'Chapter',
          chapterDoc.raw_text || '',
          JSON.stringify(mappedSegments),
          JSON.stringify(chapterDoc.manifest),
        ]
      ).catch(() => {});
    }

    if (novelId && pgPool) {
      await upsertDiscoveredCharactersPg(pgPool, novelId, mappedSegments, { pruneStale: true });
    }
    if (typeof voicesRouter.clearVoiceCaches === 'function') {
      voicesRouter.clearVoiceCaches({ chapterId, novelId, clearAll: true });
    }
    return chapterDoc;
  };

  const promise = runHeal().finally(() => {
    healingInFlight.delete(chapterId);
  });
  healingInFlight.set(chapterId, promise);
  return promise;
}

/**
 * Common ingestion helper: performs atomic PostgreSQL transaction and MongoDB document creation.
 */
async function ingestChapter({ novelId, title, text, chapterNumber, requestedBy, actorRole = null }) {
  let client;
  let clientReleased = false;
  let createdPgChapter = null;

  try {
    if (!requestedBy || typeof requestedBy !== 'string' || !UUID_REGEX.test(requestedBy)) {
      throw { status: 401, message: 'Authentication required. Valid authenticated user ID is required.' };
    }

    const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [requestedBy]);
    if (userRes.rows.length === 0) {
      throw { status: 401, message: 'Authenticated user account not found.' };
    }
    const effectiveRole = actorRole || userRes.rows[0].role;
    if (effectiveRole === 'reader') {
      throw { status: 403, message: "Forbidden: role 'reader' cannot ingest chapters." };
    }

    // Fail fast on missing novel or non-owner before running heavy LLM/OCR parsing
    const preNovelCheck = await pool.query('SELECT id, added_by FROM novels WHERE id = $1', [novelId]);
    if (preNovelCheck.rows.length === 0) {
      throw { status: 404, message: `Novel with id '${novelId}' not found.` };
    }
    if (effectiveRole !== 'admin' && preNovelCheck.rows[0].added_by !== requestedBy) {
      throw { status: 403, message: 'Forbidden: you do not have permission to ingest chapters into this novel.' };
    }

    // Parse segments & timeline BEFORE opening a PostgreSQL transaction so long-running LLM/OCR calls never hold row locks
    const preChapterId = uuidv4();
    const preliminaryTitle = title && typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : 'Chapter';
    const { mappedSegments, totalDurationMs, timeline } = await buildParsedSegmentsAndManifestAsync(
      text,
      preliminaryTitle,
      preChapterId,
      { novelId, pgPool: pool }
    );

    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Verify novel exists & re-check ownership atomically; lock parent novel row with FOR UPDATE when auto-numbering
    // to serialize concurrent insertions and prevent chapter numbering race conditions
    const novelQuery = (!chapterNumber || chapterNumber < 1)
      ? 'SELECT id, added_by FROM novels WHERE id = $1 FOR UPDATE'
      : 'SELECT id, added_by FROM novels WHERE id = $1';
    const novelCheck = await client.query(novelQuery, [novelId]);
    if (novelCheck.rows.length === 0) {
      throw { status: 404, message: `Novel with id '${novelId}' not found.` };
    }
    if (effectiveRole !== 'admin' && novelCheck.rows[0].added_by !== requestedBy) {
      throw { status: 403, message: 'Forbidden: you do not have permission to ingest chapters into this novel.' };
    }

    // 2. Determine chapter_number if not provided
    let num = chapterNumber;
    if (!num || num < 1) {
      const numRes = await client.query(
        'SELECT COALESCE(MAX(chapter_number), 0) + 1 AS next_num FROM chapters WHERE novel_id = $1',
        [novelId]
      );
      num = parseInt(numRes.rows[0].next_num, 10);
    }

    const chapterTitle = title && typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : `Chapter ${num}`;

    // 3. Insert relational chapter record into PostgreSQL
    const insertChapterQuery = `
      INSERT INTO chapters (id, novel_id, chapter_number, title, status, audio_version, total_duration_ms)
      VALUES ($1, $2, $3, $4, 'draft', 1, 0)
      RETURNING id, novel_id, chapter_number, title, status, audio_version, total_duration_ms, created_at, updated_at;
    `;
    const chapterRes = await client.query(insertChapterQuery, [preChapterId, novelId, num, chapterTitle]);
    createdPgChapter = chapterRes.rows[0];

    // 4. Enqueue synthesis job into PostgreSQL within the same transaction
    const insertJobQuery = `
      INSERT INTO synthesis_jobs (requested_by, job_type, status, progress_pct)
      VALUES ($1, 'synthesize_chapter', 'queued', 0.0)
      RETURNING id, requested_by, job_type, status, progress_pct, created_at;
    `;
    const jobRes = await client.query(insertJobQuery, [
      requestedBy || null,
    ]);
    const job = jobRes.rows[0];

    await client.query(
      `
      INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id)
      VALUES ($1, $2);
      `,
      [job.id, createdPgChapter.id]
    );

    job.novel_id = novelId;
    job.chapter_id = createdPgChapter.id;

    // 5. Persist chapter text, segments & timeline in PostgreSQL chapter_documents (works with or without MongoDB)
    const chapterManifestObj = {
      total_duration_ms: totalDurationMs,
      audio_url: `/api/stream/${createdPgChapter.id}`,
      timeline,
    };
    await client.query(
      `
      INSERT INTO chapter_documents (pg_chapter_id, novel_id, chapter_number, title, raw_text, segments, manifest)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      ON CONFLICT (pg_chapter_id) DO UPDATE SET
        title = EXCLUDED.title,
        raw_text = EXCLUDED.raw_text,
        segments = EXCLUDED.segments,
        manifest = EXCLUDED.manifest,
        updated_at = now();
      `,
      [
        createdPgChapter.id,
        createdPgChapter.novel_id,
        createdPgChapter.chapter_number,
        createdPgChapter.title,
        text,
        JSON.stringify(mappedSegments),
        JSON.stringify(chapterManifestObj),
      ]
    );

    // 5b. Mirror into MongoDB when connected (linked via pg_chapter_id)
    let mongoDocId = null;
    if (mongoose.connection.readyState === 1) {
      const mongoDoc = new Chapter({
        pg_chapter_id: createdPgChapter.id,
        novel_id: createdPgChapter.novel_id,
        chapter_number: createdPgChapter.chapter_number,
        title: createdPgChapter.title,
        raw_text: text,
        audio_version: 1,
        manifest: chapterManifestObj,
        segments: mappedSegments,
      });
      await mongoDoc.save();
      mongoDocId = mongoDoc._id;
    }

    // 6. Commit transaction
    await client.query('COMMIT');
    client.release();
    clientReleased = true;

    try {
      require('./novels').invalidateNovelsCache?.();
    } catch (_) {}

    await upsertDiscoveredCharactersPg(pool, novelId, mappedSegments);

    persistChapterToDisk(createdPgChapter.id, createdPgChapter.title, text);

    return {
      chapter: createdPgChapter,
      job,
      mongo_id: mongoDocId,
    };
  } catch (err) {
    if (client && !clientReleased) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      clientReleased = true;
    }

    // Compensating cleanup: remove orphan MongoDB document if created
    if (createdPgChapter && createdPgChapter.id) {
      await Chapter.deleteOne({ pg_chapter_id: createdPgChapter.id }).catch(() => {});
    }

    throw err;
  }
}

/**
 * 1. POST /api/novels/:id/chapters
 * Official Polyglot Chapter Ingestion route (saves text to Mongo, enqueues job in Postgres).
 */
router.post('/novels/:id/chapters', authenticateUser, requireRole('writer', 'admin'), async (req, res) => {
  try {
    const novelId = req.params.id;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { text, title, chapter_number } = body;

    if (!novelId || !UUID_REGEX.test(novelId)) {
      return res.status(400).json({ error: 'Invalid novel UUID in route parameter.' });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or empty chapter "text" field.' });
    }

    let parsedChapterNumber;
    if (chapter_number !== undefined && chapter_number !== null && chapter_number !== '') {
      const n = Number(chapter_number);
      if (!Number.isInteger(n) || n < 0 || n > 2147483647) {
        return res.status(400).json({ error: 'chapter_number must be a non-negative integer.' });
      }
      parsedChapterNumber = n > 0 ? n : undefined;
    }

    // Verify novel exists in PostgreSQL and enforce novel ownership
    const novelCheck = await pool.query('SELECT id, added_by FROM novels WHERE id = $1', [novelId]);
    if (novelCheck.rows.length === 0) {
      return res.status(404).json({ error: `Novel with id '${novelId}' not found.` });
    }
    if (req.user.role !== 'admin' && novelCheck.rows[0].added_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: you do not own this novel.' });
    }

    // Derive writer identity exclusively from the authenticated session
    const result = await ingestChapter({
      novelId,
      title,
      text,
      chapterNumber: parsedChapterNumber,
      requestedBy: req.user.id,
      actorRole: req.user.role,
    });

    return res.status(201).json({
      message: 'Chapter ingested successfully',
      chapter_id: result.chapter.id,
      chapter: result.chapter,
      job: result.job,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Chapter number already exists for this novel.' });
    }
    console.error('[Chapter Ingestion Error]:', err);
    return res.status(500).json({ error: 'Failed to ingest chapter.' });
  }
});

/**
 * 2. POST /api/upload
 * Backwards-compatible upload route: ingests into specified novel or user's default novel.
 */
router.post('/upload', authenticateUser, requireRole('writer', 'admin'), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { text, title = 'Untitled Chapter', novel_id } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "text" field' });
    }

    let effectiveNovelId = novel_id;
    if (effectiveNovelId !== undefined && effectiveNovelId !== null && effectiveNovelId !== '') {
      if (typeof effectiveNovelId !== 'string' || !UUID_REGEX.test(effectiveNovelId)) {
        return res.status(400).json({ error: 'Invalid novel_id UUID.' });
      }
    } else {
      effectiveNovelId = await getOrCreateDefaultNovel(req.user.id);
    }

    const result = await ingestChapter({
      novelId: effectiveNovelId,
      title,
      text,
      requestedBy: req.user.id,
      actorRole: req.user.role,
    });

    console.log(`[Chapters] Uploaded '${result.chapter.title}' as ${result.chapter.id}`);
    return res.json({
      chapter_id: result.chapter.id,
      chapter: result.chapter,
      job: result.job,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Upload Error]:', err);
    return res.status(500).json({ error: 'Failed to upload chapter.' });
  }
});

/**
 * 3. GET /api/chapters
 * Retrieves chapters from PostgreSQL joined with novels.
 */
router.get('/chapters', async (_req, res) => {
  try {
    const query = `
      SELECT 
        c.id AS chapter_id,
        c.id,
        c.novel_id,
        c.chapter_number,
        c.title,
        c.status,
        c.audio_version,
        c.swift_audio_object,
        c.total_duration_ms,
        c.created_at,
        c.updated_at,
        n.title AS novel_title
      FROM chapters c
      LEFT JOIN novels n ON c.novel_id = n.id
      ORDER BY c.created_at DESC;
    `;
    const result = await pool.query(query);

    const list = result.rows.map((row) => ({
      chapter_id: row.id,
      title: row.title,
      chapter_number: row.chapter_number,
      novel_id: row.novel_id,
      novel_title: row.novel_title,
      status: row.status,
      has_parsed: row.status !== 'draft',
      has_manifest: row.status === 'completed' || row.total_duration_ms > 0,
      total_duration_ms: row.total_duration_ms,
    }));

    return res.json({ chapters: list });
  } catch (err) {
    console.error('[Get Chapters Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch chapters list.' });
  }
});

const parsingInFlight = new Map();
const synthesisInFlight = new Map();

/**
 * 4. POST /api/parse/:chapter_id
 * Reads chapter text from MongoDB, runs parsing & attribution, updates MongoDB & PostgreSQL.
 */
router.post('/parse/:chapter_id', authenticateUser, requireRole('writer', 'admin'), async (req, res) => {
  const { chapter_id } = req.params;

  if (!chapter_id || !UUID_REGEX.test(chapter_id)) {
    return res.status(400).json({ error: 'Invalid chapter UUID format.' });
  }

  try {
    const ownerCheck = await pool.query(
      'SELECT c.id, c.novel_id, n.added_by FROM chapters c LEFT JOIN novels n ON n.id = c.novel_id WHERE c.id = $1',
      [chapter_id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ detail: 'Chapter not found.' });
    }
    if (req.user.role !== 'admin' && ownerCheck.rows[0].added_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: you do not have permission to parse this chapter.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify chapter ownership.' });
  }

  if (parsingInFlight.has(chapter_id)) {
    try {
      const existingResult = await parsingInFlight.get(chapter_id);
      if (existingResult.notFound) {
        return res.status(404).json({ detail: 'Chapter not found in document store.' });
      }
      return res.json(existingResult.parsedOutput);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to parse chapter.', detail: err.message });
    }
  }

  const runParseTask = async () => {
    const chapterDoc = await Chapter.findOne({ pg_chapter_id: chapter_id });
    if (!chapterDoc) {
      return { notFound: true };
    }

    let novelId = chapterDoc.novel_id || null;
    if (!novelId) {
      try {
        const chRow = await pool.query('SELECT novel_id FROM chapters WHERE id = $1', [chapter_id]);
        if (chRow.rows.length > 0) novelId = chRow.rows[0].novel_id;
      } catch (_) {}
    }

    const parserEngine = req.body?.parser_engine || req.body?.engine || null;
    const parserConfig = req.body?.parser_config || req.body?.config || null;

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: 0,
      total_segments: 0,
      percent_complete: 10,
      status: 'parsing',
    });

    const { mappedSegments, totalDurationMs, timeline, parsedData, usedEngine } =
      await buildParsedSegmentsAndManifestAsync(chapterDoc.raw_text, chapterDoc.title, chapter_id, {
        parserEngine,
        parserConfig,
        novelId,
        pgPool: pool,
        onProgress: (totalSegs) => {
          broadcastProgress(chapter_id, {
            chapter_id,
            current_segment: 0,
            total_segments: totalSegs,
            percent_complete: 40,
            status: 'attributing',
          });
        },
      });

    // Save BOTH rebuilt segments AND manifest.timeline into MongoDB
    chapterDoc.segments = mappedSegments;
    const prevManifest = chapterDoc.manifest?.toObject ? chapterDoc.manifest.toObject() : (chapterDoc.manifest || {});
    chapterDoc.manifest = {
      ...prevManifest,
      total_duration_ms: totalDurationMs,
      audio_url: prevManifest.audio_url || `/api/stream/${chapter_id}`,
      timeline,
      healed_unresolved_engine: undefined,
    };
    if (typeof chapterDoc.markModified === 'function') {
      chapterDoc.markModified('segments');
      chapterDoc.markModified('manifest');
    }
    await chapterDoc.save();

    if (typeof voicesRouter.clearVoiceCaches === 'function') {
      voicesRouter.clearVoiceCaches({ chapterId: chapter_id, novelId, clearAll: true });
    }

    const discoveredCharacters = await upsertDiscoveredCharactersPg(pool, novelId, mappedSegments, { pruneStale: true });

    // Update PostgreSQL status (chapters_status_check allows draft, processing, completed, failed)
    await pool.query(
      "UPDATE chapters SET status = 'completed', total_duration_ms = GREATEST(total_duration_ms, $2), updated_at = now() WHERE id = $1",
      [chapter_id, totalDurationMs]
    );

    const parsedCharMeta = new Map();
    for (const pc of Array.isArray(parsedData?.characters) ? parsedData.characters : []) {
      if (!pc) continue;
      const cid = String(pc.character_id || '').toLowerCase();
      const cname = String(pc.name || pc.speaker_name || '').toLowerCase();
      if (cid) parsedCharMeta.set(cid, pc);
      if (cname) parsedCharMeta.set(cname, pc);
    }

    const narrSeg = mappedSegments.find(
      (s) => s && (s.type === 'narration' || s.character_id === 'narrator' || s.speaker_id === 'narrator')
    );
    const narratorMeta = parsedCharMeta.get('narrator');
    const narratorVoice =
      toVoiceIdString(narrSeg?.assigned_voice_id || narrSeg?.voice_id) ||
      toVoiceIdString(narratorMeta?.voice_id) ||
      'en-GB-RyanNeural';
    const narratorLineCount = mappedSegments.filter(
      (s) => s && (s.type === 'narration' || s.character_id === 'narrator' || s.speaker_id === 'narrator')
    ).length;

    const characterMap = {
      narrator: {
        character_id: 'narrator',
        name: 'Narrator',
        speaker_name: 'Narrator',
        gender: narratorMeta?.gender || 'male',
        voice_id: narratorVoice,
        line_count: narratorLineCount,
        sample_quote: narrSeg?.text ? String(narrSeg.text).slice(0, 220) : (narratorMeta?.sample_quote || 'Primary narrative voice.'),
        is_narrator: true,
      },
    };

    for (const seg of mappedSegments) {
      if (!seg || seg.type === 'image') continue;
      const sid = String(seg.character_id || seg.speaker_id || '').trim();
      const sname = String(seg.speaker_name || '').trim();
      const sidLower = sid.toLowerCase();
      const snameLower = sname.toLowerCase();
      if (!sidLower || sidLower === 'narrator' || sidLower === 'image' || sidLower === 'unknown_speaker') continue;
      if (STALE_GENERIC_SPEAKER_NAMES.has(sidLower) || STALE_GENERIC_SPEAKER_NAMES.has(snameLower)) continue;
      if (!sname || snameLower === 'unknown') continue;

      const meta = parsedCharMeta.get(sidLower) || parsedCharMeta.get(snameLower);
      const voiceId =
        toVoiceIdString(seg.assigned_voice_id || seg.voice_id) ||
        toVoiceIdString(meta?.voice_id) ||
        'en-GB-ThomasNeural';

      if (!characterMap[sidLower]) {
        characterMap[sidLower] = {
          character_id: sid,
          name: sname,
          speaker_name: sname,
          gender: meta?.gender || seg.speaker_gender || 'unknown',
          description: meta?.description || undefined,
          voice_id: voiceId,
          line_count: 1,
          sample_quote: meta?.sample_quote || String(seg.text || '').slice(0, 220),
          is_narrator: false,
        };
      } else {
        characterMap[sidLower].line_count += 1;
      }
    }

    const parsedOutput = {
      ...(parsedData || {}),
      chapter_id,
      parser_engine: usedEngine,
      segments: mappedSegments,
      manifest: chapterDoc.manifest,
      discovered_characters: discoveredCharacters,
      characters: Object.values(characterMap),
    };

    const chapterDir = path.join(config.paths.chaptersDir, chapter_id);
    if (!fs.existsSync(chapterDir)) fs.mkdirSync(chapterDir, { recursive: true });
    fs.writeFileSync(path.join(chapterDir, 'parsed.json'), JSON.stringify(parsedOutput, null, 2), 'utf-8');

    broadcastProgress(chapter_id, {
      chapter_id,
      current_segment: mappedSegments.length,
      total_segments: mappedSegments.length,
      percent_complete: 100,
      status: 'complete',
    });

    console.log(`[Chapters] Parsed ${chapter_id} (${usedEngine}) with ${mappedSegments.length} segments`);
    return { notFound: false, parsedOutput };
  };

  const taskPromise = runParseTask().finally(() => {
    parsingInFlight.delete(chapter_id);
  });
  parsingInFlight.set(chapter_id, taskPromise);

  try {
    const outcome = await taskPromise;
    if (outcome.notFound) {
      return res.status(404).json({ detail: 'Chapter not found in document store.' });
    }
    return res.json(outcome.parsedOutput);
  } catch (err) {
    console.error('[Parse Chapter Error]:', err.message);
    broadcastProgress(chapter_id, { status: 'failed', error: err.message });
    try {
      await pool.query(
        "UPDATE chapters SET status = 'failed', updated_at = now() WHERE id = $1",
        [chapter_id]
      );
    } catch (_dbErr) {}
    return res.status(500).json({ error: 'Failed to parse chapter.', detail: err.message });
  }
});

/**
 * 5. POST /api/synthesize/:chapter_id
 * Synthesizes segment audio via Edge TTS (Kokoro fallback), stitches PCM/MP3, updates MongoDB manifest & PostgreSQL chapters/jobs.
 */
async function claimOrReuseChapterSynthesisJob(chapterId, requestedBy, lockTimeoutSec = 300) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [String(chapterId)]);

    const existingRes = await client.query(
      `SELECT j.*
       FROM synthesis_jobs j
       JOIN chapter_synthesis_job_targets t ON t.job_id = j.id
       WHERE t.chapter_id = $1
       ORDER BY j.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [chapterId]
    );
    const latest = existingRes.rows[0] || null;

    if (latest) {
      if (latest.status === 'processing') {
        const lockedAtMs = latest.locked_at ? new Date(latest.locked_at).getTime() : 0;
        const isStale = !lockedAtMs || Date.now() - lockedAtMs > lockTimeoutSec * 1000;
        if (!isStale) {
          await client.query('COMMIT');
          return { conflict: true, job: latest };
        }
        if (latest.attempts < latest.max_attempts) {
          const reclaimed = await client.query(
            `UPDATE synthesis_jobs
             SET status = 'processing',
                 worker_id = 'api-gateway',
                 locked_at = now(),
                 attempts = attempts + 1,
                 progress_pct = 5.0,
                 error_message = NULL
             WHERE id = $1
             RETURNING *`,
            [latest.id]
          );
          await client.query('COMMIT');
          return { conflict: false, job: reclaimed.rows[0] };
        }
        await client.query(
          `UPDATE synthesis_jobs
           SET status = 'failed', worker_id = NULL, locked_at = NULL,
               error_message = 'Failed: stale worker lock exceeded max_attempts'
           WHERE id = $1`,
          [latest.id]
        );
      } else if (
        latest.status === 'queued' ||
        (latest.status === 'failed' && latest.attempts < latest.max_attempts)
      ) {
        const claimed = await client.query(
          `UPDATE synthesis_jobs
           SET status = 'processing',
               worker_id = 'api-gateway',
               locked_at = now(),
               attempts = attempts + 1,
               progress_pct = 5.0,
               error_message = NULL
           WHERE id = $1
           RETURNING *`,
          [latest.id]
        );
        await client.query('COMMIT');
        return { conflict: false, job: claimed.rows[0] };
      }
    }

    const inserted = await client.query(
      `INSERT INTO synthesis_jobs (requested_by, job_type, status, progress_pct, attempts, worker_id, locked_at)
       VALUES ($1, 'synthesize_chapter', 'processing', 5.0, 1, 'api-gateway', now())
       RETURNING *`,
      [requestedBy || null]
    );
    const createdJob = inserted.rows[0];
    await client.query(
      'INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id) VALUES ($1, $2)',
      [createdJob.id, chapterId]
    );
    await client.query('COMMIT');
    return { conflict: false, job: createdJob };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function ensureQueuedChapterSynthesisJob(chapterId, requestedBy, lockTimeoutSec = 300) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [String(chapterId)]);

    const existingRes = await client.query(
      `SELECT j.*
       FROM synthesis_jobs j
       JOIN chapter_synthesis_job_targets t ON t.job_id = j.id
       WHERE t.chapter_id = $1
       ORDER BY j.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [chapterId]
    );
    const latest = existingRes.rows[0] || null;
    if (latest) {
      if (latest.status === 'queued') {
        await client.query('COMMIT');
        return { conflict: false, job: latest };
      }
      if (latest.status === 'processing') {
        const lockedAtMs = latest.locked_at ? new Date(latest.locked_at).getTime() : 0;
        const isStale = !lockedAtMs || Date.now() - lockedAtMs > lockTimeoutSec * 1000;
        if (!isStale) {
          await client.query('COMMIT');
          return { conflict: true, job: latest };
        }
        if (latest.attempts < latest.max_attempts) {
          const requeued = await client.query(
            `UPDATE synthesis_jobs
             SET status = 'queued', worker_id = NULL, locked_at = NULL, run_after = now(), progress_pct = 0.0
             WHERE id = $1 RETURNING *`,
            [latest.id]
          );
          await client.query('COMMIT');
          return { conflict: false, job: requeued.rows[0] };
        }
      }
    }

    const inserted = await client.query(
      `INSERT INTO synthesis_jobs (requested_by, job_type, status, progress_pct)
       VALUES ($1, 'synthesize_chapter', 'queued', 0.0)
       RETURNING *`,
      [requestedBy || null]
    );
    const createdJob = inserted.rows[0];
    await client.query(
      'INSERT INTO chapter_synthesis_job_targets (job_id, chapter_id) VALUES ($1, $2)',
      [createdJob.id, chapterId]
    );
    await client.query('COMMIT');
    return { conflict: false, job: createdJob };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

router.post('/synthesize/:chapter_id', authenticateUser, requireRole('writer', 'admin'), async (req, res) => {
  const { chapter_id } = req.params;

  if (!chapter_id || !UUID_REGEX.test(chapter_id)) {
    return res.status(400).json({ error: 'Invalid chapter UUID format.' });
  }

  try {
    const ownerCheck = await pool.query(
      'SELECT c.id, c.novel_id, n.added_by FROM chapters c LEFT JOIN novels n ON n.id = c.novel_id WHERE c.id = $1',
      [chapter_id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ detail: 'Chapter not found.' });
    }
    if (req.user.role !== 'admin' && ownerCheck.rows[0].added_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: you do not have permission to synthesize this chapter.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify chapter ownership.' });
  }

  const runAsyncWorkerMode = req.body?.async === true || String(req.query?.async || '').toLowerCase() === 'true';
  if (runAsyncWorkerMode) {
    try {
      const queued = await ensureQueuedChapterSynthesisJob(chapter_id, req.user.id);
      if (queued.conflict) {
        return res.status(409).json({
          error: 'Chapter synthesis is already in progress.',
          job_id: queued.job.id,
        });
      }
      return res.status(202).json({
        status: 'queued',
        chapter_id,
        job: queued.job,
      });
    } catch (qErr) {
      return res.status(500).json({ error: 'Failed to enqueue chapter synthesis job.', detail: qErr.message });
    }
  }

  const preferredEngine = String(req.body?.engine || req.query?.engine || 'auto').trim() || 'auto';
  const normalizedEngineKey = preferredEngine.toLowerCase();

  while (synthesisInFlight.has(chapter_id)) {
    const active = synthesisInFlight.get(chapter_id);
    if (active.engineKey === normalizedEngineKey) {
      const outcome = await active.promise;
      if (outcome.errorStatus) {
        return res.status(outcome.errorStatus).json(outcome.errorBody);
      }
      return res.json(outcome.manifest);
    }
    await active.promise.catch(() => {});
  }

  const runSynthesisTask = async () => {
    let claimedJob = null;
    try {
      const chapterDoc = await Chapter.findOne({ pg_chapter_id: chapter_id });
      if (!chapterDoc) {
        return { errorStatus: 404, errorBody: { detail: 'Chapter not found in document store.' } };
      }

      if (!chapterDoc.segments || chapterDoc.segments.length === 0) {
        return { errorStatus: 400, errorBody: { detail: 'Chapter not yet parsed. Call /parse first.' } };
      }

      // Claim & reuse queued job from ingestChapter (or prevent concurrent processing with 409)
      const claimOutcome = await claimOrReuseChapterSynthesisJob(chapter_id, req.user.id);
      if (claimOutcome.conflict) {
        return {
          errorStatus: 409,
          errorBody: {
            error: 'Chapter synthesis is already being processed by a worker.',
            job_id: claimOutcome.job.id,
          },
        };
      }
      claimedJob = claimOutcome.job;

      // Mark chapter as processing in PostgreSQL (supports both 'processing' and legacy 'synthesizing' check constraints)
      try {
        try {
          await pool.query(
            "UPDATE chapters SET status = 'processing', updated_at = now() WHERE id = $1",
            [chapter_id]
          );
        } catch (chStatusErr) {
          if (chStatusErr.code === '23514') {
            await pool.query(
              "UPDATE chapters SET status = 'synthesizing', updated_at = now() WHERE id = $1",
              [chapter_id]
            );
          } else {
            throw chStatusErr;
          }
        }
      } catch (dbErr) {
        console.warn('[Synthesize] DB status update warning:', dbErr.message);
      }

      const total = chapterDoc.segments.length;
      const segmentAudios = [];

      const activeAssignments = voiceProfiler.getAllAssignments();
      const { buildMixedCastPlan } = require('../engine/mixedVoiceRouter');

      let novelCharacters = [];
      if (chapterDoc.novel_id) {
        try {
          const charRes = await pool.query(
            'SELECT id, novel_id, canonical_name AS name, canonical_name, gender, voice_id, is_narrator FROM characters WHERE novel_id = $1',
            [chapterDoc.novel_id]
          );
          if (charRes?.rows?.length > 0) {
            novelCharacters = charRes.rows;
          }
        } catch (_) {}
      }

      const castPlan =
        normalizedEngineKey === 'paradee-mixed'
          ? buildMixedCastPlan(chapterDoc.segments, novelCharacters)
          : null;

      const charVoiceLookup = new Map();
      for (const c of novelCharacters) {
        if (!c?.voice_id) continue;
        const candidates = [c.id, c.canonical_name, c.name];
        if (c.is_narrator) candidates.push('narrator');
        for (const k of candidates) {
          if (k) charVoiceLookup.set(String(k).trim().toLowerCase(), c.voice_id);
        }
      }

      const enginesUsedSet = new Set();

      for (let i = 0; i < total; i++) {
        const seg = chapterDoc.segments[i];
        const segCharKey = String(seg.character_id || seg.speaker_id || '').trim().toLowerCase();
        const segSpeakerKey = String(seg.speaker_name || '').trim().toLowerCase();
        const isNarrSeg = seg.type === 'narration' || segCharKey === 'narrator';
        const effectiveVoiceId =
          charVoiceLookup.get(segCharKey) ||
          charVoiceLookup.get(segSpeakerKey) ||
          (isNarrSeg ? charVoiceLookup.get('narrator') : null) ||
          activeAssignments[seg.character_id] ||
          activeAssignments[segCharKey] ||
          seg.assigned_voice_id ||
          seg.voice_id;
        const isImageSeg = seg.type === 'image' || (seg.text && seg.text.startsWith('[IMAGE:'));

        broadcastProgress(chapter_id, {
          chapter_id,
          current_segment: i + 1,
          total_segments: total,
          percent_complete: Math.round(((i + 1) / total) * 90),
          status: 'synthesizing',
        });

        if (isImageSeg) {
          continue;
        }

        let result;
        if (!/[a-zA-Z0-9]/.test(seg.text || '')) {
          const silentSamples = Math.floor((ttsEngine.sampleRate || 24000) * 0.2);
          result = {
            audio_buffer: Buffer.alloc(silentSamples * 2),
            duration_ms: 200,
            format: 'pcm',
            engine: preferredEngine === 'auto' ? 'msedge-tts' : preferredEngine,
            resolved_voice_id: effectiveVoiceId,
          };
        } else {
          try {
            result = await ttsEngine.synthesizeSegment(
              seg.text,
              effectiveVoiceId,
              1.0,
              preferredEngine,
              {
                characterId: seg.character_id || seg.speaker_id || '',
                speakerName: seg.speaker_name || '',
                isNarrator: isNarrSeg,
                explicitVoice: Boolean(effectiveVoiceId && effectiveVoiceId !== 'en-GB-RyanNeural'),
                castPlan,
              }
            );
          } catch (segErr) {
            console.warn(`[Synthesize Segment Fallback] Segment ${i + 1} failed (${segErr.message}); attempting Machine OS TTS fallback.`);
            result = await ttsEngine.synthesizeWithMachine(
              seg.text,
              effectiveVoiceId,
              1.0,
              {
                characterId: seg.character_id || seg.speaker_id || '',
                speakerName: seg.speaker_name || '',
                isNarrator: seg.type === 'narration' || String(seg.character_id || '').toLowerCase() === 'narrator',
              }
            );
          }
        }

        const rawBuf = result.audio_buffer || result.pcm_buffer;
        const fmt = result.format || 'mp3';
        const validation = validateAudioBuffer(rawBuf, fmt);
        const isValidBuf = typeof validation === 'object' && validation !== null ? validation.valid : Boolean(validation);
        if (!isValidBuf) {
          throw new Error(`Invalid synthesized audio buffer for segment ${i + 1}`);
        }

        const actualEngine = result.engine || (preferredEngine === 'auto' ? 'msedge-tts' : preferredEngine);
        enginesUsedSet.add(actualEngine);
        if (result.sub_engine) {
          enginesUsedSet.add(result.sub_engine);
        }

        const resolvedVoice = result.resolved_voice_id || result.voice_id || effectiveVoiceId;

        segmentAudios.push({
          segment_id: seg.order,
          order: seg.order,
          text: seg.text,
          voice_id: resolvedVoice,
          resolved_voice_id: resolvedVoice,
          speaker_name: seg.speaker_name || seg.character_id,
          character_id: seg.character_id,
          audio_buffer: result.audio_buffer || result.pcm_buffer,
          pcm_buffer: result.pcm_buffer || result.audio_buffer,
          duration_ms: result.duration_ms,
          format: result.format || 'mp3',
          engine: actualEngine,
        });
      }

      broadcastProgress(chapter_id, {
        chapter_id,
        current_segment: total,
        total_segments: total,
        percent_complete: 95,
        status: 'stitching',
      });

      const manifest = audioStitcher.stitch(segmentAudios, chapter_id);

      const enginesUsedList = Array.from(enginesUsedSet);
      if (enginesUsedList.length === 0) {
        enginesUsedList.push(preferredEngine);
      }

      manifest.engine = preferredEngine;
      manifest.studio_engine = preferredEngine;
      manifest.engines_used = enginesUsedList;

      manifest.timeline = manifest.timeline.map((t, idx) => {
        const segAudio = segmentAudios[idx];
        const resolvedVoice = segAudio?.resolved_voice_id || segAudio?.voice_id || t.voice_id;
        return {
          ...t,
          voice_id: resolvedVoice,
          resolved_voice_id: resolvedVoice,
        };
      });

      // Save manifest in MongoDB with engine, studio_engine, engines_used, and resolved_voice_id
      chapterDoc.manifest = {
        total_duration_ms: manifest.total_duration_ms,
        audio_url: manifest.audio_url || `${chapter_id}.${manifest.audio_format || 'mp3'}`,
        engine: preferredEngine,
        studio_engine: preferredEngine,
        engines_used: enginesUsedList,
        timeline: manifest.timeline.map((t) => ({
          order: t.order || 0,
          segment_id: t.segment_id || t.order || 0,
          start_ms: t.start_ms,
          end_ms: t.end_ms,
          character_id: t.character_id || t.speaker_name,
          voice_id: t.voice_id,
          resolved_voice_id: t.resolved_voice_id || t.voice_id,
          text: t.text || '',
          type: t.type || 'narration',
          image_url: t.image_url || null,
        })),
      };
      chapterDoc.set('manifest.engine', preferredEngine, { strict: false });
      chapterDoc.set('manifest.studio_engine', preferredEngine, { strict: false });
      chapterDoc.set('manifest.engines_used', enginesUsedList, { strict: false });
      await chapterDoc.save();

      const swiftAudioObject = `${chapter_id}.${manifest.audio_format || 'mp3'}`;
      const audioFilePath = path.join(config.paths.outputDir, swiftAudioObject);

      if (!fs.existsSync(audioFilePath) || fs.statSync(audioFilePath).size === 0) {
        throw new Error(`Persisted chapter audio missing or empty at ${audioFilePath}`);
      }

      // Upload synthesized audio to S3-compatible bucket (Supabase / B2 / R2) or OpenStack Swift
      if (fs.existsSync(audioFilePath)) {
        const contentType = swiftAudioObject.endsWith('.mp3')
          ? 'audio/mpeg'
          : swiftAudioObject.endsWith('.opus')
            ? 'audio/opus'
            : 'audio/wav';
        if (storageService.isS3Configured()) {
          try {
            const audioData = fs.readFileSync(audioFilePath);
            await storageService.putObject({
              bucketType: 'audio',
              key: swiftAudioObject,
              body: audioData,
              contentType,
            });
          } catch (s3Err) {
            console.warn('[Synthesize S3 Upload Warning]: Failed uploading chapter audio to bucket:', s3Err.message);
          }
        } else {
          try {
            if (getSwiftAuth) {
              const { token, storageUrl } = await getSwiftAuth();
              if (token && storageUrl) {
                const audioData = fs.readFileSync(audioFilePath);
                const axios = require('axios');
                await axios.put(
                  `${storageUrl}/${config.swift.containerAudio}/${swiftAudioObject}`,
                  audioData,
                  {
                    headers: {
                      'X-Auth-Token': token,
                      'Content-Type': contentType,
                    },
                    timeout: 5000,
                  }
                );
              }
            }
          } catch (swiftErr) {
            console.warn('[Synthesize Swift Upload Warning]: Swift offline or upload failed, continuing locally:', swiftErr.message);
          }
        }
      }

      const chapterDir = path.join(config.paths.chaptersDir, chapter_id);
      if (!fs.existsSync(chapterDir)) fs.mkdirSync(chapterDir, { recursive: true });
      fs.writeFileSync(path.join(chapterDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

      // Update PostgreSQL chapters table only AFTER audio & manifest persistence succeed
      await pool.query(
        `
        UPDATE chapters 
        SET status = 'completed', total_duration_ms = $1, swift_audio_object = $2, updated_at = now() 
        WHERE id = $3;
      `,
        [manifest.total_duration_ms, swiftAudioObject, chapter_id]
      );
      invalidatePersistedAudioCache(chapter_id);
      try {
        require('./novels').invalidateNovelsCache?.();
      } catch (_) {}

      // Mark ONLY the claimed synthesis_jobs row completed and release worker lock
      if (claimedJob?.id) {
        await pool.query(
          `UPDATE synthesis_jobs
           SET status = 'completed',
               progress_pct = 100.0,
               worker_id = NULL,
               locked_at = NULL,
               error_message = NULL,
               completed_at = now()
           WHERE id = $1`,
          [claimedJob.id]
        );
      }

      broadcastProgress(chapter_id, {
        chapter_id,
        current_segment: total,
        total_segments: total,
        percent_complete: 100,
        status: 'complete',
      });

      console.log(`[Chapters] Synthesized ${chapter_id} (${manifest.total_duration_ms}ms, format: ${manifest.audio_format})`);
      manifest.audio_stream_url = manifest.audio_url || manifest.audio_stream_url || '';
      return { manifest };
    } catch (err) {
      console.error('[Synthesize Chapter Error]:', err.message);
      try {
        if (claimedJob?.id) {
          const canRetry = Number(claimedJob.attempts || 1) < Number(claimedJob.max_attempts || 3);
          if (canRetry) {
            await pool.query("UPDATE chapters SET status = 'draft', updated_at = now() WHERE id = $1", [chapter_id]);
            await pool.query(
              `UPDATE synthesis_jobs
               SET status = 'queued',
                   worker_id = NULL,
                   locked_at = NULL,
                   run_after = now() + interval '4 seconds',
                   error_message = $1
               WHERE id = $2`,
              [String(err.message || 'Synthesis failed').slice(0, 2000), claimedJob.id]
            );
          } else {
            await pool.query("UPDATE chapters SET status = 'failed', updated_at = now() WHERE id = $1", [chapter_id]);
            await pool.query(
              `UPDATE synthesis_jobs
               SET status = 'failed',
                   worker_id = NULL,
                   locked_at = NULL,
                   error_message = $1,
                   completed_at = now()
               WHERE id = $2`,
              [String(err.message || 'Synthesis failed').slice(0, 2000), claimedJob.id]
            );
          }
        } else {
          await pool.query("UPDATE chapters SET status = 'failed', updated_at = now() WHERE id = $1", [chapter_id]);
        }
      } catch (_dbErr) {}
      broadcastProgress(chapter_id, {
        chapter_id,
        current_segment: null,
        total_segments: null,
        status: 'failed',
        error: 'Chapter synthesis encountered an unexpected error. Please retry.',
      });
      return { errorStatus: 500, errorBody: { error: 'Failed to synthesize chapter.', detail: err.message } };
    }
  };

  const taskPromise = runSynthesisTask().finally(() => {
    const current = synthesisInFlight.get(chapter_id);
    if (current && current.promise === taskPromise) {
      synthesisInFlight.delete(chapter_id);
    }
  });
  synthesisInFlight.set(chapter_id, { engineKey: normalizedEngineKey, promise: taskPromise });

  const outcome = await taskPromise;
  if (outcome.errorStatus) {
    return res.status(outcome.errorStatus).json(outcome.errorBody);
  }
  return res.json(outcome.manifest);
});

/**
 * 6. ALL /api/stream/:chapter_id
 * Audio stream proxy: supports both Edge TTS MP3 and Kokoro WAV fallback.
 * Gracefully handles GET, HEAD, byte ranges, and track status checks.
 */
router.all('/stream/:chapter_id', async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const { chapter_id } = req.params;

  // Prevent path traversal
  const cleanId = path.basename(chapter_id);
  if (cleanId !== chapter_id || !/^[0-9a-zA-Z_-]+$/.test(chapter_id)) {
    return res.status(400).json({ detail: 'Invalid chapter ID' });
  }

  let studioEngine = null;
  try {
    const diskManifestPath = path.join(config.paths.chaptersDir, cleanId, 'manifest.json');
    if (fs.existsSync(diskManifestPath)) {
      const raw = fs.readFileSync(diskManifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      studioEngine = parsed?.engine || parsed?.studio_engine || null;
    }
  } catch (_) {}

  const audioPathMp3 = path.join(config.paths.outputDir, `${cleanId}.mp3`);
  const audioPathWav = path.join(config.paths.outputDir, `${cleanId}.wav`);
  const hasMp3 = fs.existsSync(audioPathMp3) && fs.statSync(audioPathMp3).size > 0;
  const hasWav = fs.existsSync(audioPathWav) && fs.statSync(audioPathWav).size > 0;
  const audioPath = hasMp3 ? audioPathMp3 : (hasWav ? audioPathWav : null);

  if (!audioPath) {
    if (storageService.isS3Configured()) {
      try {
        let dbKey = null;
        if (UUID_REGEX.test(cleanId)) {
          const pgRes = await pool.query('SELECT swift_audio_object FROM chapters WHERE id = $1', [cleanId]);
          dbKey = pgRes.rows?.[0]?.swift_audio_object || null;
        }
        const candidates = Array.from(
          new Set([dbKey, `${cleanId}.mp3`, `${cleanId}.opus`, `${cleanId}.wav`].filter(Boolean))
        );
        for (const key of candidates) {
          const s3Obj = await storageService.getObjectStream({
            bucketType: 'audio',
            key,
            range: req.method === 'HEAD' ? undefined : req.headers.range,
          });
          if (!s3Obj) continue;

          const ct = key.endsWith('.mp3')
            ? 'audio/mpeg'
            : key.endsWith('.opus')
              ? 'audio/opus'
              : 'audio/wav';
          const outHeaders = {
            ...s3Obj.headers,
            'Content-Type': s3Obj.headers['Content-Type'] || ct,
          };
          if (studioEngine) {
            outHeaders['X-Studio-Engine'] = studioEngine;
            outHeaders['X-TTS-Engine'] = studioEngine;
          }
          res.writeHead(req.method === 'HEAD' ? 200 : (s3Obj.status || 200), outHeaders);
          if (req.method === 'HEAD' || s3Obj.status === 416 || !s3Obj.stream) {
            if (s3Obj.stream && typeof s3Obj.stream.destroy === 'function') s3Obj.stream.destroy();
            return res.end();
          }
          return pipeStreamSafe(s3Obj.stream, res);
        }
      } catch (s3Err) {
        console.warn('[Stream Cloud Fallback Warning]:', s3Err.message);
      }
    }

    // Lightweight in-memory fallback buffer for un-synthesized placeholder chapters in zero-S3/MongoDB-M0 mode
    if (UUID_REGEX.test(cleanId)) {
      try {
        const chCheck = await pool.query('SELECT id FROM chapters WHERE id = $1', [cleanId]);
        if (chCheck.rows.length > 0) {
          const fallbackBuf = audioStitcher.createMp3SilenceBuffer(5000);
          const total = fallbackBuf.length;
          const baseHeaders = {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
          };
          if (req.method === 'HEAD') {
            res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
            return res.end();
          }
          const rangeHdr = req.headers.range;
          if (rangeHdr) {
            const parsedRange = parseByteRange(rangeHdr, total);
            if (!parsedRange || parsedRange.invalid) {
              res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
              return res.end();
            }
            const { start, end } = parsedRange;
            const slice = fallbackBuf.subarray(start, end + 1);
            res.writeHead(206, {
              ...baseHeaders,
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Content-Length': slice.length,
            });
            return res.end(slice);
          }
          res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
          return res.end(fallbackBuf);
        }
      } catch (_) {}
    }

    return res.status(404).json({ detail: 'Audio file not found' });
  }

  try {
    const isMp3 = audioPath === audioPathMp3;
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    if (fileSize <= 0) {
      return res.status(404).json({ detail: 'Audio file not found' });
    }
    const range = req.headers.range;
    const contentType = isMp3 ? 'audio/mpeg' : 'audio/wav';

    const defaultHeaders = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    };
    if (studioEngine) {
      defaultHeaders['X-Studio-Engine'] = studioEngine;
      defaultHeaders['X-TTS-Engine'] = studioEngine;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        ...defaultHeaders,
        'Content-Length': fileSize,
      });
      return res.end();
    }

    if (range) {
      const parsedRange = parseByteRange(range, fileSize);
      if (!parsedRange || parsedRange.invalid) {
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`,
          ...defaultHeaders,
        });
        return res.end();
      }

      const { start, end } = parsedRange;
      const chunksize = end - start + 1;

      const file = fs.createReadStream(audioPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        ...defaultHeaders,
      });
      pipeStreamSafe(file, res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        ...defaultHeaders,
      });
      pipeStreamSafe(fs.createReadStream(audioPath), res);
    }
  } catch (err) {
    console.warn('[Stream Local File Warning]:', err.message);
    if (!res.headersSent) {
      return res.status(404).json({ detail: 'Audio file not found' });
    }
  }
});

/**
 * 6a-1. GET /api/chapters/:id/progress/sse
 * Server-Sent Events (SSE) real-time synthesis progress stream fallback.
 */
router.get('/chapters/:id/progress/sse', (req, res) => {
  const { id } = req.params;
  if (!id || !SAFE_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  eventDispatcher.addSseClient(id, res);

  let cleaned = false;
  let heartbeat;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    eventDispatcher.removeSseClient(id, res);
  };

  heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      cleanup();
      return;
    }
    try {
      res.write(': ping\n\n');
    } catch (_) {
      cleanup();
    }
  }, 15000);
  if (typeof heartbeat.unref === 'function') {
    heartbeat.unref();
  }

  req.once('close', cleanup);
  res.once('close', cleanup);
});

/**
 * 6a-2. GET /api/chapters/:id/progress
 * Polling fallback for synthesis progress state.
 */
router.get('/chapters/:id/progress', async (req, res) => {
  const { id } = req.params;
  if (!id || !SAFE_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }
  try {
    const cached = eventDispatcher.getLatest(id);
    if (cached) {
      return res.json(cached);
    }

    if (UUID_REGEX.test(id)) {
      const q = `
        SELECT c.status AS chapter_status,
               j.status AS job_status,
               j.progress_pct,
               j.error_message
        FROM chapters c
        LEFT JOIN chapter_synthesis_job_targets t ON t.chapter_id = c.id
        LEFT JOIN synthesis_jobs j ON j.id = t.job_id
        WHERE c.id = $1
        ORDER BY j.created_at DESC NULLS LAST
        LIMIT 1;
      `;
      const { rows } = await pool.query(q, [id]);
      if (rows.length > 0) {
        const row = rows[0];
        const statusMap = {
          draft: 'idle',
          parsed: 'idle',
          processing: 'synthesizing',
          synthesizing: 'synthesizing',
          completed: 'complete',
          failed: 'failed',
        };
        const status = statusMap[row.chapter_status] || 'idle';
        const pct =
          status === 'complete'
            ? 100
            : Math.round(Number(row.progress_pct || 0) * 100);
        return res.json({
          chapter_id: id,
          status,
          percent_complete: pct,
          current_segment: null,
          total_segments: null,
          error: row.error_message || null,
          timestamp: Date.now(),
        });
      }
    }

    return res.json({
      chapter_id: id,
      status: 'idle',
      percent_complete: 0,
      current_segment: null,
      total_segments: null,
      error: null,
      timestamp: Date.now(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch synthesis progress.' });
  }
});

const PERSISTED_AUDIO_CACHE_TTL_MS = 60000;
const MAX_PERSISTED_AUDIO_CACHE = 500;
const persistedAudioCache = new Map();

function setPersistedAudioCache(key, value) {
  const k = String(key);
  if (persistedAudioCache.has(k)) {
    persistedAudioCache.delete(k);
  } else if (persistedAudioCache.size >= MAX_PERSISTED_AUDIO_CACHE) {
    const oldest = persistedAudioCache.keys().next().value;
    if (oldest !== undefined) persistedAudioCache.delete(oldest);
  }
  persistedAudioCache.set(k, { ts: Date.now(), value });
}

function invalidatePersistedAudioCache(chapterId) {
  if (chapterId) persistedAudioCache.delete(String(chapterId));
  else persistedAudioCache.clear();
}

async function hasPersistedChapterAudio(chapterId, swiftAudioObject) {
  const safeId = path.basename(String(chapterId || ''));
  if (!SAFE_ID_REGEX.test(safeId)) return false;

  if (process.env.NODE_ENV !== 'test') {
    const cached = persistedAudioCache.get(safeId);
    if (cached && Date.now() - cached.ts < PERSISTED_AUDIO_CACHE_TTL_MS) {
      return cached.value;
    }
  }

  const audioPathMp3 = path.join(config.paths.outputDir, `${safeId}.mp3`);
  const audioPathWav = path.join(config.paths.outputDir, `${safeId}.wav`);
  const hasMp3 = fs.existsSync(audioPathMp3) && fs.statSync(audioPathMp3).size > 0;
  const hasWav = fs.existsSync(audioPathWav) && fs.statSync(audioPathWav).size > 0;
  if (hasMp3 || hasWav) {
    setPersistedAudioCache(safeId, true);
    return true;
  }

  if (storageService.isS3Configured()) {
    const candidates = Array.from(
      new Set([swiftAudioObject, `${safeId}.mp3`, `${safeId}.opus`, `${safeId}.wav`].filter(Boolean))
    );
    const existsFlags = await Promise.all(
      candidates.map((key) => storageService.objectExists({ bucketType: 'audio', key }).catch(() => false))
    );
    const found = existsFlags.some(Boolean);
    setPersistedAudioCache(safeId, found);
    return found;
  }
  setPersistedAudioCache(safeId, false);
  return false;
}

/**
 * Finds a chapter document from MongoDB (if connected), falling back to PostgreSQL `chapter_documents`
 * and finally hardcoded public-domain catalog entries.
 */
async function findChapterDocWithFallback(chapterId) {
  if (mongoose.connection.readyState === 1) {
    try {
      const mDoc = await Chapter.findOne({ pg_chapter_id: chapterId });
      if (mDoc) return mDoc;
    } catch (_) {}
  }

  if (UUID_REGEX.test(chapterId)) {
    try {
      const docRes = await pool.query(
        'SELECT pg_chapter_id, novel_id, chapter_number, title, raw_text, segments, manifest FROM chapter_documents WHERE pg_chapter_id = $1::uuid LIMIT 1',
        [chapterId]
      );
      if (docRes.rows.length > 0) {
        const row = docRes.rows[0];
        return {
          pg_chapter_id: row.pg_chapter_id,
          novel_id: row.novel_id,
          chapter_number: row.chapter_number,
          title: row.title,
          raw_text: row.raw_text || '',
          segments: Array.isArray(row.segments) ? row.segments : [],
          manifest: row.manifest && typeof row.manifest === 'object' ? row.manifest : {},
        };
      }
    } catch (_) {}
  }

  try {
    const { findPublicDomainChapterById } = require('../data/publicDomainCatalog');
    if (typeof findPublicDomainChapterById === 'function') {
      const pdChapter = findPublicDomainChapterById(chapterId);
      if (pdChapter) return pdChapter;
    }
  } catch (_) {}

  return null;
}

/**
 * 6b. GET /api/chapters/:id
 * Fetches combined PostgreSQL metadata and MongoDB/Postgres document details in parallel.
 */
router.get('/chapters/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || !SAFE_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }
  try {
    const [pgRes, chapterDoc] = await Promise.all([
      UUID_REGEX.test(id)
        ? pool.query('SELECT * FROM chapters WHERE id = $1', [id])
        : Promise.resolve({ rows: [] }),
      findChapterDocWithFallback(id),
    ]);
    const pgData = pgRes.rows.length > 0 ? pgRes.rows[0] : {};

    if (Object.keys(pgData).length === 0 && !chapterDoc) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Auto-parse & self-heal on read if segments are missing, >50% dialogue unresolved, or all dialogue shares narrator voice
    if (chapterDoc && needsSelfHealingReparse(chapterDoc)) {
      await healChapterDocument(chapterDoc, pgData.novel_id || chapterDoc.novel_id, pool);
    }

    const docData = chapterDoc ? (chapterDoc.toObject ? chapterDoc.toObject() : chapterDoc) : {};
    const hasStudioAudio = await hasPersistedChapterAudio(id, pgData.swift_audio_object);

    let studioEngine = docData?.manifest?.engine || docData?.manifest?.studio_engine || null;
    if (!studioEngine) {
      try {
        const diskManifestPath = path.join(config.paths.chaptersDir, id, 'manifest.json');
        if (fs.existsSync(diskManifestPath)) {
          const raw = fs.readFileSync(diskManifestPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.engine || parsed.studio_engine)) {
            studioEngine = parsed.engine || parsed.studio_engine;
          }
        }
      } catch (_) {}
    }
    if (!studioEngine && hasStudioAudio) {
      studioEngine = 'auto';
    }

    if (docData.manifest) {
      docData.manifest.studio_engine = studioEngine;
      if (!docData.manifest.engine && studioEngine) {
        docData.manifest.engine = studioEngine;
      }
    }

    return res.json({
      ...pgData,
      ...docData,
      id: pgData.id || docData.pg_chapter_id,
      pg_chapter_id: pgData.id || docData.pg_chapter_id,
      has_studio_audio: hasStudioAudio,
      studio_engine: studioEngine,
    });
  } catch (err) {
    console.error('[Get Chapter Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve chapter details.' });
  }
});

/**
 * 6b-2. GET /api/chapters/:id/track-status
 * Lightweight status check for Voice TTS <-> Studio track switching.
 */
router.get('/chapters/:id/track-status', async (req, res) => {
  const { id } = req.params;
  if (!id || !SAFE_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }
  try {
    let pgData = {};
    if (UUID_REGEX.test(id)) {
      const pgRes = await pool.query('SELECT status, total_duration_ms, swift_audio_object FROM chapters WHERE id = $1', [id]);
      if (pgRes.rows.length > 0) {
        pgData = pgRes.rows[0];
      }
    }

    const hasStudioAudio = await hasPersistedChapterAudio(id, pgData.swift_audio_object);

    let studioEngine = null;
    try {
      const diskManifestPath = path.join(config.paths.chaptersDir, id, 'manifest.json');
      if (fs.existsSync(diskManifestPath)) {
        const raw = fs.readFileSync(diskManifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        studioEngine = parsed?.engine || parsed?.studio_engine || null;
      }
    } catch (_) {}

    if (!studioEngine && hasStudioAudio) {
      studioEngine = 'auto';
    }

    return res.json({
      chapter_id: id,
      has_studio_audio: hasStudioAudio,
      studio_engine: studioEngine,
      status: pgData.status || (hasStudioAudio ? 'completed' : 'draft'),
      audio_url: hasStudioAudio ? `/api/stream/${id}` : null,
      total_duration_ms: pgData.total_duration_ms || 0,
    });
  } catch (err) {
    console.error('[Track Status Error]:', err.message);
    return res.status(500).json({ error: 'Failed to check track status' });
  }
});

/**
 * 6c. GET /api/chapters/:id/segments
 * Fetches parsed dialogue segments from MongoDB Chapter document.
 */
router.get('/chapters/:id/segments', async (req, res) => {
  const { id } = req.params;
  if (!id || !SAFE_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }
  try {
    const chapterDoc = await findChapterDocWithFallback(id);
    if (chapterDoc && needsSelfHealingReparse(chapterDoc)) {
      await healChapterDocument(chapterDoc, chapterDoc.novel_id, pool);
    }
    if (!chapterDoc || !chapterDoc.segments || chapterDoc.segments.length === 0) {
      return res.status(404).json({ error: 'Chapter segments not found or not yet parsed.' });
    }
    return res.json({
      chapter_id: id,
      segments: chapterDoc.segments,
    });
  } catch (err) {
    console.error('[Get Chapter Segments Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve chapter segments.' });
  }
});

/**
 * 7. GET /api/manifest/:chapter_id
 * Reads manifest from MongoDB Chapter document.
 */
router.get('/manifest/:chapter_id', async (req, res) => {
  const { chapter_id } = req.params;
  if (!chapter_id || !SAFE_ID_REGEX.test(chapter_id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }

  try {
    const chapterDoc = await findChapterDocWithFallback(chapter_id);
    if (!chapterDoc) {
      return res.status(404).json({ detail: 'Chapter not found' });
    }

    if (
      chapterDoc.manifest &&
      Array.isArray(chapterDoc.manifest.timeline) &&
      chapterDoc.manifest.timeline.length > 0 &&
      needsSelfHealingReparse(chapterDoc)
    ) {
      await healChapterDocument(chapterDoc, chapterDoc.novel_id, pool);
    }

    let manifestObj = null;
    if (chapterDoc.manifest && chapterDoc.manifest.timeline && chapterDoc.manifest.timeline.length > 0) {
      manifestObj = chapterDoc.manifest.toObject ? chapterDoc.manifest.toObject() : { ...chapterDoc.manifest };
    }

    if (!manifestObj || !manifestObj.timeline || manifestObj.timeline.length === 0) {
      const diskManifestPath = path.join(config.paths.chaptersDir, chapter_id, 'manifest.json');
      if (fs.existsSync(diskManifestPath)) {
        try {
          const raw = fs.readFileSync(diskManifestPath, 'utf8');
          manifestObj = JSON.parse(raw);
        } catch (_) {}
      }
    }

    if (!manifestObj || !manifestObj.timeline || manifestObj.timeline.length === 0) {
      return res.status(400).json({ detail: 'Chapter not yet synthesized. Call /synthesize first.' });
    }

    let studioEngine = manifestObj.engine || manifestObj.studio_engine || null;
    if (!studioEngine) {
      const diskManifestPath = path.join(config.paths.chaptersDir, chapter_id, 'manifest.json');
      if (fs.existsSync(diskManifestPath)) {
        try {
          const raw = fs.readFileSync(diskManifestPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.engine || parsed.studio_engine)) {
            studioEngine = parsed.engine || parsed.studio_engine;
          }
        } catch (_) {}
      }
    }

    manifestObj.studio_engine = studioEngine || 'auto';
    if (!manifestObj.engine) {
      manifestObj.engine = manifestObj.studio_engine;
    }
    manifestObj.audio_stream_url = manifestObj.audio_url || manifestObj.audio_stream_url || `/api/stream/${chapter_id}`;

    return res.json(manifestObj);
  } catch (err) {
    console.error('[Manifest Error]:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve manifest.' });
  }
});

/**
 * 8. GET /api/characters/:chapter_id
 * Returns characters and segment counts from MongoDB segments array.
 */
router.get('/characters/:chapter_id', async (req, res) => {
  const { chapter_id } = req.params;
  if (!chapter_id || !SAFE_ID_REGEX.test(chapter_id)) {
    return res.status(400).json({ error: 'Invalid chapter ID format.' });
  }

  try {
    const chapterDoc = await findChapterDocWithFallback(chapter_id);
    if (!chapterDoc || !chapterDoc.segments || chapterDoc.segments.length === 0) {
      return res.status(404).json({ detail: 'Chapter not found or not yet parsed.' });
    }

    const charCounts = new Map();
    for (const seg of chapterDoc.segments) {
      if (seg.character_id && seg.character_id !== 'narrator') {
        const prev = charCounts.get(seg.character_id) || {
          name: seg.speaker_name || seg.character_id,
          voice: seg.assigned_voice_id || seg.voice_id,
          count: 0,
        };
        prev.count += 1;
        charCounts.set(seg.character_id, prev);
      }
    }

    const characters = [];
    for (const [cid, val] of charCounts.entries()) {
      characters.push({
        character_id: cid,
        character_name: val.name,
        assigned_voice_id: val.voice,
        segment_count: val.count,
      });
    }

    return res.json({ characters });
  } catch (err) {
    console.error('[Chapter Characters Error]:', err.message);
    return res.status(500).json({ error: 'Failed to fetch characters for chapter.' });
  }
});

router.buildParsedSegmentsAndManifest = buildParsedSegmentsAndManifest;
router.buildParsedSegmentsAndManifestAsync = buildParsedSegmentsAndManifestAsync;
router.needsSelfHealingReparse = needsSelfHealingReparse;
router.healChapterDocument = healChapterDocument;
router.upsertDiscoveredCharactersPg = upsertDiscoveredCharactersPg;
router.sanitizeSegmentSource = sanitizeSegmentSource;
router.ingestChapter = ingestChapter;

module.exports = router;
