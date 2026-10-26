import React, { useState } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { IconPlus, IconX, IconUser } from './icons';

export default function AddNovelModal({ isOpen, onClose, onNovelCreated, onOpenAuth }) {
  const { user, isAuthenticated, isWriterOrAdmin } = useAuth();
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [channel, setChannel] = useState('verified');
  const [globalTone, setGlobalTone] = useState('Fantasy / British Dramatic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      });
      if (res?.novel) {
        if (onNovelCreated) onNovelCreated(res.novel);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-scrim-enter"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg theme-surface rounded-2xl shadow-2xl border overflow-hidden modal-panel-enter">
        <div className="p-6 border-b theme-border flex items-center justify-between">
          <h2 className="text-base font-bold theme-heading flex items-center gap-2">
            <IconPlus className="w-4 h-4 text-[var(--accent)]" />
            <span>Add New Novel</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition"
            aria-label="Close modal"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isAuthenticated && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl flex items-center justify-between gap-2">
              <span>Sign in with an author account to publish directly to the catalog.</span>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth('login');
                  }}
                  className="font-bold underline text-amber-200 hover:text-white flex-shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl border border-rose-500/20">
              {error}
            </div>
          )}

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
              className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Novel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
