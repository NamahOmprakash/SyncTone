const axios = require('axios');
const { config } = require('../config');

class AttributionEngine {
  constructor() {
    this.ollamaUrl = config.ollama.url;
    this.model = config.ollama.model;
  }

  async checkAvailability() {
    try {
      const res = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 1500 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async resolveUnattributed(segments, knownCharacters) {
    const isOllamaUp = await this.checkAvailability();
    const updated = [...segments];

    let lastKnownSpeaker = '';
    let secondLastSpeaker = '';

    for (let i = 0; i < updated.length; i++) {
      const seg = updated[i];
      if (seg.type !== 'dialogue') continue;

      if (seg.speaker_id !== 'unresolved' && seg.speaker_name && seg.speaker_name !== 'Unknown Speaker') {
        secondLastSpeaker = lastKnownSpeaker;
        lastKnownSpeaker = seg.speaker_name;
        continue;
      }

      let resolvedName = '';
      if (isOllamaUp && knownCharacters.length > 0) {
        try {
          const contextBefore = updated
            .slice(Math.max(0, i - 3), i)
            .map((s) => `${s.speaker_name}: "${s.text}"`)
            .join('\n');

          const prompt = `Based on this literary dialogue context:\n${contextBefore}\nWho spoke this quote: "${seg.text}"?\nChoose ONLY from: ${knownCharacters.join(', ')}. Reply with just the name.`;

          const res = await axios.post(
            `${this.ollamaUrl}/api/generate`,
            {
              model: this.model,
              prompt,
              stream: false,
            },
            { timeout: 3000 }
          );

          const answer = (res.data.response || '').trim();
          for (const c of knownCharacters) {
            if (answer.toLowerCase().includes(c.toLowerCase())) {
              resolvedName = c;
              break;
            }
          }
        } catch {
          // Fall back to alternation heuristic
        }
      }

      if (!resolvedName) {
        if (secondLastSpeaker && lastKnownSpeaker && secondLastSpeaker !== lastKnownSpeaker) {
          resolvedName = secondLastSpeaker;
        } else if (lastKnownSpeaker) {
          resolvedName = lastKnownSpeaker;
        } else if (knownCharacters.length > 0) {
          resolvedName = knownCharacters[0];
        } else {
          resolvedName = 'Speaker';
        }
      }

      updated[i] = {
        ...seg,
        speaker_name: resolvedName,
        speaker_id: resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        attribution_confidence: isOllamaUp ? 0.75 : 0.5,
        attribution_source: isOllamaUp ? 'llm_fallback' : 'regex_rule',
      };

      secondLastSpeaker = lastKnownSpeaker;
      lastKnownSpeaker = resolvedName;
    }

    return updated;
  }
}

const attributionEngine = new AttributionEngine();

module.exports = {
  attributionEngine,
};
