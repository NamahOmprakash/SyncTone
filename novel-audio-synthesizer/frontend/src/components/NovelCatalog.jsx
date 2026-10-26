import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import NovelCover from './NovelCover';
import {
  IconSearch,
  IconPlay,
  IconBook,
  IconMic,
  IconStar,
  IconSparkles,
  IconPlus,
  IconRefresh,
  IconUsers,
  IconSettings,
  IconUser,
  IconChevronLeft,
  IconChevronRight,
  IconSoundwave,
} from './icons';

export default function NovelCatalog({
  onSelectNovel,
  onSelectChapter,
  onOpenAddNovel,
  onOpenSettings,
  onOpenAuth,
  onToggleRoster,
}) {
  const { user, isAuthenticated } = useAuth();
  const isWriterOrAdmin = user && (user.role === 'writer' || user.role === 'admin');

  const [novels, setNovels] = useState([]);
  const [channel, setChannel] = useState('verified'); // 'verified' | 'community' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchInputRef = useRef(null);
  const carouselRef = useRef(null);

  // Fetch novels by channel filter
  const fetchNovels = async (selectedChannel) => {
    setIsLoading(true);
    setError(null);
    try {
      const channelParam = selectedChannel === 'all' ? undefined : selectedChannel;
      const data = await api.novels.list(channelParam);
      setNovels(data.novels || []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to load novel catalog';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNovels(channel);
  }, [channel]);

  // Global "/" keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter novels by search query
  const filteredNovels = useMemo(() => {
    if (!searchQuery.trim()) return novels;
    const q = searchQuery.toLowerCase().trim();
    return novels.filter((n) => {
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const synopsisMatch = (n.synopsis || '').toLowerCase().includes(q);
      const authorMatch = (n.author_username || '').toLowerCase().includes(q);
      const narratorMatch = (n.narrator_name || '').toLowerCase().includes(q);
      return titleMatch || synopsisMatch || authorMatch || narratorMatch;
    });
  }, [novels, searchQuery]);

  // Featured Hero Novel (first novel in list)
  const featuredNovel = useMemo(() => {
    return novels.length > 0 ? novels[0] : null;
  }, [novels]);

  // Top 10 Ranked List (up to 10 novels)
  const top10Novels = useMemo(() => {
    return novels.slice(0, 10);
  }, [novels]);

  const handleStartListening = async (novel, e) => {
    if (e) e.stopPropagation();
    if (!novel) return;
    try {
      const data = await api.novels.get(novel.id);
      const ch1 = (data.chapters || []).find((c) => c.chapter_number === 1) || data.chapters?.[0];
      if (ch1 && onSelectChapter) {
        onSelectChapter(novel, ch1);
        return;
      }
    } catch (_) {}
    onSelectNovel(novel.id);
  };

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: direction * 340, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-10 pb-20">
      {/* ================================================================= */}
      {/* 1. MASTER STICKY GLASS HEADER (Single Unified Header)             */}
      {/* ================================================================= */}
      <header className="sticky top-0 z-30 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3.5 glass-header border-b flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Left: Heading & Instant Search */}
        <div className="flex items-center gap-4 flex-1 max-w-2xl">
          <div className="flex-shrink-0">
            <h1 className="text-lg font-bold tracking-tight theme-heading font-display">
              Novel Library
            </h1>
          </div>

          <div className="relative w-full">
            <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none theme-muted">
              <IconSearch className="w-4 h-4" />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, author, or narrator... (/ to focus)"
              className="w-full pl-10 pr-10 py-2 text-xs theme-card border rounded-xl placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition shadow-inner"
              aria-label="Search novels"
            />
            <span className="hidden sm:flex absolute inset-y-0 right-3 items-center pointer-events-none text-[10px] font-mono theme-muted border theme-border rounded px-1.5 py-0.5 my-auto">
              /
            </span>
          </div>
        </div>

        {/* Right: Channel Filter Tabs & Quick Action Buttons */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 md:pb-0 flex-shrink-0">
          <div className="inline-flex p-1 rounded-xl theme-card border" role="tablist" aria-label="Channel selection">
            <button
              role="tab"
              aria-selected={channel === 'verified'}
              onClick={() => setChannel('verified')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                channel === 'verified'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              Verified Originals
            </button>
            <button
              role="tab"
              aria-selected={channel === 'community'}
              onClick={() => setChannel('community')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                channel === 'community'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              Community Novels
            </button>
            <button
              role="tab"
              aria-selected={channel === 'all'}
              onClick={() => setChannel('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                channel === 'all'
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              All Novels
            </button>
          </div>

          {/* Quick Roster Drawer Toggle */}
          {onToggleRoster && (
            <button
              onClick={onToggleRoster}
              className="px-3 py-1.5 theme-card border hover:border-[var(--border-focus)] rounded-xl text-xs font-medium transition flex items-center gap-1.5 flex-shrink-0"
              title="Open Cast Roster"
            >
              <IconUsers className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="hidden lg:inline">Cast Roster</span>
            </button>
          )}

          {/* Add Novel Button for Writers/Admins */}
          {isWriterOrAdmin && onOpenAddNovel && (
            <button
              onClick={onOpenAddNovel}
              className="px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5 flex-shrink-0"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Novel</span>
            </button>
          )}

          {/* Auth Button */}
          {onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 theme-card border hover:border-[var(--border-focus)] rounded-xl text-xs font-semibold transition flex items-center gap-1.5 flex-shrink-0"
            >
              <IconUser className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{isAuthenticated ? user.username : 'Sign In'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Error State with Retry Button */}
      {error && (
        <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-400">{error}</p>
          <button
            onClick={() => fetchNovels(channel)}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition inline-flex items-center gap-2"
          >
            <IconRefresh className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && !error && (
        <div className="space-y-10 animate-pulse">
          {/* Hero Billboard Skeleton */}
          <div className="w-full h-[480px] rounded-3xl theme-card border p-8 sm:p-12 flex flex-col justify-end space-y-4">
            <div className="h-4 w-40 bg-[var(--border-subtle)] rounded-md" />
            <div className="h-10 w-96 max-w-full bg-[var(--border-subtle)] rounded-xl" />
            <div className="h-14 w-full max-w-xl bg-[var(--border-subtle)] rounded-xl" />
            <div className="flex gap-4 pt-4">
              <div className="h-12 w-44 bg-[var(--border-subtle)] rounded-xl" />
              <div className="h-12 w-32 bg-[var(--border-subtle)] rounded-xl" />
            </div>
          </div>

          {/* Grid Skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl theme-card border overflow-hidden flex flex-col">
                <div className="aspect-[3/4] bg-[var(--border-subtle)]" />
                <div className="p-4 space-y-3 flex-1">
                  <div className="h-3 w-24 bg-[var(--border-subtle)] rounded" />
                  <div className="h-5 w-full bg-[var(--border-subtle)] rounded" />
                  <div className="h-3 w-28 bg-[var(--border-subtle)] rounded" />
                  <div className="h-10 w-full bg-[var(--border-subtle)] rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content when Loaded */}
      {!isLoading && !error && (
        <>
          {/* ================================================================= */}
          {/* 2. CINEMATIC HERO BILLBOARD (Full-Bleed Marquee Banner)           */}
          {/* ================================================================= */}
          {featuredNovel && !searchQuery && (
            <section
              className="relative w-full rounded-3xl overflow-hidden p-6 sm:p-12 md:p-16 border theme-border shadow-2xl flex flex-col md:flex-row items-center md:items-end justify-between gap-8 min-h-[480px] sm:min-h-[520px]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(16, 22, 36, 0.98) 0%, rgba(8, 12, 20, 0.99) 100%)',
              }}
              aria-label="Featured Novel Billboard"
            >
              {/* Radial Atmospheric Spotlight Glow */}
              <div
                className="absolute inset-0 pointer-events-none opacity-45"
                style={{
                  backgroundImage:
                    'radial-gradient(ellipse at 78% 38%, rgba(99, 102, 241, 0.4) 0%, transparent 65%)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-page)] via-[var(--bg-page)]/75 to-transparent pointer-events-none" />

              {/* Left Column: Atmospheric Typography & High-Impact CTA */}
              <div className="relative z-10 max-w-2xl space-y-4">
                {/* Eyebrow Badges Row */}
                <div className="flex flex-wrap items-center gap-2.5 stagger-1">
                  <span className="px-3 py-1 rounded-lg theme-card text-amber-400 border border-amber-500/30 text-[11px] font-mono font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5">
                    <IconStar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Top Pick of the Week</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg theme-card theme-sub border text-[11px] font-mono font-semibold">
                    {featuredNovel.global_tone || 'Dramatic Ensemble'}
                  </span>
                  <span className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Follow Along</span>
                  </span>
                </div>

                {/* Massive Serif Title */}
                <h2
                  onClick={() => onSelectNovel(featuredNovel.id)}
                  className="text-3xl sm:text-5xl md:text-6xl font-bold font-serif tracking-tight text-white leading-[1.1] cursor-pointer hover:text-[var(--accent)] transition-colors drop-shadow-xl stagger-2"
                >
                  <span className="sr-only">Featured Spotlight: </span>
                  {featuredNovel.title}
                </h2>

                {/* Evocative Literary Synopsis */}
                <p className="text-xs sm:text-sm md:text-base text-slate-300 font-serif line-clamp-3 leading-relaxed max-w-xl drop-shadow-sm stagger-3">
                  {featuredNovel.synopsis ||
                    'An extraordinary world of storytelling brought to life with synchronized multi-voice performance.'}
                </p>

                {/* Voice Visualizer Widget */}
                <div className="flex items-center gap-3 py-1 stagger-4">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md theme-card border border-white/10 text-[10px] font-mono theme-muted">
                    <IconSoundwave className="w-3.5 h-3.5 text-[var(--accent)] mr-1" />
                    <span className="text-[var(--text-main)] font-semibold">
                      {featuredNovel.narrator_name || 'Narrator'}
                    </span>
                    <span className="opacity-60">• Studio Audio</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-0.5 h-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                      <span
                        key={bar}
                        className="w-0.5 bg-[var(--accent)] rounded-full"
                        style={{
                          height: `${Math.sin(bar) * 6 + 8}px`,
                          opacity: 0.7,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Call to Action Buttons */}
                <div className="flex flex-wrap items-center gap-3.5 pt-2 stagger-5">
                  <button
                    onClick={(e) => handleStartListening(featuredNovel, e)}
                    className="px-6 py-3.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow-xl flex items-center gap-2.5 text-xs sm:text-sm transition transform hover:-translate-y-0.5 focus:outline-none cursor-pointer"
                  >
                    <IconPlay className="w-4 h-4 fill-current" />
                    <span>Start Listening (Ch. 1)</span>
                  </button>
                  <button
                    onClick={() => onSelectNovel(featuredNovel.id)}
                    className="px-5 py-3.5 theme-card border font-semibold rounded-xl text-xs sm:text-sm transition hover:border-[var(--border-focus)] focus:outline-none shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <IconBook className="w-4 h-4" />
                    <span>Novel Details</span>
                  </button>
                </div>
              </div>

              {/* Right Column: 3D Hardcover Physical Book Presentation */}
              <div
                onClick={() => onSelectNovel(featuredNovel.id)}
                className="relative z-10 w-48 sm:w-60 md:w-64 aspect-[3/4] flex-shrink-0 cursor-pointer group transform hover:scale-105 transition-all duration-300"
                style={{
                  filter: 'drop-shadow(0 25px 40px rgba(0, 0, 0, 0.85))',
                }}
                title={featuredNovel.title}
              >
                {/* 3D Cream Page Edges along the right spine */}
                <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/20 border-r-[6px] border-r-amber-100/25 transform -rotate-2 group-hover:rotate-0 transition-transform duration-300">
                  <NovelCover
                    title={featuredNovel.title}
                    author={featuredNovel.author_username}
                    coverUrl={featuredNovel.cover_object}
                    className="w-full h-full"
                  />
                </div>
                {/* Floating Seal */}
                <div className="absolute -bottom-3 -right-3 px-3 py-1 rounded-xl bg-[var(--accent)] text-white font-mono font-bold text-[10px] shadow-lg border border-white/20">
                  ★ 9.4 Verified
                </div>
              </div>
            </section>
          )}

          {/* ================================================================= */}
          {/* 3. SECTION 1: TOP 10 NUMBERED CAROUSEL (<ol> List with Controls)  */}
          {/* ================================================================= */}
          {top10Novels.length > 0 && !searchQuery && (
            <section className="space-y-4 pt-2" aria-label="Top 10 Audiobooks">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg sm:text-xl font-bold theme-heading font-serif flex items-center gap-2">
                    <IconSparkles className="w-5 h-5 text-[var(--accent)]" />
                    <span>Top 10 Today in Audiobooks</span>
                  </h3>
                  <span className="hidden sm:inline text-xs theme-muted font-mono">
                    Ranked by listener count
                  </span>
                </div>

                {/* Horizontal Scroll Arrows (Desktop) */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => scrollCarousel(-1)}
                    aria-label="Scroll carousel left"
                    className="p-1.5 rounded-lg theme-card border hover:border-[var(--border-focus)] transition theme-muted hover:text-[var(--text-main)] shadow-xs"
                  >
                    <IconChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scrollCarousel(1)}
                    aria-label="Scroll carousel right"
                    className="p-1.5 rounded-lg theme-card border hover:border-[var(--border-focus)] transition theme-muted hover:text-[var(--text-main)] shadow-xs"
                  >
                    <IconChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Horizontal Scroll Carousel */}
              <ol
                ref={carouselRef}
                className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 pt-2 list-none scrollbar-none snap-x"
              >
                {top10Novels.map((novel, index) => {
                  const rank = index + 1;
                  return (
                    <li
                      key={novel.id}
                      onClick={() => onSelectNovel(novel.id)}
                      className="top10-card flex-shrink-0 flex items-center cursor-pointer group snap-start relative pl-12 sm:pl-16"
                    >
                      {/* Decorative Outline Rank Number */}
                      <span
                        aria-hidden="true"
                        className="top10-num absolute left-0 bottom-6 text-8xl sm:text-9xl z-0 select-none pointer-events-none font-mono"
                      >
                        {rank}
                      </span>

                      {/* Card Body in Normal Document Flow */}
                      <div className="relative z-10 w-44 sm:w-56 rounded-2xl overflow-hidden theme-card border shadow-xl flex flex-col card-motion">
                        {/* 3:4 Cover Artwork without text overlay */}
                        <div className="w-full aspect-[3/4] relative overflow-hidden">
                          <NovelCover
                            title={novel.title}
                            author={novel.author_username}
                            coverUrl={novel.cover_object}
                            className="w-full h-full"
                          />
                        </div>

                        {/* Text Body in Normal Flow */}
                        <div className="p-3.5 bg-[var(--bg-card)] border-t theme-border space-y-1">
                          <h4
                            className="font-bold text-xs sm:text-sm theme-heading font-serif truncate"
                            title={novel.title}
                          >
                            <span className="sr-only">Rank #{rank}: </span>
                            {novel.title}
                          </h4>
                          <p className="text-[11px] theme-muted truncate">
                            By {novel.author_username || 'SyncTone Author'}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* ================================================================= */}
          {/* 4. SECTION 2: VERIFIED NEURAL MASTERPIECES GRID (Hybrid Cards)   */}
          {/* ================================================================= */}
          <section className="space-y-4 pt-2" aria-label="Novel Catalog Grid">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-bold theme-heading font-serif">
                  {channel === 'verified'
                    ? 'Featured Masterpieces'
                    : channel === 'community'
                    ? 'Community Original Novels'
                    : 'All Audiobooks'}
                </h3>
                <p className="text-xs theme-muted mt-0.5">
                  Multi-voice audio synchronized with grounded character voices
                </p>
              </div>
              <span className="text-xs theme-muted font-mono">
                {filteredNovels.length} {filteredNovels.length === 1 ? 'novel' : 'novels'}
              </span>
            </div>

            {/* Empty Search Results State */}
            {filteredNovels.length === 0 && searchQuery && (
              <div className="p-12 text-center rounded-2xl theme-surface border space-y-3">
                <IconSearch className="w-8 h-8 mx-auto theme-muted opacity-60" />
                <h4 className="text-base font-bold theme-heading">No novels found</h4>
                <p className="text-xs theme-muted max-w-sm mx-auto">
                  No novels match &ldquo;{searchQuery}&rdquo;. Try adjusting your search or channel filter.
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 theme-card border hover:border-[var(--border-focus)] rounded-xl text-xs font-semibold transition"
                >
                  Clear Search
                </button>
              </div>
            )}

            {/* Responsive Hybrid Cards Grid */}
            {filteredNovels.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredNovels.map((novel) => (
                  <article
                    key={novel.id}
                    onClick={() => onSelectNovel(novel.id)}
                    className="novel-card-hybrid group cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={novel.title}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectNovel(novel.id);
                      }
                    }}
                  >
                    {/* Desktop Column Container / Mobile Flex Row (<640px) */}
                    <div className="flex flex-row sm:flex-col h-full min-w-0">
                      {/* Cover Zone (Fixed 3:4 aspect ratio) */}
                      <div className="w-28 sm:w-full aspect-[3/4] relative overflow-hidden flex-shrink-0">
                        <NovelCover
                          title={novel.title}
                          author={novel.author_username}
                          coverUrl={novel.cover_object}
                          className="w-full h-full"
                        />
                      </div>

                      {/* Card Body in Normal Flow */}
                      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between min-w-0">
                        <div className="min-w-0">
                          {/* Genre / Channel Tag & Match Rating */}
                          <div className="flex items-center justify-between gap-1 mb-2">
                            <span className="text-[11px] font-mono font-bold text-[var(--accent)] uppercase tracking-wider truncate">
                              {novel.global_tone ||
                                (novel.channel === 'verified' ? 'Verified Original' : 'Community')}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs font-mono text-amber-400 font-bold">★ 9.4</span>
                              <span className="text-[11px] font-mono text-emerald-400 font-semibold">98% Match</span>
                            </div>
                          </div>

                          {/* Title: 1 line on desktop, up to 2 lines on mobile */}
                          <h4
                            className="font-serif text-base sm:text-lg font-bold theme-heading line-clamp-2 sm:line-clamp-1 group-hover:text-[var(--accent)] transition-colors"
                            title={novel.title}
                          >
                            {novel.title}
                          </h4>

                          {/* Author line with exact By ${author_username} for test assertions */}
                          <p className="text-xs theme-muted mt-1 truncate">
                            By {novel.author_username || 'SyncTone Author'}
                          </p>

                          {/* Narrator Voice Pill */}
                          <div className="mt-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg theme-surface theme-sub border border-[var(--border-subtle)]">
                              <IconMic className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
                              <span className="truncate max-w-[180px]">
                                {novel.narrator_name || 'Lead Narrator'}
                              </span>
                            </span>
                          </div>

                          {/* Reserved 2-Line Clamped Synopsis with Exact Line-Height Matching */}
                          <p className="text-xs theme-sub mt-3 synopsis-reserved-box font-serif leading-relaxed line-clamp-2">
                            {novel.synopsis ||
                              'Multi-voice synchronized audio performance featuring expressive character voices.'}
                          </p>
                        </div>

                        {/* Pinned Action Row (Equal heights across all cards) */}
                        <div className="pt-3.5 mt-4 border-t theme-border flex items-center justify-between gap-2.5">
                          <button
                            onClick={(e) => handleStartListening(novel, e)}
                            className="flex-1 py-2 px-3.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 focus:outline-none cursor-pointer"
                          >
                            <IconPlay className="w-3.5 h-3.5 fill-current" />
                            <span>Play</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectNovel(novel.id);
                            }}
                            className="p-2 rounded-xl theme-surface hover:bg-[var(--bg-hover)] theme-sub border border-[var(--border-subtle)] hover:border-[var(--border-hover)] transition focus:outline-none cursor-pointer min-w-[36px] flex items-center justify-center"
                            title="View Novel Details"
                            aria-label="View Novel Details"
                          >
                            <IconBook className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                {/* Upload Placeholder Card in Grid (Available to all users) */}
                {onOpenAddNovel && (
                  <div
                    onClick={onOpenAddNovel}
                    className="novel-card-hybrid group cursor-pointer border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)] flex flex-col items-center justify-center p-8 text-center transition bg-[var(--bg-card)]/40 hover:bg-[var(--bg-card)] min-h-[380px]"
                    tabIndex={0}
                    role="button"
                    aria-label="Upload Novel"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenAddNovel();
                      }
                    }}
                  >
                    <div className="w-14 h-14 rounded-2xl theme-surface border border-[var(--border-subtle)] group-hover:border-[var(--accent)] text-[var(--accent)] flex items-center justify-center mb-4 shadow-sm transition-transform group-hover:scale-105">
                      <IconPlus className="w-7 h-7" />
                    </div>
                    <span className="text-base font-bold theme-heading group-hover:text-[var(--accent)] transition">
                      Upload Novel
                    </span>
                    <span className="text-xs theme-muted mt-1.5 font-mono">
                      Multi-Voice Audio
                    </span>
                    <span className="mt-4 px-3.5 py-1.5 rounded-lg theme-surface border border-[var(--border-subtle)] text-xs font-semibold text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white transition">
                      + Add New Novel
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* 5. DEDICATED SECTION: PUBLISH & UPLOAD NOVEL                       */}
          {/* ================================================================= */}
          <section
            className="relative w-full rounded-3xl overflow-hidden p-6 sm:p-10 md:p-12 border theme-border shadow-2xl theme-surface"
            aria-label="Upload Novel Section"
          >
            {/* Atmospheric Background Ambient Tint */}
            <div
              className="absolute inset-0 pointer-events-none opacity-25"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse at 85% 20%, rgba(224, 75, 56, 0.25) 0%, transparent 60%), radial-gradient(ellipse at 15% 80%, rgba(99, 102, 241, 0.2) 0%, transparent 60%)',
              }}
            />

            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
              {/* Left Column: Benefit Copy & Feature Badges */}
              <div className="space-y-4 max-w-2xl text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full theme-card border border-[var(--border-subtle)] text-[11px] font-mono font-bold text-[var(--accent)] tracking-wider uppercase">
                  <IconSparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Author Studio & Publishing</span>
                </div>

                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold font-serif theme-heading tracking-tight">
                  Publish Your Novel & Cast Your Characters
                </h3>

                <p className="text-xs sm:text-sm theme-sub font-serif leading-relaxed max-w-xl">
                  Transform your written manuscript into an immersive multi-voice audio performance.
                  SyncTone pairs your characters with distinctive voices and delivers synchronized
                  read-along narration.
                </p>

                {/* Feature Badges Row */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1 text-xs font-mono">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl theme-card border theme-sub">
                    <IconMic className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Multi-Voice Casting</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl theme-card border theme-sub">
                    <IconSoundwave className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Synchronized Audio</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl theme-card border theme-sub">
                    <IconBook className="w-3.5 h-3.5 text-amber-400" />
                    <span>Follow-Along Prose</span>
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 pt-3">
                  <button
                    onClick={onOpenAddNovel}
                    className="px-6 py-3.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold rounded-xl shadow-lg flex items-center gap-2.5 text-xs sm:text-sm transition transform hover:-translate-y-0.5 active:scale-95 focus:outline-none cursor-pointer"
                  >
                    <IconPlus className="w-4 h-4" />
                    <span>Upload Novel</span>
                  </button>
                  <button
                    onClick={() => {
                      setChannel('community');
                      window.scrollTo({ top: 600, behavior: 'smooth' });
                    }}
                    className="px-5 py-3.5 theme-card border hover:border-[var(--border-focus)] font-semibold rounded-xl text-xs sm:text-sm theme-sub hover:text-[var(--text-main)] transition cursor-pointer"
                  >
                    Explore Community Stories
                  </button>
                </div>
              </div>

              {/* Right Column: Visual Graphic / Manuscript Preview Card */}
              <div className="w-full max-w-sm flex-shrink-0">
                <div className="rounded-2xl p-6 theme-card border border-[var(--border-subtle)] shadow-xl space-y-4 relative group hover:border-[var(--border-focus)] transition-colors">
                  <div className="flex items-center justify-between pb-3 border-b theme-border">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="text-[10px] font-mono theme-muted uppercase tracking-wider">
                      Audio Manuscript Studio
                    </span>
                  </div>

                  <div className="space-y-2.5 font-serif text-xs leading-relaxed">
                    <div className="p-3 rounded-xl theme-surface border border-[var(--border-subtle)] space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--accent)] font-bold">
                        <span>NARRATOR</span>
                        <span className="text-emerald-400 font-semibold">Cast Assigned</span>
                      </div>
                      <p className="theme-sub italic">
                        &ldquo;The rain began to fall in Baker Street, tapping rhythmically against the glass...&rdquo;
                      </p>
                    </div>

                    <div className="p-3 rounded-xl theme-surface border border-[var(--border-subtle)] space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-amber-400 font-bold">
                        <span>LEAD CHARACTER</span>
                        <span className="text-emerald-400 font-semibold">Cast Assigned</span>
                      </div>
                      <p className="theme-heading font-medium">
                        &ldquo;Data! Data! Data! I can't make bricks without clay.&rdquo;
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[11px] font-mono theme-muted border-t theme-border">
                    <span>Ready for audio</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Studio Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
