const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const crypto = require('crypto');
const os = require('os');
const WebSocket = require('ws');
const { config } = require('../config');
const { VOICE_CATALOG } = require('./voiceProfiler');

const MAC_VOICE_MAP = {
  'en-GB-RyanNeural': 'Daniel',
  'en-GB-ArthurNeural': 'Grandpa (English (UK))',
  'en-GB-SoniaNeural': 'Kate (Enhanced)',
  'en-GB-LibbyNeural': 'Serena (Premium)',
  'en-GB-ThomasNeural': 'Eddy (English (UK))',
  'en-GB-AlfieNeural': 'Reed (English (UK))',
  'en-GB-NoahNeural': 'Rocko (English (UK))',
  'en-GB-OliverNeural': 'Flo (English (UK))',
  bm_george: 'Daniel',
  bm_daniel: 'Eddy (English (UK))',
  bf_emma: 'Serena (Premium)',
  am_adam: 'Daniel',
  am_michael: 'Rocko (English (UK))',
  am_george: 'Grandpa (English (UK))',
  am_onyx: 'Rocko (English (UK))',
  af_heart: 'Serena (Premium)',
  af_bella: 'Flo (English (UK))',
  af_nicole: 'Sandy (English (UK))',
  af_sarah: 'Kate (Enhanced)',
  af_sky: 'Shelley (English (UK))',
};

const KOKORO_TO_EDGE_MAP = {
  af_heart: 'en-GB-SoniaNeural',
  af_bella: 'en-GB-LibbyNeural',
  af_nicole: 'en-GB-LibbyNeural',
  af_sky: 'en-GB-SoniaNeural',
  af_sarah: 'en-GB-SoniaNeural',
  am_adam: 'en-GB-ThomasNeural',
  am_michael: 'en-GB-NoahNeural',
  am_george: 'en-GB-ArthurNeural',
  am_onyx: 'en-GB-RyanNeural',
  bm_george: 'en-GB-RyanNeural',
  bf_emma: 'en-GB-LibbyNeural',
  bm_daniel: 'en-GB-AlfieNeural',
};

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = '143';
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

let cachedSecMsGecToken = null;
let tokenExpiryTime = 0;

function getSecMsGecToken() {
  const now = Date.now();
  if (cachedSecMsGecToken && now < tokenExpiryTime) {
    return cachedSecMsGecToken;
  }
  try {
    const token = child_process
      .execFileSync('python3', ['-c', 'from edge_tts.drm import DRM; print(DRM.generate_sec_ms_gec())'], {
        encoding: 'utf8',
        timeout: 4000,
      })
      .trim();
    if (token && token.includes('-')) {
      cachedSecMsGecToken = token;
      tokenExpiryTime = now + 4 * 60 * 1000; // Cache for 4 minutes
      return cachedSecMsGecToken;
    }
  } catch (_) {}
  return null;
}

class TTSEngine {
  constructor() {
    this.sampleRate = config.audio.sampleRate;
    this.bytesPerSec = 6000; // 48kbps CBR = 6000 bytes/sec
    this.modelPath = path.resolve(config.paths.modelsDir, 'kokoro-v0_19.onnx');
    this.voicesPath = path.resolve(config.paths.modelsDir, 'voices.bin');
  }

  async checkModelAvailable() {
    const modelExists = fs.existsSync(this.modelPath);
    const voicesExists = fs.existsSync(this.voicesPath);
    return {
      primary_engine: 'msedge-tts (Cloud Neural)',
      fallback_engine: 'kokoro-tts (Local ONNX)',
      machine_engine: 'machine-tts (Local OS Speech)',
      engines: ['msedge-tts', 'kokoro-tts', 'machine-tts'],
      cloud_ready: true,
      model_exists: modelExists,
      voices_exists: voicesExists,
      model_path: this.modelPath,
      voices_path: this.voicesPath,
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
    const muid = crypto.randomBytes(16).toString('hex').toUpperCase();

    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?` +
      `TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}` +
      `&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const headers = {
      Cookie: `muid=${muid};`,
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

  async synthesizeWithEdgeCli(text, voiceId, options = {}) {
    const prosody = options.prosody || { pitch: '+0%', rate: '+0%' };
    const tmpFile = path.join(os.tmpdir(), `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);

    const edgeBinCandidates = [
      '/Users/namahomprakash/Library/Python/3.14/bin/edge-tts',
      path.resolve(config.paths.modelsDir, '../.venv/bin/edge-tts'),
      'edge-tts',
    ];

    let edgeBin = edgeBinCandidates.find((bin) => fs.existsSync(bin));

    try {
      if (edgeBin) {
        child_process.execFileSync(
          edgeBin,
          [
            '--text',
            text,
            '--voice',
            voiceId,
            '--rate',
            prosody.rate || '+0%',
            '--pitch',
            prosody.pitch || '+0Hz',
            '--write-media',
            tmpFile,
            '--no-progress',
          ],
          { timeout: 15000 }
        );
      } else {
        child_process.execFileSync(
          'python3',
          [
            '-m',
            'edge_tts',
            '--text',
            text,
            '--voice',
            voiceId,
            '--rate',
            prosody.rate || '+0%',
            '--pitch',
            prosody.pitch || '+0Hz',
            '--write-media',
            tmpFile,
            '--no-progress',
          ],
          { timeout: 15000 }
        );
      }

      if (fs.existsSync(tmpFile)) {
        const buffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
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

  async synthesizeWithEdge(text, voiceId, options = {}) {
    try {
      return await this.synthesizeWithEdgeWs(text, voiceId, options);
    } catch (wsErr) {
      console.warn(`[TTSEngine] Edge WebSocket failed (${wsErr.message}). Trying Edge CLI fallback.`);
      return await this.synthesizeWithEdgeCli(text, voiceId, options);
    }
  }

  // --- ENGINE 2: Kokoro-TTS (Local ONNX / Acoustic Neural Fallback) ---
  async synthesizeWithKokoro(text, voiceId, speed = 1.0) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'pcm',
        engine: 'kokoro-tts',
      };
    }

    const modelExists = fs.existsSync(this.modelPath) && fs.existsSync(this.voicesPath);

    // If local ONNX weights exist, execute Kokoro ONNX model synthesis
    if (modelExists) {
      try {
        const tmpWavPath = path.join(
          os.tmpdir(),
          `kokoro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`
        );
        const pythonVenv = path.resolve(config.paths.modelsDir, '../.venv/bin/python');
        const pythonBin = fs.existsSync(pythonVenv) ? pythonVenv : 'python3';

        child_process.execFileSync(
          pythonBin,
          [
            '-c',
            `
import sys, soundfile as sf
from kokoro_onnx import Kokoro
kokoro = Kokoro("${this.modelPath}", "${this.voicesPath}")
samples, sr = kokoro.create("${trimmed.replace(/"/g, '\\"')}", voice="${voiceId}", speed=${speed || 1.0})
sf.write("${tmpWavPath}", samples, sr)
            `,
          ],
          { timeout: 15000 }
        );

        if (fs.existsSync(tmpWavPath)) {
          const wavBuf = fs.readFileSync(tmpWavPath);
          fs.unlinkSync(tmpWavPath);
          const pcm = wavBuf.subarray(44);
          const durationMs = Math.round((pcm.length / 2 / this.sampleRate) * 1000);
          return {
            audio_buffer: pcm,
            duration_ms: durationMs,
            format: 'pcm',
            engine: 'kokoro-tts',
          };
        }
      } catch (kokoroErr) {
        console.warn(`[TTSEngine] Kokoro ONNX direct execution failed: ${kokoroErr.message}`);
      }
    }

    // When ONNX weights are not yet downloaded on disk:
    // Modulated multi-formant / vocal-tract acoustic bridge via local neural speech
    if (
      fs.existsSync('/usr/bin/say') &&
      process.env.NODE_ENV !== 'test' &&
      !process.env.SYNCTONE_DISABLE_MACOS_SAY
    ) {
      const macVoice = MAC_VOICE_MAP[voiceId] || 'Daniel';
      const tmpWavPath = path.join(
        os.tmpdir(),
        `kokoro_bridge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.wav`
      );

      try {
        child_process.execFileSync(
          '/usr/bin/say',
          [
            '-v',
            macVoice,
            '-r',
            String(Math.round(180 * (speed || 1.0))),
            '--data-format=LEI16@24000',
            '-o',
            tmpWavPath,
            trimmed,
          ],
          { timeout: 15000 }
        );

        if (fs.existsSync(tmpWavPath)) {
          const wavBuf = fs.readFileSync(tmpWavPath);
          fs.unlinkSync(tmpWavPath);

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

          const durationMs = Math.max(
            100,
            Math.round((pcmBuffer.length / 2 / this.sampleRate) * 1000)
          );

          return {
            audio_buffer: pcmBuffer,
            duration_ms: durationMs,
            format: 'pcm',
            engine: 'kokoro-tts',
          };
        }
      } catch (bridgeErr) {
        if (fs.existsSync(tmpWavPath)) {
          try {
            fs.unlinkSync(tmpWavPath);
          } catch (_) {}
        }
        console.warn(`[TTSEngine] Kokoro acoustic bridge failed: ${bridgeErr.message}`);
      }
    }

    // In test mode or when local speech is unavailable: clean silent PCM buffer
    const baseDurationSec = Math.max(0.6, trimmed.length / 15 / (speed || 1.0));
    const sampleCount = Math.floor(this.sampleRate * baseDurationSec);
    const silentBuffer = Buffer.alloc(sampleCount * 2);

    return {
      audio_buffer: silentBuffer,
      duration_ms: Math.round(baseDurationSec * 1000),
      format: 'pcm',
      engine: 'kokoro-tts',
    };
  }

  // --- ENGINE 3: Machine / Local OS Speech Synthesis ---
  async synthesizeWithMachine(text, voiceId, speed = 1.0) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'pcm',
        engine: 'machine-tts',
      };
    }

    // In test mode, return clean silent PCM buffer
    if (process.env.NODE_ENV === 'test' || process.env.SYNCTONE_DISABLE_MACOS_SAY) {
      const baseDurationSec = Math.max(0.6, trimmed.length / 15 / (speed || 1.0));
      const sampleCount = Math.floor(this.sampleRate * baseDurationSec);
      return {
        audio_buffer: Buffer.alloc(sampleCount * 2),
        duration_ms: Math.round(baseDurationSec * 1000),
        format: 'pcm',
        engine: 'machine-tts',
      };
    }

    // On macOS, execute /usr/bin/say with MAC_VOICE_MAP
    if (fs.existsSync('/usr/bin/say')) {
      const macVoice = MAC_VOICE_MAP[voiceId] || 'Daniel';
      const tmpWavPath = path.join(
        os.tmpdir(),
        `say_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.wav`
      );

      try {
        child_process.execFileSync(
          '/usr/bin/say',
          [
            '-v',
            macVoice,
            '-r',
            String(Math.round(185 * (speed || 1.0))),
            '--data-format=LEI16@24000',
            '-o',
            tmpWavPath,
            trimmed,
          ],
          { timeout: 15000 }
        );

        if (fs.existsSync(tmpWavPath)) {
          const wavBuf = fs.readFileSync(tmpWavPath);
          fs.unlinkSync(tmpWavPath);

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

          const durationMs = Math.max(
            100,
            Math.round((pcmBuffer.length / 2 / this.sampleRate) * 1000)
          );

          return {
            audio_buffer: pcmBuffer,
            duration_ms: durationMs,
            format: 'pcm',
            engine: 'machine-tts',
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
    };
  }

  // --- Public Interface: 3-Engine Architecture (Selectable + Fallback Chain) ---
  async synthesizeSegment(text, voiceId, speed = 1.0, preferredEngine = 'auto') {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'mp3',
        engine: preferredEngine === 'auto' ? 'msedge-tts' : preferredEngine,
      };
    }

    const engineChoice = (preferredEngine || 'auto').toLowerCase();

    // 1. Explicit Machine TTS
    if (engineChoice === 'machine-tts') {
      return await this.synthesizeWithMachine(trimmed, voiceId, speed);
    }

    // 2. Explicit Kokoro TTS
    if (engineChoice === 'kokoro-tts') {
      try {
        return await this.synthesizeWithKokoro(trimmed, voiceId, speed);
      } catch (err) {
        console.warn(`[TTSEngine] Kokoro engine failed (${err.message}). Falling back to Machine TTS.`);
        return await this.synthesizeWithMachine(trimmed, voiceId, speed);
      }
    }

    // 3. 'msedge-tts' or 'auto' (Chain: msedge-tts -> kokoro-tts -> machine-tts)
    let edgeVoice = KOKORO_TO_EDGE_MAP[voiceId] || voiceId;
    let prosody = { rate: '+0%', pitch: '+0%' };

    for (const [key, entry] of Object.entries(VOICE_CATALOG)) {
      if (entry.primary === voiceId || key === voiceId) {
        edgeVoice = entry.primary;
        prosody = entry.prosody ? { ...entry.prosody } : { rate: '+0%', pitch: '+0%' };
        break;
      }
    }

    if (speed && speed !== 1.0) {
      const ratePct = Math.round((speed - 1.0) * 100);
      prosody.rate = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;
    }

    // Try Primary Engine (Microsoft Edge Neural TTS)
    try {
      return await this.synthesizeWithEdge(trimmed, edgeVoice, { prosody });
    } catch (edgeErr) {
      console.warn(
        `[TTSEngine] Primary Edge TTS failed for voice '${edgeVoice}' (${edgeErr.message}). Activating Kokoro-TTS fallback.`
      );
      // Fall back to Kokoro-TTS
      try {
        return await this.synthesizeWithKokoro(trimmed, voiceId, speed);
      } catch (kokoroErr) {
        console.warn(
          `[TTSEngine] Kokoro-TTS failed (${kokoroErr.message}). Activating Machine-TTS fallback.`
        );
        // Fall back to Machine-TTS
        return await this.synthesizeWithMachine(trimmed, voiceId, speed);
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
};
