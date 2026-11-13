/**
 * SyncTone — Tier 2 Cloud Multimodal AI Parser (Google Gemini Flash)
 *
 * Uses Google's Gemini REST API (`generateContent` with `responseMimeType: "application/json"`)
 * to parse uploaded PDFs, images, or noisy EPUB/text manuscripts into structured
 * chapters, attributed dialogue/narration segments, and a character roster in a single pass.
 */

const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const { voiceProfiler, VOICE_PALETTE } = require('../voiceProfiler');
const { unifyCharacterEntities, inferSpeakerGender } = require('../textParser');

const GEMINI_SYSTEM_PROMPT = `You are SyncTone's literary manuscript parser and multi-voice dialogue attribution engine.
Analyze the provided book/manuscript content and return ONLY valid JSON matching this exact structure:
{
  "title": "Book Title",
  "author": "Author Name",
  "synopsis": "1-2 sentence synopsis of the work",
  "global_tone": "e.g., British Fantasy, Victorian Mystery, Sci-Fi Thriller",
  "characters": [
    {
      "name": "Canonical Character Name",
      "gender": "male | female | neutral",
      "age_band": "young | adult | elder",
      "accent": "british | american",
      "role": "narrator | protagonist | supporting"
    }
  ],
  "chapters": [
    {
      "chapter_number": 1,
      "title": "Chapter Title",
      "segments": [
        {
          "order": 1,
          "type": "narration | dialogue",
          "speaker_name": "Narrator or Canonical Character Name",
          "text": "Exact clean literary text of the segment (artifacts, page numbers, and OCR headers stripped)",
          "confidence": 0.95
        }
      ]
    }
  ]
}

Rules:
1. Strip running headers, page numbers, ISBN blocks, table-of-contents noise, and OCR gibberish.
2. Separate narration from spoken dialogue into sequential segments.
3. Attribute every dialogue segment to the speaking character's canonical name using explicit dialogue tags, conversational turn-taking (A-B-A-B), and vocative address cues.
4. Narration segments must have type="narration" and speaker_name="Narrator".`;

function normalizeSpeakerId(name = '') {
  const cleaned = String(name || 'Narrator')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'narrator';
}

function normalizeGenderValue(rawGender, fallbackName = '') {
  const g = String(rawGender || '').toLowerCase().trim();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  return inferSpeakerGender(fallbackName);
}

function extractVoiceIdString(resolved, fallback = 'en-GB-ThomasNeural') {
  if (typeof resolved === 'string' && resolved.trim()) return resolved.trim();
  if (resolved && typeof resolved === 'object' && typeof resolved.voiceId === 'string' && resolved.voiceId.trim()) {
    return resolved.voiceId.trim();
  }
  return fallback;
}

function normalizeGeminiPayload(rawJson, fallbackTitle = 'Untitled Novel', options = {}) {
  const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  const rawCharacters = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const rawChapters = Array.isArray(parsed?.chapters) ? parsed.chapters : [];
  const shouldApplyVoices = options.applyVoices !== false;

  const rawCharLookup = new Map();
  const seedCharacters = [];
  for (const c of rawCharacters) {
    if (!c || typeof c !== 'object') continue;
    const cname = String(c.name || c.speaker_name || c.canonical_name || '').trim();
    if (!cname) continue;
    const cid = normalizeSpeakerId(c.character_id || cname);
    const gender = cid === 'narrator' ? 'male' : normalizeGenderValue(c.gender, cname);
    const description =
      String(c.description || '').trim() ||
      [c.role, c.age_band, c.accent].filter(Boolean).join(', ');
    const entry = {
      character_id: cid,
      name: cid === 'narrator' ? 'Narrator' : cname,
      gender,
      description,
      line_count: Number(c.line_count) || 0,
      sample_quote: String(c.sample_quote || '').trim(),
      voice_id: typeof c.voice_id === 'string' && c.voice_id.trim() ? c.voice_id.trim() : null,
    };
    rawCharLookup.set(cname.toLowerCase(), entry);
    rawCharLookup.set(cid, entry);
    seedCharacters.push(entry);
  }

  const chapterBounds = [];
  const allSegments = [];

  const preliminaryChapters = rawChapters
    .map((ch, idx) => {
      const rawSegs = Array.isArray(ch?.segments) ? ch.segments : [];
      const chapterSegs = rawSegs
        .filter((s) => s && typeof s.text === 'string' && s.text.trim().length > 0)
        .map((s, sIdx) => {
          const isNarration =
            String(s.type || '').toLowerCase() === 'narration' ||
            String(s.speaker_name || '').toLowerCase() === 'narrator';
          const speakerName = isNarration ? 'Narrator' : String(s.speaker_name || 'Narrator').trim();
          const speakerId = isNarration ? 'narrator' : normalizeSpeakerId(speakerName);
          const charMeta = rawCharLookup.get(speakerName.toLowerCase()) || rawCharLookup.get(speakerId);
          const gender = isNarration
            ? 'male'
            : normalizeGenderValue(s.gender || s.speaker_gender || charMeta?.gender, speakerName);
          const genderArg = gender === 'male' || gender === 'female' ? gender : null;

          const resolved = isNarration
            ? VOICE_PALETTE.narrator
            : voiceProfiler.resolveCharacterVoice(speakerName, '', genderArg);
          const voiceId = isNarration
            ? VOICE_PALETTE.narrator
            : extractVoiceIdString(resolved, 'en-GB-ThomasNeural');

          return {
            order: sIdx + 1,
            segment_id: sIdx + 1,
            type: isNarration ? 'narration' : 'dialogue',
            speaker_id: speakerId,
            speaker_name: speakerName,
            character_id: speakerId,
            gender,
            speaker_gender: gender,
            voice_id: voiceId,
            assigned_voice_id: voiceId,
            text: s.text.trim(),
            confidence: typeof s.confidence === 'number' ? Math.min(1, Math.max(0, s.confidence)) : 0.94,
            source: 'gemini_ai',
            attribution_source: 'gemini_ai',
            needs_review: false,
          };
        });

      const joinedText =
        typeof ch?.text === 'string' && ch.text.trim().length > 0
          ? ch.text.trim()
          : chapterSegs.map((s) => s.text).join('\n\n');

      return {
        chapter_number: Number(ch?.chapter_number) || idx + 1,
        title: String(ch?.title || `Chapter ${idx + 1}`).trim(),
        text: joinedText,
        segments: chapterSegs,
      };
    })
    .filter((ch) => ch.text.length > 0 || ch.segments.length > 0);

  for (const ch of preliminaryChapters) {
    const start = allSegments.length;
    allSegments.push(...ch.segments);
    chapterBounds.push({ start, end: allSegments.length });
  }

  const unified = unifyCharacterEntities(allSegments, seedCharacters);
  const voicedAll = shouldApplyVoices
    ? voiceProfiler.applyVoicesToSegments(unified.segments, unified.characters)
    : unified.segments;

  const normalizedAllSegments = voicedAll.map((seg) => {
    if (!seg) return seg;
    const isNarr = seg.type === 'narration' || seg.speaker_id === 'narrator';
    const strVoice = isNarr
      ? VOICE_PALETTE.narrator
      : extractVoiceIdString(seg.assigned_voice_id || seg.voice_id, 'en-GB-ThomasNeural');
    return {
      ...seg,
      speaker_name: isNarr ? 'Narrator' : seg.speaker_name,
      voice_id: strVoice,
      assigned_voice_id: strVoice,
    };
  });

  const chapters = preliminaryChapters.map((ch, idx) => {
    const { start, end } = chapterBounds[idx];
    const chSegs = normalizedAllSegments.slice(start, end).map((seg, sIdx) => ({
      ...seg,
      order: sIdx + 1,
      segment_id: sIdx + 1,
    }));
    return {
      ...ch,
      segments: chSegs,
    };
  });

  // Collect per-character voice & narration stats from normalized segments
  const segVoiceByCharId = new Map();
  let narrationCount = 0;
  let firstNarrationQuote = '';
  for (const seg of normalizedAllSegments) {
    if (!seg) continue;
    if (seg.type === 'narration' || seg.speaker_id === 'narrator') {
      narrationCount += 1;
      if (!firstNarrationQuote && seg.text) {
        firstNarrationQuote = String(seg.text).trim().slice(0, 220);
      }
      continue;
    }
    if (seg.type === 'dialogue' && seg.speaker_id && !segVoiceByCharId.has(seg.speaker_id)) {
      if (typeof seg.voice_id === 'string' && seg.voice_id && seg.voice_id !== VOICE_PALETTE.narrator) {
        segVoiceByCharId.set(seg.speaker_id, seg.voice_id);
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
    if (!c || !c.character_id || seenCharIds.has(c.character_id)) continue;
    seenCharIds.add(c.character_id);
    const charGender = normalizeGenderValue(c.gender, c.name);
    const genderArg = charGender === 'male' || charGender === 'female' ? charGender : null;
    let voiceId = segVoiceByCharId.get(c.character_id) || (typeof c.voice_id === 'string' ? c.voice_id : null);
    if (!voiceId || voiceId === VOICE_PALETTE.narrator) {
      const resolved = voiceProfiler.resolveCharacterVoice(c.name, '', genderArg);
      voiceId = extractVoiceIdString(resolved, 'en-GB-ThomasNeural');
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
    title: String(parsed?.title || fallbackTitle).trim(),
    author: String(parsed?.author || '').trim(),
    synopsis: String(parsed?.synopsis || '').trim(),
    global_tone: String(parsed?.global_tone || 'Dramatic Literary').trim(),
    cover_url: parsed?.cover_url || null,
    parser_engine: 'gemini',
    characters: finalCharacters,
    chapters,
  };
}

/**
 * Calls Google Gemini REST API (`generateContent`) with either inline binary PDF/image data
 * or pre-extracted text from local heuristic helper.
 */
async function parseWithGemini(filePath, options = {}) {
  const apiKey = options.apiKey || config.gemini?.apiKey || process.env.GEMINI_API_KEY || '';
  const timeoutMs = options.timeoutMs || config.gemini?.timeoutMs || 90000;
  const fetchImpl = options.fetchImpl || global.fetch;

  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured on the server.');
    err.code = 'GEMINI_KEY_MISSING';
    throw err;
  }

  const ext = path.extname(filePath).toLowerCase();
  const baseTitle = path.basename(filePath, ext).replace(/[_-]+/g, ' ').trim() || 'Untitled Novel';

  const parts = [{ text: GEMINI_SYSTEM_PROMPT }];
  let localPreExtract = null;

  if (ext === '.pdf' && fs.existsSync(filePath) && fs.statSync(filePath).size <= 18 * 1024 * 1024) {
    const pdfBase64 = fs.readFileSync(filePath).toString('base64');
    parts.push({
      inline_data: {
        mime_type: 'application/pdf',
        data: pdfBase64,
      },
    });
  } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext) && fs.existsSync(filePath)) {
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    parts.push({
      inline_data: {
        mime_type: mimeMap[ext] || 'image/png',
        data: fs.readFileSync(filePath).toString('base64'),
      },
    });
  } else if (typeof options.runLocalExtractor === 'function') {
    localPreExtract = await options.runLocalExtractor(filePath);
    const chapterSample = (localPreExtract?.chapters || [])
      .slice(0, 15)
      .map((c, idx) => `=== CHAPTER ${idx + 1}: ${c.title || ''} ===\n${String(c.raw_text || c.content_text || c.text || c.content || '').slice(0, 18000)}`)
      .join('\n\n');
    parts.push({
      text: `Book Title Hint: ${localPreExtract?.title || baseTitle}\nAuthor Hint: ${localPreExtract?.author || ''}\n\nManuscript Content:\n${chapterSample}`,
    });
  } else if (fs.existsSync(filePath)) {
    const rawText = fs.readFileSync(filePath, 'utf-8').slice(0, 120000);
    parts.push({
      text: `Book Title Hint: ${baseTitle}\n\nManuscript Content:\n${rawText}`,
    });
  }

  const requestedModel = String(
    options.model || config.gemini?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  ).trim();
  const fallbackModel = 'gemini-2.5-flash';
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.1;

  const callGeminiModel = async (targetModel) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let response = await callGeminiModel(requestedModel);
  let errText = '';
  if (!response.ok) {
    errText = await response.text().catch(() => '');
    const isUnsupportedOr404 =
      response.status === 404 ||
      /not found|is not supported|unsupported|invalid model|unknown model/i.test(errText);
    if (isUnsupportedOr404 && requestedModel !== fallbackModel) {
      console.warn(
        `[GeminiParser] Model '${requestedModel}' returned HTTP ${response.status}; retrying with '${fallbackModel}'.`
      );
      response = await callGeminiModel(fallbackModel);
      if (!response.ok) {
        errText = await response.text().catch(() => '');
      }
    }
  }

  if (!response.ok) {
    throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const candidateText =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

  if (!candidateText.trim()) {
    throw new Error('Gemini API returned an empty response.');
  }

  const cleanedJsonText = candidateText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const normalized = normalizeGeminiPayload(
    cleanedJsonText,
    localPreExtract?.title || baseTitle,
    { applyVoices: options.applyVoices !== false }
  );
  if (!normalized.cover_url && localPreExtract?.cover_url) {
    normalized.cover_url = localPreExtract.cover_url;
  }
  return normalized;
}

module.exports = {
  parseWithGemini,
  normalizeGeminiPayload,
  GEMINI_SYSTEM_PROMPT,
};
