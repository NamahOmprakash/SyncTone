import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { IconSettings, IconX, IconRefresh } from './icons';
import { api } from '../services/api';

const PARSER_CONFIG_STORAGE_KEY = 'synctone_parser_config';

const DEFAULT_PARSER_CONFIG = {
  heuristic: {
    sensitivity: 'balanced',
    turnTaking: true,
    quoteStyle: 'auto',
  },
  gemini: {
    apiKey: '',
    model: 'gemini-2.5-flash',
    temperature: 0.1,
  },
  ollama: {
    url: 'http://localhost:11434',
    model: 'llama3:8b',
  },
  ocr: {
    baseUrl: 'http://localhost:8000/v1',
    model: 'baidu/Unlimited-OCR',
  },
};

const KNOWN_OLLAMA_MODELS = ['mistral', 'llama3:8b', 'qwen2.5'];
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

function normalizeParserConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? (raw.config && typeof raw.config === 'object' ? raw.config : raw) : {};
  const ocrSrc = src.ocr || src['unlimited-ocr'] || src.unlimited_ocr || {};
  return {
    heuristic: {
      sensitivity: src.heuristic?.sensitivity || DEFAULT_PARSER_CONFIG.heuristic.sensitivity,
      turnTaking:
        src.heuristic?.turnTaking !== undefined
          ? Boolean(src.heuristic.turnTaking)
          : DEFAULT_PARSER_CONFIG.heuristic.turnTaking,
      quoteStyle: src.heuristic?.quoteStyle || DEFAULT_PARSER_CONFIG.heuristic.quoteStyle,
    },
    gemini: {
      apiKey: typeof src.gemini?.apiKey === 'string' ? src.gemini.apiKey : '',
      hasKey: Boolean(
        src.geminiConfigured || src.gemini?.hasKey || src.gemini?.configured || src.gemini?.apiKey
      ),
      model: src.gemini?.model || DEFAULT_PARSER_CONFIG.gemini.model,
      temperature:
        src.gemini?.temperature !== undefined && src.gemini?.temperature !== ''
          ? Number(src.gemini.temperature)
          : DEFAULT_PARSER_CONFIG.gemini.temperature,
    },
    ollama: {
      url: src.ollama?.url || DEFAULT_PARSER_CONFIG.ollama.url,
      model: src.ollama?.model || DEFAULT_PARSER_CONFIG.ollama.model,
    },
    ocr: {
      baseUrl: ocrSrc.baseUrl || ocrSrc.url || DEFAULT_PARSER_CONFIG.ocr.baseUrl,
      model: ocrSrc.model || DEFAULT_PARSER_CONFIG.ocr.model,
    },
  };
}

function readStoredParserConfig() {
  try {
    if (typeof localStorage === 'undefined') return normalizeParserConfig();
    const raw = localStorage.getItem(PARSER_CONFIG_STORAGE_KEY);
    return raw ? normalizeParserConfig(JSON.parse(raw)) : normalizeParserConfig();
  } catch (_) {
    return normalizeParserConfig();
  }
}

export default function SettingsModal({
  onClose,
  modelStatus: initialModelStatus,
  ttsEngine: propTtsEngine,
  onSelectTtsEngine,
  defaultParserEngine: propDefaultParserEngine,
  onSelectParserEngine,
  onProbeStatus,
  currentChapterId = null,
  onReparseChapter = null,
}) {
  const { theme, setTheme, fontFamily, setFontFamily, fontSize, increaseFontSize, decreaseFontSize } = useTheme();

  const [modelStatus, setModelStatus] = useState(initialModelStatus || null);
  const [probing, setProbing] = useState(false);
  const [deviceVoiceCount, setDeviceVoiceCount] = useState(0);

  const [parserConfig, setParserConfig] = useState(readStoredParserConfig);
  const [discoveredOllamaModels, setDiscoveredOllamaModels] = useState([]);
  const [parserActionStatus, setParserActionStatus] = useState(null); // { state: 'busy' | 'ok' | 'error', message: string }
  const [testingParser, setTestingParser] = useState(false);
  const [reparsingChapter, setReparsingChapter] = useState(false);
  const [reparseStatus, setReparseStatus] = useState(null);

  const [localTtsEngine, setLocalTtsEngine] = useState(() => {
    try {
      return localStorage.getItem('synctone_tts_engine') || 'msedge-tts';
    } catch (_) {
      return 'msedge-tts';
    }
  });

  const [localParserEngine, setLocalParserEngine] = useState(() => {
    try {
      return localStorage.getItem('synctone_parser_engine') || 'heuristic';
    } catch (_) {
      return 'heuristic';
    }
  });

  const activeEngine = propTtsEngine || localTtsEngine;
  const activeParser = propDefaultParserEngine || localParserEngine;

  useEffect(() => {
    if (initialModelStatus) {
      setModelStatus(initialModelStatus);
    }
  }, [initialModelStatus]);

  useEffect(() => {
    let cancelled = false;
    const maybePromise = api.status?.getParserConfig?.();
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise
        .then((res) => {
          if (cancelled || !res) return;
          setParserConfig((prev) => {
            const merged = normalizeParserConfig(res);
            // Keep locally typed unsaved API key if server only reports masked status
            if (!merged.gemini.apiKey && prev.gemini.apiKey) {
              merged.gemini.apiKey = prev.gemini.apiKey;
            }
            try {
              localStorage.setItem(PARSER_CONFIG_STORAGE_KEY, JSON.stringify(merged));
            } catch (_) {}
            return merged;
          });
          if (Array.isArray(res?.ollamaModels)) {
            setDiscoveredOllamaModels(res.ollamaModels);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const persistParserConfig = useCallback(
    async (nextConfig, engineOverride = null) => {
      const normalized = normalizeParserConfig(nextConfig);
      const selectedEngine = engineOverride || activeParser;
      try {
        localStorage.setItem(PARSER_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
      } catch (_) {}
      try {
        const maybeSave = api.status?.updateParserConfig?.({
          activeEngine: selectedEngine,
          heuristic: normalized.heuristic,
          gemini: normalized.gemini,
          ollama: normalized.ollama,
          ocr: normalized.ocr,
          'unlimited-ocr': normalized.ocr,
        });
        if (maybeSave && typeof maybeSave.then === 'function') {
          await maybeSave;
        }
        return true;
      } catch (_) {
        return false;
      }
    },
    [activeParser]
  );

  const updateParserSection = useCallback(
    (section, patch, autoPersist = false) => {
      setParserConfig((prev) => {
        const next = {
          ...prev,
          [section]: {
            ...prev[section],
            ...patch,
          },
        };
        try {
          localStorage.setItem(PARSER_CONFIG_STORAGE_KEY, JSON.stringify(next));
        } catch (_) {}
        if (autoPersist) {
          persistParserConfig(next);
        }
        return next;
      });
    },
    [persistParserConfig]
  );

  const ollamaModelOptions = useMemo(() => {
    const combined = [
      ...KNOWN_OLLAMA_MODELS,
      ...discoveredOllamaModels,
      parserConfig.ollama.model,
    ]
      .filter(Boolean)
      .map((m) => String(m).trim());
    return Array.from(new Set(combined));
  }, [discoveredOllamaModels, parserConfig.ollama.model]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const updateVoices = () => {
        try {
          const v = window.speechSynthesis.getVoices();
          setDeviceVoiceCount(v ? v.length : 0);
        } catch (_) {}
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  const handleSelectEngine = useCallback(
    (engine) => {
      setLocalTtsEngine(engine);
      try {
        localStorage.setItem('synctone_tts_engine', engine);
      } catch (_) {}
      onSelectTtsEngine?.(engine);
    },
    [onSelectTtsEngine]
  );

  const handleSelectParser = useCallback(
    (parser) => {
      setLocalParserEngine(parser);
      setParserActionStatus(null);
      try {
        localStorage.setItem('synctone_parser_engine', parser);
      } catch (_) {}
      onSelectParserEngine?.(parser);
      try {
        const maybeSave = api.status?.updateParserConfig?.({ activeEngine: parser });
        if (maybeSave && typeof maybeSave.catch === 'function') {
          maybeSave.catch(() => {});
        }
      } catch (_) {}
    },
    [onSelectParserEngine]
  );

  const handleSaveAndTestParser = useCallback(
    async (engine) => {
      setTestingParser(true);
      setParserActionStatus({ state: 'busy', message: `Saving and testing ${engine}...` });
      try {
        const persisted = await persistParserConfig(parserConfig, engine);
        const targetSection =
          engine === 'gemini'
            ? parserConfig.gemini
            : engine === 'ollama'
              ? parserConfig.ollama
              : engine === 'unlimited-ocr' || engine === 'ocr'
                ? parserConfig.ocr
                : parserConfig.heuristic;

        let testRes = null;
        if (typeof api.status?.testParserConnection === 'function') {
          testRes = await api.status.testParserConnection({
            engine,
            config: targetSection,
          });
        } else {
          const probe = await api.status?.models?.({ probe: true });
          if (probe) {
            setModelStatus(probe);
            testRes = { ok: true, message: 'Config saved and status probed.' };
          }
        }

        if (Array.isArray(testRes?.models)) {
          const modelNames = testRes.models
            .map((m) => (typeof m === 'string' ? m : m?.name || m?.id))
            .filter(Boolean);
          if (modelNames.length > 0 && engine === 'ollama') {
            setDiscoveredOllamaModels(modelNames);
          }
        }

        if (onProbeStatus) {
          onProbeStatus()
            .then((res) => {
              if (res) setModelStatus(res);
            })
            .catch(() => {});
        } else if (typeof api.status?.models === 'function') {
          api.status
            .models({ probe: true })
            .then((res) => {
              if (res) setModelStatus(res);
            })
            .catch(() => {});
        }

        const isOk = testRes ? testRes.ok !== false && testRes.connected !== false && testRes.reachable !== false : persisted;
        const defaultMsg = isOk
          ? `Connected & saved${persisted ? '' : ' locally'}.`
          : 'Saved locally, but connection check reported offline.';
        setParserActionStatus({
          state: isOk ? 'ok' : 'error',
          message: testRes?.message || testRes?.error || testRes?.detail || defaultMsg,
        });
      } catch (err) {
        setParserActionStatus({
          state: 'error',
          message: err?.message || 'Saved locally, connection probe failed.',
        });
      } finally {
        setTestingParser(false);
      }
    },
    [parserConfig, persistParserConfig, onProbeStatus]
  );

  const handleReparseChapter = useCallback(async () => {
    if (!currentChapterId) return;
    setReparsingChapter(true);
    setReparseStatus({ state: 'busy', message: `Re-parsing chapter with ${activeParser}...` });
    try {
      await persistParserConfig(parserConfig);
      let result = null;
      if (typeof onReparseChapter === 'function') {
        result = await onReparseChapter(activeParser, parserConfig);
      } else {
        result = await api.chapters.parse(currentChapterId, activeParser, parserConfig);
      }
      const segCount = result?.segments?.length ?? 0;
      setReparseStatus({
        state: 'ok',
        message: `Re-parsed chapter with ${activeParser}${segCount ? ` (${segCount} segments updated)` : ''}.`,
      });
    } catch (err) {
      setReparseStatus({
        state: 'error',
        message: err?.message || 'Chapter re-parse failed.',
      });
    } finally {
      setReparsingChapter(false);
    }
  }, [currentChapterId, activeParser, parserConfig, persistParserConfig, onReparseChapter]);

  const handleProbeAll = useCallback(async () => {
    setProbing(true);
    try {
      if (onProbeStatus) {
        const res = await onProbeStatus();
        if (res) setModelStatus(res);
      } else {
        const res = await api.status.models({ probe: true });
        if (res) setModelStatus(res);
      }
    } catch (_) {
    } finally {
      setProbing(false);
    }
  }, [onProbeStatus]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const kokoroAvailable = Boolean(modelStatus?.kokoro?.available || modelStatus?.tts?.model_exists);
  const paradeeAvailable = Boolean(modelStatus?.paradee?.model_exists || modelStatus?.paradee?.available || modelStatus?.tts?.paradee_ready);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 modal-scrim-enter cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border-strong)] max-w-lg w-full p-6 space-y-6 modal-panel-enter max-h-[90vh] overflow-y-auto cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <h2 id="settings-dialog-title" className="text-base font-bold theme-heading flex items-center gap-2">
            <IconSettings className="w-4 h-4 text-[var(--text-main)]" />
            <span>Reading & Audio Preferences</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
            aria-label="Close settings"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Voice Cast & Narration Status */}
          <div className="py-2 border-b border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold theme-heading">Voice Cast & Narration</p>
                <p className="theme-muted text-[11px]">Multi-voice storytelling & offline support</p>
              </div>
              <button
                type="button"
                onClick={handleProbeAll}
                disabled={probing}
                className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--border-strong)] hover:border-[var(--text-main)] transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-xs hover:scale-[1.03] active:scale-[0.96]"
                title="Probe real engine readiness"
              >
                {probing ? 'Probing...' : 'Check / Test'}
              </button>
            </div>

            <div className="space-y-2 mt-2">
              {/* Voice 1: Studio Cast */}
              <button
                type="button"
                onClick={() => handleSelectEngine('msedge-tts')}
                className={`w-full text-left p-3 rounded-xl theme-card border transition-all cursor-pointer flex items-center justify-between shadow-xs ${
                  activeEngine === 'msedge-tts'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                    <span className="font-bold theme-heading">1. Studio Cast Voices</span>
                    {activeEngine === 'msedge-tts' && (
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="theme-muted text-[10px] mt-0.5 font-mono">
                    High fidelity • Multi-character cast
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-main)] font-bold border border-[var(--border-strong)] shadow-xs">
                  {modelStatus?.tts?.edge_available !== false ? 'Cloud Ready' : 'Ready'}
                </span>
              </button>

              {/* Voice 2: Expressive Offline Voices */}
              <button
                type="button"
                onClick={() => handleSelectEngine('kokoro-tts')}
                className={`w-full text-left p-3 rounded-xl theme-card border transition-all cursor-pointer flex items-center justify-between shadow-xs ${
                  activeEngine === 'kokoro-tts'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        kokoroAvailable ? 'bg-[var(--text-main)]' : 'bg-[var(--text-muted)]'
                      }`}
                    />
                    <span className="font-bold theme-heading">2. Expressive Offline Voices</span>
                    {activeEngine === 'kokoro-tts' && (
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="theme-muted text-[10px] mt-0.5 font-mono">
                    {kokoroAvailable
                      ? 'Local voice package installed'
                      : "This voice isn't available right now. Try another one."}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border shadow-xs ${
                    kokoroAvailable
                      ? 'bg-[var(--bg-surface)] text-[var(--text-main)] border-[var(--border-strong)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                  }`}
                >
                  {kokoroAvailable ? 'Ready' : 'Unavailable'}
                </span>
              </button>

              {/* Voice 3: Device Speech */}
              <button
                type="button"
                onClick={() => handleSelectEngine('machine-tts')}
                className={`w-full text-left p-3 rounded-xl theme-card border transition-all cursor-pointer flex items-center justify-between shadow-xs ${
                  activeEngine === 'machine-tts'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                    <span className="font-bold theme-heading">3. Device Speech</span>
                    {activeEngine === 'machine-tts' && (
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="theme-muted text-[10px] mt-0.5 font-mono">
                    Built-in device speech for instant listening anywhere
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-main)] font-bold border border-[var(--border-strong)] shadow-xs">
                  {deviceVoiceCount > 0 ? `Device Ready (${deviceVoiceCount})` : 'Device Ready'}
                </span>
              </button>

              {/* Engine 4: Paradee-8M Micro ONNX */}
              <button
                type="button"
                onClick={() => handleSelectEngine('paradee-tts')}
                className={`w-full text-left p-3 rounded-xl theme-card border transition-all cursor-pointer flex items-center justify-between shadow-xs ${
                  activeEngine === 'paradee-tts'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        paradeeAvailable ? 'bg-[var(--text-main)]' : 'bg-[var(--text-muted)]'
                      }`}
                    />
                    <span className="font-bold theme-heading">4. Paradee-8M Micro ONNX</span>
                    {activeEngine === 'paradee-tts' && (
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="theme-muted text-[10px] mt-0.5 font-mono">
                    sahilmahendrakar/Paradee-8M-v1.2 • 8.5MB int8 • 4 Neural Voices
                  </p>
                </div>
                <span
                  className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border shadow-xs ${
                    paradeeAvailable
                      ? 'bg-[var(--bg-surface)] text-[var(--text-main)] border-[var(--border-strong)]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                  }`}
                >
                  {paradeeAvailable ? 'Paradee Ready' : 'OS Fallback'}
                </span>
              </button>

              {/* Engine 5: Paradee + Machine Mixed Cast Mode */}
              <button
                type="button"
                onClick={() => handleSelectEngine('paradee-mixed')}
                className={`w-full text-left p-3 rounded-xl theme-card border transition-all cursor-pointer flex items-center justify-between shadow-xs ${
                  activeEngine === 'paradee-mixed'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                    <span className="font-bold theme-heading">5. Paradee + Machine Mixed Cast Mode</span>
                    {activeEngine === 'paradee-mixed' && (
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="theme-muted text-[10px] mt-0.5 font-mono">
                    Paradee-8M (Narrator + Top 3 Cast) + Machine-TTS (5th+ Extras)
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-main)] font-bold border border-[var(--border-strong)] shadow-xs">
                  Hybrid Ready
                </span>
              </button>
            </div>
          </div>

          {/* 3-Tier AI Manuscript Parsers Status */}
          <div className="py-2 border-b border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold theme-heading">AI Manuscript Parsers</p>
                <p className="theme-muted text-[11px]">3-Tier Book Extraction & Dialogue Attribution</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-strong)] shadow-xs">
                Pluggable
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleSelectParser('heuristic')}
                className={`text-left p-2.5 rounded-xl theme-card border transition-all cursor-pointer shadow-xs ${
                  activeParser === 'heuristic'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold theme-heading text-[10px]">Heuristic</p>
                  {activeParser === 'heuristic' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                  )}
                </div>
                <p className="text-[9px] font-mono text-[var(--text-main)] mt-0.5">Local Ready</p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectParser('gemini')}
                className={`text-left p-2.5 rounded-xl theme-card border transition-all cursor-pointer shadow-xs ${
                  activeParser === 'gemini'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold theme-heading text-[10px]">Gemini AI</p>
                  {activeParser === 'gemini' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                  )}
                </div>
                <p
                  className={`text-[9px] font-mono mt-0.5 ${
                    modelStatus?.parsers?.gemini?.configured ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {modelStatus?.parsers?.gemini?.configured ? 'API Ready' : 'Fallback Mode'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectParser('unlimited-ocr')}
                className={`text-left p-2.5 rounded-xl theme-card border transition-all cursor-pointer shadow-xs ${
                  activeParser === 'unlimited-ocr'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold theme-heading text-[10px]">Vision OCR</p>
                  {activeParser === 'unlimited-ocr' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                  )}
                </div>
                <p
                  className={`text-[9px] font-mono mt-0.5 ${
                    modelStatus?.parsers?.['unlimited-ocr']?.reachable || modelStatus?.parsers?.unlimited_ocr?.reachable
                      ? 'text-[var(--text-main)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {modelStatus?.parsers?.['unlimited-ocr']?.reachable || modelStatus?.parsers?.unlimited_ocr?.reachable
                    ? 'vLLM Online'
                    : 'vLLM Offline'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectParser('ollama')}
                className={`text-left p-2.5 rounded-xl theme-card border transition-all cursor-pointer shadow-xs ${
                  activeParser === 'ollama'
                    ? 'border-[var(--text-main)] ring-1 ring-[var(--text-main)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold theme-heading text-[10px]">Ollama</p>
                  {activeParser === 'ollama' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                  )}
                </div>
                <p
                  className={`text-[9px] font-mono mt-0.5 ${
                    modelStatus?.parsers?.ollama?.available || modelStatus?.llm?.available
                      ? 'text-[var(--text-main)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {modelStatus?.parsers?.ollama?.available || modelStatus?.llm?.available
                    ? 'Local LLM'
                    : 'Offline'}
                </p>
              </button>
            </div>

            {/* Adjustable Parser Configuration Subpanel */}
            <div className="mt-2 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5">
              {activeParser === 'heuristic' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-[10px] uppercase tracking-wider theme-heading">
                      Heuristic Attribution Settings
                    </span>
                    <span className="text-[9px] font-mono theme-muted">Instant Local Rules</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="space-y-1 block">
                      <span className="block text-[10px] font-mono theme-muted">Attribution Mode</span>
                      <select
                        aria-label="Attribution Mode"
                        value={parserConfig.heuristic.sensitivity}
                        onChange={(e) =>
                          updateParserSection('heuristic', { sensitivity: e.target.value }, true)
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                      >
                        <option value="balanced">Balanced</option>
                        <option value="aggressive">Aggressive Turn-Taking</option>
                        <option value="strict">Strict Speech Tags</option>
                      </select>
                    </label>

                    <label className="space-y-1 block">
                      <span className="block text-[10px] font-mono theme-muted">Quote Detection</span>
                      <select
                        aria-label="Quote Detection"
                        value={parserConfig.heuristic.quoteStyle}
                        onChange={(e) =>
                          updateParserSection('heuristic', { quoteStyle: e.target.value }, true)
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                      >
                        <option value="auto">Auto</option>
                        <option value="double">Double Quotes</option>
                        <option value="single">Single &amp; Double</option>
                      </select>
                    </label>
                  </div>

                  <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                    <span className="text-[11px] font-mono theme-heading">Conversational Turn-Taking</span>
                    <input
                      type="checkbox"
                      aria-label="Conversational Turn-Taking"
                      checked={Boolean(parserConfig.heuristic.turnTaking)}
                      onChange={(e) =>
                        updateParserSection('heuristic', { turnTaking: e.target.checked }, true)
                      }
                      className="w-4 h-4 accent-[var(--text-main)] cursor-pointer"
                    />
                  </label>
                </>
              )}

              {activeParser === 'gemini' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-[10px] uppercase tracking-wider theme-heading">
                      Gemini AI Configuration
                    </span>
                    <span className="text-[9px] font-mono theme-muted">Cloud Dialogue LLM</span>
                  </div>

                  <label className="space-y-1 block">
                    <span className="block text-[10px] font-mono theme-muted">API Key</span>
                    <input
                      type="password"
                      aria-label="Gemini API Key"
                      value={parserConfig.gemini.apiKey}
                      onChange={(e) => updateParserSection('gemini', { apiKey: e.target.value })}
                      placeholder={parserConfig.gemini.hasKey ? 'AIza... (configured on server)' : 'AIza...'}
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="space-y-1 block">
                      <span className="block text-[10px] font-mono theme-muted">Model</span>
                      <select
                        aria-label="Gemini Model"
                        value={parserConfig.gemini.model}
                        onChange={(e) => updateParserSection('gemini', { model: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                      >
                        {GEMINI_MODELS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 block">
                      <span className="block text-[10px] font-mono theme-muted">
                        Temperature ({Number(parserConfig.gemini.temperature ?? 0.1).toFixed(1)})
                      </span>
                      <input
                        type="range"
                        aria-label="Gemini Temperature"
                        min="0"
                        max="0.7"
                        step="0.1"
                        value={parserConfig.gemini.temperature ?? 0.1}
                        onChange={(e) =>
                          updateParserSection('gemini', { temperature: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[var(--text-main)] cursor-pointer mt-1.5"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveAndTestParser('gemini')}
                    disabled={testingParser}
                    className="w-full py-1.5 px-3 rounded-lg text-[11px] font-mono font-bold uppercase bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--border-strong)] transition cursor-pointer disabled:opacity-50"
                  >
                    {testingParser ? 'Testing Gemini...' : 'Save & Test Gemini'}
                  </button>
                </>
              )}

              {activeParser === 'ollama' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-[10px] uppercase tracking-wider theme-heading">
                      Ollama Local LLM
                    </span>
                    <span className="text-[9px] font-mono theme-muted">Private Offline Attribution</span>
                  </div>

                  <label className="space-y-1 block">
                    <span className="block text-[10px] font-mono theme-muted">Endpoint URL</span>
                    <input
                      type="text"
                      aria-label="Ollama Endpoint URL"
                      value={parserConfig.ollama.url}
                      onChange={(e) => updateParserSection('ollama', { url: e.target.value })}
                      placeholder="http://localhost:11434"
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="space-y-1 block">
                      <span className="block text-[10px] font-mono theme-muted">Model Preset</span>
                      <select
                        aria-label="Ollama Model"
                        value={parserConfig.ollama.model}
                        onChange={(e) => updateParserSection('ollama', { model: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                      >
                        {ollamaModelOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 block">
                      <span className="block text-[10px] font-mono theme-muted">Custom Model Tag</span>
                      <input
                        type="text"
                        aria-label="Ollama Model ID"
                        value={parserConfig.ollama.model}
                        onChange={(e) => updateParserSection('ollama', { model: e.target.value })}
                        placeholder="llama3:8b"
                        className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveAndTestParser('ollama')}
                    disabled={testingParser}
                    className="w-full py-1.5 px-3 rounded-lg text-[11px] font-mono font-bold uppercase bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--border-strong)] transition cursor-pointer disabled:opacity-50"
                  >
                    {testingParser ? 'Probing Ollama...' : 'Save & Probe Ollama'}
                  </button>
                </>
              )}

              {activeParser === 'unlimited-ocr' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-[10px] uppercase tracking-wider theme-heading">
                      Vision OCR Server
                    </span>
                    <span className="text-[9px] font-mono theme-muted">Scanned PDFs &amp; Layouts</span>
                  </div>

                  <p className="text-[11px] theme-muted leading-snug">
                    Self-hosted OpenAI/vLLM Vision OCR for scanned PDFs
                  </p>

                  <label className="space-y-1 block">
                    <span className="block text-[10px] font-mono theme-muted">Endpoint URL</span>
                    <input
                      type="text"
                      aria-label="Vision OCR Endpoint URL"
                      value={parserConfig.ocr.baseUrl}
                      onChange={(e) => updateParserSection('ocr', { baseUrl: e.target.value })}
                      placeholder="http://localhost:8000/v1"
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="block text-[10px] font-mono theme-muted">Model ID</span>
                    <input
                      type="text"
                      aria-label="Vision OCR Model ID"
                      value={parserConfig.ocr.model}
                      onChange={(e) => updateParserSection('ocr', { model: e.target.value })}
                      placeholder="baidu/Unlimited-OCR"
                      className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSaveAndTestParser('unlimited-ocr')}
                    disabled={testingParser}
                    className="w-full py-1.5 px-3 rounded-lg text-[11px] font-mono font-bold uppercase bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] border border-[var(--border-strong)] transition cursor-pointer disabled:opacity-50"
                  >
                    {testingParser ? 'Probing OCR...' : 'Save & Probe OCR'}
                  </button>
                </>
              )}

              {parserActionStatus && (
                <p
                  role="status"
                  className={`text-[10px] font-mono px-2.5 py-1.5 rounded-lg border ${
                    parserActionStatus.state === 'ok'
                      ? 'bg-[var(--bg-card)] text-[var(--text-main)] border-[var(--border-strong)]'
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                  }`}
                >
                  {parserActionStatus.message}
                </p>
              )}
            </div>

            {currentChapterId && (
              <div className="pt-1 space-y-1.5">
                <button
                  type="button"
                  onClick={handleReparseChapter}
                  disabled={reparsingChapter}
                  className="w-full py-2 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] font-mono font-bold uppercase text-[11px] border border-[var(--border-strong)] transition cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <IconRefresh className={`w-3.5 h-3.5 ${reparsingChapter ? 'animate-spin' : ''}`} />
                  <span>{reparsingChapter ? 'Re-Parsing Chapter...' : 'Re-Parse Current Chapter'}</span>
                </button>
                {reparseStatus && (
                  <p
                    role="status"
                    className="text-[10px] font-mono text-[var(--text-sub)] px-2"
                  >
                    {reparseStatus.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Theme Option */}
          <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
            <div>
              <p className="font-semibold theme-heading">Color Theme</p>
              <p className="theme-muted text-[11px]">Choose light or dark appearance</p>
            </div>
            <div className="flex p-0.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold font-mono transition cursor-pointer ${
                  theme === 'dark' ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs' : 'theme-muted hover:text-[var(--text-main)]'
                }`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold font-mono transition cursor-pointer ${
                  theme === 'light' ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs' : 'theme-muted hover:text-[var(--text-main)]'
                }`}
              >
                Light
              </button>
            </div>
          </div>

          {/* Typography */}
          <div className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]">
            <div>
              <p className="font-semibold theme-heading">Book Font</p>
              <p className="theme-muted text-[11px]">Choose serif literature or clean sans</p>
            </div>
            <div className="flex p-0.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
              <button
                type="button"
                onClick={() => setFontFamily('serif')}
                className={`px-3 py-1 rounded-lg text-xs font-serif font-semibold transition cursor-pointer ${
                  fontFamily === 'serif' ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs' : 'theme-muted hover:text-[var(--text-main)]'
                }`}
              >
                Serif
              </button>
              <button
                type="button"
                onClick={() => setFontFamily('sans')}
                className={`px-3 py-1 rounded-lg text-xs font-sans font-semibold transition cursor-pointer ${
                  fontFamily === 'sans' ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs' : 'theme-muted hover:text-[var(--text-main)]'
                }`}
              >
                Sans
              </button>
            </div>
          </div>

          {/* Font Size */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-semibold theme-heading">Text Size</p>
              <p className="theme-muted text-[11px]">Adjust reading comfort</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={decreaseFontSize}
                className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono font-bold theme-muted hover:text-[var(--text-main)] transition cursor-pointer shadow-xs active:scale-95"
                aria-label="Decrease font size"
              >
                A-
              </button>
              <span className="font-mono font-bold text-xs theme-heading px-1">{fontSize}px</span>
              <button
                type="button"
                onClick={increaseFontSize}
                className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono font-bold theme-muted hover:text-[var(--text-main)] transition cursor-pointer shadow-xs active:scale-95"
                aria-label="Increase font size"
              >
                A+
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-mono font-bold uppercase rounded-full text-xs transition-all duration-200 cursor-pointer border border-[var(--accent)] shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.96]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
