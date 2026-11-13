import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { preloadNovelDetails, preloadReaderView } from '../App';
import NovelCover from './NovelCover';
import { getNovelCanonicalInfo } from '../data/canonicalNovels';
import FeaturedBook3D from './3d/FeaturedBook3D';
import Interactive3DCard from './3d/Interactive3DCard';
import BookShelf3D from './3d/BookShelf3D';
import {
  IconSyncToneLogo,
  IconSearch,
  IconPlay,
  IconBook,
  IconMic,
  IconStar,
  IconSparkles,
  IconPlus,
  IconRefresh,
  IconUser,
  IconChevronLeft,
  IconChevronRight,
  IconSoundwave,
} from './icons';

const SEED_NOVELS = [
  {
    id: '14ee0456-ad37-4867-9190-938b0e7d14ad',
    title: 'A Study in Scarlet',
    synopsis: 'The landmark debut of Sherlock Holmes and Dr. John Watson.',
    channel: 'verified',
    status: 'draft',
    portfolio_source: 'ai',
    cover_object: null,
    added_by: 'a9da22c3-d45d-4997-ba10-7e5a235334f1',
    author_username: 'writer_1792437336846',
    narrator_name: 'Dr. John Watson',
    narrator_voice_id: 'bm_george',
    narrator_voice_label: 'George (British Received)',
    chapter_count: 1,
  },
];

export default function NovelCatalog({
  initialChannel = 'verified',
  onSelectNovel,
  onSelectChapter,
  onOpenAddNovel,
  onOpenSettings,
  onOpenAuth,
}) {
  const { user, isAuthenticated } = useAuth();
  const isWriterOrAdmin = user && (user.role === 'writer' || user.role === 'admin');

  const [novels, setNovels] = useState(() => {
    try {
      const cached = sessionStorage.getItem('synctone_cached_novels');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return SEED_NOVELS;
  });
  const [channel, setChannel] = useState(initialChannel); // 'verified' | 'community' | 'all'

  useEffect(() => {
    if (initialChannel && initialChannel !== channel) {
      setChannel(initialChannel);
    }
  }, [initialChannel]);
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 200);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchInputRef = useRef(null);
  const carouselRef = useRef(null);
  const tabRefs = useRef([]);
  const CHANNELS = ['verified', 'community', 'all'];

  const handleTabKeyDown = (e, idx) => {
    let nextIdx = idx;
    if (e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % CHANNELS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + CHANNELS.length) % CHANNELS.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = CHANNELS.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setChannel(CHANNELS[nextIdx]);
    tabRefs.current[nextIdx]?.focus();
  };

  // Fetch novels by channel filter
  const fetchNovels = async (selectedChannel, signal) => {
    setIsLoading(true);
    setError(null);
    try {
      const channelParam = selectedChannel === 'all' ? undefined : selectedChannel;
      const data = await api.novels.list(channelParam);
      if (signal && signal.aborted) return;
      const loadedNovels = data?.novels || [];
      setNovels(loadedNovels);
      if (Array.isArray(loadedNovels) && loadedNovels.length > 0) {
        try {
          sessionStorage.setItem('synctone_cached_novels', JSON.stringify(loadedNovels));
        } catch (_) {}
      }
    } catch (err) {
      if (err.name === 'AbortError' || (signal && signal.aborted)) return;
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to load novel catalog';
      setError(msg);
      setNovels([]);
    } finally {
      if (!signal || !signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchNovels(channel, controller.signal);
    return () => controller.abort();
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

  // Extract dynamic genre tags from current novel collection
  const availableGenres = useMemo(() => {
    const set = new Set();
    novels.forEach((n) => {
      if (n.global_tone) {
        set.add(n.global_tone.toUpperCase());
      }
    });
    return ['ALL', ...Array.from(set).slice(0, 4)];
  }, [novels]);

  // Filter novels by search query and genre chip
  const filteredNovels = useMemo(() => {
    let result = novels;
    if (selectedGenre !== 'ALL') {
      result = result.filter(
        (n) => (n.global_tone || '').toUpperCase() === selectedGenre
      );
    }
    if (!debouncedSearch.trim()) return result;
    const q = debouncedSearch.toLowerCase().trim();
    return result.filter((n) => {
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const synopsisMatch = (n.synopsis || '').toLowerCase().includes(q);
      const authorMatch = (n.author_username || '').toLowerCase().includes(q);
      const narratorMatch = (n.narrator_name || '').toLowerCase().includes(q);
      return titleMatch || synopsisMatch || authorMatch || narratorMatch;
    });
  }, [novels, debouncedSearch, selectedGenre]);

  // Netflix & Amazon Prime style automatic billboard rotation state
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState('forward');
  const [isBillboardPaused, setIsBillboardPaused] = useState(false);
  const [libraryViewMode, setLibraryViewMode] = useState('grid'); // 'grid' | 'shelf'
  const [lastReadingSession, setLastReadingSession] = useState(null);

  // Slide navigation handlers with direction awareness
  const handleNextSlide = useCallback(() => {
    setSlideDirection('forward');
    setFeaturedIndex((prev) => (prev + 1) % (novels.length || 1));
  }, [novels.length]);

  const handlePrevSlide = useCallback(() => {
    setSlideDirection('backward');
    setFeaturedIndex((prev) => (prev - 1 + novels.length) % (novels.length || 1));
  }, [novels.length]);

  const handleJumpToSlide = useCallback((targetIndex) => {
    setSlideDirection(targetIndex >= featuredIndex ? 'forward' : 'backward');
    setFeaturedIndex(targetIndex);
  }, [featuredIndex]);

  // Touch gesture support for mobile/trackpad swiping
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null || !e.changedTouches || !e.changedTouches[0]) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Detect horizontal swipe gesture
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        handleNextSlide();
      } else {
        handlePrevSlide();
      }
    }
  };

  // Load persistent reading progress (Section 12.A)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('synctone_last_reading');
      if (stored) {
        setLastReadingSession(JSON.parse(stored));
      }
    } catch (_) {}
  }, []);

  // Reset rotation index when channel filter changes
  useEffect(() => {
    setFeaturedIndex(0);
  }, [channel]);

  // Pause automatic billboard rotation when document is hidden (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBillboardPaused(true);
      } else {
        setIsBillboardPaused(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Netflix & Amazon Prime style 5-second automatic rotation timer (swipes every 5000ms)
  useEffect(() => {
    if (debouncedSearch || isBillboardPaused || novels.length <= 1) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = setInterval(() => {
      setSlideDirection('forward');
      setFeaturedIndex((prev) => (prev + 1) % novels.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [debouncedSearch, isBillboardPaused, novels.length, featuredIndex]);

  // Featured Hero Novel (cycles automatically through novels)
  const featuredNovel = useMemo(() => {
    if (novels.length === 0) return null;
    return novels[featuredIndex % novels.length] || novels[0];
  }, [novels, featuredIndex]);

  const featuredInfo = useMemo(() => {
    return getNovelCanonicalInfo(featuredNovel?.title);
  }, [featuredNovel]);

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
      {/* Error State with Retry Button */}
      {error && (
        <div className="p-8 rounded-2xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-center space-y-3">
          <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>
          <button
            onClick={() => fetchNovels(channel)}
            className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] text-xs font-bold rounded-full shadow-md hover:scale-[1.03] active:scale-[0.96] transition-all duration-200 inline-flex items-center gap-2 cursor-pointer"
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
          <div className="novel-catalog-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <div key={i} className="rounded-2xl theme-card border border-[var(--border-subtle)] overflow-hidden flex flex-col p-3">
                <div className="aspect-[2/3] bg-[var(--border-subtle)] rounded-xl" />
                <div className="pt-3 space-y-2 flex-1">
                  <div className="h-3 w-16 bg-[var(--border-subtle)] rounded-full" />
                  <div className="h-4 w-full bg-[var(--border-subtle)] rounded" />
                  <div className="h-3 w-20 bg-[var(--border-subtle)] rounded" />
                  <div className="h-8 w-full bg-[var(--border-subtle)] rounded-full mt-2" />
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
          {/* 2. NOIR MONOCHROME HERO STAGE (Tall Stage Gradient & 3D Cover)    */}
          {/* ================================================================= */}
          {featuredNovel && !searchQuery.trim() && (
            <section
              className="relative w-full -mx-4 sm:-mx-8 -mt-6 mb-10 px-4 sm:px-8 lg:px-12 pt-8 pb-14 border-b border-[var(--border-subtle)] flex flex-col justify-between transition-all duration-300"
              style={{
                background: 'var(--stage-gradient)',
              }}
              aria-label="Featured Novel Billboard"
              data-testid="featured-novel-billboard"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="max-w-7xl mx-auto w-full flex flex-col justify-between">
                {/* Eyebrow Real-Data Tag */}
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono tracking-wider uppercase border border-[var(--border-strong)] bg-[var(--bg-card)] text-[var(--text-main)] rounded-full shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span>FEATURED VOLUME // VOL. {String(featuredIndex + 1).padStart(2, '0')} — {featuredNovel.title.toUpperCase()}</span>
                  </span>
                  {isBillboardPaused && (
                    <span className="text-[11px] font-mono text-[var(--text-sub)] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      Paused
                    </span>
                  )}
                </div>

                {/* Display Headline: STORIES THAT / SPEAK (80-85% Width) */}
                <div className="w-full mb-8 sm:mb-10">
                  <h1 className="font-sans font-black text-5xl sm:text-7xl md:text-8xl lg:text-[7.2rem] xl:text-[8.2rem] tracking-tighter uppercase leading-[0.85] text-[var(--text-main)]">
                    <span className="headline-gradient block">STORIES THAT</span>
                    <span className="headline-gradient headline-skew block opacity-45">SPEAK</span>
                  </h1>
                </div>

                {/* Hero Triad Grid: Left Credits, Center 3D Book, Right Sans Blurb */}
                <div
                  key={`hero-stage-${featuredNovel.id || featuredIndex}`}
                  className={`grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 items-center w-full mb-8 ${
                    slideDirection === 'backward' ? 'hero-swipe-backward' : 'hero-swipe-forward'
                  }`}
                >
                  {/* Left Column: Mono Metadata Credits ("AT A GLANCE") */}
                  <div key={`credits-${featuredNovel.id || featuredIndex}`} className="hero-content-crossfade border-l border-[var(--border-strong)] pl-5 flex flex-col gap-3 font-mono">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[var(--text-sub)] tracking-wider">FEATURED TITLE</span>
                      <span
                        onClick={() => onSelectNovel(featuredNovel.id)}
                        className="text-xs font-bold text-[var(--text-main)] truncate cursor-pointer hover:underline uppercase"
                        title={featuredNovel.title}
                      >
                        {featuredNovel.title}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[var(--text-sub)] tracking-wider">AUTHOR</span>
                      <span className="text-xs font-bold text-[var(--text-main)]">
                        {(featuredNovel.author_username || 'SYNCTONE AUTHOR').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[var(--text-sub)] tracking-wider">PUBLISHED</span>
                      <span className="text-xs font-bold text-[var(--text-main)]">
                        {featuredInfo?.year || 'CLASSIC'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[var(--text-sub)] tracking-wider">GENRE</span>
                      <span className="text-xs font-bold text-[var(--text-main)] truncate max-w-[220px]" title={featuredInfo?.genre || featuredNovel.global_tone}>
                        {(featuredInfo?.genre || featuredNovel.global_tone || 'FICTION').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[var(--text-sub)] tracking-wider">NARRATOR</span>
                      <span className="text-xs font-bold text-[var(--text-main)]">
                        {(featuredNovel.narrator_name || 'STUDIO ENSEMBLE').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[var(--text-sub)] tracking-wider">SCOPE</span>
                      <span className="text-xs font-bold text-[var(--text-main)]">
                        {featuredNovel.chapter_count || 1} CHAPTERS
                      </span>
                    </div>
                  </div>

                  {/* Center Column: Genuine 3D Physical Book Showcase (Hover on book pauses timer) */}
                  <div
                    key={`stage-${featuredNovel.id || featuredIndex}`}
                    data-testid="featured-book-stage"
                    className="hero-cover-crossfade flex justify-center items-center py-2 tilted-cover-stage cursor-grab"
                    onMouseEnter={() => setIsBillboardPaused(true)}
                    onMouseLeave={() => setIsBillboardPaused(false)}
                    onPointerEnter={() => setIsBillboardPaused(true)}
                    onPointerLeave={() => setIsBillboardPaused(false)}
                  >
                    <FeaturedBook3D
                      novel={featuredNovel}
                      volumeIndex={featuredIndex}
                      onSelectNovel={onSelectNovel}
                      isPaused={isBillboardPaused}
                    />
                  </div>

                  {/* Right Column: Editorial Sans Blurb & CTA Scrim Box */}
                  <div key={`blurb-${featuredNovel.id || featuredIndex}`} className="hero-content-crossfade flex flex-col gap-4">
                    <p className="font-sans text-sm sm:text-base leading-relaxed text-[var(--text-main)]">
                      {featuredNovel.synopsis ||
                        'SyncTone re-engineers classic literature into neural multi-speaker drama. Every sentence is dynamically assigned to character voices, scored with generative ambient soundscapes, and synchronized to the reading canvas in real time.'}
                    </p>

                    {/* Scrim box for high WCAG AA contrast compliance */}
                    <div className="bg-[var(--bg-card)] border border-[var(--border-strong)] p-5 flex flex-col gap-3.5 rounded-2xl shadow-xl backdrop-blur-md">
                      <div className="flex flex-col gap-2.5">
                        <button
                          onClick={(e) => handleStartListening(featuredNovel, e)}
                          className="boxed-btn-primary py-3 px-6 text-xs font-mono uppercase flex items-center justify-center gap-2 cursor-pointer rounded-full shadow-md hover:scale-[1.03] active:scale-[0.96] transition-all duration-200"
                        >
                          <span className="w-2 h-2 rounded-full bg-current" />
                          <span>LISTEN NOW</span>
                        </button>
                        <button
                          onClick={() => onSelectNovel(featuredNovel.id)}
                          className="w-full boxed-btn py-2.5 px-3 text-[11px] font-mono uppercase flex items-center justify-center gap-1.5 text-[var(--text-main)] hover:border-[var(--text-main)] cursor-pointer rounded-full bg-[var(--bg-surface)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                        >
                          <IconBook className="w-3.5 h-3.5" />
                          <span>
                            {lastReadingSession?.novelId === featuredNovel.id
                              ? `Resume (${lastReadingSession.progressPercent}%)`
                              : 'Read Novel'}
                          </span>
                        </button>
                      </div>

                      <div className="text-[11px] font-mono text-[var(--text-sub)] flex justify-between items-center pt-2 border-t border-[var(--border-subtle)]">
                        <span>STATUS: {featuredNovel.status?.toUpperCase() || 'READY'}</span>
                        <span>{featuredNovel.chapter_count || 1} CHAPTERS</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Minimal Numbered Counters & Arrows with 5s Netflix/Prime Progress Bars */}
                {novels.length > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] font-mono text-xs">
                    <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto py-1">
                      {novels.slice(0, 5).map((novelItem, idx) => {
                        const isActive = idx === (featuredIndex % Math.min(novels.length, 5));
                        const numStr = String(idx + 1).padStart(2, '0');
                        return (
                          <button
                            key={novelItem.id || idx}
                            type="button"
                            onClick={() => handleJumpToSlide(idx)}
                            aria-label={`Jump to slide ${idx + 1}: ${novelItem.title}`}
                            className={`flex items-center gap-2 cursor-pointer transition-colors group ${
                              isActive
                                ? 'text-[var(--text-main)] font-bold'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                            }`}
                          >
                            <span>{numStr}</span>
                            <div className="w-8 sm:w-12 h-0.5 sm:h-1 bg-[var(--border-strong)] rounded-full overflow-hidden relative">
                              {isActive ? (
                                <div
                                  key={`progress-${featuredIndex}`}
                                  className={`h-full bg-[var(--text-main)] rounded-full billboard-progress-fill ${
                                    isBillboardPaused ? 'paused' : ''
                                  }`}
                                />
                              ) : (
                                <div className="h-full w-0 bg-[var(--text-main)]" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={handlePrevSlide}
                        aria-label="Previous featured novel"
                        className="boxed-btn p-2 rounded-full text-[var(--text-sub)] hover:text-[var(--text-main)] active:scale-95 hover:scale-105 transition-all duration-200 shadow-xs cursor-pointer"
                      >
                        <IconChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextSlide}
                        aria-label="Next featured novel"
                        className="boxed-btn p-2 rounded-full text-[var(--text-sub)] hover:text-[var(--text-main)] active:scale-95 hover:scale-105 transition-all duration-200 shadow-xs cursor-pointer"
                      >
                        <IconChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ================================================================= */}
          {/* 3. SECTION 1: TOP 10 NUMBERED CAROUSEL (<ol> List with Controls)  */}
          {/* ================================================================= */}
          {top10Novels.length > 0 && !searchQuery.trim() && (
            <section className="space-y-4 pt-2 w-full max-w-full overflow-hidden" aria-label="Top 10 Audiobooks">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-mono text-[var(--text-sub)] uppercase tracking-wider">
                    // CURATED VOLUMES
                  </span>
                  <h3 className="text-base sm:text-lg font-bold font-sans uppercase tracking-tight text-[var(--text-main)]">
                    Top 10 Today in Audiobooks
                  </h3>
                </div>

                {/* Horizontal Scroll Arrows (Desktop) */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => scrollCarousel(-1)}
                    aria-label="Scroll carousel left"
                    className="boxed-btn p-2 rounded-full text-[var(--text-sub)] hover:text-[var(--text-main)] active:scale-90 hover:scale-105 transition-all duration-200 shadow-xs cursor-pointer"
                  >
                    <IconChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scrollCarousel(1)}
                    aria-label="Scroll carousel right"
                    className="boxed-btn p-2 rounded-full text-[var(--text-sub)] hover:text-[var(--text-main)] active:scale-90 hover:scale-105 transition-all duration-200 shadow-xs cursor-pointer"
                  >
                    <IconChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Horizontal Scroll Carousel */}
              <ol
                ref={carouselRef}
                tabIndex={0}
                aria-label="Top 10 audiobooks"
                className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 pt-2 list-none scrollbar-none snap-x focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]"
              >
                {top10Novels.map((novel, index) => {
                  const rank = index + 1;
                  return (
                    <li
                      key={novel.id}
                      onClick={() => onSelectNovel(novel.id)}
                      onMouseEnter={preloadNovelDetails}
                      onFocus={preloadNovelDetails}
                      onPointerDown={preloadNovelDetails}
                      className="top10-card flex-shrink-0 flex items-center cursor-pointer group snap-start relative pl-12 sm:pl-16"
                    >
                      {/* Decorative Outline Rank Number */}
                      <span
                        aria-hidden="true"
                        className="top10-num absolute left-0 bottom-4 text-7xl sm:text-8xl z-0 select-none pointer-events-none font-mono"
                      >
                        {rank}
                      </span>

                      {/* Card Body */}
                      <div className="relative z-10 w-44 sm:w-56 rounded-2xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-sm hover:shadow-xl transition-all flex flex-col">
                        <div className="w-full aspect-[3/4] relative overflow-hidden bg-[var(--bg-surface)]">
                          <NovelCover
                            title={novel.title}
                            author={novel.author_username}
                            coverUrl={novel.cover_object}
                            id={novel.id}
                            index={rank - 1}
                            hideEyebrow={true}
                            className="w-full h-full"
                          />
                          <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-main)] shadow-xs">
                              #{rank} TOP 10
                            </span>
                          </div>
                        </div>

                        <div className="p-3 bg-[var(--bg-card)] border-t border-[var(--border-subtle)] space-y-1">
                          <h4
                            className="font-bold text-xs sm:text-sm font-sans uppercase tracking-tight text-[var(--text-main)] truncate"
                            title={novel.title}
                          >
                            <span className="sr-only">Rank #{rank}: </span>
                            {novel.title}
                          </h4>
                          <p className="text-[11px] font-mono text-[var(--text-sub)] truncate">
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
          {/* 4. SECTION 2: VERIFIED & COMMUNITY VOLUMES GRID                   */}
          {/* ================================================================= */}
          <section id="archive-catalog" className="max-w-[1720px] mx-auto w-full space-y-6 pt-4 scroll-mt-20" aria-label="Novel Catalog Grid">
            <div className="border-b border-[var(--border-subtle)] pb-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[var(--text-sub)] uppercase tracking-wider">
                      // ARCHIVE CATALOG —
                    </span>
                    <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-main)]">
                      Novel Library
                    </h2>
                  </div>
                  <h3 className="text-base sm:text-xl font-bold font-sans uppercase tracking-tight text-[var(--text-main)]">
                    {channel === 'verified'
                      ? 'Verified Repertory'
                      : channel === 'community'
                      ? 'Community Volumes'
                      : 'Literary Volumes in Repertory'}
                  </h3>
                </div>

                {/* Channel Filter Tabs (Accessible & Keyboard Navigable) */}
                <div
                  className="inline-flex p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] gap-1 flex-wrap self-start md:self-auto shadow-xs"
                  role="tablist"
                  aria-label="Channel selection"
                >
                  <button
                    ref={(el) => (tabRefs.current[0] = el)}
                    role="tab"
                    aria-selected={channel === 'verified'}
                    tabIndex={channel === 'verified' ? 0 : -1}
                    onClick={() => setChannel('verified')}
                    onKeyDown={(e) => handleTabKeyDown(e, 0)}
                    className={`px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all duration-200 cursor-pointer ${
                      channel === 'verified'
                        ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                        : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    + Verified Originals
                  </button>
                  <button
                    ref={(el) => (tabRefs.current[1] = el)}
                    role="tab"
                    aria-selected={channel === 'community'}
                    tabIndex={channel === 'community' ? 0 : -1}
                    onClick={() => setChannel('community')}
                    onKeyDown={(e) => handleTabKeyDown(e, 1)}
                    className={`px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all duration-200 cursor-pointer ${
                      channel === 'community'
                        ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                        : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    + Community Novels
                  </button>
                  <button
                    ref={(el) => (tabRefs.current[2] = el)}
                    role="tab"
                    aria-selected={channel === 'all'}
                    tabIndex={channel === 'all' ? 0 : -1}
                    onClick={() => setChannel('all')}
                    onKeyDown={(e) => handleTabKeyDown(e, 2)}
                    className={`px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all duration-200 cursor-pointer ${
                      channel === 'all'
                        ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                        : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    + All Novels
                  </button>
                </div>

                {/* Library View Mode Switcher: Grid View vs 3D Bookshelf */}
                <div
                  className="inline-flex p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] gap-1 shadow-xs self-start md:self-auto"
                  role="group"
                  aria-label="Library View Mode"
                >
                  <button
                    type="button"
                    onClick={() => setLibraryViewMode('grid')}
                    className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      libraryViewMode === 'grid'
                        ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                        : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                    }`}
                    title="Responsive Compact Grid View"
                  >
                    <span>⊞ Grid View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibraryViewMode('shelf')}
                    className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      libraryViewMode === 'shelf'
                        ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold shadow-xs'
                        : 'text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                    }`}
                    title="Interactive Physical 3D Bookshelf Experience"
                  >
                    <span>☱ 3D Bookshelf</span>
                  </button>
                </div>
              </div>

              {/* Instant Search Bar & Genre Filter Chips */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1 w-full min-w-0">
                {/* Monospace Genre Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 min-w-0 flex-1 scrollbar-none">
                  {availableGenres.map((g) => (
                    <button
                      key={g}
                      onClick={() => setSelectedGenre(g)}
                      className={`px-3 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full border cursor-pointer transition-all duration-200 flex-shrink-0 ${
                        selectedGenre === g
                          ? 'bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] font-bold shadow-xs'
                          : 'border-[var(--border-subtle)] text-[var(--text-sub)] hover:text-[var(--text-main)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {g === 'ALL' ? 'ALL VOLUMES' : g}
                    </button>
                  ))}
                </div>

                {/* Search Box & Controls */}
                <div className="flex items-center gap-2 flex-shrink-0 w-full lg:w-auto lg:max-w-md">
                  <div className="relative flex-1 lg:w-80">
                    <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-[var(--text-muted)]">
                      <IconSearch className="w-3.5 h-3.5" />
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by title, author, or narrator... (/ to focus)"
                      className="w-full pl-9 pr-9 py-2 text-xs font-mono bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-full text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-main)] focus:ring-1 focus:ring-[var(--text-main)] transition shadow-xs"
                      aria-label="Search novels"
                    />
                    <span className="hidden sm:flex absolute inset-y-0 right-2 items-center pointer-events-none text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-md px-1.5 py-0.5 my-auto">
                      /
                    </span>
                  </div>

                  {isWriterOrAdmin && onOpenAddNovel && (
                    <button
                      onClick={onOpenAddNovel}
                      className="boxed-btn px-3.5 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] text-[11px] font-mono uppercase font-semibold rounded-full border border-[var(--border-strong)] hover:border-[var(--text-main)] transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer shadow-xs hover:scale-105 active:scale-95"
                      aria-label="Add Novel"
                      title="Add Novel"
                    >
                      <IconPlus className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Add</span>
                    </button>
                  )}

                  <span className="text-xs text-[var(--text-sub)] font-mono flex-shrink-0 pl-1">
                    {filteredNovels.length} {filteredNovels.length === 1 ? 'VOL' : 'VOLS'}
                  </span>
                </div>
              </div>
            </div>

            {/* Empty Search Results State */}
            {filteredNovels.length === 0 && searchQuery && (
              <div className="p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3 shadow-sm animate-fade-in">
                <IconSearch className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
                <h4 className="text-base font-bold font-sans uppercase text-[var(--text-main)]">No novels found</h4>
                <p className="text-xs text-[var(--text-muted)] font-mono max-w-sm mx-auto">
                  No novels match &ldquo;{searchQuery}&rdquo;. Try adjusting your search query.
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="boxed-btn px-4 py-2 text-xs font-mono uppercase cursor-pointer rounded-full active:scale-95 transition-all hover:scale-105"
                >
                  Clear Search
                </button>
              </div>
            )}

            {/* Empty Library Category State */}
            {filteredNovels.length === 0 && !searchQuery && (
              <div className="p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3 shadow-sm animate-fade-in">
                <IconBook className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
                <h4 className="text-base font-bold font-sans uppercase text-[var(--text-main)]">No novels available</h4>
                <p className="text-xs text-[var(--text-muted)] font-mono max-w-sm mx-auto">
                  No novels found in this library shelf. Upload a novel or switch channels to browse.
                </p>
                {isWriterOrAdmin && onOpenAddNovel && (
                  <button
                    onClick={onOpenAddNovel}
                    className="boxed-btn-primary px-5 py-2.5 text-xs font-mono uppercase inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-transform rounded-full mt-2 hover:scale-105"
                  >
                    <IconPlus className="w-4 h-4" />
                    <span>Upload First Novel</span>
                  </button>
                )}
              </div>
            )}

            {/* 3D Physical Bookshelf Experience */}
            {filteredNovels.length > 0 && libraryViewMode === 'shelf' && (
              <BookShelf3D
                novels={filteredNovels}
                onSelectNovel={onSelectNovel}
                onStartListening={handleStartListening}
              />
            )}

            {/* Responsive Compact Volume Cards Grid */}
            {filteredNovels.length > 0 && libraryViewMode === 'grid' && (
              <div className="novel-catalog-grid">
                {filteredNovels.map((novel, index) => (
                  <Interactive3DCard
                    key={novel.id}
                    onClick={() => onSelectNovel(novel.id)}
                    onMouseEnter={preloadNovelDetails}
                    onFocus={preloadNovelDetails}
                    onPointerDown={preloadNovelDetails}
                    style={{ animationDelay: `${Math.min(index, 11) * 50}ms` }}
                    className="volume-card catalog-card-animate novel-card-hybrid group cursor-pointer p-3 sm:p-3.5 flex flex-col justify-between rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:shadow-xl transition-all duration-300 h-full min-w-0"
                    ariaLabel={novel.title}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget && e.target.closest('button, a, input, select')) {
                        return;
                      }
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectNovel(novel.id);
                      }
                    }}
                  >
                    <div className="flex flex-col min-w-0">
                      {/* Physical Book Cover Wrapper (Aspect 2:3 Compact) */}
                      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0 shadow-sm">
                        <NovelCover
                          title={novel.title}
                          author={novel.author_username}
                          coverUrl={novel.cover_object}
                          id={novel.id}
                          index={index}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 z-20">
                          <span className="px-2 py-0.5 text-[9px] font-mono uppercase bg-[var(--bg-card)]/90 backdrop-blur-xs border border-[var(--border-subtle)] text-[var(--text-sub)] rounded-full shadow-xs">
                            VOL. {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>
                      </div>

                      {/* Volume Metadata */}
                      <div className="mt-2.5 flex-1 flex flex-col justify-between min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span
                              className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-sub)] truncate max-w-[150px] inline-block"
                              title={novel.global_tone || (novel.channel === 'verified' ? 'VERIFIED' : 'COMMUNITY')}
                            >
                              + {novel.global_tone || (novel.channel === 'verified' ? 'VERIFIED' : 'COMMUNITY')}
                            </span>
                          </div>

                          <h4
                            className="font-sans text-xs sm:text-sm font-bold uppercase tracking-tight text-[var(--text-main)] line-clamp-2 leading-snug group-hover:text-[var(--accent)] transition-colors min-h-[2.4rem] flex items-start"
                            title={novel.title}
                          >
                            {novel.title}
                          </h4>

                          <div className="text-[11px] font-mono text-[var(--text-sub)] mt-1 truncate">
                            By {novel.author_username || 'SyncTone Author'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Row */}
                    <div className="pt-2.5 mt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                      <button
                        onClick={(e) => handleStartListening(novel, e)}
                        onMouseEnter={preloadReaderView}
                        onFocus={preloadReaderView}
                        onPointerDown={preloadReaderView}
                        className="boxed-btn-primary flex-1 py-1.5 px-3 text-[11px] flex items-center justify-center gap-1.5 cursor-pointer rounded-full active:scale-95 transition-all hover:scale-[1.03]"
                      >
                        <IconPlay className="w-3 h-3 fill-current" />
                        <span>Play</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNovel(novel.id);
                        }}
                        onMouseEnter={preloadNovelDetails}
                        onFocus={preloadNovelDetails}
                        onPointerDown={preloadNovelDetails}
                        className="boxed-btn py-1.5 px-3 text-[11px] text-[var(--text-sub)] hover:text-[var(--text-main)] cursor-pointer rounded-full active:scale-95 flex items-center justify-center gap-1.5 transition-all hover:scale-105"
                        title="View Novel Details"
                        aria-label="View Novel Details"
                      >
                        <IconBook className="w-3.5 h-3.5" />
                        <span>Read</span>
                      </button>
                    </div>
                  </Interactive3DCard>
                ))}

                {/* Upload Placeholder Card */}
                {onOpenAddNovel && (
                  <div
                    onClick={onOpenAddNovel}
                    style={{ animationDelay: `${Math.min(filteredNovels.length, 11) * 50}ms` }}
                    className="volume-card upload-novel-card catalog-card-animate group cursor-pointer border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--text-main)] flex flex-col justify-between p-3 sm:p-3.5 text-center transition-all bg-[var(--bg-card)]/40 hover:bg-[var(--bg-card)] rounded-2xl shadow-xs hover:shadow-xl h-full min-w-0"
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
                    <div className="flex flex-col min-w-0">
                      {/* Upper area matching Cover 2:3 aspect container */}
                      <div className="relative aspect-[2/3] w-full rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 flex flex-col items-center justify-center p-4 transition-colors group-hover:bg-[var(--bg-surface)] flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-main)] flex items-center justify-center mb-3 transition-transform group-hover:scale-110 shadow-sm">
                          <IconPlus className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-mono uppercase font-bold text-[var(--text-main)] tracking-wider">
                          Upload Novel
                        </span>
                        <span className="text-[9px] text-[var(--text-sub)] mt-1 font-mono tracking-tight text-center px-1">
                          EPUB • TXT • PDF
                        </span>
                        <div className="absolute top-2 left-2 z-20">
                          <span className="px-2 py-0.5 text-[9px] font-mono uppercase bg-[var(--bg-card)]/90 backdrop-blur-xs border border-[var(--border-subtle)] text-[var(--text-sub)] rounded-full shadow-xs">
                            STUDIO
                          </span>
                        </div>
                      </div>

                      {/* Metadata area matching regular card info */}
                      <div className="mt-2.5 flex-1 flex flex-col justify-between min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center justify-center gap-1.5 mb-1.5">
                            <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-sub)] truncate max-w-[150px] inline-block">
                              + VOICE SYNTHESIS
                            </span>
                          </div>
                          <h4 className="font-sans text-xs sm:text-sm font-bold uppercase tracking-tight text-[var(--text-main)] line-clamp-2 leading-snug group-hover:text-[var(--accent)] transition-colors min-h-[2.4rem] flex items-center justify-center">
                            Publish Volume
                          </h4>
                          <div className="text-[11px] font-mono text-[var(--text-sub)] mt-1 truncate text-center">
                            Multi-Voice Engine
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Row matching regular card buttons */}
                    <div className="pt-2.5 mt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-center">
                      <span className="boxed-btn-primary w-full py-1.5 px-3 text-[11px] font-mono uppercase font-semibold rounded-full flex items-center justify-center gap-1.5 transition-all group-hover:scale-[1.02]">
                        <IconPlus className="w-3.5 h-3.5" />
                        <span>Add Novel</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* 5. DEDICATED SECTION: PUBLISH & UPLOAD NOVEL                       */}
          {/* ================================================================= */}
          <section
            className="relative w-full rounded-3xl overflow-hidden p-6 sm:p-10 border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg"
            aria-label="Upload Novel Section"
          >
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
              {/* Left Column: Benefit Copy & Feature Badges */}
              <div className="space-y-4 max-w-2xl text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] font-mono tracking-wider uppercase text-[var(--text-sub)] shadow-xs">
                  <IconSparkles className="w-3.5 h-3.5 text-[var(--text-main)]" />
                  <span>Author Studio & Publishing</span>
                </div>

                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold font-sans uppercase tracking-tight text-[var(--text-main)]">
                  Publish Your Novel & Cast Your Characters
                </h3>

                <p className="text-xs sm:text-sm font-sans text-[var(--text-sub)] leading-relaxed max-w-xl">
                  Transform your written manuscript into an immersive multi-voice audio performance.
                  SyncTone pairs your characters with distinctive voices and delivers synchronized
                  read-along narration.
                </p>

                {/* Feature Badges Row */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-1 text-xs font-mono">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)]">
                    <IconMic className="w-3.5 h-3.5 text-[var(--text-main)]" />
                    <span>Multi-Voice Casting</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)]">
                    <IconSoundwave className="w-3.5 h-3.5 text-[var(--text-main)]" />
                    <span>Synchronized Audio</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)]">
                    <IconBook className="w-3.5 h-3.5 text-[var(--text-main)]" />
                    <span>Follow-Along Prose</span>
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-3">
                  <button
                    onClick={onOpenAddNovel}
                    className="boxed-btn-primary px-6 py-2.5 text-xs font-mono uppercase flex items-center gap-2 cursor-pointer active:scale-95 transition-transform rounded-full hover:scale-105"
                  >
                    <IconPlus className="w-4 h-4" />
                    <span>Upload Novel</span>
                  </button>
                  <button
                    onClick={() => {
                      setChannel('community');
                      window.scrollTo({ top: 600, behavior: 'smooth' });
                    }}
                    className="boxed-btn px-6 py-2.5 text-xs font-mono uppercase text-[var(--text-main)] hover:border-[var(--text-main)] cursor-pointer active:scale-95 transition-colors rounded-full hover:scale-105"
                  >
                    Explore Community Stories
                  </button>
                </div>
              </div>

              {/* Right Column: Monochrome Geometric Showcase Frame */}
              <div className="w-full max-w-xs flex-shrink-0 flex justify-center">
                <div className="w-48 h-56 rounded-2xl bg-[var(--bg-surface)] p-6 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden group border border-[var(--border-strong)] shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-main)] relative z-10 shadow-xs">
                    <IconMic className="w-5 h-5 text-[var(--text-main)]" />
                  </div>
                  <div className="relative z-10 space-y-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-sub)]">Studio Ready</span>
                    <p className="text-xs font-sans font-bold uppercase tracking-tight text-[var(--text-main)]">Voice Studio</p>
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
