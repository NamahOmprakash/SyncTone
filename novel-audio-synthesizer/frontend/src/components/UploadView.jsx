import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api, ApiError } from '../services/api';
import { parseEbookWithFoliate, parsePdfWithPdfJs, extractChaptersFromText } from '../utils/ebookParser';
import {
  buildCanonicalVoiceGroups,
  VoiceOptionGroups,
  normalizeParsedCharacters,
  encodeUtf8Base64,
  useVoiceAudition,
} from './VoicesView';
import {
  IconUpload,
  IconBook,
  IconSparkles,
  IconRefresh,
  IconCheck,
  IconX,
  IconUser,
  IconPlay,
  IconPause,
} from './icons';

const PARSER_ENGINE_OPTIONS = [
  { id: 'heuristic', label: 'Heuristic (Fast Local Rules)' },
  { id: 'gemini', label: 'Gemini AI (Cloud Dialogue LLM)' },
  { id: 'ollama', label: 'Ollama (Local LLM Attribution)' },
  { id: 'unlimited-ocr', label: 'Vision OCR (Scanned PDF / vLLM)' },
];

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readStoredParserConfig() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('synctone_parser_config');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export default function UploadView({
  onNovelCreated,
  onSelectChapter,
  onOpenAuth,
  onNavigate,
  defaultParserEngine: propParserEngine,
  onSelectParserEngine,
}) {
  const { user, isAuthenticated, isWriterOrAdmin, login, register } = useAuth();

  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [parseError, setParseError] = useState(null);

  const [localParserEngine, setLocalParserEngine] = useState(() => {
    try {
      return (typeof localStorage !== 'undefined' && localStorage.getItem('synctone_parser_engine')) || 'heuristic';
    } catch (_) {
      return 'heuristic';
    }
  });
  const parserEngine = propParserEngine || localParserEngine;
  const [parserConfig, setParserConfig] = useState(readStoredParserConfig);

  // Form Fields
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [globalTone, setGlobalTone] = useState('Victorian Mystery');
  const [channel, setChannel] = useState('community');
  const [parsedChapters, setParsedChapters] = useState([]);
  const [parsedCharacters, setParsedCharacters] = useState([]);
  const [coverUrl, setCoverUrl] = useState('');

  const {
    playingId: auditionPlayingId,
    loadingId: auditionLoadingId,
    auditionError,
    setAuditionError,
    toggleAudition,
  } = useVoiceAudition();

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [quickLoginLoading, setQuickLoginLoading] = useState(false);

  const fileInputRef = useRef(null);
  const parserEngineRef = useRef(parserEngine);
  const parserConfigRef = useRef(parserConfig);
  parserEngineRef.current = parserEngine;
  parserConfigRef.current = parserConfig;

  React.useEffect(() => {
    let cancelled = false;
    const maybePromise = api.status?.getParserConfig?.();
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise
        .then((res) => {
          if (cancelled || !res) return;
          const nextCfg = res.config && typeof res.config === 'object' ? res.config : res;
          setParserConfig(nextCfg);
          try {
            localStorage.setItem('synctone_parser_config', JSON.stringify(nextCfg));
          } catch (_) {}
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const handleParserEngineChange = (nextEngine) => {
    setLocalParserEngine(nextEngine);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('synctone_parser_engine', nextEngine);
      }
    } catch (_) {}
    onSelectParserEngine?.(nextEngine);
  };

  // Quick 1-click Demo Writer Login for testing/guest access (auto-registers if account missing)
  const handleQuickDemoLogin = async () => {
    setQuickLoginLoading(true);
    setSubmitError(null);
    try {
      const loginRes = await login('demo_writer@synctone.internal', 'demo1234');
      if (!loginRes?.success) {
        if (typeof register === 'function') {
          const regRes = await register('Demo Writer', 'demo_writer@synctone.internal', 'demo1234', 'writer');
          if (!regRes?.success) {
            setSubmitError(regRes?.error || 'Quick demo writer sign-in failed. Please use standard Sign In.');
          }
        } else {
          setSubmitError(loginRes?.error || 'Quick demo writer sign-in failed. Please use standard Sign In.');
        }
      }
    } catch (_) {
      try {
        if (typeof register === 'function') {
          const regRes = await register('Demo Writer', 'demo_writer@synctone.internal', 'demo1234', 'writer');
          if (!regRes?.success) {
            setSubmitError(regRes?.error || 'Quick demo writer sign-in failed. Please use standard Sign In.');
          }
        } else {
          setSubmitError('Quick demo writer sign-in failed. Please use standard Sign In.');
        }
      } catch (err) {
        setSubmitError('Quick demo writer sign-in failed. Please use standard Sign In.');
      }
    } finally {
      setQuickLoginLoading(false);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setParseProgress('Analyzing manuscript container...');

    try {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      const activeParserEngine = parserEngineRef.current || 'heuristic';
      const activeParserConfig = parserConfigRef.current || readStoredParserConfig();
      let extractedData = null;

      // Run backend parser first across all 4 engines (heuristic, gemini, ollama, unlimited-ocr)
      if (typeof api.novels?.parseFile === 'function') {
        setParseProgress(`Extracting & attributing manuscript via ${activeParserEngine}...`);
        try {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('parser_engine', activeParserEngine);
          if (activeParserConfig) {
            formData.append('parser_config', JSON.stringify(activeParserConfig));
          }
          extractedData = await api.novels.parseFile(formData, activeParserEngine, activeParserConfig);
        } catch (uploadErr) {
          if (selectedFile.size < 50 * 1024 * 1024) {
            try {
              const base64 = await readFileAsBase64(selectedFile);
              extractedData = await api.novels.parseFile(
                {
                  file_name: selectedFile.name,
                  file_base64: base64,
                  parser_engine: activeParserEngine,
                  ...(activeParserConfig ? { parser_config: activeParserConfig } : {}),
                },
                activeParserEngine,
                activeParserConfig
              );
            } catch (_) {}
          }
        }
      }

      if (!extractedData || !Array.isArray(extractedData.chapters) || extractedData.chapters.length === 0) {
        if (ext === 'pdf') {
          setParseProgress('Extracting text chapters via PDF.js...');
          extractedData = await parsePdfWithPdfJs(selectedFile, api.novels.uploadAsset);
        } else if (['epub', 'mobi', 'azw3', 'fb2'].includes(ext)) {
          setParseProgress('Extracting book structure via Foliate parser...');
          extractedData = await parseEbookWithFoliate(selectedFile, api.novels.uploadAsset);
        } else {
          // Plain text / markdown fallback
          setParseProgress('Parsing plain text chapters...');
          const text = await selectedFile.text();
          const rawChapters = text.split(/(?=^Chapter\s+\d+|^PART\s+\d+|^BOOK\s+\d+)/gmi);
          extractedData = {
            title: selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            author: user?.username || 'SyncTone Author',
            chapters: rawChapters.map((ch, idx) => {
              const body = ch.trim() || 'Chapter text preview.';
              return {
                chapter_number: idx + 1,
                title: `Chapter ${idx + 1}`,
                raw_text: body,
                text: body,
                content: body,
              };
            }),
          };
        }
      }

      if (extractedData) {
        if (extractedData.title && !title) setTitle(extractedData.title);
        if (extractedData.synopsis && !synopsis) setSynopsis(extractedData.synopsis);
        if (extractedData.cover_object) setCoverUrl(extractedData.cover_object);
        const resolvedChapters =
          Array.isArray(extractedData.chapters) && extractedData.chapters.length > 0
            ? extractedData.chapters
            : [
                { chapter_number: 1, title: 'Chapter 1', raw_text: 'Extracted chapter prose.', text: 'Extracted chapter prose.', content: 'Extracted chapter prose.' },
              ];
        setParsedChapters(resolvedChapters);
        setParsedCharacters(normalizeParsedCharacters(extractedData.characters, resolvedChapters));
      }
    } catch (err) {
      console.warn('[Upload Studio Parser Warning]:', err);
      setParseError(err.message || 'Could not parse manuscript automatically. You can still enter details manually.');
      // Graceful fallback
      if (!title) setTitle(selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      if (parsedChapters.length === 0) {
        setParsedChapters([
          { chapter_number: 1, title: 'Chapter 1', raw_text: 'Manual manuscript upload.', text: 'Manual manuscript upload.', content: 'Manual manuscript upload.' },
        ]);
      }
      setParsedCharacters((prev) => (prev.length > 0 ? prev : normalizeParsedCharacters([])));
    } finally {
      setIsParsing(false);
      setParseProgress('');
    }
  };

  const handleParsePastedText = async () => {
    const sourceText =
      pastedText.trim() ||
      parsedChapters.map((c) => c.raw_text || c.text || c.content || '').filter(Boolean).join('\n\n') ||
      synopsis.trim();

    if (!sourceText) {
      setParseError('Paste manuscript text or upload a file first to detect characters.');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    const activeParserEngine = parserEngineRef.current || 'heuristic';
    const activeParserConfig = parserConfigRef.current || readStoredParserConfig();
    setParseProgress(`Parsing text & detecting characters via ${activeParserEngine}...`);

    try {
      let extractedData = null;
      const safeName = `${(title || 'manuscript').trim().replace(/[^a-z0-9_-]+/gi, '_')}.txt`;

      if (typeof api.novels?.parseFile === 'function') {
        try {
          extractedData = await api.novels.parseFile(
            {
              file_name: safeName,
              file_base64: encodeUtf8Base64(sourceText),
              parser_engine: activeParserEngine,
              ...(activeParserConfig ? { parser_config: activeParserConfig } : {}),
            },
            activeParserEngine,
            activeParserConfig
          );
        } catch (_) {}
      }

      if (!extractedData || !Array.isArray(extractedData.chapters) || extractedData.chapters.length === 0) {
        const chapters = extractChaptersFromText(sourceText, title || 'Manuscript');
        extractedData = { title: title || 'Manuscript', chapters, characters: [] };
      }

      const resolvedChapters = extractedData.chapters.map((ch, idx) => {
        const body = ch.raw_text || ch.text || ch.content || '';
        return {
          ...ch,
          chapter_number: ch.chapter_number || idx + 1,
          title: ch.title || `Chapter ${idx + 1}`,
          raw_text: body,
          text: body,
          content: body,
        };
      });

      setParsedChapters(resolvedChapters);
      setParsedCharacters(normalizeParsedCharacters(extractedData.characters, resolvedChapters));
      if (extractedData.title && !title) setTitle(extractedData.title);
    } catch (err) {
      setParseError(err?.message || 'Failed to parse pasted manuscript text.');
    } finally {
      setIsParsing(false);
      setParseProgress('');
    }
  };

  const handleCharacterUpdate = (charId, patch) => {
    setParsedCharacters((prev) =>
      prev.map((c) => (c.character_id === charId ? { ...c, ...patch } : c))
    );
  };

  const baseVoiceGroups = useMemo(() => buildCanonicalVoiceGroups({}), []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setSubmitError('Please enter a novel title.');
      return;
    }

    if (!isAuthenticated) {
      setSubmitError('Authentication required. Please sign in or click "Quick Demo Writer" to publish manuscripts.');
      if (onOpenAuth) onOpenAuth('login');
      return;
    }

    if (user?.role === 'reader') {
      setSubmitError("Your account has role 'reader'. Only writers and admins can publish manuscripts.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const activeParserConfig = parserConfigRef.current || readStoredParserConfig();
      const payload = {
        title: title.trim(),
        synopsis: synopsis.trim() || 'Dramatic multi-voice audio adaptation.',
        global_tone: globalTone,
        channel,
        portfolio_source: 'manual',
        cover_object: coverUrl || null,
        parser_engine: parserEngine,
        ...(activeParserConfig ? { parser_config: activeParserConfig } : {}),
        characters: parsedCharacters,
        chapters: (parsedChapters.length > 0
          ? parsedChapters
          : [
              {
                chapter_number: 1,
                title: 'Chapter 1',
                raw_text: pastedText.trim() || synopsis.trim() || 'Initial manuscript prose.',
                text: pastedText.trim() || synopsis.trim() || 'Initial manuscript prose.',
                content: pastedText.trim() || synopsis.trim() || 'Initial manuscript prose.',
              },
            ]
        ).map((c, i) => {
          const body = c.raw_text || c.text || c.content || 'Chapter text.';
          return {
            chapter_number: c.chapter_number || i + 1,
            title: c.title || `Chapter ${i + 1}`,
            raw_text: body,
            text: body,
            content: body,
            ...(Array.isArray(c.segments) && c.segments.length > 0 ? { segments: c.segments } : {}),
          };
        }),
      };

      const res = await api.novels.create(payload);
      setSubmitSuccess('Novel uploaded and registered successfully!');

      if (onNovelCreated) {
        onNovelCreated(res.novel, res.chapters?.[0]);
      } else if (onNavigate && res.novel?.id) {
        onNavigate('details', res.novel.id);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to upload novel. Please verify connection.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-20">
      {/* 1. Header Banner */}
      <section className="p-6 sm:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-[11px] font-mono tracking-wider uppercase border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)] rounded-full shadow-xs">
                PUBLISHING PORTAL
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase bg-[var(--bg-surface)] text-[var(--text-sub)] border border-[var(--border-subtle)] rounded-full">
                EPUB • PDF • TXT • MOBI
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-sans uppercase tracking-tight text-[var(--text-main)]">
              Upload Studio
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-sub)] font-mono max-w-xl leading-relaxed">
              Import full manuscripts to synthesize multi-speaker neural audiobooks with synchronized sentence read-along.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isAuthenticated && (
              <button
                type="button"
                onClick={handleQuickDemoLogin}
                disabled={quickLoginLoading}
                className="boxed-btn-primary px-4 py-2 text-xs font-mono uppercase inline-flex items-center gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all shadow-md hover:scale-105"
              >
                <IconUser className="w-3.5 h-3.5" />
                <span>{quickLoginLoading ? 'Signing In...' : 'Quick Demo Writer'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Guest helper notice if unauthenticated */}
        {!isAuthenticated && (
          <div className="mt-4 p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs font-mono flex-wrap">
            <span className="text-[var(--text-sub)]">
              ℹ Browsing as Guest. Click <strong>Quick Demo Writer</strong> or <strong>Sign In</strong> to publish manuscripts.
            </span>
            {onOpenAuth && (
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="text-[var(--accent)] hover:underline uppercase font-bold cursor-pointer"
              >
                Sign In →
              </button>
            )}
          </div>
        )}
      </section>

      {/* 2. Drag & Drop File Upload Zone */}
      <section className="space-y-4">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
            dragActive
              ? 'border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]'
              : file
              ? 'border-[var(--text-main)] bg-[var(--bg-card)]'
              : 'border-[var(--border-strong)] bg-[var(--bg-card)]/50 hover:border-[var(--text-main)] hover:bg-[var(--bg-card)]'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Upload manuscript file"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.pdf,.txt,.mobi,.azw3,.fb2"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-main)] shadow-sm">
            <IconUpload className="w-8 h-8" />
          </div>

          {file ? (
            <div className="space-y-2">
              <span className="px-3 py-1 text-[11px] font-mono uppercase bg-[var(--accent)] text-[var(--on-accent)] font-bold rounded-full">
                MANUSCRIPT SELECTED
              </span>
              <h3 className="text-base font-bold font-sans uppercase text-[var(--text-main)] mt-2">
                {file.name}
              </h3>
              <p className="text-xs text-[var(--text-sub)] font-mono">
                {Math.round(file.size / 1024)} KB • Click or drop new file to replace
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold font-sans uppercase text-[var(--text-main)]">
                Drag & Drop Manuscript Here
              </h3>
              <p className="text-xs text-[var(--text-sub)] font-mono max-w-sm mx-auto">
                Supports EPUB, PDF, TXT, MOBI, AZW3, and FB2. We automatically parse chapters and character dialogue.
              </p>
              <div className="pt-2">
                <span className="boxed-btn px-4 py-2 text-xs font-mono uppercase rounded-full inline-block">
                  Browse File
                </span>
              </div>
            </div>
          )}

          {isParsing && (
            <div className="mt-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] inline-flex items-center gap-2 text-xs font-mono text-[var(--text-main)] animate-pulse">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              <span>{parseProgress || 'Parsing manuscript...'}</span>
            </div>
          )}

          {parseError && (
            <p className="mt-3 text-xs text-[var(--danger)] font-mono">{parseError}</p>
          )}
        </div>
      </section>

      {/* 3. Manuscript Metadata & Chapter Configuration Form */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl space-y-6">
        <div className="space-y-1">
          <span className="mono-xs text-[var(--text-muted)]">// MANUSCRIPT SPECIFICATIONS</span>
          <h2 className="text-lg font-bold font-sans uppercase text-[var(--text-main)]">
            Volume Information
          </h2>
        </div>

        {submitError && (
          <div className="p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-mono">
            {submitError}
          </div>
        )}

        {submitSuccess && (
          <div className="p-4 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)] text-xs font-mono">
            {submitSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase text-[var(--text-sub)]">
              Novel Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Picture of Dorian Gray"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--text-main)] font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase text-[var(--text-sub)]">
              Dramatic Genre / Global Tone
            </label>
            <select
              value={globalTone}
              onChange={(e) => setGlobalTone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--text-main)] font-mono"
            >
              <option value="Victorian Mystery">Victorian Mystery</option>
              <option value="British Fantasy">British Fantasy</option>
              <option value="High Fantasy">High Fantasy</option>
              <option value="Gothic Horror">Gothic Horror</option>
              <option value="Dystopian Political Fiction">Dystopian Political Fiction</option>
              <option value="Jazz Age Fiction">Jazz Age Fiction</option>
              <option value="Regency Romance">Regency Romance</option>
              <option value="Philosophical Fable">Philosophical Fable</option>
              <option value="Epic Maritime Fiction">Epic Maritime Fiction</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono uppercase text-[var(--text-sub)]">
            Synopsis / Editorial Blurb
          </label>
          <textarea
            rows={3}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="A short overview of the narrative for catalog readers and listeners..."
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--text-main)] font-sans"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase text-[var(--text-sub)]">
              Catalog Channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--text-main)] font-mono"
            >
              <option value="community">Community Archive (Open Access)</option>
              <option value="verified">Verified Repertory (Curated Classics)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="upload-parser-engine"
              className="text-xs font-mono uppercase text-[var(--text-sub)]"
            >
              AI Manuscript Parser
            </label>
            <select
              id="upload-parser-engine"
              aria-label="AI Manuscript Parser"
              value={parserEngine}
              onChange={(e) => handleParserEngineChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--text-main)] font-mono"
            >
              {PARSER_ENGINE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase text-[var(--text-sub)]">
              Extracted Chapters ({parsedChapters.length})
            </label>
            <div className="px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-sub)] flex items-center justify-between">
              <span>{parsedChapters.length} Tracks Ready</span>
              <span className="text-[10px] text-[var(--text-main)] font-bold">● PARSED</span>
            </div>
          </div>
        </div>

        {/* Paste Manuscript Text & Parse Characters */}
        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label htmlFor="upload-pasted-text" className="text-xs font-mono uppercase text-[var(--text-sub)]">
              Paste Manuscript Text (Optional)
            </label>
            <button
              type="button"
              onClick={handleParsePastedText}
              disabled={isParsing}
              className="boxed-btn px-3.5 py-1.5 text-[11px] font-mono uppercase inline-flex items-center gap-1.5 rounded-full cursor-pointer disabled:opacity-50"
            >
              <IconSparkles className="w-3.5 h-3.5" />
              <span>{isParsing ? 'Parsing...' : 'Parse & Detect Characters'}</span>
            </button>
          </div>
          <textarea
            id="upload-pasted-text"
            rows={4}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste chapter prose and dialogue here to detect characters and assign voices before publishing..."
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--text-main)] font-sans"
          />
        </div>

        {/* Detected Characters & Voice Assignment Panel */}
        {parsedCharacters.length > 0 && (
          <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] block">
                  // PRE-PUBLISH VOICE CAST
                </span>
                <h3 className="text-sm font-bold font-sans uppercase text-[var(--text-main)]">
                  Detected Characters &amp; Voice Assignment ({parsedCharacters.length})
                </h3>
              </div>
              {auditionError && (
                <button
                  type="button"
                  onClick={() => setAuditionError(null)}
                  className="text-[10px] font-mono text-[var(--text-main)] underline cursor-pointer"
                >
                  {auditionError}
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {parsedCharacters.map((char) => {
                const groups = buildCanonicalVoiceGroups({}, [char.voice_id]);
                const auditionKey = `upload:${char.character_id}`;
                const isPlaying = auditionPlayingId === auditionKey;
                const isLoading = auditionLoadingId === auditionKey;

                return (
                  <div
                    key={char.character_id}
                    className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold font-sans uppercase text-[var(--text-main)] truncate">
                          {char.name}
                        </span>
                        {char.is_narrator && (
                          <span className="px-2 py-0.5 text-[9px] font-mono font-bold rounded-full bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-main)]">
                            NARRATOR
                          </span>
                        )}
                        {char.line_count > 0 && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {char.line_count} line{char.line_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {char.sample_quote && (
                        <p className="text-[11px] font-serif italic text-[var(--text-sub)] line-clamp-1">
                          &ldquo;{char.sample_quote}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        aria-label={`Gender for ${char.name}`}
                        value={char.gender || 'unknown'}
                        onChange={(e) => handleCharacterUpdate(char.character_id, { gender: e.target.value })}
                        className="px-2 py-1 rounded-lg text-[11px] font-mono bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="neutral">Neutral</option>
                      </select>

                      <select
                        aria-label={`Voice for ${char.name}`}
                        value={char.voice_id}
                        onChange={(e) => handleCharacterUpdate(char.character_id, { voice_id: e.target.value })}
                        className="max-w-[200px] px-2.5 py-1 rounded-lg text-[11px] font-mono bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-strong)] focus:outline-none focus:border-[var(--text-main)]"
                      >
                        <VoiceOptionGroups groups={groups} />
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          toggleAudition({
                            key: auditionKey,
                            voiceId: char.voice_id,
                            text: char.sample_quote || `Hello, I am ${char.name}.`,
                            characterId: char.character_id,
                            speakerName: char.name,
                            isNarrator: Boolean(char.is_narrator),
                            gender: char.gender || '',
                          })
                        }
                        className="boxed-btn px-2.5 py-1 text-[10px] font-mono uppercase inline-flex items-center gap-1 rounded-full cursor-pointer"
                        aria-label={`Audition voice for ${char.name}`}
                      >
                        {isLoading ? (
                          <>
                            <IconRefresh className="w-3 h-3 animate-spin" />
                            <span>Loading</span>
                          </>
                        ) : isPlaying ? (
                          <>
                            <IconPause className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <IconPlay className="w-3 h-3 fill-current" />
                            <span>Audition</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="boxed-btn-primary px-7 py-3 text-xs font-mono uppercase font-bold tracking-wider inline-flex items-center gap-2 cursor-pointer rounded-full shadow-md hover:scale-[1.03] active:scale-[0.96] transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                <span>Creating Volume...</span>
              </>
            ) : (
              <>
                <IconSparkles className="w-4 h-4" />
                <span>Publish & Synthesize Audio</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
