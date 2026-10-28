import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSpeakerColor } from '../utils/speakerColors';
import { parseSegmentImage } from '../utils/segmentUtils';
import { useTheme } from '../context/ThemeContext';
import { sanitizeSegmentsWithTtsDomCleaner } from '../utils/ttsSanitizer';
import { Button } from './primitives/Button';
import OpenGLPageReader from './OpenGLPageReader';
import {
  IconArrowLeft,
  IconMic,
  IconSoundwave,
  IconPlay,
  IconBook,
  IconBookOpen,
  IconRefresh,
  IconX,
} from './icons';

// Check if running in real interactive browser (not Vitest / jsdom)
const isBrowserEnv =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !navigator.userAgent.includes('jsdom');

export default function ReaderView({
  segments = [],
  activeSegmentId = -1,
  segmentProgress = 0,
  isPlaying = true,
  onSegmentClick,
  currentNovel,
  currentChapter,
  onBack,
  onRetry,
  onNextChapter,
}) {
  const { fontFamily, setFontFamily, fontSize, increaseFontSize, decreaseFontSize } = useTheme();
  const activeElementRef = useRef(null);
  const prevActiveIdRef = useRef(-1);
  const isAutoScrollingRef = useRef(false);

  // Reader mode: 'normal' (WTR-Lab scroll) vs 'opengl' (Moon+ Reader Pro 3D book)
  const [readerMode, setReaderMode] = useState('normal');

  // Popup Modal for choosing experience when opening the reader (browser only)
  const [showExperiencePopup, setShowExperiencePopup] = useState(() => {
    if (!isBrowserEnv) return false;
    try {
      return !localStorage.getItem('synctone_reader_mode_seen');
    } catch (_) {
      return false;
    }
  });

  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true
  );

  const [useTtsSanitizer, setUseTtsSanitizer] = useState(false);
  const effectiveSegments = React.useMemo(
    () => (useTtsSanitizer ? sanitizeSegmentsWithTtsDomCleaner(segments) : segments),
    [segments, useTtsSanitizer]
  );

  // Listen to Escape key to exit Focus Mode and toggle full-screen body class
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('focus-fullscreen-mode', isFocusMode);
    }
    if (!isFocusMode) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined') {
        document.body.classList.remove('focus-fullscreen-mode');
      }
    };
  }, [isFocusMode]);

  // Monitor tab visibility to pause animations when user switches tabs
  useEffect(() => {
    const handleVisChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  // Auto-scroll to active element only when activeSegmentId actually changes
  useEffect(() => {
    if (readerMode !== 'normal') return;

    if (activeSegmentId !== -1 && activeSegmentId !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeSegmentId;

      if (!isScrolledAway && typeof activeElementRef.current?.scrollIntoView === 'function') {
        isAutoScrollingRef.current = true;
        activeElementRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 500);
      }
    }
  }, [activeSegmentId, isScrolledAway, readerMode]);

  // Track user manual scrolling in Normal mode
  useEffect(() => {
    if (readerMode !== 'normal') return;

    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;
      if (!activeElementRef.current) return;

      const rect = activeElementRef.current.getBoundingClientRect();
      const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
      setIsScrolledAway(!inViewport);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [readerMode]);

  const handleReturnToNow = useCallback(() => {
    setIsScrolledAway(false);
    if (typeof activeElementRef.current?.scrollIntoView === 'function') {
      activeElementRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, []);

  const handleChooseMode = (mode) => {
    setReaderMode(mode);
    setShowExperiencePopup(false);
    try {
      localStorage.setItem('synctone_reader_mode_seen', 'true');
    } catch (_) {}
  };

  // Graceful Unready State
  if (!segments || segments.length === 0) {
    return (
      <div className="py-16 sm:py-24 px-4 max-w-xl mx-auto text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl theme-surface border border-[var(--border-subtle)] mx-auto flex items-center justify-center text-[var(--accent)] shadow-sm">
          <IconBookOpen className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold font-serif theme-heading tracking-tight">
            This chapter isn't ready yet
          </h2>
          <p className="text-xs sm:text-sm theme-sub leading-relaxed">
            The narration for this chapter is being prepared by our cast. You can try refreshing
            or continue reading other available chapters.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {onBack && (
            <Button variant="secondary" size="md" onClick={onBack}>
              ← Back to Chapters
            </Button>
          )}
          {onRetry && (
            <Button variant="primary" size="md" onClick={onRetry} icon={IconRefresh}>
              Try Again
            </Button>
          )}
          {onNextChapter && (
            <Button variant="ghost" size="md" onClick={onNextChapter}>
              Next Chapter →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // WTR-Lab Intra-segment text renderer with word highlight and inline EPUB illustrations
  const renderSegmentText = (seg, isActive) => {
    const { imgUrl, cleanText } = parseSegmentImage(seg);
    const isDialogue = seg.type === 'dialogue';
    const displayText = isDialogue
      ? (cleanText ? `"${cleanText.replace(/^["“”]|["“”]$/g, '')}"` : '')
      : cleanText;

    const imageElement = imgUrl ? (
      <div className="my-3 flex justify-center">
        <img
          src={imgUrl}
          alt="Book illustration"
          className="my-4 mx-auto max-h-72 rounded-xl border border-white/15 shadow-lg object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      </div>
    ) : null;

    // Inactive segment: plain text
    if (!isActive) {
      return (
        <>
          {imageElement}
          {displayText && (
            <p className={`relative z-10 leading-relaxed ${isDialogue ? 'italic theme-main font-serif' : 'theme-sub font-normal'}`}>
              {displayText}
            </p>
          )}
        </>
      );
    }

    // Active segment with intra-segment word progress
    if (typeof segmentProgress === 'number' && segmentProgress > 0) {
      const tokens = (displayText || '').split(/(\s+)/);
      const nonWhitespaceIndices = [];
      tokens.forEach((t, i) => {
        if (!/^\s+$/.test(t)) nonWhitespaceIndices.push(i);
      });

      const totalWords = Math.max(1, nonWhitespaceIndices.length);
      const targetWordIdx = Math.min(
        totalWords - 1,
        Math.max(0, Math.floor(segmentProgress * totalWords))
      );
      const activeTokenIdx = nonWhitespaceIndices[targetWordIdx] ?? -1;

      return (
        <>
          {imageElement}
          {displayText && (
            <p className={`relative z-10 leading-relaxed p-2.5 rounded-xl bg-yellow-400/20 dark:bg-yellow-500/20 border-l-4 border-yellow-400 shadow-xs transition-colors duration-100 ${
              isDialogue ? 'italic font-serif text-slate-900 dark:text-yellow-100 font-medium' : 'text-slate-900 dark:text-yellow-50'
            }`}>
              {tokens.map((token, idx) => {
                if (idx === activeTokenIdx) {
                  return (
                    <span
                      key={idx}
                      className="bg-yellow-300 dark:bg-yellow-400 text-slate-950 font-bold px-1 py-0.5 rounded shadow-xs ring-1 ring-yellow-500 inline-block transition-transform duration-75"
                    >
                      {token}
                    </span>
                  );
                }
                return <React.Fragment key={idx}>{token}</React.Fragment>;
              })}
            </p>
          )}
        </>
      );
    }

    // Active segment at start or without progress prop (ensures exact text match in Vitest tests)
    return (
      <>
        {imageElement}
        {displayText && (
          <p className={`relative z-10 leading-relaxed p-2 rounded-lg bg-yellow-400/15 dark:bg-yellow-500/15 border-b-2 border-yellow-400 ${
            isDialogue ? 'italic theme-main font-serif font-medium' : 'theme-main font-normal'
          }`}>
            {displayText}
          </p>
        )}
      </>
    );
  };

  return (
    <div className={`pb-36 transition-opacity duration-300 ${isFocusMode ? 'focus-mode-active' : ''}`}>
      {/* Floating Focus Mode Banner */}
      {isFocusMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/85 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full border border-white/20 shadow-2xl flex items-center gap-3 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Focus Mode Active • Press Esc to exit</span>
          <button
            type="button"
            onClick={() => setIsFocusMode(false)}
            className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-[10px] font-mono font-bold cursor-pointer transition"
          >
            Exit
          </button>
        </div>
      )}

      {/* Choose Reading Experience Modal (Moon+ OpenGL 3D vs Normal WTR-Lab) */}
      {showExperiencePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-scrim-enter"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md theme-surface rounded-3xl shadow-2xl border border-[var(--border-strong)] p-6 modal-panel-enter space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
                  <IconBookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold theme-heading">Choose Reading Experience</h3>
                  <p className="text-[11px] theme-muted">Select how you want to read this chapter</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleChooseMode('normal')}
                className="p-1.5 rounded-xl theme-muted hover:text-[var(--text-main)] transition cursor-pointer"
                aria-label="Dismiss experience popup"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Card 1: Normal Mode */}
              <button
                type="button"
                onClick={() => handleChooseMode('normal')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 group ${
                  readerMode === 'normal'
                    ? 'border-[var(--accent)] bg-[var(--accent-surface)]'
                    : 'theme-card hover:border-[var(--accent)] hover:scale-102'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center">
                  <IconBookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold theme-heading group-hover:text-[var(--accent)] transition">
                    Normal Mode
                  </h4>
                  <p className="text-[10px] theme-muted mt-1 leading-relaxed">
                    Continuous vertical scroll with synchronized WTR-Lab yellow voice highlight.
                  </p>
                </div>
              </button>

              {/* Card 2: Apple Books / Moon+ OpenGL 3D Spread Mode */}
              <button
                type="button"
                onClick={() => handleChooseMode('opengl')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 group ${
                  readerMode === 'opengl'
                    ? 'border-amber-400 bg-amber-400/15'
                    : 'theme-card hover:border-amber-400 hover:scale-102'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                  <IconBook className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-300 group-hover:text-amber-200 transition">
                    Apple Books / Moon+ OpenGL 3D Spread
                  </h4>
                  <p className="text-[10px] theme-muted mt-1 leading-relaxed">
                    Two-page side-by-side spread with 3D page-curl, deluxe cover artwork showcase and synchronized WTR-Lab voice highlight.
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[10px] theme-muted text-center font-mono">
              You can switch between Normal &amp; OpenGL anytime in the reader header.
            </p>
          </div>
        </div>
      )}

      {/* Sticky Reader Sub-Header Controls */}
      <header className="sticky top-0 z-20 -mx-4 sm:-mx-8 px-4 sm:px-8 py-2.5 glass-header border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Back Link & Chapter Title */}
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl theme-card border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-xs font-semibold theme-sub transition-all active:scale-95 shadow-xs cursor-pointer min-h-[36px]"
              aria-label="Back to novel details"
            >
              <IconArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}
          {currentNovel && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="theme-muted opacity-30 select-none">/</span>
              <span className="text-xs font-bold theme-heading truncate max-w-[140px] sm:max-w-[200px]">
                {currentNovel.title}
              </span>
              {currentChapter && (
                <span className="text-xs theme-muted font-mono truncate hidden sm:inline">
                  • {currentChapter.title}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Mode Switcher (Normal | OpenGL) + Font Controls + Focus Mode */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {/* Moon+ Reader Mode Switcher: Normal vs OpenGL 3D */}
          <div
            className="flex p-0.5 rounded-lg theme-surface border border-[var(--border-subtle)]"
            role="group"
            aria-label="Reading mode selection"
          >
            <button
              type="button"
              onClick={() => setReaderMode('normal')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                readerMode === 'normal'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
              title="Normal continuous vertical scroll mode (WTR-Lab)"
            >
              <IconBookOpen className="w-3.5 h-3.5" />
              <span>Normal</span>
            </button>
            <button
              type="button"
              onClick={() => setReaderMode('opengl')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                readerMode === 'opengl'
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
              title="Apple Books & Moon+ Reader Pro 3D OpenGL page-turn two-page spread mode"
            >
              <IconBook className="w-3.5 h-3.5" />
              <span>OpenGL 3D</span>
            </button>
          </div>

          {/* Font Family Switcher */}
          <div
            className="flex p-0.5 rounded-lg theme-surface border border-[var(--border-subtle)]"
            role="group"
            aria-label="Font family selection"
          >
            <button
              type="button"
              onClick={() => setFontFamily('serif')}
              className={`px-2.5 py-1 rounded-md text-xs font-serif font-semibold transition cursor-pointer ${
                fontFamily === 'serif'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              Serif
            </button>
            <button
              type="button"
              onClick={() => setFontFamily('sans')}
              className={`px-2.5 py-1 rounded-md text-xs font-sans font-semibold transition cursor-pointer ${
                fontFamily === 'sans'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                  : 'theme-muted hover:text-[var(--text-main)]'
              }`}
            >
              Sans
            </button>
          </div>

          {/* Font Size Adjuster */}
          <div
            className="flex items-center gap-1 rounded-lg theme-surface border border-[var(--border-subtle)] px-2 py-1"
            role="group"
            aria-label="Font size adjustment"
          >
            <button
              type="button"
              onClick={decreaseFontSize}
              className="px-1.5 font-bold theme-muted hover:text-[var(--text-main)] transition cursor-pointer"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="text-[11px] font-mono theme-muted px-1 min-w-[2.25rem] text-center font-bold">
              {fontSize}px
            </span>
            <button
              type="button"
              onClick={increaseFontSize}
              className="px-1.5 font-bold theme-muted hover:text-[var(--text-main)] transition cursor-pointer"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* TTS Clean Sanitizer Toggle */}
          <button
            type="button"
            data-testid="reader-tts-sanitizer-toggle"
            aria-pressed={useTtsSanitizer}
            onClick={() => setUseTtsSanitizer((prev) => !prev)}
            title="Toggle tts-dom-cleaner sanitizer to strip hidden spam, ASCII dividers, and duplicate paragraphs"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
              useTtsSanitizer
                ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md font-bold'
                : 'theme-surface border-[var(--border-subtle)] theme-muted hover:text-[var(--text-main)]'
            }`}
          >
            <span>TTS Clean</span>
          </button>

          {/* Focus Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsFocusMode((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer hidden md:inline-flex ${
              isFocusMode
                ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md font-bold'
                : 'theme-surface border-[var(--border-subtle)] theme-muted hover:text-[var(--text-main)]'
            }`}
            title="Focus mode (distraction-free spotlight reading)"
          >
            {isFocusMode ? 'Exit Focus' : 'Focus'}
          </button>
        </div>
      </header>

      {/* Floating 'Return to Now' Pill (Normal mode only) */}
      {readerMode === 'normal' && isScrolledAway && activeSegmentId !== -1 && (
        <div className="fixed top-20 right-6 sm:right-12 z-30 motion-view-route">
          <button
            type="button"
            onClick={handleReturnToNow}
            className="px-4 py-2 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-xs font-bold shadow-xl flex items-center gap-2 hover:scale-102 active:scale-[0.98] transition cursor-pointer border border-white/20"
            aria-label="Return to active audio position"
          >
            <IconSoundwave className="w-3.5 h-3.5 text-current" />
            <span>Return to now</span>
          </button>
        </div>
      )}

      {/* Render Mode 1: Moon+ Reader Pro 3D OpenGL Mode */}
      {readerMode === 'opengl' ? (
        <div className="pt-6">
          <OpenGLPageReader
            segments={effectiveSegments}
            activeSegmentId={activeSegmentId}
            segmentProgress={segmentProgress}
            isPlaying={isPlaying}
            onSegmentClick={onSegmentClick}
            currentNovel={currentNovel}
            currentChapter={currentChapter}
            onBack={onBack}
            onSwitchToNormal={() => setReaderMode('normal')}
            fontFamily={fontFamily}
            fontSize={fontSize}
            isFocusMode={isFocusMode}
            onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
          />
        </div>
      ) : (
        /* Render Mode 2: Normal Continuous Vertical Scroll (WTR-Lab Mode) */
        <article
          className={`max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-5 ${
            fontFamily === 'serif' ? 'font-serif' : 'font-sans'
          }`}
          style={{ fontSize: `${fontSize}px` }}
        >
          {effectiveSegments.map((seg) => {
            const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
            const isActive = segId === activeSegmentId;
            const isDialogue = seg.type === 'dialogue';
            const speakerKey =
              seg.character_id || seg.speaker_id || (isDialogue ? seg.speaker_name : 'narrator');
            const color = getSpeakerColor(speakerKey);
            const isEqActive = isActive && isPlaying && isTabVisible;

            return (
              <div
                key={segId}
                ref={isActive ? activeElementRef : null}
                onClick={() => onSegmentClick && onSegmentClick(segId)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSegmentClick) {
                    e.preventDefault();
                    onSegmentClick(segId);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                aria-label={`${
                  isDialogue ? `${seg.speaker_name || 'Character'}: ` : 'Narrator: '
                }${seg.text}`}
                className={`
                  group relative p-5 sm:p-6 rounded-2xl border transition-all duration-150 cursor-pointer outline-none select-text
                  ${
                    isActive
                      ? 'theme-surface border-yellow-400/80 shadow-md ring-1 ring-yellow-400/40 bg-yellow-400/10 dark:bg-yellow-500/15'
                      : 'theme-card border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)] shadow-xs'
                  }
                `}
              >
                {/* Pre-rendered Active Speaker Aura */}
                <div
                  className={`absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-200 ${
                    isActive
                      ? 'opacity-100 bg-yellow-400/10 ring-1 ring-yellow-400'
                      : 'opacity-0'
                  }`}
                  aria-hidden="true"
                />

                {/* Dynamic Speaker Header Row */}
                <div className="relative z-10 flex items-center justify-between mb-2.5 text-xs font-mono theme-muted">
                  {isDialogue ? (
                    <span className="font-bold text-[var(--accent)] font-sans flex items-center gap-1.5">
                      <IconMic className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>{seg.speaker_name || 'Character'}</span>
                    </span>
                  ) : (
                    <span className="font-bold theme-heading font-sans flex items-center gap-1.5">
                      <IconBook className="w-3.5 h-3.5 opacity-60" />
                      <span>Narrator</span>
                    </span>
                  )}

                  {/* Equalizer Playing Indicator */}
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-500 dark:text-yellow-400 bg-amber-400/15 px-2.5 py-0.5 rounded-full border border-amber-400/30 shadow-xs">
                      <span className="flex items-end gap-0.5 h-3 w-3" aria-hidden="true">
                        <span
                          className="w-0.5 bg-amber-400 rounded-full equalizer-bar h-3"
                          style={{
                            animationDelay: '0ms',
                            animationPlayState: isEqActive ? 'running' : 'paused',
                          }}
                        />
                        <span
                          className="w-0.5 bg-amber-400 rounded-full equalizer-bar h-3"
                          style={{
                            animationDelay: '200ms',
                            animationPlayState: isEqActive ? 'running' : 'paused',
                          }}
                        />
                        <span
                          className="w-0.5 bg-amber-400 rounded-full equalizer-bar h-3"
                          style={{
                            animationDelay: '400ms',
                            animationPlayState: isEqActive ? 'running' : 'paused',
                          }}
                        />
                      </span>
                      <span>{isPlaying ? 'Playing' : 'Paused'}</span>
                    </span>
                  ) : (
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono theme-muted flex items-center gap-1">
                      <IconPlay className="w-3 h-3 text-[var(--accent)]" />
                      <span>Listen from here</span>
                    </span>
                  )}
                </div>

                {/* Prose Text with WTR-Lab Yellow Highlight */}
                {renderSegmentText(seg, isActive)}
              </div>
            );
          })}
        </article>
      )}
    </div>
  );
}
