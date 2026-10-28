import React, { useState } from 'react';
import { api, ApiError } from '../services/api';
import { IconUpload, IconX } from './icons';

export default function UploadChapterModal({ isOpen, novel, onClose, onChapterUploaded }) {
  const [title, setTitle] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      const payload = {
        title: title.trim() || undefined,
        text: text.trim(),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-scrim-enter"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl theme-surface rounded-2xl shadow-2xl border overflow-hidden modal-panel-enter">
        <div className="p-6 border-b theme-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold theme-heading flex items-center gap-2">
              <IconUpload className="w-4 h-4 text-[var(--accent)]" />
              <span>Upload Chapter to {novel.title}</span>
            </h2>
            <p className="text-xs theme-muted mt-0.5">
              Prose will be prepared for multi-voice performance with dialogue detection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition"
            aria-label="Close modal"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl border border-rose-500/20">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
                Chapter Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chapter 1: The Boy Who Lived"
                className="w-full px-3.5 py-2 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
                Number (optional)
              </label>
              <input
                type="number"
                min="1"
                value={chapterNumber}
                onChange={(e) => setChapterNumber(e.target.value)}
                placeholder="Auto"
                className="w-full px-3.5 py-2 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold theme-sub uppercase tracking-wider mb-1.5 font-mono">
              Chapter Prose Text
            </label>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste raw prose text here. Quotes will be automatically detected and attributed to distinct character voices..."
              required
              className="w-full px-3.5 py-2.5 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition font-serif leading-relaxed"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 theme-card border rounded-xl text-xs font-semibold theme-muted hover:text-[var(--text-main)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? 'Ingesting...' : 'Upload & Parse Prose'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
