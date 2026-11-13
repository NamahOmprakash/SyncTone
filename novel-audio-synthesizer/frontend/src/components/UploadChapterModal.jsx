import React, { useState, useEffect, useRef } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { api, ApiError } from '../services/api';
import { sanitizeTextWithTtsDomCleaner } from '../utils/ttsSanitizer';
import { IconUpload, IconX } from './icons';

export default function UploadChapterModal({ isOpen, novel, onClose, onChapterUploaded }) {
  const [title, setTitle] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [text, setText] = useState('');
  const [useTtsSanitizer, setUseTtsSanitizer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const triggerRef = useRef(null);
  const prefersReduced = useReducedMotion();

  const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
  const panelVariants = prefersReduced
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } };

  // Store trigger element on open; restore focus on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === 'Escape') { onClose(); if (triggerRef.current) triggerRef.current.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  if (!isOpen || !novel) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!text.trim()) {
      setError('Chapter text content is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const chapterText = useTtsSanitizer ? sanitizeTextWithTtsDomCleaner(text) : text;
      const payload = {
        title: title.trim() || undefined,
        text: chapterText.trim(),
        chapter_number: chapterNumber ? parseInt(chapterNumber, 10) : undefined,
      };

      const res = await api.novels.uploadChapter(novel.id, payload);
      if (res?.chapter) {
        if (onChapterUploaded) onChapterUploaded(res.chapter);
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message || 'Failed to upload chapter');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-chapter-modal-title"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.2 }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isUploading) onClose();
        }}
      >
        <m.div
          className="w-full max-w-xl bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border-strong)] overflow-hidden cursor-default"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h2 id="upload-chapter-modal-title" className="text-sm font-bold font-sans uppercase tracking-tight text-[var(--text-main)] flex items-center gap-2">
              <IconUpload className="w-4 h-4 text-[var(--text-main)]" />
              <span>Upload Chapter to {novel.title}</span>
            </h2>
            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
              Prose will be prepared for multi-voice performance with dialogue detection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
            aria-label="Close modal"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono">
          {error && (
            <div className="p-3 bg-[var(--bg-surface)] text-[var(--text-main)] text-xs rounded-xl border border-[var(--border-strong)]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5 text-[var(--text-sub)]">
                Chapter Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chapter 1: The Boy Who Lived"
                className="w-full px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-main)] transition text-[var(--text-main)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5 text-[var(--text-sub)]">
                Number (optional)
              </label>
              <input
                type="number"
                min="1"
                value={chapterNumber}
                onChange={(e) => setChapterNumber(e.target.value)}
                placeholder="Auto"
                className="w-full px-3 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-main)] transition text-[var(--text-main)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5 text-[var(--text-sub)]">
              Chapter Prose Text
            </label>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste raw prose text here. Quotes will be automatically detected and attributed to distinct character voices..."
              required
              className="w-full px-3.5 py-2.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-main)] transition font-serif leading-relaxed text-[var(--text-main)]"
            />
          </div>

          {/* TTS Sanitizer Toggle */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-start justify-between gap-3 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-sans uppercase text-[var(--text-main)]">TTS Prose Cleaner</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-[var(--bg-card)] text-[var(--text-sub)] border border-[var(--border-subtle)]">
                  Opt-in
                </span>
              </div>
              <p className="text-[11px] font-sans text-[var(--text-muted)] mt-0.5 leading-relaxed">
                Strips hidden noise, watermarks, ASCII dividers, and deduplicates paragraphs.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="chapter-tts-sanitizer-toggle"
              aria-checked={useTtsSanitizer}
              onClick={() => setUseTtsSanitizer((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                useTtsSanitizer ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  useTtsSanitizer ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-2 flex justify-end gap-3 font-mono">
            <button
              type="button"
              onClick={onClose}
              className="boxed-btn px-5 py-2 text-xs uppercase text-[var(--text-sub)] hover:text-[var(--text-main)] cursor-pointer rounded-full active:scale-[0.96] hover:scale-105 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="boxed-btn-primary px-6 py-2 text-xs uppercase cursor-pointer disabled:opacity-50 rounded-full shadow-md hover:shadow-lg active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-200"
            >
              {isSubmitting ? 'Ingesting...' : 'Upload & Parse Prose'}
            </button>
          </div>
        </form>
      </m.div>
    </m.div>
  </LazyMotion>
  );
}
