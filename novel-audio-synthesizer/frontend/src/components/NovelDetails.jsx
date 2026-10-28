import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import NovelCover from './NovelCover';
import {
  IconArrowLeft,
  IconPlay,
  IconMic,
  IconUsers,
  IconClock,
  IconStar,
  IconPlus,
  IconRefresh,
  IconBook,
  IconSoundwave,
} from './icons';

function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Audio pending';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function NovelDetails({ novelId, onBack, onSelectChapter, onOpenUploadChapter }) {
  const { isWriterOrAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('chapters'); // 'chapters' | 'characters'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inLibrary, setInLibrary] = useState(false);

  const fetchDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.novels.get(novelId);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to load novel details';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (novelId) fetchDetails();
  }, [novelId]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 w-32 bg-[var(--border-subtle)] rounded" />
        <div className="rounded-3xl theme-surface border p-8 flex flex-col md:flex-row gap-8">
          <div className="w-48 sm:w-56 aspect-[3/4] bg-[var(--border-subtle)] rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-4">
            <div className="h-8 w-2/3 bg-[var(--border-subtle)] rounded-lg" />
            <div className="h-4 w-1/3 bg-[var(--border-subtle)] rounded" />
            <div className="h-20 w-full bg-[var(--border-subtle)] rounded-lg" />
            <div className="h-10 w-44 bg-[var(--border-subtle)] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.novel) {
    return (
      <div className="rounded-3xl theme-surface border p-10 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
          <IconRefresh className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold theme-heading">Error Loading Novel</h3>
        <p className="text-sm text-rose-400 max-w-md mx-auto">{error || 'Novel not found'}</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={onBack}
            className="px-4 py-2 theme-card border rounded-xl text-xs font-semibold theme-sub hover:text-[var(--text-main)] transition cursor-pointer"
          >
            ← Back to Library
          </button>
          <button
            onClick={fetchDetails}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-xl shadow-sm transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { novel, characters = [], chapters = [] } = data;
  const isVerified = novel.channel === 'verified';
  const narratorDisplay =
    novel.narrator_name ||
    novel.narrator_voice_label ||
    novel.narrator_voice_id ||
    'British Cast Narrator';

  return (
    <div className="space-y-8 pb-20">
      {/* Back Navigation */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl theme-card border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-xs font-semibold theme-sub transition-all active:scale-95 shadow-xs cursor-pointer group min-h-[38px]"
          aria-label="Back to Library"
        >
          <IconArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Library</span>
        </button>
      </div>

      {/* HERO POSTER & DETAILS BANNER */}
      <section className="relative w-full rounded-3xl overflow-hidden p-6 sm:p-8 md:p-10 theme-surface border shadow-2xl">
        {/* Ambient Glow from Cover */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <NovelCover
            title={novel.title}
            author={novel.author_username}
            coverUrl={novel.cover_object}
            className="w-full h-full object-cover blur-3xl scale-125"
          />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 items-start">
          {/* 3:4 Cover Poster (Left) with 3D Gilded Edge */}
          <div className="w-52 sm:w-64 aspect-[3/4] rounded-2xl overflow-hidden border border-white/20 border-r-[6px] border-r-amber-100/25 shadow-2xl flex-shrink-0 relative group transform hover:scale-102 transition-transform">
            <NovelCover
              title={novel.title}
              author={novel.author_username}
              coverUrl={novel.cover_object}
              className="w-full h-full"
            />
            <div className="absolute top-2.5 left-2.5">
              <span className="px-2 py-0.5 theme-card text-[10px] font-mono font-bold rounded border shadow-sm text-[var(--accent)]">
                {isVerified ? 'VERIFIED ORIGINAL' : 'COMMUNITY'}
              </span>
            </div>
          </div>

          {/* Novel Info (Right) */}
          <div className="flex-1 space-y-4 min-w-0">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-mono font-bold text-[var(--accent)] uppercase tracking-wider">
                  {novel.global_tone || 'British Fantasy'}
                </span>
                <span className="theme-muted opacity-40">•</span>
                <span className="text-xs theme-muted">
                  By {novel.author_username || 'SyncTone Author'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-bold theme-heading font-serif tracking-tight leading-tight">
                {novel.title}
              </h1>
              <p className="text-xs sm:text-sm italic theme-sub mt-1 font-serif">
                &ldquo;Let the storytelling begin with a complete cast of voices.&rdquo;
              </p>
            </div>

            {/* Metadata Badges Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-0.5 rounded-md theme-card text-emerald-400 font-bold border shadow-sm">
                98% Voice Match
              </span>
              <span className="theme-muted">2026</span>
              <span className="px-2 py-0.5 rounded theme-card border text-[11px] font-bold">
                Ensemble Cast
              </span>
              <span className="theme-muted">
                {chapters.length} {chapters.length === 1 ? 'Chapter' : 'Chapters'}
              </span>
              <span className="px-2 py-0.5 rounded theme-card text-[var(--accent)] font-bold border shadow-sm flex items-center gap-1">
                <IconStar className="w-3 h-3 text-[var(--accent)]" />
                <span>9.4</span>
              </span>
              <span className="theme-muted">Studio Audio</span>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {chapters.length > 0 && (
                <button
                  onClick={() => onSelectChapter(novel, chapters[0])}
                  className="px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-bold rounded-xl shadow-lg flex items-center gap-2 text-xs sm:text-sm min-h-[44px] transition transform hover:-translate-y-0.5 active:scale-95 focus:outline-none cursor-pointer"
                >
                  <IconPlay className="w-4 h-4 fill-current" />
                  <span>Start Listening (Ch. 1)</span>
                </button>
              )}
              {isWriterOrAdmin && onOpenUploadChapter && (
                <button
                  onClick={() => onOpenUploadChapter(novel)}
                  className="px-4 py-3 theme-card hover:border-[var(--border-focus)] rounded-xl text-xs sm:text-sm font-semibold border min-h-[44px] transition flex items-center gap-1.5 cursor-pointer"
                >
                  <IconPlus className="w-4 h-4" />
                  <span>Upload Chapter</span>
                </button>
              )}
              <button
                className={`px-4 py-3 theme-card hover:border-[var(--border-focus)] rounded-xl text-xs sm:text-sm font-semibold border min-h-[44px] transition cursor-pointer ${
                  inLibrary ? 'text-status-success border-[var(--color-status-success)]' : ''
                }`}
                onClick={() => setInLibrary((prev) => !prev)}
              >
                {inLibrary ? '✓ In Library' : '+ Add to Library'}
              </button>
            </div>

            {/* Two-Column Metadata Alignment (2-of-3 cols Synopsis, 1-of-3 col Cast Box) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 items-start border-t theme-border">
              {/* Left 2 Cols: Full Synopsis */}
              <div className="md:col-span-2 space-y-2">
                <span className="text-xs font-bold theme-muted uppercase font-mono tracking-wider">
                  Synopsis
                </span>
                <p className="text-xs sm:text-sm theme-sub font-serif leading-relaxed">
                  {novel.synopsis || 'No synopsis provided for this novel.'}
                </p>
              </div>

              {/* Right 1 Col: Character Voices & Audio Pipeline Box */}
              <div className="p-4 rounded-2xl theme-card border space-y-3 text-xs">
                <div>
                  <span className="theme-muted font-bold block mb-1 font-mono text-[11px] uppercase tracking-wider">
                    Narrator:
                  </span>
                  <p className="theme-heading font-semibold flex items-center gap-1.5">
                    <IconMic className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>{narratorDisplay}</span>
                  </p>
                </div>

                {characters.length > 0 && (
                  <div className="border-t theme-border pt-2.5">
                    <span className="theme-muted font-bold block mb-1.5 font-mono text-[11px] uppercase tracking-wider">
                      Cast Voices ({characters.length}):
                    </span>
                    <p className="text-[11px] font-mono theme-sub leading-relaxed">
                      {characters.map((c) => c.canonical_name).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TABS: CHAPTER DIRECTORY & CHARACTER ROSTER */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b theme-border pb-3">
          {/* Segmented Control with Sliding Indicator (Transform Only) */}
          <div className="relative p-1 rounded-xl theme-surface border flex items-center">
            <div
              className="absolute inset-y-1 rounded-lg bg-[var(--accent)] transition-transform duration-200 will-change-transform pointer-events-none shadow-sm"
              style={{
                width: 'calc(50% - 4px)',
                transform: activeTab === 'chapters' ? 'translateX(4px)' : 'translateX(calc(100% + 4px))',
              }}
            />
            <button
              onClick={() => setActiveTab('chapters')}
              className={`relative z-10 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors duration-120 cursor-pointer ${
                activeTab === 'chapters' ? 'text-[var(--on-accent)]' : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              Chapter Directory ({chapters.length})
            </button>
            <button
              onClick={() => setActiveTab('characters')}
              className={`relative z-10 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors duration-120 cursor-pointer ${
                activeTab === 'characters' ? 'text-[var(--on-accent)]' : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              Character Cast ({characters.length})
            </button>
          </div>
          <span className="text-xs theme-muted font-mono hidden sm:inline">
            Synchronized Multi-Voice Audio
          </span>
        </div>

        {/* Tab 1: Chapter Directory Track List */}
        {activeTab === 'chapters' && (
          <div className="space-y-2.5">
            {chapters.length === 0 ? (
              <div className="p-8 text-center rounded-2xl theme-surface border theme-muted text-xs">
                No chapters uploaded yet.
              </div>
            ) : (
              chapters.map((ch, idx) => (
                <div
                  key={ch.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectChapter(novel, ch)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectChapter(novel, ch);
                    }
                  }}
                  className="group p-4 rounded-2xl theme-card border hover:border-[var(--border-focus)] transition-all flex items-center justify-between gap-4 cursor-pointer shadow-sm hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl theme-surface border flex items-center justify-center font-mono font-bold text-xs theme-heading group-hover:bg-[var(--accent)] group-hover:text-[var(--on-accent)] transition-colors flex-shrink-0">
                      {ch.chapter_number || idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold theme-heading font-serif truncate group-hover:text-[var(--accent)] transition-colors">
                        {ch.title || `Chapter ${ch.chapter_number || idx + 1}`}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] theme-muted font-mono">
                        <span>{ch.segment_count ? `${ch.segment_count} dialogue turns` : 'Multi-voice audio'}</span>
                        <span className="opacity-40">•</span>
                        <span>Multi-voice</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs font-mono theme-muted flex items-center gap-1">
                      <IconClock className="w-3.5 h-3.5 opacity-60" />
                      <span>{formatDuration(ch.total_duration_ms || 0)}</span>
                    </span>
                    <button
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChapter(novel, ch);
                      }}
                    >
                      <IconPlay className="w-3 h-3 fill-current" />
                      <span className="hidden sm:inline">Read & Listen</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Character Cast Portfolio */}
        {activeTab === 'characters' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {characters.length === 0 ? (
              <div className="col-span-full p-8 text-center rounded-2xl theme-surface border theme-muted text-xs">
                No character profiles generated.
              </div>
            ) : (
              characters.map((char) => (
                <div key={char.id} className="p-4 rounded-2xl theme-card border space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-xs theme-heading font-serif">{char.canonical_name}</h5>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded theme-surface border text-[var(--accent)] font-semibold">
                      {char.gender || 'Character'}
                    </span>
                  </div>
                  <p className="text-[11px] theme-muted font-mono flex items-center justify-between">
                    <span>Voice:</span>
                    <span className="theme-heading font-semibold">{char.voice_id || 'en-GB-RyanNeural'}</span>
                  </p>
                  {char.sample_quote && (
                    <p className="text-xs italic theme-sub font-serif line-clamp-2">
                      &ldquo;{char.sample_quote}&rdquo;
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
