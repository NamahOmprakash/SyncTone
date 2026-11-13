const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const crypto = require('crypto');
const os = require('os');
const { promisify } = require('util');
const WebSocket = require('ws');
const { config } = require('../config');
const {
  VOICE_CATALOG,
  KEYWORD_MAP,
  SORTED_KEYWORDS,
  matchesKeyword,
  LEGACY_VOICE_ALIASES,
} = require('./voiceProfiler');
const {
  mapToParadeeVoice,
  resolveMixedVoiceForCharacter,
  stableHash,
} = require('./mixedVoiceRouter');
const { ttsWorkerPool } = require('./ttsWorkerPool');

const execFileAsync = promisify(child_process.execFile);

const MAC_VOICE_CANDIDATES = {
  'en-GB-RyanNeural': ['Daniel', 'Reed (English (UK))', 'Fred'],
  'en-GB-ArthurNeural': ['Grandpa (English (UK))', 'Rocko (English (UK))', 'Fred', 'Daniel'],
  'en-GB-SoniaNeural': ['Kate (Enhanced)', 'Shelley (English (UK))', 'Karen', 'Samantha'],
  'en-GB-LibbyNeural': ['Serena (Premium)', 'Flo (English (UK))', 'Samantha', 'Moira'],
  'en-GB-ThomasNeural': ['Eddy (English (UK))', 'Reed (English (UK))', 'Rishi', 'Daniel'],
  'en-GB-AlfieNeural': ['Reed (English (UK))', 'Eddy (English (UK))', 'Rishi', 'Daniel'],
  'en-GB-NoahNeural': ['Rocko (English (UK))', 'Fred', 'Eddy (English (UK))', 'Daniel'],
  'en-GB-OliverNeural': ['Flo (English (UK))', 'Reed (English (UK))', 'Daniel'],
  'en-US-RogerNeural': ['Rishi', 'Rocko (English (US))', 'Grandpa (English (UK))', 'Daniel'],
  'en-IE-ConnorNeural': ['Reed (English (UK))', 'Rishi', 'Eddy (English (UK))', 'Daniel'],
  'en-AU-WilliamMultilingualNeural': ['Fred', 'Eddy (English (UK))', 'Rocko (English (UK))', 'Daniel'],
  'en-NZ-MitchellNeural': ['Rocko (English (UK))', 'Rishi', 'Fred', 'Daniel'],
  'en-US-SteffanNeural': ['Grandpa (English (UK))', 'Rocko (English (UK))', 'Fred'],
  'en-GB-MaisieNeural': ['Sandy (English (UK))', 'Flo (English (UK))', 'Tessa', 'Samantha'],
  'en-IE-EmilyNeural': ['Moira', 'Shelley (English (UK))', 'Karen', 'Samantha'],
  'en-CA-LiamNeural': ['Reed (English (US))', 'Reed (English (UK))', 'Rishi'],
  'en-US-ChristopherNeural': ['Eddy (English (US))', 'Reed (English (US))', 'Daniel'],
  'en-US-AndrewNeural': ['Rocko (English (US))', 'Rishi', 'Daniel'],
  'en-US-EricNeural': ['Fred', 'Reed (English (US))', 'Daniel'],
  'en-US-GuyNeural': ['Grandpa (English (US))', 'Eddy (English (US))', 'Daniel'],
  'en-US-BrianNeural': ['Rishi', 'Eddy (English (US))', 'Daniel'],
  'en-AU-NatashaNeural': ['Karen', 'Tessa', 'Samantha'],
  'en-NZ-MollyNeural': ['Tessa', 'Karen', 'Moira'],
  'en-CA-ClaraNeural': ['Tara', 'Samantha', 'Karen'],
  'en-US-AriaNeural': ['Samantha', 'Flo (English (US))', 'Karen'],
  'en-US-AvaNeural': ['Flo (English (US))', 'Samantha', 'Tessa'],
  'en-US-EmmaNeural': ['Shelley (English (US))', 'Serena (Premium)', 'Samantha'],
  'en-US-JennyNeural': ['Sandy (English (US))', 'Karen', 'Samantha'],
  'en-US-MichelleNeural': ['Grandma (English (UK))', 'Shelley (English (UK))', 'Moira'],
  bm_george: ['Grandpa (English (UK))', 'Reed (English (UK))', 'Fred', 'Daniel'],
  bm_daniel: ['Eddy (English (UK))', 'Reed (English (UK))', 'Rishi', 'Daniel'],
  bm_lewis: ['Rocko (English (UK))', 'Grandpa (English (UK))', 'Fred', 'Daniel'],
  bf_emma: ['Serena (Premium)', 'Flo (English (UK))', 'Samantha', 'Karen'],
  am_adam: ['Fred', 'Reed (English (US))', 'Rishi', 'Daniel'],
  am_michael: ['Rocko (English (US))', 'Rocko (English (UK))', 'Eddy (English (US))', 'Daniel'],
  am_george: ['Grandpa (English (US))', 'Grandpa (English (UK))', 'Fred', 'Daniel'],
  am_onyx: ['Rishi', 'Rocko (English (UK))', 'Fred', 'Daniel'],
  af_heart: ['Samantha', 'Serena (Premium)', 'Flo (English (UK))', 'Karen'],
  af_bella: ['Flo (English (US))', 'Flo (English (UK))', 'Tessa', 'Samantha'],
  af_nicole: ['Sandy (English (US))', 'Sandy (English (UK))', 'Karen', 'Tessa'],
  af_sarah: ['Karen', 'Kate (Enhanced)', 'Shelley (English (UK))', 'Samantha'],
  af_sky: ['Shelley (English (US))', 'Shelley (English (UK))', 'Tessa', 'Samantha'],
  // Paradee-8M voice IDs mapped for macOS fallback if needed
  bm_fable: ['Daniel', 'Reed (English (UK))', 'Fred'],
  bf_isabella: ['Serena (Premium)', 'Shelley (English (UK))', 'Samantha', 'Karen'],
  am_puck: ['Reed (English (UK))', 'Eddy (English (UK))', 'Rishi', 'Daniel'],
  // Machine Extra Voice Pool (5th+ cast slots & explicit selection)
  mac_daniel: ['Daniel', 'Reed (English (UK))'],
  mac_serena: ['Serena (Premium)', 'Flo (English (UK))', 'Samantha'],
  mac_reed: ['Reed (English (UK))', 'Reed (English (US))', 'Rishi'],
  mac_rocko: ['Rocko (English (UK))', 'Rocko (English (US))', 'Fred'],
  mac_shelley: ['Shelley (English (UK))', 'Shelley (English (US))', 'Karen'],
  mac_grandpa: ['Grandpa (English (UK))', 'Fred', 'Rocko (English (UK))'],
  mac_flo: ['Flo (English (UK))', 'Flo (English (US))', 'Samantha'],
  mac_moira: ['Moira', 'Tessa', 'Karen'],
  mac_rishi: ['Rishi', 'Reed (English (UK))', 'Fred'],
  mac_karen: ['Karen', 'Samantha', 'Tessa'],
  mac_tessa: ['Tessa', 'Karen', 'Moira'],
  mac_samantha: ['Samantha', 'Karen', 'Flo (English (UK))'],
  mac_fred: ['Fred', 'Rocko (English (UK))', 'Daniel'],
  mac_eddy: ['Eddy (English (UK))', 'Reed (English (UK))', 'Daniel'],
  mac_sandy: ['Sandy (English (UK))', 'Flo (English (UK))', 'Tessa'],
};

const MAC_CHARACTER_FALLBACK_POOL = [
  'Reed (English (UK))',
  'Flo (English (UK))',
  'Rocko (English (UK))',
  'Shelley (English (UK))',
  'Grandpa (English (UK))',
  'Eddy (English (UK))',
  'Sandy (English (UK))',
  'Moira',
  'Karen',
  'Samantha',
  'Rishi',
  'Tessa',
  'Fred',
];

function discoverInstalledMacVoices() {
  const exactVoices = new Set();
  const lookupMap = new Map();
  if (process.platform === 'darwin' && fs.existsSync('/usr/bin/say')) {
    try {
      const output = child_process.execFileSync('/usr/bin/say', ['-v', '?'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      for (const line of String(output || '').split(/\r?\n/)) {
        const match = line.match(/^(.+?)\s+([a-z]{2,3}(?:_[A-Za-z0-9]+)+)\s+#/);
        if (!match) continue;
        const fullName = match[1].trim();
        const locale = match[2].trim();
        exactVoices.add(fullName);
        lookupMap.set(fullName.toLowerCase(), fullName);
        const bareMatch = fullName.match(/^(.+?)\s+\(English\s+\([^)]+\)\)$/);
        if (bareMatch) {
          const bareLower = bareMatch[1].trim().toLowerCase();
          if (!lookupMap.has(bareLower) || locale === 'en_GB') {
            lookupMap.set(bareLower, fullName);
          }
        }
      }
    } catch (err) {
      console.warn(`[TTSEngine] Failed to probe installed macOS voices: ${err.message}`);
    }
  }
  return { exactVoices, lookupMap };
}

const { exactVoices: INSTALLED_MAC_VOICES, lookupMap: MAC_VOICE_LOOKUP } = discoverInstalledMacVoices();

function pickFirstInstalledMacVoice(candidates = []) {
  if (INSTALLED_MAC_VOICES.size === 0) {
    return candidates[0] || 'Daniel';
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const hit = MAC_VOICE_LOOKUP.get(String(candidate).trim().toLowerCase());
    if (hit) return hit;
  }
  return (
    MAC_VOICE_LOOKUP.get('daniel') ||
    MAC_VOICE_LOOKUP.get('samantha') ||
    Array.from(INSTALLED_MAC_VOICES)[0] ||
    'Daniel'
  );
}

const MAC_VOICE_MAP = Object.fromEntries(
  Object.entries(MAC_VOICE_CANDIDATES).map(([voiceKey, candidates]) => [
    voiceKey,
    pickFirstInstalledMacVoice(candidates),
  ])
);

const INSTALLED_NON_NARRATOR_MAC_POOL = (() => {
  const pool = MAC_CHARACTER_FALLBACK_POOL
    .map((v) => (INSTALLED_MAC_VOICES.size > 0 ? MAC_VOICE_LOOKUP.get(v.toLowerCase()) : v))
    .filter(Boolean);
  return pool.length > 0 ? Array.from(new Set(pool)) : ['Reed (English (UK))', 'Samantha', 'Karen', 'Moira'];
})();

function resolveMacVoice(voiceId, mixContext = {}) {
  const charId = String(
    mixContext.characterId || mixContext.character_id || mixContext.speakerName || mixContext.speaker_name || ''
  ).trim();
  const isNarr = Boolean(
    mixContext.isNarrator ||
    mixContext.is_narrator ||
    charId.toLowerCase() === 'narrator'
  );
  const rawVoice = String(voiceId || '').trim();
  const aliasedVoice = LEGACY_VOICE_ALIASES[rawVoice] || rawVoice;

  let resolved = null;
  if (rawVoice && INSTALLED_MAC_VOICES.size > 0 && MAC_VOICE_LOOKUP.has(rawVoice.toLowerCase())) {
    resolved = MAC_VOICE_LOOKUP.get(rawVoice.toLowerCase());
  } else if (MAC_VOICE_CANDIDATES[rawVoice]) {
    resolved = pickFirstInstalledMacVoice(MAC_VOICE_CANDIDATES[rawVoice]);
  } else if (MAC_VOICE_CANDIDATES[aliasedVoice]) {
    resolved = pickFirstInstalledMacVoice(MAC_VOICE_CANDIDATES[aliasedVoice]);
  }

  const narratorMacVoice = MAC_VOICE_MAP['en-GB-RyanNeural'] || pickFirstInstalledMacVoice(['Daniel']);
  if (!isNarr && charId) {
    const collidedWithNarrator =
      !resolved ||
      (resolved === narratorMacVoice && rawVoice !== 'mac_daniel' && !mixContext.explicitVoice);
    if (collidedWithNarrator) {
      return INSTALLED_NON_NARRATOR_MAC_POOL[stableHash(charId) % INSTALLED_NON_NARRATOR_MAC_POOL.length];
    }
  }

  return resolved || narratorMacVoice;
}

const KOKORO_TO_EDGE_MAP = {
  af_heart: 'en-GB-SoniaNeural',
  af_bella: 'en-GB-LibbyNeural',
  af_nicole: 'en-GB-LibbyNeural',
  af_sky: 'en-GB-SoniaNeural',
  af_sarah: 'en-GB-SoniaNeural',
  am_adam: 'en-GB-ThomasNeural',
  am_michael: 'en-US-RogerNeural',
  am_george: 'en-NZ-MitchellNeural',
  am_onyx: 'en-US-RogerNeural',
  bm_george: 'en-GB-RyanNeural',
  bm_lewis: 'en-NZ-MitchellNeural',
  bf_emma: 'en-GB-LibbyNeural',
  bm_daniel: 'en-IE-ConnorNeural',
  bm_fable: 'en-GB-RyanNeural',
  bf_isabella: 'en-GB-LibbyNeural',
  am_puck: 'en-GB-ThomasNeural',
  mac_daniel: 'en-GB-RyanNeural',
  mac_serena: 'en-GB-LibbyNeural',
  mac_reed: 'en-IE-ConnorNeural',
  mac_rocko: 'en-US-RogerNeural',
  mac_shelley: 'en-GB-SoniaNeural',
  mac_grandpa: 'en-NZ-MitchellNeural',
  mac_flo: 'en-GB-MaisieNeural',
  mac_moira: 'en-IE-EmilyNeural',
};

const EDGE_TO_KOKORO_MAP = {
  'en-GB-RyanNeural': 'bm_george',
  'en-GB-ArthurNeural': 'bm_lewis',
  'en-GB-SoniaNeural': 'af_sarah',
  'en-GB-LibbyNeural': 'bf_emma',
  'en-GB-ThomasNeural': 'am_adam',
  'en-GB-AlfieNeural': 'bm_daniel',
  'en-GB-NoahNeural': 'am_michael',
  'en-GB-OliverNeural': 'bm_george',
  'en-US-RogerNeural': 'am_adam',
  'en-IE-ConnorNeural': 'bm_daniel',
  'en-AU-WilliamMultilingualNeural': 'bm_george',
  'en-NZ-MitchellNeural': 'bm_lewis',
  'en-GB-MaisieNeural': 'bf_emma',
  'en-IE-EmilyNeural': 'af_sarah',
};

// Full catalog of native English Kokoro v1.0 voices from voices-v1.0.bin
const VALID_KOKORO_VOICES = new Set([
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
]);

function resolveKokoroVoice(voiceId, mixContext = {}) {
  const charId = String(mixContext.characterId || mixContext.character_id || '').trim();
  const isNarr = Boolean(mixContext.isNarrator || mixContext.is_narrator || charId.toLowerCase() === 'narrator');

  if (!mixContext.skipCatalogLookup) {
    if (isNarr && VOICE_CATALOG.narrator?.fallback) {
      const fb = VOICE_CATALOG.narrator.fallback;
      return LEGACY_VOICE_ALIASES[fb] || fb;
    }
    if (charId) {
      const charKey = charId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (VOICE_CATALOG[charKey]?.fallback) {
        const fb = VOICE_CATALOG[charKey].fallback;
        return LEGACY_VOICE_ALIASES[fb] || fb;
      }
    }
  }

  if (!voiceId) return 'bm_george';
  if (voiceId === 'am_george') return 'bm_lewis'; // Fix missing am_george -> bm_lewis
  const aliased = LEGACY_VOICE_ALIASES[voiceId] || voiceId;
  if (VALID_KOKORO_VOICES.has(aliased)) return aliased;
  if (EDGE_TO_KOKORO_MAP[aliased]) return EDGE_TO_KOKORO_MAP[aliased];
  if (EDGE_TO_KOKORO_MAP[voiceId]) return EDGE_TO_KOKORO_MAP[voiceId];
  for (const [key, entry] of Object.entries(VOICE_CATALOG)) {
    if ((entry.primary === aliased || key === aliased || entry.primary === voiceId || key === voiceId) && entry.fallback) {
      const fb = entry.fallback === 'am_george' ? 'bm_lewis' : entry.fallback;
      if (VALID_KOKORO_VOICES.has(fb)) return fb;
    }
  }
  return 'bm_george';
}

function convertPitchToHz(pitchStr) {
  if (!pitchStr) return '+0Hz';
  if (/^[+-]?\d+Hz$/i.test(pitchStr)) {
    const num = parseInt(pitchStr, 10);
    return `${num >= 0 ? '+' : ''}${num}Hz`;
  }
  const match = String(pitchStr).match(/^([+-]?\d+)(?:%|st)?$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    return `${val >= 0 ? '+' : ''}${val}Hz`;
  }
  return '+0Hz';
}

function trimExcessiveLeadingSilence(pcmBuffer, maxLeadingBytes = 800) {
  if (!pcmBuffer || pcmBuffer.length <= maxLeadingBytes) return pcmBuffer;
  let firstNonZero = -1;
  for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
    const sample = pcmBuffer.readInt16LE(i);
    if (Math.abs(sample) > 50) {
      firstNonZero = i;
      break;
    }
  }
  if (firstNonZero > maxLeadingBytes) {
    const trimAmount = firstNonZero - maxLeadingBytes;
    const alignedTrim = trimAmount - (trimAmount % 2);
    return pcmBuffer.subarray(alignedTrim);
  }
  return pcmBuffer;
}

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.96';
const CHROMIUM_MAJOR_VERSION = '143';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

function getSecMsGecToken() {
  try {
    const ticks = Math.floor(Date.now() / 1000) + 11644473600;
    const rounded = ticks - (ticks % 300);
    const windowsTicks = rounded * 10000000;
    const data = `${windowsTicks}${TRUSTED_CLIENT_TOKEN}`;
    return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
  } catch (_) {
    return null;
  }
}

function getPythonBin() {
  const pythonVenv = path.resolve(config.paths.modelsDir, '../.venv/bin/python');
  if (fs.existsSync(pythonVenv)) return pythonVenv;
  return process.env.PYTHON_BIN || 'python3';
}

class TTSEngine {
  constructor() {
    this.sampleRate = config.audio.sampleRate;
    this.bytesPerSec = 6000; // 48kbps CBR = 6000 bytes/sec
    this.modelPath = path.resolve(config.paths.modelsDir, 'kokoro-v0_19.onnx');
    this.voicesPath = path.resolve(config.paths.modelsDir, 'voices.bin');
    this.paradeeModelPath = config.paradee?.onnxFile || path.resolve(config.paths.modelsDir, 'paradee/paradee_int8.onnx');
    this.paradeeConfigPath = config.paradee?.configFile || path.resolve(config.paths.modelsDir, 'paradee/config.json');
    this.paradeeWorkerScript = path.resolve(__dirname, '../scripts/paradeeWorker.py');
    this.kokoroWorkerScript = path.resolve(__dirname, '../scripts/kokoroWorker.py');
  }

  async checkModelAvailable(options = {}) {
    const modelExists = fs.existsSync(this.modelPath);
    const voicesExists = fs.existsSync(this.voicesPath);
    const paradeeExists = fs.existsSync(this.paradeeModelPath) && fs.existsSync(this.paradeeConfigPath);
    let cloudReady = true;
    if (options.probe) {
      try {
        const token = getSecMsGecToken();
        cloudReady = Boolean(token);
      } catch (_) {
        cloudReady = false;
      }
    }
    const machineReady =
      process.platform === 'darwin' ||
      Boolean(
        child_process.spawnSync('which', ['espeak-ng']).status === 0 ||
        child_process.spawnSync('which', ['espeak']).status === 0
      );

    return {
      primary_engine: 'msedge-tts (Cloud Neural)',
      fallback_engine: 'kokoro-tts (Local ONNX)',
      paradee_engine: 'paradee-tts (Paradee-8M-v1.2 Micro ONNX)',
      mixed_engine: 'paradee-mixed (Paradee-8M Primary + Machine-TTS Extra Cast)',
      machine_engine: 'machine-tts (Local OS Speech)',
      engines: ['msedge-tts', 'kokoro-tts', 'paradee-tts', 'paradee-mixed', 'machine-tts'],
      cloud_ready: cloudReady,
      model_exists: modelExists,
      voices_exists: voicesExists,
      model_path: this.modelPath,
      voices_path: this.voicesPath,
      paradee_ready: paradeeExists,
      paradee_model_path: this.paradeeModelPath,
      paradee_voices: ['bm_fable', 'bf_isabella', 'am_puck', 'af_heart'],
      machine_ready: machineReady,
      initialized: true,
    };
  }

  escapeSsml(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // --- ENGINE 1: Microsoft Edge Cloud Neural TTS (Node WS + Python edge-tts CLI fallback) ---
  async synthesizeWithEdgeWs(text, voiceId, options = {}) {
    const token = getSecMsGecToken();
    if (!token) {
      throw new Error('Sec-MS-GEC DRM token generation failed');
    }

    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const url =
      `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?` +
      `Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${token}` +
      `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;

    const headers = {
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    };

    const prosody = options.prosody || { pitch: '+0%', rate: '+0%' };
    const safeText = this.escapeSsml(text);
    const rate = prosody.rate || '+0%';
    const pitch = prosody.pitch || '+0%';

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers });
      const chunks = [];
      let finished = false;

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          try {
            ws.close();
          } catch (_) {}
          reject(new Error('Edge TTS WebSocket timeout (12s)'));
        }
      }, 12000);

      ws.on('open', () => {
        const configMsg =
          'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'false',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });
        ws.send(configMsg);

        const timestamp = new Date().toUTCString();
        const requestId = crypto.randomUUID().replace(/-/g, '');
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voiceId}'><prosody pitch='${pitch}' rate='${rate}'>${safeText}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const separator = Buffer.from('Path:audio\r\n');
          const idx = data.indexOf(separator);
          if (idx !== -1) {
            const audioData = data.subarray(idx + separator.length);
            if (audioData.length > 0) chunks.push(audioData);
          }
        } else {
          const textMsg = data.toString();
          if (textMsg.includes('Path:turn.end')) {
            if (!finished) {
              finished = true;
              clearTimeout(timeout);
              try {
                ws.close();
              } catch (_) {}
              const buffer = Buffer.concat(chunks);
              if (buffer.length === 0) {
                return reject(new Error('Edge TTS returned empty audio buffer'));
              }
              const durationMs = Math.round((buffer.length / this.bytesPerSec) * 1000);
              resolve({
                audio_buffer: buffer,
                duration_ms: durationMs,
                format: 'mp3',
                engine: 'msedge-tts',
              });
            }
          }
        }
      });

      ws.on('error', (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      ws.on('close', (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          if (chunks.length > 0) {
            const buffer = Buffer.concat(chunks);
            const durationMs = Math.round((buffer.length / this.bytesPerSec) * 1000);
            return resolve({
              audio_buffer: buffer,
              duration_ms: durationMs,
              format: 'mp3',
              engine: 'msedge-tts',
            });
          }
          reject(new Error(`Edge TTS WebSocket closed unexpectedly with code ${code}`));
        }
      });
    });
  }

  // Non-blocking async Edge CLI execution
  async synthesizeWithEdgeCli(text, voiceId, options = {}) {
    const prosody = options.prosody || { pitch: '+0Hz', rate: '+0%' };
    const edgePitch = convertPitchToHz(prosody.pitch);
    const tmpFile = path.join(os.tmpdir(), `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);

    const edgeBinCandidates = [
      '/Users/namahomprakash/Library/Python/3.14/bin/edge-tts',
      path.resolve(config.paths.modelsDir, '../.venv/bin/edge-tts'),
      'edge-tts',
    ];

    let edgeBin = edgeBinCandidates.find((bin) => fs.existsSync(bin));

    try {
      if (edgeBin) {
        await execFileAsync(
          edgeBin,
          [
            '--text', text,
            '--voice', voiceId,
            '--rate', prosody.rate || '+0%',
            '--pitch', edgePitch,
            '--write-media', tmpFile,
            '--no-progress',
          ],
          { timeout: 15000 }
        );
      } else {
        await execFileAsync(
          'python3',
          [
            '-m', 'edge_tts',
            '--text', text,
            '--voice', voiceId,
            '--rate', prosody.rate || '+0%',
            '--pitch', edgePitch,
            '--write-media', tmpFile,
            '--no-progress',
          ],
          { timeout: 15000 }
        );
      }

      if (fs.existsSync(tmpFile)) {
        const buffer = fs.readFileSync(tmpFile);
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        if (buffer.length === 0) {
          throw new Error('Edge TTS CLI output is empty');
        }
        const durationMs = Math.round((buffer.length / this.bytesPerSec) * 1000);
        return {
          audio_buffer: buffer,
          duration_ms: durationMs,
          format: 'mp3',
          engine: 'msedge-tts',
        };
      }
      throw new Error('Edge TTS CLI output file not generated');
    } finally {
      if (fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch (_) {}
      }
    }
  }

  async synthesizeWithEdgeNode(text, voiceId, options = {}) {
    return new Promise(async (resolve, reject) => {
      let settled = false;
      let tts = null;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            if (tts && typeof tts.close === 'function') {
              tts.close();
            }
          } catch (_) {}
          reject(new Error('Edge-TTS timed out after 8000ms'));
        }
      }, 8000);

      const finishResolve = (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(val);
        }
      };

      const finishReject = (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          try {
            if (tts && typeof tts.close === 'function') {
              tts.close();
            }
          } catch (_) {}
          reject(err);
        }
      };

      try {
        const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
        tts = new MsEdgeTTS();
        const pitchStr = options.prosody?.pitch || '+0Hz';
        const rateStr = options.prosody?.rate || '+0%';
        await tts.setMetadata(voiceId || 'en-GB-RyanNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        if (settled) return;
        const streamResult = tts.toStream(text, {
          pitch: pitchStr,
          rate: rateStr,
        });
        const audioStream = streamResult?.audioStream || streamResult;
        if (!audioStream || typeof audioStream.on !== 'function') {
          return finishReject(new Error('MsEdgeTTS toStream did not return a readable audioStream'));
        }
        const chunks = [];
        audioStream.on('data', (chunk) => chunks.push(chunk));
        audioStream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) {
            return finishReject(new Error('MsEdgeTTS returned empty audio stream'));
          }
          const durationMs = Math.round((buffer.length / this.bytesPerSec) * 1000);
          finishResolve({
            audio_buffer: buffer,
            duration_ms: durationMs,
            format: 'mp3',
            engine: 'msedge-tts',
          });
        });
        audioStream.on('error', (err) => finishReject(err));
      } catch (err) {
        finishReject(err);
      }
    });
  }

  async synthesizeWithEdge(text, voiceId, options = {}) {
    try {
      return await this.synthesizeWithEdgeWs(text, voiceId, options);
    } catch (wsErr) {
      try {
        return await this.synthesizeWithEdgeNode(text, voiceId, options);
      } catch (nodeErr) {
        console.warn(`[TTSEngine] Edge WebSocket/Node failed (${wsErr.message} / ${nodeErr.message}). Trying Edge CLI fallback.`);
        return await this.synthesizeWithEdgeCli(text, voiceId, options);
      }
    }
  }

  // --- ENGINE 2: Kokoro-TTS (Local ONNX / Acoustic Neural Fallback) ---
  async synthesizeWithKokoro(text, voiceId, speed = 1.0, options = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'pcm',
        engine: 'kokoro-tts',
      };
    }

    const kokoroVoice = resolveKokoroVoice(voiceId);
    const lang = kokoroVoice.startsWith('b') ? 'en-gb' : 'en-us';

    if (ttsWorkerPool.isKokoroAvailable()) {
      try {
        const poolRes = await ttsWorkerPool.synthesizeKokoro({
          text: trimmed,
          voice: kokoroVoice,
          speed,
          lang,
        });

        if (poolRes && poolRes.audio_buffer && poolRes.audio_buffer.length > 0) {
          const pcmBuffer = trimExcessiveLeadingSilence(poolRes.audio_buffer);
          const durationMs = Math.max(100, Math.round((pcmBuffer.length / 2 / this.sampleRate) * 1000));
          return {
            audio_buffer: pcmBuffer,
            duration_ms: durationMs,
            format: 'pcm',
            engine: 'kokoro-tts',
            resolved_voice_id: kokoroVoice,
          };
        }
      } catch (err) {
        if (options.failHonestly) {
          throw err;
        }
        console.warn(`[TTSEngine] Kokoro worker pool failed: ${err.message}`);
      }
    }

    if (options.failHonestly) {
      throw new Error(`Kokoro-TTS model weights not available or synthesis failed for voice '${voiceId}'`);
    }

    // In test mode or when local speech is disabled: clean silent PCM buffer
    if (process.env.NODE_ENV === 'test' || process.env.SYNCTONE_DISABLE_MACOS_SAY) {
      const baseDurationSec = Math.max(0.6, trimmed.length / 15 / (speed || 1.0));
      const sampleCount = Math.floor(this.sampleRate * baseDurationSec);
      return {
        audio_buffer: Buffer.alloc(sampleCount * 2),
        duration_ms: Math.round(baseDurationSec * 1000),
        format: 'pcm',
        engine: 'kokoro-tts',
        resolved_voice_id: kokoroVoice,
      };
    }

    // When NOT in failHonestly mode, fall back to Machine TTS returning true engine name
    const machineRes = await this.synthesizeWithMachine(trimmed, voiceId, speed);
    return {
      ...machineRes,
      engine: 'machine-tts',
      resolved_voice_id: kokoroVoice,
    };
  }

  // --- ENGINE 3: Machine / Local OS Speech Synthesis (Async non-blocking) ---
  async synthesizeWithMachine(text, voiceId, speed = 1.0, mixContext = {}) {
    const trimmed = (text || '').trim();
    const macVoice = resolveMacVoice(voiceId, mixContext);
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'pcm',
        engine: 'machine-tts',
        resolved_voice_id: macVoice,
      };
    }

    const charId = String(
      mixContext.characterId || mixContext.character_id || mixContext.speakerName || mixContext.speaker_name || ''
    ).trim();
    const isNarr = Boolean(
      mixContext.isNarrator ||
      mixContext.is_narrator ||
      charId.toLowerCase() === 'narrator'
    );
    let baseWpm = 185;
    if (charId && !isNarr && !mixContext.skipCharacterRateJitter) {
      const wpmSteps = [164, 172, 180, 192, 200, 210];
      baseWpm = wpmSteps[stableHash(`${charId}:mac_rate`) % wpmSteps.length];
    }
    const targetWpm = Math.max(140, Math.min(240, Math.round(baseWpm * (speed || 1.0))));

    // In test mode, return clean silent PCM buffer
    if (process.env.NODE_ENV === 'test' || process.env.SYNCTONE_DISABLE_MACOS_SAY) {
      const baseDurationSec = Math.max(0.6, trimmed.length / 15 / (speed || 1.0));
      const sampleCount = Math.floor(this.sampleRate * baseDurationSec);
      return {
        audio_buffer: Buffer.alloc(sampleCount * 2),
        duration_ms: Math.round(baseDurationSec * 1000),
        format: 'pcm',
        engine: 'machine-tts',
        resolved_voice_id: macVoice,
      };
    }

    // On macOS, execute /usr/bin/say asynchronously using verified installed voices
    if (fs.existsSync('/usr/bin/say')) {
      const tmpWavPath = path.join(
        os.tmpdir(),
        `say_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.wav`
      );

      try {
        await execFileAsync(
          '/usr/bin/say',
          [
            '-v',
            macVoice,
            '-r',
            String(targetWpm),
            '--data-format=LEI16@24000',
            '-o',
            tmpWavPath,
            trimmed,
          ],
          { timeout: 15000 }
        );

        if (fs.existsSync(tmpWavPath)) {
          const wavBuf = fs.readFileSync(tmpWavPath);
          try { fs.unlinkSync(tmpWavPath); } catch (_) {}

          let pcmBuffer;
          const dataIdx = wavBuf.indexOf(Buffer.from('data'));
          if (dataIdx !== -1 && dataIdx + 8 <= wavBuf.length) {
            const dataLen = wavBuf.readUInt32LE(dataIdx + 4);
            pcmBuffer =
              dataLen > 0 && dataIdx + 8 + dataLen <= wavBuf.length
                ? wavBuf.subarray(dataIdx + 8, dataIdx + 8 + dataLen)
                : wavBuf.subarray(dataIdx + 8);
          } else {
            pcmBuffer = wavBuf.subarray(44);
          }
          pcmBuffer = trimExcessiveLeadingSilence(pcmBuffer);

          const durationMs = Math.max(
            100,
            Math.round((pcmBuffer.length / 2 / this.sampleRate) * 1000)
          );

          return {
            audio_buffer: pcmBuffer,
            duration_ms: durationMs,
            format: 'pcm',
            engine: 'machine-tts',
            resolved_voice_id: macVoice,
          };
        }
      } catch (sayErr) {
        if (fs.existsSync(tmpWavPath)) {
          try {
            fs.unlinkSync(tmpWavPath);
          } catch (_) {}
        }
        console.warn(`[TTSEngine] Machine /usr/bin/say failed: ${sayErr.message}`);
      }
    }

    // Fallback: clean silent buffer
    const baseDurationSec = Math.max(0.6, trimmed.length / 15 / (speed || 1.0));
    const sampleCount = Math.floor(this.sampleRate * baseDurationSec);
    return {
      audio_buffer: Buffer.alloc(sampleCount * 2),
      duration_ms: Math.round(baseDurationSec * 1000),
      format: 'pcm',
      engine: 'machine-tts',
      resolved_voice_id: macVoice,
    };
  }

  // --- ENGINE 4: Paradee-8M-v1.2 (Local Micro 8.5MB Int8 ONNX via Worker Pool) ---
  async synthesizeWithParadee(text, voiceId, speed = 1.0, mixContext = {}) {
    const trimmed = (text || '').trim();
    const charId = String(
      mixContext.characterId || mixContext.character_id || mixContext.speakerName || mixContext.speaker_name || ''
    ).trim();
    const isNarr = Boolean(
      mixContext.isNarrator ||
      mixContext.is_narrator ||
      charId.toLowerCase() === 'narrator'
    );
    const paradeeVoice = mapToParadeeVoice(voiceId, {
      isNarrator: isNarr,
      gender: mixContext.gender || '',
      accent: mixContext.accent || '',
    });
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'pcm',
        engine: 'paradee-tts',
        resolved_voice_id: paradeeVoice,
      };
    }

    // Deterministic per-character speed variation (skip when caller already applied cast-slot jitter)
    let rateMultiplier = 1.0;
    if (charId && !isNarr && !mixContext.skipCharacterRateJitter) {
      const rateSteps = [0.91, 0.95, 1.04, 1.08, 0.88, 1.12];
      rateMultiplier = rateSteps[stableHash(charId) % rateSteps.length];
    }
    const effectiveSpeed = Number(((speed || 1.0) * rateMultiplier).toFixed(2));

    if (ttsWorkerPool.isParadeeAvailable() && !process.env.SYNCTONE_DISABLE_PARADEE_ONNX) {
      try {
        const poolRes = await ttsWorkerPool.synthesizeParadee({
          text: trimmed,
          voice: paradeeVoice,
          speed: effectiveSpeed,
        });

        if (poolRes && poolRes.audio_buffer && poolRes.audio_buffer.length > 0) {
          const pcmBuffer = trimExcessiveLeadingSilence(poolRes.audio_buffer);
          const durationMs = Math.max(
            100,
            Math.round((pcmBuffer.length / 2 / this.sampleRate) * 1000)
          );
          return {
            audio_buffer: pcmBuffer,
            duration_ms: durationMs,
            format: 'pcm',
            engine: 'paradee-tts',
            resolved_voice_id: paradeeVoice,
          };
        }
      } catch (err) {
        console.warn(`[TTSEngine] Paradee worker pool failed: ${err.message}`);
      }
    }

    // Fallback when Paradee ONNX is unavailable: fail honestly if requested, else delegate to Machine TTS
    if (mixContext.failHonestly) {
      throw new Error(`Paradee-TTS model weights not available or synthesis failed for voice '${voiceId}'`);
    }
    const fallbackRes = await this.synthesizeWithMachine(trimmed, paradeeVoice, effectiveSpeed, {
      ...mixContext,
      skipCharacterRateJitter: true,
    });
    return {
      ...fallbackRes,
      engine: 'paradee-tts',
      resolved_voice_id: paradeeVoice,
    };
  }

  // --- ENGINE 5: Mixed Paradee-8M (Primary 4 Cast) + Machine-TTS (5th+ Extra Cast) ---
  async synthesizeWithParadeeMixed(text, voiceId, speed = 1.0, mixContext = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'pcm',
        engine: 'paradee-mixed',
        sub_engine: 'paradee-tts',
      };
    }

    const resolved = resolveMixedVoiceForCharacter({
      characterId: mixContext.characterId || mixContext.character_id || '',
      speakerName: mixContext.speakerName || mixContext.speaker_name || '',
      voiceId,
      isNarrator: Boolean(mixContext.isNarrator || mixContext.is_narrator),
      castSlot: mixContext.castSlot ?? mixContext.cast_slot ?? null,
      castPlan: mixContext.castPlan || null,
      gender: mixContext.gender || '',
    });

    const effectiveSpeed = Number(((speed || 1.0) * (resolved.rateMultiplier || 1.0)).toFixed(2));
    const singleJitterContext = { ...mixContext, skipCharacterRateJitter: true };

    if (resolved.engine === 'machine-tts') {
      const macRes = await this.synthesizeWithMachine(trimmed, resolved.voiceId, effectiveSpeed, singleJitterContext);
      return {
        ...macRes,
        engine: 'paradee-mixed',
        sub_engine: 'machine-tts',
        resolved_voice_id: resolved.voiceId,
        mac_voice: macRes.resolved_voice_id,
      };
    }

    const paradeeRes = await this.synthesizeWithParadee(trimmed, resolved.voiceId, effectiveSpeed, singleJitterContext);
    return {
      ...paradeeRes,
      engine: 'paradee-mixed',
      sub_engine: 'paradee-tts',
      resolved_voice_id: resolved.voiceId,
    };
  }

  // --- Public Interface: 5-Engine Architecture (Selectable + Fallback Chain) ---
  async synthesizeSegment(text, voiceId, speed = 1.0, preferredEngine = 'auto', mixContext = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'mp3',
        engine: preferredEngine === 'auto' ? 'msedge-tts' : preferredEngine,
      };
    }

    if (!/[a-zA-Z0-9]/.test(trimmed)) {
      const sampleCount = Math.floor(this.sampleRate * 0.2);
      return {
        audio_buffer: Buffer.alloc(sampleCount * 2),
        duration_ms: 200,
        format: 'pcm',
        engine: preferredEngine === 'auto' ? 'msedge-tts' : preferredEngine,
      };
    }

    const engineChoice = (preferredEngine || 'auto').toLowerCase();
    const KNOWN_ENGINES = new Set(['msedge-tts', 'kokoro-tts', 'paradee-tts', 'paradee-mixed', 'machine-tts', 'auto']);
    if (!KNOWN_ENGINES.has(engineChoice)) {
      throw new Error(`Unsupported TTS engine '${preferredEngine}'`);
    }

    // Resolve character / speaker identity from mixContext
    const charId = String(mixContext.characterId || mixContext.character_id || '').trim();
    const speakerName = String(mixContext.speakerName || mixContext.speaker_name || '').trim();
    const identityKey = (charId || speakerName).trim();
    const isNarrator = Boolean(
      mixContext.isNarrator ||
      mixContext.is_narrator ||
      charId.toLowerCase() === 'narrator' ||
      speakerName.toLowerCase() === 'narrator'
    );

    const rawVoiceId = String(voiceId || '').trim();
    const deadVoiceFallbacks = {
      'en-GB-ArthurNeural': 'en-US-RogerNeural',
      'en-GB-NoahNeural': 'en-AU-WilliamMultilingualNeural',
    };
    const aliasedVoiceId = LEGACY_VOICE_ALIASES[rawVoiceId] || deadVoiceFallbacks[rawVoiceId] || rawVoiceId;
    const requestedEdgeVoice = KOKORO_TO_EDGE_MAP[rawVoiceId] || KOKORO_TO_EDGE_MAP[aliasedVoiceId] || aliasedVoiceId;
    const narratorDefaultEdge = VOICE_CATALOG.narrator?.primary || 'en-GB-RyanNeural';
    const hasExplicitVoiceOverride = Boolean(
      !isNarrator &&
      (mixContext.explicitVoice || (rawVoiceId && requestedEdgeVoice !== narratorDefaultEdge && rawVoiceId !== 'narrator'))
    );

    // 1. Match catalog entry by character/speaker first
    let charCatalogEntry = null;
    if (isNarrator) {
      charCatalogEntry = VOICE_CATALOG.narrator;
    } else if (charId) {
      const charKey = charId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (VOICE_CATALOG[charKey]) {
        charCatalogEntry = VOICE_CATALOG[charKey];
      }
    }

    if (!charCatalogEntry && !isNarrator && (charId || speakerName)) {
      const searchStr = `${charId} ${speakerName}`.toLowerCase().trim();
      for (const [kw, archetype] of SORTED_KEYWORDS) {
        if (matchesKeyword(searchStr, kw)) {
          if (VOICE_CATALOG[archetype]) {
            charCatalogEntry = VOICE_CATALOG[archetype];
            break;
          }
        }
      }
    }

    // Decide whether the catalog entry governs voice selection or caller explicitly overrode voiceId
    let catalogEntry = null;
    let useCatalogVoice = false;
    if (isNarrator) {
      catalogEntry = VOICE_CATALOG.narrator;
      useCatalogVoice = !mixContext.explicitVoice || !rawVoiceId;
    } else if (charCatalogEntry) {
      const catEdge = LEGACY_VOICE_ALIASES[charCatalogEntry.primary] || charCatalogEntry.primary;
      const catFallback = charCatalogEntry.fallback
        ? (LEGACY_VOICE_ALIASES[charCatalogEntry.fallback] || charCatalogEntry.fallback)
        : '';
      const matchesCatalogVoice =
        !hasExplicitVoiceOverride ||
        requestedEdgeVoice === catEdge ||
        aliasedVoiceId === catFallback ||
        rawVoiceId === charCatalogEntry.primary;

      if (matchesCatalogVoice) {
        catalogEntry = charCatalogEntry;
        useCatalogVoice = true;
      }
    } else if (!identityKey && aliasedVoiceId) {
      // Only match VOICE_CATALOG by voiceId when unambiguous (avoids collapsing shared RyanNeural/SoniaNeural presets)
      if (VOICE_CATALOG[aliasedVoiceId]) {
        catalogEntry = VOICE_CATALOG[aliasedVoiceId];
        useCatalogVoice = true;
      } else {
        const matchingEntries = Object.values(VOICE_CATALOG).filter(
          (entry) => (LEGACY_VOICE_ALIASES[entry.primary] || entry.primary) === requestedEdgeVoice
        );
        if (matchingEntries.length === 1) {
          catalogEntry = matchingEntries[0];
          useCatalogVoice = true;
        }
      }
    }

    let prosody = catalogEntry?.prosody ? { ...catalogEntry.prosody } : { rate: '+0%', pitch: '+0%' };
    let baseRatePct = parseInt(prosody.rate, 10) || 0;
    let basePitchNum = parseInt(prosody.pitch, 10) || 0;

    let edgeVoice =
      useCatalogVoice && catalogEntry?.primary
        ? (LEGACY_VOICE_ALIASES[catalogEntry.primary] || catalogEntry.primary)
        : (requestedEdgeVoice || narratorDefaultEdge);

    // Deterministic per-character prosody differentiation so non-narrator characters sharing
    // a base Edge voice (or lacking distinct catalog prosody) stay acoustically & byte-distinct
    if (!isNarrator && identityKey && (!useCatalogVoice || (baseRatePct === 0 && basePitchNum === 0))) {
      const PITCH_OFFSETS_HZ = [-8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8];
      const RATE_OFFSETS_PCT = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
      const digest = crypto.createHash('md5').update(identityKey.toLowerCase()).digest();
      const pitchOffset = PITCH_OFFSETS_HZ[digest.readUInt32BE(0) % PITCH_OFFSETS_HZ.length];
      const rateOffset = RATE_OFFSETS_PCT[digest.readUInt32BE(4) % RATE_OFFSETS_PCT.length];
      baseRatePct += rateOffset;
      basePitchNum += pitchOffset;
      prosody = {
        rate: `${baseRatePct >= 0 ? '+' : ''}${baseRatePct}%`,
        pitch: `${basePitchNum >= 0 ? '+' : ''}${basePitchNum}Hz`,
      };
    }

    let effectiveSpeed = speed || 1.0;
    if (baseRatePct !== 0) {
      effectiveSpeed = Number((effectiveSpeed * (1 + baseRatePct / 100)).toFixed(2));
    }

    // 1. Explicit Machine TTS
    if (engineChoice === 'machine-tts') {
      return await this.synthesizeWithMachine(trimmed, useCatalogVoice ? edgeVoice : voiceId, effectiveSpeed, mixContext);
    }

    // 2. Explicit Paradee-8M + Machine Mixed Mode
    if (engineChoice === 'paradee-mixed') {
      return await this.synthesizeWithParadeeMixed(trimmed, voiceId, effectiveSpeed, mixContext);
    }

    // 3. Explicit Paradee-8M Neural TTS
    if (engineChoice === 'paradee-tts') {
      return await this.synthesizeWithParadee(trimmed, voiceId, effectiveSpeed, mixContext);
    }

    // 4. Explicit Kokoro TTS - fails honestly, no silent fallback to macOS say
    if (engineChoice === 'kokoro-tts') {
      const kokoroVoice =
        useCatalogVoice && catalogEntry?.fallback
          ? (LEGACY_VOICE_ALIASES[catalogEntry.fallback] || catalogEntry.fallback)
          : resolveKokoroVoice(voiceId, { ...mixContext, skipCatalogLookup: !useCatalogVoice });
      return await this.synthesizeWithKokoro(trimmed, kokoroVoice, effectiveSpeed, { failHonestly: true });
    }

    // 5. 'msedge-tts' or 'auto' (Fallback Chain: msedge-tts -> kokoro-tts -> paradee-tts -> machine-tts)
    if (speed && speed !== 1.0) {
      const speedPct = Math.round((speed - 1.0) * 100);
      const totalRate = baseRatePct + speedPct;
      prosody.rate = `${totalRate >= 0 ? '+' : ''}${totalRate}%`;
    }

    try {
      return await this.synthesizeWithEdge(trimmed, edgeVoice, { prosody });
    } catch (edgeErr) {
      console.warn(
        `[TTSEngine] Edge TTS failed for voice '${edgeVoice}' (${edgeErr.message}). Activating Kokoro-TTS fallback.`
      );
      try {
        const fallbackKokoroVoice =
          useCatalogVoice && catalogEntry?.fallback
            ? (LEGACY_VOICE_ALIASES[catalogEntry.fallback] || catalogEntry.fallback)
            : resolveKokoroVoice(voiceId, { ...mixContext, skipCatalogLookup: !useCatalogVoice });
        return await this.synthesizeWithKokoro(trimmed, fallbackKokoroVoice, effectiveSpeed, { failHonestly: true });
      } catch (kokoroErr) {
        console.warn(
          `[TTSEngine] Kokoro-TTS failed (${kokoroErr.message}). Activating Paradee-TTS fallback.`
        );
        try {
          return await this.synthesizeWithParadee(trimmed, voiceId, effectiveSpeed, {
            ...mixContext,
            failHonestly: true,
          });
        } catch (paradeeErr) {
          console.warn(
            `[TTSEngine] Paradee-TTS failed (${paradeeErr.message}). Activating Machine-TTS fallback.`
          );
          return await this.synthesizeWithMachine(trimmed, edgeVoice || voiceId, effectiveSpeed, mixContext);
        }
      }
    }
  }

  // Alias for backward compatibility
  async synthesizeFallback(text, voiceId, speed = 1.0) {
    return await this.synthesizeWithKokoro(text, voiceId, speed);
  }
}

const ttsEngine = new TTSEngine();

module.exports = {
  ttsEngine,
  TTSEngine,
  convertPitchToHz,
  resolveKokoroVoice,
  resolveMacVoice,
  VALID_KOKORO_VOICES,
  MAC_VOICE_MAP,
  MAC_VOICE_CANDIDATES,
  INSTALLED_MAC_VOICES,
  KOKORO_TO_EDGE_MAP,
  EDGE_TO_KOKORO_MAP,
};
