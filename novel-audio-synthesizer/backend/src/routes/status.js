const { Router } = require('express');
const { ttsEngine } = require('../engine/ttsEngine');
const { attributionEngine } = require('../engine/attribution');
const { config } = require('../config');

const router = Router();

// GET /api/status/models
router.get('/status/models', async (_req, res) => {
  const ttsStatus = await ttsEngine.checkModelAvailable();
  const llmAvailable = await attributionEngine.checkAvailability();

  return res.json({
    tts: ttsStatus,
    llm: {
      available: llmAvailable,
      model: config.ollama.model,
      url: config.ollama.url,
    },
  });
});

module.exports = router;
