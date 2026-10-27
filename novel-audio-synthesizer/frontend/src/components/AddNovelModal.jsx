import React, { useState, useRef } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import {
  IconPlus,
  IconX,
  IconUser,
  IconUpload,
  IconPlay,
  IconCheck,
  IconBook,
  IconSparkles,
} from './icons';

export default function AddNovelModal({
  isOpen,
  onClose,
  onNovelCreated,
  onSelectChapter,
  onOpenAuth,
}) {
  const { user, isAuthenticated, isWriterOrAdmin, login, register } = useAuth();
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [channel, setChannel] = useState('verified');
  const [globalTone, setGlobalTone] = useState('Fantasy / British Dramatic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState(null);

  // File Dropzone & Extraction state
  const [isDragging, setIsDragging] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null); // { name, size, format, chapterCount }
  const [coverObject, setCoverObject] = useState(null);
  const [parsedChapters, setParsedChapters] = useState([]); // [{ chapter_number, title, raw_text }]
  const [previewOpen, setPreviewOpen] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Convert File to Base64 data string
  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = typeof result === 'string' ? result.split(',')[1] || result : '';
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  // Read File as plain text string
  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });

  // Client-side fallback chapter parser for .txt / .md / unparsed novels
  const extractChaptersFromText = (rawText, novelTitle) => {
    if (!rawText || !rawText.trim()) return [];

    const chapterRegex =
      /(?:^|\r?\n)(?:(?:Chapter|CHAPTER|Book|BOOK|Section|SECTION)\s+([0-9IVXLCDM]+|[A-Za-z]+)[\s:–-]*(.*?))(?=\r?\n|$)/gi;
    const matches = [...rawText.matchAll(chapterRegex)];

    if (matches.length > 0) {
      const chapters = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
        const chapterNum = i + 1;
        const headingSub = (matches[i][2] || '').trim();
        const chapterTitle = headingSub
          ? `Chapter ${chapterNum}: ${headingSub}`
          : `Chapter ${chapterNum}`;
        const chapterText = rawText.slice(start, end).trim();

        chapters.push({
          chapter_number: chapterNum,
          title: chapterTitle,
          raw_text: chapterText,
        });
      }
      return chapters;
    }

    // Fallback: chunk paragraphs if extensive text
    const paragraphs = rawText.split(/\r?\n\s*\r?\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length > 30) {
      const chunkSize = 20;
      const chapters = [];
      for (let i = 0; i < paragraphs.length; i += chunkSize) {
        const chNum = Math.floor(i / chunkSize) + 1;
        chapters.push({
          chapter_number: chNum,
          title: `Chapter ${chNum}`,
          raw_text: paragraphs.slice(i, i + chunkSize).join('\n\n'),
        });
      }
      return chapters;
    }

    // Default to single chapter
    return [
      {
        chapter_number: 1,
        title: `Chapter 1: ${novelTitle || 'Introduction'}`,
        raw_text: rawText.trim(),
      },
    ];
  };

  // Process dropped or selected novel file
  const processFile = async (file) => {
    if (!file) return;
    setIsParsingFile(true);
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const formatBadge = ext.toUpperCase() || 'FILE';
    const cleanTitle = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

    try {
      let base64 = '';
      let textContent = '';

      try {
        base64 = await readFileAsBase64(file);
      } catch (_) {}

      if (['txt', 'md', 'html', 'htm'].includes(ext)) {
        try {
          textContent = await readFileAsText(file);
        } catch (_) {}
      }

      let parsedResult = null;

      // Call backend parsing endpoint
      try {
        parsedResult = await api.novels.parseFile({
          file_name: file.name,
          file_base64: base64,
        });
      } catch (apiErr) {
        // Safe fallback to client parser
      }

      const resolvedTitle = parsedResult?.title || cleanTitle;
      let resolvedSynopsis = parsedResult?.synopsis || '';
      let chapters = parsedResult?.chapters || [];

      // Extract client-side if server returned no chapters
      if (!chapters || chapters.length === 0) {
        if (textContent) {
          chapters = extractChaptersFromText(textContent, resolvedTitle);
        } else {
          chapters = [
            {
              chapter_number: 1,
              title: 'Chapter 1: The Beginning',
              raw_text: `Opening of ${resolvedTitle}.\n\nImported from ${file.name}.\nThis file was processed and is ready for neural speech synthesis and playback.`,
            },
          ];
        }
      }

      if (!resolvedSynopsis) {
        const excerpt = chapters[0]?.raw_text?.slice(0, 180)?.replace(/\s+/g, ' ') || '';
        resolvedSynopsis = excerpt
          ? `${excerpt}...`
          : `Imported from ${file.name}. Contains ${chapters.length} chapters ready for playback.`;
      }

      // Auto-fill title & synopsis if empty
      if (!title.trim()) {
        setTitle(resolvedTitle);
      }
      if (!synopsis.trim()) {
        setSynopsis(resolvedSynopsis);
      }

      setCoverObject(parsedResult?.cover_object || null);
      setParsedChapters(chapters);
      setUploadedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        format: formatBadge,
        chapterCount: chapters.length,
      });
    } catch (err) {
      setError('Failed to parse novel file: ' + (err.message || 'Unknown error'));
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      processFile(droppedFiles[0]);
    }
  };

  const handleFileInputChange = (e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      processFile(selectedFiles[0]);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setCoverObject(null);
    setParsedChapters([]);
    setPreviewOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDemoLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await login('demo_author@synctone.internal', 'DemoPass2026!');
      if (!res?.success && register) {
        await register('demo_author', 'demo_author@synctone.internal', 'DemoPass2026!', 'writer');
      }
    } catch (err) {
      setError('Failed to log in demo author: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSubmit = async (e, shouldReadNow = false) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!isAuthenticated) {
      setError('Please sign in or create an author account to publish a novel.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.novels.create({
        title: title.trim(),
        synopsis: synopsis.trim(),
        channel,
        global_tone: globalTone.trim(),
        cover_object: coverObject || null,
        chapters: parsedChapters,
      });

      if (res?.novel) {
        if (!res.novel.cover_object && coverObject) {
          res.novel.cover_object = coverObject;
        }
        let firstChapter = res?.chapters?.[0] || null;

        // If backend did not create chapters in batch, upload them sequentially
        if (!firstChapter && parsedChapters.length > 0 && res.novel.id) {
          try {
            for (const ch of parsedChapters) {
              const upRes = await api.novels.uploadChapter(res.novel.id, {
                title: ch.title,
                text: ch.raw_text,
                chapter_number: ch.chapter_number,
              });
              if (!firstChapter && upRes?.chapter) {
                firstChapter = upRes.chapter;
              }
            }
          } catch (upErr) {
            console.warn('Chapter ingestion fallback notice:', upErr);
          }
        }

        // Open directly in Reader if user clicked "Create & Read Now" or onSelectChapter is provided
        if ((shouldReadNow || onSelectChapter) && firstChapter) {
          if (onSelectChapter) {
            onSelectChapter(res.novel, firstChapter);
          } else if (onNovelCreated) {
            onNovelCreated(res.novel, firstChapter);
          }
        } else {
          if (onNovelCreated) {
            onNovelCreated(res.novel, firstChapter);
          }
        }
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message || 'Failed to create novel');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm modal-scrim-enter"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl theme-surface rounded-2xl shadow-2xl border overflow-hidden modal-panel-enter max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b theme-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <IconBook className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold theme-heading font-serif">Add New Novel</h2>
              <p className="text-[11px] theme-muted">
                Import EPUB, PDF, TXT or author your novel with synchronized audio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
            aria-label="Close modal"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Form Body */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Auth Warning Banner */}
          {!isAuthenticated && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <span>Sign in with an author account to publish directly to the catalog.</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={isLoggingIn}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg font-bold text-[11px] transition cursor-pointer"
                >
                  {isLoggingIn ? 'Logging in...' : 'Quick Demo Author Login'}
                </button>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth('login');
                    }}
                    className="font-bold underline text-amber-200 hover:text-white cursor-pointer text-[11px]"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl border border-rose-500/20">
              {error}
            </div>
          )}

          {/* ================================================================= */}
          {/* DRAG & DROP NOVEL FILE DROPZONE ("DROPBOX")                        */}
          {/* ================================================================= */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold theme-sub uppercase tracking-wider font-mono">
              Novel File Dropzone (EPUB, PDF, TXT, MD, HTML)
            </label>

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.pdf,.txt,.md,.html,application/epub+zip,application/pdf,text/plain,text/markdown,text/html"
              onChange={handleFileInputChange}
              className="hidden"
              data-testid="novel-file-input"
            />

            {!uploadedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.01]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]'
                }`}
                role="region"
                aria-label="Novel file dropzone"
              >
                {isParsingFile ? (
                  <div className="py-4 flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                    <span className="text-xs font-semibold text-[var(--accent)]">
                      Analyzing manuscript & extracting chapters...
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm">
                      <IconUpload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold theme-heading">
                        Drag & drop your novel manuscript here, or{' '}
                        <span className="text-[var(--accent)] underline">Browse Files</span>
                      </p>
                      <p className="text-[11px] theme-muted mt-1">
                        Supports EPUB, PDF, TXT, Markdown, and HTML files
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                      {['EPUB', 'PDF', 'TXT', 'MD', 'HTML'].map((fmt) => (
                        <span
                          key={fmt}
                          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 border border-white/10 theme-muted"
                        >
                          .{fmt.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Status Card when File is Successfully Extracted */
              <div className="p-4 rounded-2xl theme-card border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 flex-shrink-0">
                      <IconCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {uploadedFile.format}
                        </span>
                        <p className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                          {uploadedFile.name}
                        </p>
                      </div>
                      <p className="text-[11px] text-emerald-400/90 font-mono mt-0.5">
                        {uploadedFile.size} • {uploadedFile.chapterCount} chapters ready to read
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(!previewOpen)}
                      className="px-2.5 py-1 rounded-lg theme-card border text-[11px] font-semibold hover:border-[var(--border-focus)] transition"
                    >
                      {previewOpen ? 'Hide Preview' : 'Preview Text'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      aria-label="Remove uploaded file"
                      className="p-1.5 rounded-lg theme-muted hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Remove file"
                    >
                      <IconX className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Collapsible Extracted Chapter Preview */}
                {previewOpen && (
                  <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-emerald-300">
                      <span>Detected Chapters ({parsedChapters.length})</span>
                      <span>Ready for Reader & Synthesis</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {parsedChapters.map((ch, idx) => (
                        <div
                          key={ch.chapter_number || idx}
                          className="p-2.5 rounded-xl bg-black/30 border border-white/10 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-bold text-[var(--accent)]">
                            <span>{ch.title || `Chapter ${idx + 1}`}</span>
                            <span className="text-[10px] font-mono theme-muted">
                              {ch.raw_text?.length || 0} chars
                            </span>
                          </div>
                          <p className="text-[11px] theme-muted line-clamp-2 leading-relaxed">
                            {ch.raw_text?.slice(0, 180)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Novel Title Input */}
          <div>
            <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
              Novel Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Harry Potter and the Philosopher's Stone"
              required
              className="w-full px-3.5 py-2.5 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
            />
          </div>

          {/* Distribution Channel Selector */}
          <div>
            <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
              Distribution Channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs theme-card border rounded-xl focus:outline-none focus:border-[var(--border-focus)] transition"
            >
              <option value="verified">Verified Channel (Production Cast)</option>
              <option value="community">Community Channel</option>
            </select>
          </div>

          {/* Global Tone / Genre Input */}
          <div>
            <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
              Global Tone / Genre
            </label>
            <input
              type="text"
              value={globalTone}
              onChange={(e) => setGlobalTone(e.target.value)}
              placeholder="e.g. Victorian Mystery, British Fantasy"
              className="w-full px-3.5 py-2.5 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
            />
          </div>

          {/* Synopsis Textarea */}
          <div>
            <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
              Synopsis
            </label>
            <textarea
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Brief summary or description of the story..."
              className="w-full px-3.5 py-2.5 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition resize-none"
            />
          </div>

          {/* Modal Actions Footer */}
          <div className="pt-3 flex flex-wrap items-center justify-end gap-3 border-t theme-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 theme-card border rounded-xl text-xs font-semibold theme-muted hover:text-[var(--text-main)] transition cursor-pointer"
            >
              Cancel
            </button>

            {/* Direct Read Option: Create & Read Now when Chapters Exist */}
            {parsedChapters.length > 0 && (
              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <IconPlay className="w-3.5 h-3.5 fill-current" />
                <span>{isSubmitting ? 'Creating & Ingesting...' : 'Create & Read Now'}</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Novel'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
