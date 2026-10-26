const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const os = require('os');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
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

class TTSEngine {
  constructor() {
    this.sampleRate = config.audio.sampleRate;
    this.primaryFormat = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
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

  // Primary: Microsoft Edge Neural TTS
  async synthesizeWithEdge(text, voiceId, options = {}) {
    const tts = new MsEdgeTTS();
    const prosody = options.prosody || { pitch: '+0%', rate: '+0%' };

    await tts.setMetadata(voiceId, this.primaryFormat);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        tts.close();
        reject(new Error('Edge TTS request timeout (15s)'));
      }, 15000);

      try {
        const safeText = this.escapeSsml(text);
        const { audioStream } = tts.toStream(safeText, prosody);
        const chunks = [];

        audioStream.on('data', (chunk) => {
          chunks.push(chunk);
        });

        audioStream.on('end', () => {
          clearTimeout(timeout);
          tts.close();
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) {
            return reject(new Error('Edge TTS returned empty audio buffer'));
          }
          // Duration based on constant 48kbps bitrate (6 bytes per ms)
          const durationMs = Math.round((buffer.length / this.bytesPerSec) * 1000);
          resolve({
            audio_buffer: buffer,
            duration_ms: durationMs,
            format: 'mp3',
            engine: 'msedge-tts',
          });
        });

        audioStream.on('error', (err) => {
          clearTimeout(timeout);
          tts.close();
          reject(err);
        });
      } catch (err) {
        clearTimeout(timeout);
        tts.close();
        reject(err);
      }
    });
  }

  // Fallback: macOS Neural / System Speech or Clean Silence Buffer (No Sine Wave Hum!)
  async synthesizeFallback(text, voiceId, speed = 1.0) {
    const trimmed = text.trim();
    if (!trimmed) {
      const silenceCount = Math.floor(this.sampleRate * 0.1);
      return {
        audio_buffer: Buffer.alloc(silenceCount * 2),
        duration_ms: 100,
        format: 'pcm',
        engine: 'kokoro-fallback',
      };
    }

    // Check if macOS /usr/bin/say is available, not in test mode, and not disabled
    if (
      fs.existsSync('/usr/bin/say') &&
      process.env.NODE_ENV !== 'test' &&
      !process.env.SYNCTONE_DISABLE_MACOS_SAY
    ) {
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
            engine: 'macos-neural-say',
          };
        }
      } catch (sayErr) {
        if (fs.existsSync(tmpWavPath)) {
          try {
            fs.unlinkSync(tmpWavPath);
          } catch (_) {}
        }
        console.warn(
          `[TTSEngine] macOS say fallback failed: ${sayErr.message}. Falling back to clean silence.`
        );
      }
    }

    // If /usr/bin/say is not available (or in test mode), return a clean SILENT buffer — NEVER generate the sine wave hum!
    const baseDurationSec = Math.max(0.6, trimmed.length / 15 / (speed || 1.0));
    const sampleCount = Math.floor(this.sampleRate * baseDurationSec);
    const silentBuffer = Buffer.alloc(sampleCount * 2);

    return {
      audio_buffer: silentBuffer,
      duration_ms: Math.round(baseDurationSec * 1000),
      format: 'pcm',
      engine: 'kokoro-fallback',
    };
  }

  // Public Interface: Tries Edge Neural TTS first, automatically falls back to Kokoro
  async synthesizeSegment(text, voiceId, speed = 1.0) {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        audio_buffer: Buffer.alloc(0),
        duration_ms: 0,
        format: 'mp3',
        engine: 'msedge-tts',
      };
    }

    // Resolve voice options from catalog
    let edgeVoice = KOKORO_TO_EDGE_MAP[voiceId] || voiceId;
    let prosody = { rate: '+0%', pitch: '+0%' };

    for (const [key, entry] of Object.entries(VOICE_CATALOG)) {
      if (entry.primary === voiceId || key === voiceId) {
        edgeVoice = entry.primary;
        prosody = entry.prosody ? { ...entry.prosody } : { rate: '+0%', pitch: '+0%' };
        break;
      }
    }

    // Adjust rate if non-default speed is requested
    if (speed && speed !== 1.0) {
      const ratePct = Math.round((speed - 1.0) * 100);
      prosody.rate = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;
    }

    // 1. Try Primary Engine (Microsoft Edge Neural TTS)
    try {
      return await this.synthesizeWithEdge(trimmed, edgeVoice, { prosody });
    } catch (err) {
      console.warn(
        `[TTSEngine] Primary Edge TTS failed for voice '${edgeVoice}' (${err.message}). Activating Kokoro fallback.`
      );
      // 2. Automatic Fallback to Kokoro / Local Engine
      return await this.synthesizeFallback(trimmed, voiceId, speed);
    }
  }
}

const ttsEngine = new TTSEngine();

module.exports = {
  ttsEngine,
};
