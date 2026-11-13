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

  async resolveChapterWithGemini(segments, knownCharacters = []) {
    const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY || '';
    const model = config.gemini?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (!apiKey || !Array.isArray(segments) || segments.length === 0) {
      return null;
    }

    const unresolvedIndices = [];
    segments.forEach((seg, idx) => {
      if (
        seg.type === 'dialogue' &&
        (seg.speaker_id === 'unresolved' ||
          seg.attribution_source === 'alternation' ||
          seg.attribution_source === 'context_alternation' ||
          !seg.speaker_name ||
          seg.speaker_name === 'Unknown Speaker')
      ) {
        unresolvedIndices.push(idx);
      }
    });

    if (unresolvedIndices.length === 0) {
      return segments;
    }

    const windowLines = segments.slice(0, 120).map((s, idx) => ({
      index: idx,
      type: s.type,
      current_speaker: s.speaker_name || 'Unknown',
      text: String(s.text || '').slice(0, 400),
    }));

    const prompt = `Resolve the speaker for all unresolved dialogue segments in this chapter excerpt.
Known characters: ${knownCharacters.length > 0 ? knownCharacters.join(', ') : 'Infer from context'}.
Return ONLY a JSON array of objects: [{"index": number, "speaker_name": "Canonical Name", "confidence": 0.92}].
Excerpt:
${JSON.stringify(windowLines)}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini attribution HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '[]';
    const resolutions = JSON.parse(rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    if (!Array.isArray(resolutions)) {
      return null;
    }

    const byIndex = new Map(resolutions.map((r) => [Number(r.index), r]));
    return segments.map((seg, idx) => {
      if (!byIndex.has(idx)) return seg;
      const match = byIndex.get(idx);
      const name = String(match.speaker_name || '').trim();
      if (!name) return seg;
      return {
        ...seg,
        speaker_name: name,
        speaker_id: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        voice_id: null,
        assigned_voice_id: null,
        attribution_confidence: typeof match.confidence === 'number' ? match.confidence : 0.9,
        attribution_source: 'gemini_ai',
      };
    });
  }

  async resolveUnattributed(segments, knownCharacters) {
    if (config.gemini?.apiKey || process.env.GEMINI_API_KEY) {
      try {
        const geminiResolved = await this.resolveChapterWithGemini(segments, knownCharacters);
        if (geminiResolved) {
          return geminiResolved;
        }
      } catch (_geminiErr) {
        // Fall through to local Ollama / heuristic alternation
      }
    }

    const isOllamaUp = await this.checkAvailability();
    const updated = [...segments];

    let lastKnownSpeaker = '';
    let secondLastSpeaker = '';

    for (let i = 0; i < updated.length; i++) {
      const seg = updated[i];
      if (seg.type !== 'dialogue') continue;

      const isUnresolvedCandidate =
        seg.speaker_id === 'unresolved' ||
        seg.attribution_source === 'alternation' ||
        seg.attribution_source === 'context_alternation' ||
        !seg.speaker_name ||
        seg.speaker_name === 'Unknown Speaker';

      if (!isUnresolvedCandidate) {
        secondLastSpeaker = lastKnownSpeaker;
        lastKnownSpeaker = seg.speaker_name;
        continue;
      }

      let resolvedName = '';
      let resolvedViaOllama = false;
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
              resolvedViaOllama = true;
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
          resolvedName = seg.speaker_name || 'Speaker';
        }
      }

      updated[i] = {
        ...seg,
        speaker_name: resolvedName,
        speaker_id: resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        voice_id: null,
        assigned_voice_id: null,
        attribution_confidence: resolvedViaOllama ? 0.75 : 0.5,
        attribution_source: resolvedViaOllama ? 'llm_fallback' : 'alternation',
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
