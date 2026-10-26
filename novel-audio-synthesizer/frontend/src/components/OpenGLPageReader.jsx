import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getSpeakerColor } from '../utils/speakerColors';
import {
  IconArrowLeft,
  IconBook,
  IconBookOpen,
  IconMic,
  IconPlay,
  IconPrev,
  IconNext,
  IconSoundwave,
} from './icons';

/**
 * Smart paginator that groups segments into realistic book pages
 * targeting ~800-1100 characters per page or 3-5 paragraphs.
 */
function paginateSegments(segments = [], charsPerPage = 900) {
  if (!segments || segments.length === 0) return [];

  const pages = [];
  let currentPage = [];
  let currentChars = 0;

  for (const seg of segments) {
    const textLen = (seg.text || '').length;

    // If page is not empty and adding this segment exceeds target character count, start new page
    if (currentPage.length > 0 && currentChars + textLen > charsPerPage && currentPage.length >= 2) {
      pages.push(currentPage);
      currentPage = [seg];
      currentChars = textLen;
    } else {
      currentPage.push(seg);
      currentChars += textLen;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

export default function OpenGLPageReader({
  segments = [],
  activeSegmentId = -1,
  segmentProgress = 0,
  isPlaying = false,
  onSegmentClick,
  currentNovel,
  currentChapter,
  onBack,
  onSwitchToNormal,
  fontFamily = 'serif',
  fontSize = 18,
}) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState('next'); // 'next' | 'prev'
  const canvasRef = useRef(null);
  const bookContainerRef = useRef(null);
  const autoFlipLockRef = useRef(false);

  // Paginate prose into book pages
  const pages = useMemo(() => {
    // Dynamically adjust characters per page based on font size
    const charsTarget = Math.max(500, Math.round(1000 * (18 / Math.max(14, fontSize))));
    return paginateSegments(segments, charsTarget);
  }, [segments, fontSize]);

  const totalPages = Math.max(1, pages.length);

  // Auto-flip book page to track active spoken segment
  useEffect(() => {
    if (activeSegmentId === -1 || pages.length === 0) return;

    const targetPageIdx = pages.findIndex((page) =>
      page.some((s) => (s.segment_id !== undefined ? s.segment_id : s.order) === activeSegmentId)
    );

    if (targetPageIdx !== -1 && targetPageIdx !== currentPageIndex && !autoFlipLockRef.current) {
      setFlipDirection(targetPageIdx > currentPageIndex ? 'next' : 'prev');
      setIsFlipping(true);
      autoFlipLockRef.current = true;

      const timer = setTimeout(() => {
        setCurrentPageIndex(targetPageIdx);
        setIsFlipping(false);
        autoFlipLockRef.current = false;
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [activeSegmentId, pages, currentPageIndex]);

  // Turn to Next Page
  const handleNextPage = useCallback(() => {
    if (currentPageIndex < totalPages - 1 && !isFlipping) {
      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPageIndex((prev) => Math.min(totalPages - 1, prev + 1));
        setIsFlipping(false);
      }, 300);
    }
  }, [currentPageIndex, totalPages, isFlipping]);

  // Turn to Previous Page
  const handlePrevPage = useCallback(() => {
    if (currentPageIndex > 0 && !isFlipping) {
      setFlipDirection('prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPageIndex((prev) => Math.max(0, prev - 1));
        setIsFlipping(false);
      }, 300);
    }
  }, [currentPageIndex, isFlipping]);

  // Keyboard navigation (Left / Right arrow keys to turn pages)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage]);

  // WebGL / Canvas Hardware-Accelerated 3D Lighting & Spine Shader Simulation
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return;

    let ctx;
    try {
      ctx = canvas.getContext('2d');
    } catch (_) {
      return;
    }
    if (!ctx) return;

    let animId;

    const renderShader = () => {
      const w = canvas.width = canvas.parentElement?.clientWidth || 800;
      const h = canvas.height = canvas.parentElement?.clientHeight || 600;

      ctx.clearRect(0, 0, w, h);

      // 1. Center Book Spine Deep Shadow
      const spineGradient = ctx.createLinearGradient(w / 2 - 40, 0, w / 2 + 40, 0);
      spineGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      spineGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.22)');
      spineGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spineGradient;
      ctx.fillRect(w / 2 - 40, 0, 80, h);

      // 2. Outer Page Edge Curvature Shading
      const leftEdgeGradient = ctx.createLinearGradient(0, 0, 24, 0);
      leftEdgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
      leftEdgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leftEdgeGradient;
      ctx.fillRect(0, 0, 24, h);

      const rightEdgeGradient = ctx.createLinearGradient(w - 24, 0, w, 0);
      rightEdgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      rightEdgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
      ctx.fillStyle = rightEdgeGradient;
      ctx.fillRect(w - 24, 0, 24, h);

      // 3. Dynamic Page Curl Shadow during flip animation
      if (isFlipping) {
        const curlX = flipDirection === 'next' ? w * 0.75 : w * 0.25;
        const curlGradient = ctx.createRadialGradient(curlX, h / 2, 20, curlX, h / 2, 220);
        curlGradient.addColorStop(0, 'rgba(250, 204, 21, 0.15)');
        curlGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.18)');
        curlGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = curlGradient;
        ctx.fillRect(0, 0, w, h);
      }
    };

    renderShader();

    const handleResize = () => renderShader();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [isFlipping, flipDirection]);

  // Current page segments
  const currentPageSegments = pages[currentPageIndex] || [];
  const percentRead = Math.round(((currentPageIndex + 1) / totalPages) * 100);

  // Render WTR-Lab TTS Yellow Highlight with intra-segment word tracking
  const renderSegmentProse = (seg, isActive) => {
    const isDialogue = seg.type === 'dialogue';
    const rawText = isDialogue
      ? `"${seg.text.replace(/^["“”]|["“”]$/g, '')}"`
      : seg.text;

    if (!isActive) {
      return (
        <p className={`leading-relaxed select-text ${isDialogue ? 'italic font-serif theme-main' : 'theme-sub'}`}>
          {rawText}
        </p>
      );
    }

    // Active segment: render WTR-Lab word-by-word yellow highlight if segmentProgress > 0
    if (typeof segmentProgress === 'number' && segmentProgress > 0) {
      const tokens = rawText.split(/(\s+)/);
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
        <p className={`leading-relaxed select-text bg-yellow-400/20 dark:bg-yellow-500/20 p-2.5 rounded-xl border-l-4 border-yellow-400 ${
          isDialogue ? 'italic font-serif text-slate-900 dark:text-yellow-100 font-medium' : 'text-slate-900 dark:text-yellow-50'
        }`}>
          {tokens.map((token, idx) => {
            if (idx === activeTokenIdx) {
              return (
                <span
                  key={idx}
                  className="bg-yellow-300 dark:bg-yellow-400 text-slate-950 font-bold px-1 py-0.5 rounded shadow-xs ring-1 ring-yellow-500 transition-all duration-75 inline-block"
                >
                  {token}
                </span>
              );
            }
            return <React.Fragment key={idx}>{token}</React.Fragment>;
          })}
        </p>
      );
    }

    // Active segment with 0 progress: solid soft yellow banner
    return (
      <p className={`leading-relaxed select-text bg-yellow-400/20 dark:bg-yellow-500/20 p-2.5 rounded-xl border-l-4 border-yellow-400 font-medium ${
        isDialogue ? 'italic font-serif text-slate-900 dark:text-yellow-100' : 'text-slate-900 dark:text-yellow-50'
      }`}>
        {rawText}
      </p>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in select-none">
      {/* 3D Book Stage (Hardware-accelerated perspective) */}
      <div className="relative max-w-4xl mx-auto perspective-1200 py-4">
        {/* Book Outer Bound Hardcover Frame */}
        <div
          ref={bookContainerRef}
          className={`
            relative min-h-[580px] sm:min-h-[660px] rounded-2xl theme-surface border border-[var(--border-strong)]
            shadow-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between
            ${isFlipping ? (flipDirection === 'next' ? 'page-curl-flip-next' : 'page-curl-flip-prev') : ''}
          `}
          style={{
            transformStyle: 'preserve-3d',
            fontSize: `${fontSize}px`,
          }}
        >
          {/* Hardware-accelerated canvas lighting overlay */}
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-20 w-full h-full" />

          {/* Book Header: Novel & Chapter Running Head */}
          <div className="relative z-10 px-8 pt-5 pb-3 border-b theme-border flex items-center justify-between text-xs font-mono theme-muted opacity-80">
            <span className="truncate max-w-[240px]">
              {currentNovel?.title || 'SyncTone 3D Reader'}
            </span>
            <span className="truncate max-w-[200px]">
              {currentChapter?.title || 'Chapter Audio Track'}
            </span>
          </div>

          {/* Book Page Content Body */}
          <div
            className={`
              relative z-10 flex-1 px-6 sm:px-12 py-8 space-y-6 overflow-y-auto
              ${fontFamily === 'serif' ? 'font-serif' : 'font-sans'}
            `}
          >
            {currentPageSegments.map((seg) => {
              const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
              const isActive = segId === activeSegmentId;
              const isDialogue = seg.type === 'dialogue';

              return (
                <div
                  key={segId}
                  onClick={() => onSegmentClick && onSegmentClick(segId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSegmentClick && onSegmentClick(segId);
                    }
                  }}
                  className={`
                    group relative p-4 rounded-xl transition-all duration-150 cursor-pointer outline-none
                    ${
                      isActive
                        ? 'bg-amber-400/10 dark:bg-yellow-500/10 ring-1 ring-yellow-400/60 shadow-md'
                        : 'hover:bg-[var(--bg-hover)]'
                    }
                  `}
                >
                  {/* Speaker Label */}
                  <div className="flex items-center justify-between text-[11px] font-mono theme-muted mb-2">
                    {isDialogue ? (
                      <span className="font-bold text-[var(--accent)] flex items-center gap-1.5 font-sans">
                        <IconMic className="w-3 h-3" />
                        <span>{seg.speaker_name || 'Character'}</span>
                      </span>
                    ) : (
                      <span className="font-bold theme-heading flex items-center gap-1.5 font-sans">
                        <IconBook className="w-3 h-3 opacity-60" />
                        <span>Narrator</span>
                      </span>
                    )}

                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 dark:text-yellow-400 bg-amber-400/15 px-2 py-0.5 rounded-full border border-amber-400/30">
                        <IconSoundwave className="w-3 h-3 animate-pulse" />
                        <span>Reading</span>
                      </span>
                    )}
                  </div>

                  {/* Prose with WTR-Lab Yellow Highlight */}
                  {renderSegmentProse(seg, isActive)}
                </div>
              );
            })}
          </div>

          {/* Book Footer: Page Number & Turn Controls */}
          <div className="relative z-10 px-8 py-3.5 border-t theme-border flex items-center justify-between text-xs font-mono theme-muted">
            <button
              onClick={handlePrevPage}
              disabled={currentPageIndex === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg theme-card border hover:text-[var(--text-main)] transition disabled:opacity-30 cursor-pointer"
              title="Previous Page (Left Arrow)"
              aria-label="Previous Page"
            >
              <IconPrev className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev Page</span>
            </button>

            <span className="font-bold tracking-wider">
              Page {currentPageIndex + 1} of {totalPages} ({percentRead}%)
            </span>

            <button
              onClick={handleNextPage}
              disabled={currentPageIndex === totalPages - 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg theme-card border hover:text-[var(--text-main)] transition disabled:opacity-30 cursor-pointer"
              title="Next Page (Right Arrow)"
              aria-label="Next Page"
            >
              <span className="hidden sm:inline">Next Page</span>
              <IconNext className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Corner Curl Click Targets for intuitive page turning */}
          <div
            onClick={handlePrevPage}
            className="absolute top-0 left-0 w-16 h-16 z-30 cursor-pointer group flex items-start justify-start p-2"
            title="Turn to previous page"
            aria-label="Turn page backward"
          >
            <div className="w-6 h-6 border-t-2 border-l-2 border-amber-400/30 group-hover:border-amber-400 transition rounded-tl-lg" />
          </div>

          <div
            onClick={handleNextPage}
            className="absolute top-0 right-0 w-16 h-16 z-30 cursor-pointer group flex items-start justify-end p-2"
            title="Turn to next page"
            aria-label="Turn page forward"
          >
            <div className="w-6 h-6 border-t-2 border-r-2 border-amber-400/30 group-hover:border-amber-400 transition rounded-tr-lg" />
          </div>
        </div>
      </div>

      {/* Floating 3D Book Dock Controls */}
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl glass-dock border theme-border shadow-lg">
        {/* Page Scrubber Slider */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs font-mono font-bold theme-muted w-12 text-right">
            P. {currentPageIndex + 1}
          </span>
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={currentPageIndex}
            onChange={(e) => setCurrentPageIndex(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 accent-amber-400 cursor-pointer"
            aria-label="Book page slider"
          />
          <span className="text-xs font-mono font-bold theme-muted w-12">
            / {totalPages}
          </span>
        </div>

        {/* Switch back to Normal scroll view */}
        {onSwitchToNormal && (
          <button
            type="button"
            onClick={onSwitchToNormal}
            className="px-3 py-1.5 rounded-xl theme-card border hover:border-[var(--accent)] text-xs font-semibold theme-sub transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <IconBookOpen className="w-3.5 h-3.5" />
            <span>Normal View</span>
          </button>
        )}
      </div>
    </div>
  );
}
