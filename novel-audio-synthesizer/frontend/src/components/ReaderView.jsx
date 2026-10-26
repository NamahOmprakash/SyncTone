import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSpeakerColor } from '../utils/speakerColors';
import { useTheme } from '../context/ThemeContext';
import { Button } from './primitives/Button';
import {
  IconArrowLeft,
  IconMic,
  IconSoundwave,
  IconPlay,
  IconBook,
  IconBookOpen,
  IconRefresh,
} from './icons';

export default function ReaderView({
  segments = [],
  activeSegmentId = -1,
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
  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true
  );

  // Monitor tab visibility to immediately pause animations when user switches tabs
  useEffect(() => {
    const handleVisChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  // Auto-scroll to active element only when activeSegmentId actually changes
  useEffect(() => {
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
  }, [activeSegmentId, isScrolledAway]);

  // Track user manual scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;
      if (!activeElementRef.current) return;

      const rect = activeElementRef.current.getBoundingClientRect();
      const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
      setIsScrolledAway(!inViewport);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleReturnToNow = useCallback(() => {
    setIsScrolledAway(false);
    if (typeof activeElementRef.current?.scrollIntoView === 'function') {
      activeElementRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, []);

  // Graceful Unready State (replaces developer strings with calm benefit-driven language)
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

  return (
    <div className={`pb-36 transition-opacity duration-300 ${isFocusMode ? 'focus-mode-active' : ''}`}>
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

        {/* Right: Typography Controls (Sans/Serif + Size A-/A+ + Focus Mode) */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {/* Font Family Switcher */}
          <div className="flex p-0.5 rounded-lg theme-surface border border-[var(--border-subtle)]" role="group" aria-label="Font family selection">
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
          <div className="flex items-center gap-1 rounded-lg theme-surface border border-[var(--border-subtle)] px-2 py-1" role="group" aria-label="Font size adjustment">
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

          {/* Focus Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsFocusMode((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer hidden md:inline-flex ${
              isFocusMode
                ? 'bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)]'
                : 'theme-surface border-[var(--border-subtle)] theme-muted hover:text-[var(--text-main)]'
            }`}
            title="Focus mode (distraction free reading)"
          >
            {isFocusMode ? 'Exit Focus' : 'Focus'}
          </button>
        </div>
      </header>

      {/* Floating 'Return to Now' Pill (Compositor Slide & Fade, Zero Overshoot) */}
      {isScrolledAway && activeSegmentId !== -1 && (
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

      {/* Reader Prose Column (Strict 65-75ch Measure) */}
      <article
        className={`max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-5 ${
          fontFamily === 'serif' ? 'font-serif' : 'font-sans'
        }`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {segments.map((seg) => {
          const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
          const isActive = segId === activeSegmentId;
          const isDialogue = seg.type === 'dialogue';
          const speakerKey = seg.character_id || seg.speaker_id || (isDialogue ? seg.speaker_name : 'narrator');
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
              aria-label={`${isDialogue ? `${seg.speaker_name || 'Character'}: ` : 'Narrator: '}${seg.text}`}
              className={`
                group relative p-5 sm:p-6 rounded-2xl border transition-transform duration-120 cursor-pointer outline-none select-text
                ${
                  isActive
                    ? 'theme-surface border-[var(--accent)] shadow-md'
                    : 'theme-card border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)] shadow-xs'
                }
              `}
            >
              {/* Pre-rendered Active Speaker Aura (Opacity Only — Zero Layout Shift) */}
              <div
                className={`absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-200 ${
                  isActive
                    ? 'opacity-100 bg-[var(--accent-surface)] ring-1 ring-[var(--accent)]'
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

                {/* Equalizer Playing Indicator (Compositor Only — Paused when tab hidden/paused) */}
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/25 shadow-xs">
                    <span className="flex items-end gap-0.5 h-3 w-3" aria-hidden="true">
                      <span
                        className="w-0.5 bg-emerald-400 rounded-full equalizer-bar h-3"
                        style={{
                          animationDelay: '0ms',
                          animationPlayState: isEqActive ? 'running' : 'paused',
                        }}
                      />
                      <span
                        className="w-0.5 bg-emerald-400 rounded-full equalizer-bar h-3"
                        style={{
                          animationDelay: '200ms',
                          animationPlayState: isEqActive ? 'running' : 'paused',
                        }}
                      />
                      <span
                        className="w-0.5 bg-emerald-400 rounded-full equalizer-bar h-3"
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

              {/* Prose Text with Italic Dialogue Formatting */}
              <p className={`relative z-10 leading-relaxed ${isDialogue ? 'italic theme-main font-serif' : 'theme-sub font-normal'}`}>
                {isDialogue ? `"${seg.text.replace(/^["“”]|["“”]$/g, '')}"` : seg.text}
              </p>
            </div>
          );
        })}
      </article>
    </div>
  );
}
