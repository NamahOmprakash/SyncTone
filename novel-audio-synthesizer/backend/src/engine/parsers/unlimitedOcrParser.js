/**
 * SyncTone — Tier 3 Self-Hosted Vision OCR Adapter (Baidu Unlimited-OCR via vLLM)
 *
 * Connects to an OpenAI-compatible vLLM server (`UNLIMITED_OCR_URL`, default `http://localhost:8000/v1`)
 * serving `baidu/Unlimited-OCR`. Sends `<image>document parsing.` requests with Baidu's
 * recommended n-gram repetition penalty (`ngram_size: 35, window_size: 128`), parses
 * `<|ref|>image<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|>` normalized `0..1000` bounding boxes,
 * and strips `<|ref|>...<|/det|>` tags to emit clean layout-aware Markdown/text.
 */

const fs = require('fs');
const path = require('path');
const { config } = require('../../config');

const IMAGE_DET_REGEX = /<\|ref\|>\s*image\s*<\|\/ref\|>\s*<\|det\|>\s*\[\s*\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]\s*\]\s*<\|\/det\|>/gi;
const ANY_REF_DET_REGEX = /<\|ref\|>[\s\S]*?<\|\/ref\|>\s*<\|det\|>[\s\S]*?<\|\/det\|>/gi;
const RESIDUAL_SPECIAL_TAG_REGEX = /<\|\/?(?:ref|det|box|image|page|table|title|text)\|>|\[\[\d+(?:,\s*\d+){3}\]\]/gi;

/**
 * Extracts normalized 0..1000 figure bounding boxes from Unlimited-OCR output
 * and converts them into pixel coordinates when width/height are provided.
 */
function parseNormalizedDetBoxes(rawOcrText = '', imageWidth = 1000, imageHeight = 1000) {
  const boxes = [];
  let match;
  const regex = new RegExp(IMAGE_DET_REGEX.source, 'gi');
  while ((match = regex.exec(String(rawOcrText))) !== null) {
    const x1Norm = Math.max(0, Math.min(1000, parseFloat(match[1])));
    const y1Norm = Math.max(0, Math.min(1000, parseFloat(match[2])));
    const x2Norm = Math.max(0, Math.min(1000, parseFloat(match[3])));
    const y2Norm = Math.max(0, Math.min(1000, parseFloat(match[4])));

    if (x2Norm <= x1Norm || y2Norm <= y1Norm) continue;

    boxes.push({
      rawMatch: match[0],
      normalized: [x1Norm, y1Norm, x2Norm, y2Norm],
      pixelBox: {
        left: Math.round((x1Norm / 1000) * imageWidth),
        top: Math.round((y1Norm / 1000) * imageHeight),
        width: Math.max(1, Math.round(((x2Norm - x1Norm) / 1000) * imageWidth)),
        height: Math.max(1, Math.round(((y2Norm - y1Norm) / 1000) * imageHeight)),
      },
    });
  }
  return boxes;
}

/**
 * Replaces `<|ref|>image<|/ref|><|det|>[[...]]<|/det|>` tags with `[IMAGE:...]` markers
 * (when figure URLs are provided) and strips all other `<|ref|>...<|/det|>` layout tags.
 */
function stripUnlimitedOcrTags(rawOcrText = '', figureUrls = []) {
  let figIdx = 0;
  let text = String(rawOcrText || '');

  text = text.replace(IMAGE_DET_REGEX, () => {
    const url = figureUrls[figIdx++];
    return url ? `\n\n[IMAGE:${url}]\n\n` : '';
  });

  // Strip non-image ref/det tags while keeping their inner or adjacent text
  text = text.replace(ANY_REF_DET_REGEX, '');
  text = text.replace(RESIDUAL_SPECIAL_TAG_REGEX, '');

  // Normalize excessive blank lines
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Checks whether the Unlimited-OCR vLLM OpenAI-compatible server is reachable.
 */
async function checkUnlimitedOcrAvailable(options = {}) {
  const baseUrl = (options.baseUrl || options.unlimitedOcrUrl || config.unlimitedOcr?.baseUrl || 'http://localhost:8000/v1').replace(/\/+$/, '');
  const model = options.model || options.unlimitedOcrModel || config.unlimitedOcr?.model || 'baidu/Unlimited-OCR';
  const fetchImpl = options.fetchImpl || global.fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetchImpl(`${baseUrl}/models`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { available: false, url: baseUrl, model };
    }
    return { available: true, url: baseUrl, model };
  } catch (_err) {
    return { available: false, url: baseUrl, model };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transcribes a single page image buffer (`image/png` or `image/jpeg`) via Baidu Unlimited-OCR vLLM.
 */
async function transcribePageWithUnlimitedOcr(imageBuffer, mimeType = 'image/png', options = {}) {
  const baseUrl = (options.baseUrl || options.unlimitedOcrUrl || config.unlimitedOcr?.baseUrl || 'http://localhost:8000/v1').replace(/\/+$/, '');
  const model = options.model || options.unlimitedOcrModel || config.unlimitedOcr?.model || 'baidu/Unlimited-OCR';
  const timeoutMs = options.timeoutMs || config.unlimitedOcr?.timeoutMs || 120000;
  const fetchImpl = options.fetchImpl || global.fetch;

  const b64 = Buffer.isBuffer(imageBuffer)
    ? imageBuffer.toString('base64')
    : Buffer.from(String(imageBuffer)).toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${b64}` },
              },
              {
                type: 'text',
                text: 'document parsing.',
              },
            ],
          },
        ],
        temperature: 0.0,
        max_tokens: 8192,
        skip_special_tokens: false,
        vllm_xargs: {
          ngram_size: 35,
          window_size: 128,
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Unlimited-OCR vLLM HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content || '';
  const boxes = parseNormalizedDetBoxes(rawContent);
  const cleanMarkdown = stripUnlimitedOcrTags(rawContent);

  return {
    raw: rawContent,
    boxes,
    markdown: cleanMarkdown,
  };
}

/**
 * Full manuscript parsing pipeline using Unlimited-OCR vLLM when reachable.
 */
async function parseWithUnlimitedOcr(filePath, options = {}) {
  const status = await checkUnlimitedOcrAvailable(options);
  if (!status.available) {
    const err = new Error(
      `Baidu Unlimited-OCR vLLM server is unreachable at ${status.url}. Start the vLLM server or select 'heuristic' / 'gemini'.`
    );
    err.code = 'UNLIMITED_OCR_OFFLINE';
    throw err;
  }

  const ext = path.extname(filePath).toLowerCase();
  const baseTitle = path.basename(filePath, ext).replace(/[_-]+/g, ' ').trim() || 'Untitled Novel';

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext) && fs.existsSync(filePath)) {
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const imgBuf = fs.readFileSync(filePath);
    const pageResult = await transcribePageWithUnlimitedOcr(imgBuf, mimeMap[ext] || 'image/png', options);
    const { enrichExtractedChaptersWithParser } = require('./index');
    const extracted = {
      title: baseTitle,
      author: '',
      synopsis: pageResult.markdown.slice(0, 360),
      cover_url: null,
      parser_engine: 'unlimited-ocr',
      chapters: [
        {
          chapter_number: 1,
          title: 'Chapter 1',
          text: pageResult.markdown,
          raw_text: pageResult.markdown,
          content_text: pageResult.markdown,
        },
      ],
    };
    return await enrichExtractedChaptersWithParser(extracted, {
      engine: 'unlimited-ocr',
      model: status.model,
      settings: options,
    });
  }

  // For PDFs/EPUBs, run local extractor first and enrich chapters via Unlimited-OCR
  if (typeof options.runLocalExtractor === 'function') {
    const localData = await options.runLocalExtractor(filePath);
    const { enrichExtractedChaptersWithParser } = require('./index');
    const extracted = {
      ...localData,
      parser_engine: 'unlimited-ocr',
    };
    return await enrichExtractedChaptersWithParser(extracted, {
      engine: 'unlimited-ocr',
      model: status.model,
      settings: options,
    });
  }

  throw new Error(`Unsupported file type '${ext}' for Unlimited-OCR parser.`);
}

module.exports = {
  parseNormalizedDetBoxes,
  stripUnlimitedOcrTags,
  checkUnlimitedOcrAvailable,
  transcribePageWithUnlimitedOcr,
  parseWithUnlimitedOcr,
};
