/**
 * SyncTone — Non-blocking Persistent TTS Worker Pool
 *
 * Manages long-lived Python daemon worker processes for Paradee-8M and Kokoro-TTS.
 * Eliminates child_process.execFileSync blocking of the Node.js event loop by:
 * 1. Spawning persistent background Python daemon processes with stdio JSON-lines communication.
 * 2. Keeping models (Paradee-8M & Kokoro-TTS) warm in RAM for sub-50ms repeat inference.
 * 3. Gracefully falling back to async child_process.execFile if workers crash or exit.
 */

const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { config } = require('../config');

const execFileAsync = promisify(execFile);

function getPythonBin() {
  const pythonVenv = path.resolve(config.paths.modelsDir, '../.venv/bin/python');
  if (fs.existsSync(pythonVenv)) return pythonVenv;
  return process.env.PYTHON_BIN || 'python3';
}

class PersistentWorker {
  constructor(name, spawnArgsGetter) {
    this.name = name;
    this.spawnArgsGetter = spawnArgsGetter;
    this.process = null;
    this.rl = null;
    this.ready = false;
    this.readyPromise = null;
    this.pending = new Map(); // reqId -> { resolve, reject, timeout }
    this.reqSeq = 0;
    this.voices = [];
    this.shuttingDown = false;
  }

  async start() {
    if (this.ready) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      const pythonBin = getPythonBin();
      const spawnArgs = this.spawnArgsGetter();

      if (!spawnArgs) {
        return reject(new Error(`[WorkerPool:${this.name}] Configuration not available to spawn worker`));
      }

      try {
        this.process = spawn(pythonBin, spawnArgs, {
          stdio: ['pipe', 'pipe', 'inherit'],
        });

        this.rl = readline.createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        const initTimeout = setTimeout(() => {
          if (!this.ready) {
            this.kill();
            reject(new Error(`[WorkerPool:${this.name}] Daemon startup timed out after 15s`));
          }
        }, 15000);

        this.rl.on('line', (line) => {
          line = line.trim();
          if (!line) return;

          try {
            const msg = JSON.parse(line);
            if (!this.ready && msg.status === 'ready') {
              this.ready = true;
              this.voices = msg.voices || [];
              clearTimeout(initTimeout);
              resolve();
              return;
            }

            if (msg.id != null && this.pending.has(msg.id)) {
              const { resolve: reqResolve, reject: reqReject, timeout: reqTimeout } = this.pending.get(msg.id);
              this.pending.delete(msg.id);
              clearTimeout(reqTimeout);

              if (msg.ok) {
                reqResolve(msg);
              } else {
                reqReject(new Error(msg.error || `[WorkerPool:${this.name}] Unknown worker error`));
              }
            }
          } catch (err) {
            console.warn(`[WorkerPool:${this.name}] Error parsing worker stdout line:`, err.message);
          }
        });

        this.process.on('error', (err) => {
          clearTimeout(initTimeout);
          this.handleExit(err);
          if (!this.ready) reject(err);
        });

        this.process.on('exit', (code, signal) => {
          clearTimeout(initTimeout);
          const err = new Error(`[WorkerPool:${this.name}] Process exited with code ${code} / signal ${signal}`);
          this.handleExit(err);
          if (!this.ready) reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });

    return this.readyPromise;
  }

  handleExit(err) {
    this.ready = false;
    this.readyPromise = null;
    for (const [id, req] of this.pending.entries()) {
      clearTimeout(req.timeout);
      req.reject(err || new Error(`[WorkerPool:${this.name}] Worker terminated unexpectedly`));
    }
    this.pending.clear();
    this.process = null;
    this.rl = null;
  }

  async sendRequest(payload, timeoutMs = 25000) {
    await this.start();

    const id = ++this.reqSeq;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`[WorkerPool:${this.name}] Request ${id} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });

      const line = JSON.stringify({ ...payload, id }) + '\n';
      this.process.stdin.write(line, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  kill() {
    this.shuttingDown = true;
    if (this.process) {
      try {
        this.process.stdin.end();
        this.process.kill('SIGTERM');
      } catch (_) {}
    }
    this.handleExit();
  }
}

class TTSWorkerPool {
  constructor() {
    this.paradeeWorker = new PersistentWorker('paradee', () => {
      const onnxFile = config.paradee?.onnxFile || path.resolve(config.paths.modelsDir, 'paradee/paradee_int8.onnx');
      const configFile = config.paradee?.configFile || path.resolve(config.paths.modelsDir, 'paradee/config.json');
      const workerScript = path.resolve(__dirname, '../scripts/paradeeWorker.py');

      if (!fs.existsSync(onnxFile) || !fs.existsSync(configFile) || !fs.existsSync(workerScript)) {
        return null;
      }

      return [workerScript, '--model', onnxFile, '--config', configFile, '--daemon'];
    });

    this.kokoroWorker = new PersistentWorker('kokoro', () => {
      const modelFile = path.resolve(config.paths.modelsDir, 'kokoro-v0_19.onnx');
      const voicesFile = path.resolve(config.paths.modelsDir, 'voices.bin');
      const workerScript = path.resolve(__dirname, '../scripts/kokoroWorker.py');

      if (!fs.existsSync(modelFile) || !fs.existsSync(voicesFile) || !fs.existsSync(workerScript)) {
        return null;
      }

      return [workerScript, '--model', modelFile, '--voices', voicesFile, '--daemon'];
    });
  }

  /**
   * Synthesize audio with persistent Paradee worker, falling back to async execFile if needed.
   */
  async synthesizeParadee({ text, voice = 'bm_fable', speed = 1.0, outWav = '' }) {
    try {
      const resp = await this.paradeeWorker.sendRequest({
        text,
        voice,
        speed,
        out_wav: outWav || undefined,
      });

      if (resp.pcm_b64) {
        return {
          audio_buffer: Buffer.from(resp.pcm_b64, 'base64'),
          samples: resp.samples,
          sample_rate: resp.sample_rate || 24000,
        };
      }
      return resp;
    } catch (daemonErr) {
      console.warn(`[TTSWorkerPool] Persistent Paradee daemon request failed (${daemonErr.message}). Using async execFile fallback.`);
      return await this.execParadeeSingleShot({ text, voice, speed, outWav });
    }
  }

  /**
   * Async execFile fallback for Paradee
   */
  async execParadeeSingleShot({ text, voice = 'bm_fable', speed = 1.0, outWav = '' }) {
    const pythonBin = getPythonBin();
    const onnxFile = config.paradee?.onnxFile || path.resolve(config.paths.modelsDir, 'paradee/paradee_int8.onnx');
    const configFile = config.paradee?.configFile || path.resolve(config.paths.modelsDir, 'paradee/config.json');
    const workerScript = path.resolve(__dirname, '../scripts/paradeeWorker.py');

    const tmpOut = outWav || path.join(require('os').tmpdir(), `paradee_pool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`);

    const args = [
      workerScript,
      '--model', onnxFile,
      '--config', configFile,
      `--text=${text}`,
      '--voice', voice,
      '--speed', String(speed || 1.0),
      '--out', tmpOut,
    ];

    await execFileAsync(pythonBin, args, { timeout: 25000 });

    if (fs.existsSync(tmpOut)) {
      const wavBuf = fs.readFileSync(tmpOut);
      if (!outWav) {
        try { fs.unlinkSync(tmpOut); } catch (_) {}
      }
      const pcmBuffer = wavBuf.subarray(44);
      return {
        audio_buffer: pcmBuffer,
        samples: Math.floor(pcmBuffer.length / 2),
        sample_rate: 24000,
      };
    }
    throw new Error('Paradee fallback synthesis did not produce output file');
  }

  /**
   * Synthesize audio with persistent Kokoro worker, falling back to async execFile if needed.
   */
  async synthesizeKokoro({ text, voice = 'bm_george', speed = 1.0, lang = '', outWav = '' }) {
    try {
      const resp = await this.kokoroWorker.sendRequest({
        text,
        voice,
        speed,
        lang,
        out_wav: outWav || undefined,
      });

      if (resp.pcm_b64) {
        return {
          audio_buffer: Buffer.from(resp.pcm_b64, 'base64'),
          samples: resp.samples,
          sample_rate: resp.sample_rate || 24000,
        };
      }
      return resp;
    } catch (daemonErr) {
      console.warn(`[TTSWorkerPool] Persistent Kokoro daemon request failed (${daemonErr.message}). Using async execFile fallback.`);
      return await this.execKokoroSingleShot({ text, voice, speed, lang, outWav });
    }
  }

  /**
   * Async execFile fallback for Kokoro
   */
  async execKokoroSingleShot({ text, voice = 'bm_george', speed = 1.0, lang = '', outWav = '' }) {
    const pythonBin = getPythonBin();
    const modelFile = path.resolve(config.paths.modelsDir, 'kokoro-v0_19.onnx');
    const voicesFile = path.resolve(config.paths.modelsDir, 'voices.bin');
    const workerScript = path.resolve(__dirname, '../scripts/kokoroWorker.py');

    const tmpOut = outWav || path.join(require('os').tmpdir(), `kokoro_pool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`);

    const args = [
      workerScript,
      '--model', modelFile,
      '--voices', voicesFile,
      `--text=${text}`,
      '--voice', voice,
      '--speed', String(speed || 1.0),
      '--out', tmpOut,
    ];
    if (lang) {
      args.push('--lang', lang);
    }

    await execFileAsync(pythonBin, args, { timeout: 25000 });

    if (fs.existsSync(tmpOut)) {
      const wavBuf = fs.readFileSync(tmpOut);
      if (!outWav) {
        try { fs.unlinkSync(tmpOut); } catch (_) {}
      }
      const pcmBuffer = wavBuf.subarray(44);
      return {
        audio_buffer: pcmBuffer,
        samples: Math.floor(pcmBuffer.length / 2),
        sample_rate: 24000,
      };
    }
    throw new Error('Kokoro fallback synthesis did not produce output file');
  }

  isParadeeAvailable() {
    const onnxFile = config.paradee?.onnxFile || path.resolve(config.paths.modelsDir, 'paradee/paradee_int8.onnx');
    const configFile = config.paradee?.configFile || path.resolve(config.paths.modelsDir, 'paradee/config.json');
    return fs.existsSync(onnxFile) && fs.existsSync(configFile);
  }

  isKokoroAvailable() {
    const modelFile = path.resolve(config.paths.modelsDir, 'kokoro-v0_19.onnx');
    const voicesFile = path.resolve(config.paths.modelsDir, 'voices.bin');
    return fs.existsSync(modelFile) && fs.existsSync(voicesFile);
  }

  shutdown() {
    this.paradeeWorker.kill();
    this.kokoroWorker.kill();
  }
}

const ttsWorkerPool = new TTSWorkerPool();

module.exports = {
  ttsWorkerPool,
  TTSWorkerPool,
};
