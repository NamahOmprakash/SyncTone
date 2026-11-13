const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const { ttsEngine } = require('../engine/ttsEngine');
const { attributionEngine } = require('../engine/attribution');
const { getParsersStatus } = require('../engine/parsers');
const { config } = require('../config');

const router = Router();
const PARSER_CONFIG_PATH = path.join(config.paths.outputDir, 'parser_config.json');

const VALID_ENGINES = new Set(['heuristic', 'gemini', 'ollama', 'ocr', 'unlimited-ocr']);
const VALID_SENSITIVITIES = new Set(['balanced', 'aggressive', 'strict']);
const VALID_QUOTE_STYLES = new Set(['auto', 'double', 'single']);

function getDefaultParserConfig() {
  return {
    activeEngine: 'heuristic',
    heuristic: {
      sensitivity: 'balanced',
      turnTaking: true,
      quoteStyle: 'auto',
    },
    gemini: {
      apiKey: config.gemini?.apiKey || '',
      model: config.gemini?.model || 'gemini-2.5-flash',
      temperature: 0.1,
    },
    ollama: {
      url: config.ollama?.url || 'http://localhost:11434',
      model: config.ollama?.model || 'llama3:8b',
    },
    ocr: {
      baseUrl: config.unlimitedOcr?.url || config.unlimitedOcr?.baseUrl || 'http://localhost:8000/v1',
      model: config.unlimitedOcr?.model || 'baidu/Unlimited-OCR',
    },
  };
}

function normalizeEngineName(engine) {
  const raw = String(engine || '').trim().toLowerCase();
  if (raw === 'unlimited-ocr' || raw === 'unlimited_ocr') return 'ocr';
  if (VALID_ENGINES.has(raw)) return raw;
  return 'heuristic';
}

function sanitizeParserConfig(incoming = {}, baseConfig = null) {
  const defaults = baseConfig || getDefaultParserConfig();
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  const ocrSrc = src.ocr || src['unlimited-ocr'] || src.unlimited_ocr || {};
  const heurSrc = src.heuristic || {};
  const gemSrc = src.gemini || {};
  const ollSrc = src.ollama || {};

  const tempNum = gemSrc.temperature !== undefined ? Number(gemSrc.temperature) : defaults.gemini.temperature;
  const clampedTemp = Number.isFinite(tempNum) ? Math.max(0, Math.min(1, Number(tempNum.toFixed(2)))) : defaults.gemini.temperature;

  return {
    activeEngine:
      src.activeEngine !== undefined
        ? normalizeEngineName(src.activeEngine)
        : normalizeEngineName(defaults.activeEngine),
    heuristic: {
      sensitivity: VALID_SENSITIVITIES.has(heurSrc.sensitivity)
        ? heurSrc.sensitivity
        : defaults.heuristic.sensitivity,
      turnTaking:
        typeof heurSrc.turnTaking === 'boolean'
          ? heurSrc.turnTaking
          : defaults.heuristic.turnTaking,
      quoteStyle: VALID_QUOTE_STYLES.has(heurSrc.quoteStyle)
        ? heurSrc.quoteStyle
        : defaults.heuristic.quoteStyle,
    },
    gemini: {
      apiKey:
        gemSrc.apiKey !== undefined
          ? String(gemSrc.apiKey).trim()
          : defaults.gemini.apiKey,
      model:
        typeof gemSrc.model === 'string' && gemSrc.model.trim()
          ? gemSrc.model.trim()
          : defaults.gemini.model,
      temperature: clampedTemp,
    },
    ollama: {
      url:
        typeof ollSrc.url === 'string' && ollSrc.url.trim()
          ? ollSrc.url.trim().replace(/\/+$/, '')
          : defaults.ollama.url,
      model:
        typeof ollSrc.model === 'string' && ollSrc.model.trim()
          ? ollSrc.model.trim()
          : defaults.ollama.model,
    },
    ocr: {
      baseUrl:
        typeof ocrSrc.baseUrl === 'string' && ocrSrc.baseUrl.trim()
          ? ocrSrc.baseUrl.trim().replace(/\/+$/, '')
          : defaults.ocr.baseUrl,
      model:
        typeof ocrSrc.model === 'string' && ocrSrc.model.trim()
          ? ocrSrc.model.trim()
          : defaults.ocr.model,
    },
  };
}

function loadParserConfig() {
  const defaults = getDefaultParserConfig();
  try {
    if (fs.existsSync(PARSER_CONFIG_PATH)) {
      const raw = fs.readFileSync(PARSER_CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return sanitizeParserConfig(parsed, defaults);
    }
  } catch (err) {
    console.warn(`[Status] Failed to read ${PARSER_CONFIG_PATH}: ${err.message}`);
  }
  return defaults;
}

function saveParserConfig(incoming) {
  const current = loadParserConfig();
  const next = sanitizeParserConfig(incoming, current);
  fs.mkdirSync(path.dirname(PARSER_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(PARSER_CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function validateHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// GET /api/status/parser-config
router.get('/status/parser-config', (_req, res) => {
  const cfg = loadParserConfig();
  return res.json({
    ...cfg,
    geminiConfigured: Boolean(cfg.gemini.apiKey),
  });
});

// POST /api/status/parser-config
router.post('/status/parser-config', (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const incomingOllamaUrl = payload?.ollama?.url;
    if (incomingOllamaUrl !== undefined && incomingOllamaUrl !== '' && !validateHttpUrl(incomingOllamaUrl)) {
      return res.status(400).json({ ok: false, error: 'Invalid Ollama URL; must start with http:// or https://' });
    }
    const incomingOcrUrl = payload?.ocr?.baseUrl || payload?.['unlimited-ocr']?.baseUrl;
    if (incomingOcrUrl !== undefined && incomingOcrUrl !== '' && !validateHttpUrl(incomingOcrUrl)) {
      return res.status(400).json({ ok: false, error: 'Invalid Vision OCR baseUrl; must start with http:// or https://' });
    }

    const saved = saveParserConfig(payload);
    return res.json({
      ok: true,
      config: saved,
      ...saved,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/status/parser-test
router.post('/status/parser-test', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawEngine = String(body.engine || body.activeEngine || '').trim().toLowerCase();
  if (!rawEngine || !VALID_ENGINES.has(rawEngine)) {
    return res.status(400).json({ ok: false, reachable: false, error: `Unsupported parser engine '${body.engine}'` });
  }

  const engine = normalizeEngineName(rawEngine);
  const saved = loadParserConfig();
  const engCfg = body.config && typeof body.config === 'object' ? body.config : {};

  if (engine === 'heuristic') {
    return res.json({
      ok: true,
      engine: 'heuristic',
      reachable: true,
      message: 'Heuristic rule-based parser is ready',
    });
  }

  if (engine === 'gemini') {
    const apiKey = String(engCfg.apiKey !== undefined ? engCfg.apiKey : saved.gemini.apiKey || '').trim();
    const model = String(engCfg.model || saved.gemini.model || 'gemini-2.5-flash').trim();
    if (!apiKey) {
      return res.json({
        ok: false,
        engine: 'gemini',
        reachable: false,
        error: 'Gemini API key is required',
      });
    }
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!resp.ok) {
        let errDetail = `Gemini API returned HTTP ${resp.status}`;
        try {
          const errJson = await resp.json();
          if (errJson?.error?.message) errDetail = errJson.error.message;
        } catch (_) {}
        return res.json({
          ok: false,
          engine: 'gemini',
          reachable: false,
          status: resp.status,
          error: errDetail,
        });
      }
      const data = await resp.json();
      const models = (data.models || [])
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter((name) => name.includes('gemini'));
      return res.json({
        ok: true,
        engine: 'gemini',
        reachable: true,
        model,
        models,
        message: `Connected to Gemini (${models.length} models accessible)`,
      });
    } catch (err) {
      return res.json({
        ok: false,
        engine: 'gemini',
        reachable: false,
        error: err.message || 'Failed to reach Gemini API',
      });
    }
  }

  if (engine === 'ollama') {
    const url = String(engCfg.url || saved.ollama.url || 'http://localhost:11434').trim().replace(/\/+$/, '');
    const model = String(engCfg.model || saved.ollama.model || 'llama3:8b').trim();
    if (!validateHttpUrl(url)) {
      return res.status(400).json({ ok: false, engine: 'ollama', reachable: false, error: 'Invalid Ollama URL' });
    }
    try {
      const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!resp.ok) {
        return res.json({
          ok: false,
          engine: 'ollama',
          reachable: false,
          url,
          models: [],
          error: `Ollama returned HTTP ${resp.status}`,
        });
      }
      const data = await resp.json();
      const models = (data.models || [])
        .map((m) => m.name || m.model)
        .filter(Boolean);
      return res.json({
        ok: true,
        engine: 'ollama',
        reachable: true,
        url,
        model,
        models,
        message: `Ollama reachable (${models.length} local model${models.length === 1 ? '' : 's'})`,
      });
    } catch (err) {
      return res.json({
        ok: false,
        engine: 'ollama',
        reachable: false,
        url,
        models: [],
        error: err.message || 'Ollama server unreachable',
      });
    }
  }

  // engine === 'ocr'
  const baseUrl = String(engCfg.baseUrl || saved.ocr.baseUrl || 'http://localhost:8000/v1').trim().replace(/\/+$/, '');
  const model = String(engCfg.model || saved.ocr.model || 'baidu/Unlimited-OCR').trim();
  if (!validateHttpUrl(baseUrl)) {
    return res.status(400).json({ ok: false, engine: 'ocr', reachable: false, error: 'Invalid Vision OCR baseUrl' });
  }
  try {
    const resp = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) {
      return res.json({
        ok: false,
        engine: 'ocr',
        reachable: false,
        baseUrl,
        model,
        models: [],
        error: `OCR endpoint returned HTTP ${resp.status}`,
      });
    }
    const data = await resp.json();
    const models = (data.data || data.models || [])
      .map((m) => m.id || m.name)
      .filter(Boolean);
    return res.json({
      ok: true,
      engine: 'ocr',
      reachable: true,
      baseUrl,
      model,
      models,
      message: `Vision OCR reachable (${models.length} model${models.length === 1 ? '' : 's'})`,
    });
  } catch (err) {
    return res.json({
      ok: false,
      engine: 'ocr',
      reachable: false,
      baseUrl,
      model,
      models: [],
      error: err.message || 'Vision OCR endpoint unreachable',
    });
  }
});

// GET /api/status/models
router.get('/status/models', async (req, res) => {
  const probe = req.query.probe === 'true' || req.query.probe === '1';
  const savedConfig = loadParserConfig();
  const [ttsStatus, llmAvailable, parsersStatus] = await Promise.all([
    ttsEngine.checkModelAvailable({ probe }),
    attributionEngine.checkAvailability(),
    getParsersStatus({
      geminiApiKey: savedConfig.gemini.apiKey,
      geminiModel: savedConfig.gemini.model,
      ollamaUrl: savedConfig.ollama.url,
      ollamaModel: savedConfig.ollama.model,
      ocrBaseUrl: savedConfig.ocr.baseUrl,
      ocrModel: savedConfig.ocr.model,
      unlimitedOcrUrl: savedConfig.ocr.baseUrl,
      unlimitedOcrModel: savedConfig.ocr.model,
    }),
  ]);

  return res.json({
    tts: ttsStatus,
    kokoro: {
      available: Boolean(ttsStatus.model_exists && ttsStatus.voices_exists),
      model_path: ttsStatus.model_path,
    },
    paradee: {
      available: Boolean(ttsStatus.paradee_ready),
      model_path: ttsStatus.paradee_model_path,
      voices: ttsStatus.paradee_voices || ['bm_fable', 'bf_isabella', 'am_puck', 'af_heart'],
      mixed_mode_ready: true,
    },
    parsers: parsersStatus,
    parser_config: {
      activeEngine: savedConfig.activeEngine,
      geminiConfigured: Boolean(savedConfig.gemini.apiKey),
      ollamaUrl: savedConfig.ollama.url,
      ollamaModel: savedConfig.ollama.model,
      ocrBaseUrl: savedConfig.ocr.baseUrl,
      ocrModel: savedConfig.ocr.model,
    },
    llm: {
      available: llmAvailable,
      model: savedConfig.ollama.model || config.ollama.model,
      url: savedConfig.ollama.url || config.ollama.url,
    },
  });
});

router.loadParserConfig = loadParserConfig;
router.saveParserConfig = saveParserConfig;
router.getParserConfigPath = () => PARSER_CONFIG_PATH;

module.exports = router;
