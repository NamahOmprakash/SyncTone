import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getSpeakerColor } from '../utils/speakerColors';
import { parseSegmentImage } from '../utils/segmentUtils';
import NovelCover from './NovelCover';
import {
  IconArrowLeft,
  IconBook,
  IconBookOpen,
  IconMic,
  IconPlay,
  IconPrev,
  IconNext,
  IconChevronLeft,
  IconChevronRight,
  IconSoundwave,
} from './icons';

/**
 * Smart paginator that groups segments into realistic literary book pages
 * targeting ~850-1000 characters per page or 3-5 paragraphs.
 */
function paginateSegments(segments = [], charsPerPage = 850) {
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

  // If character-based pagination produced only 1 page but chapter has >= 2 segments,
  // split segments into smaller pages of at most 2-3 segments per page (or ~450 chars)
  // so every multi-paragraph chapter has multiple pages and spreads that can turn!
  if (pages.length === 1 && segments.length >= 2) {
    const subPages = [];
    let cur = [];
    let chars = 0;
    const maxChars = Math.min(charsPerPage, 450);
    const maxSegs = segments.length <= 3 ? 1 : 2;

    for (const seg of segments) {
      const textLen = (seg.text || '').length;
      if (cur.length > 0 && (chars + textLen > maxChars || cur.length >= maxSegs)) {
        subPages.push(cur);
        cur = [seg];
        chars = textLen;
      } else {
        cur.push(seg);
        chars += textLen;
      }
    }
    if (cur.length > 0) {
      subPages.push(cur);
    }
    if (subPages.length > 1) {
      return subPages;
    }
    // Fallback for short segments: 1 per page if <= 3 segments, else 2 per page
    const fallbackPages = [];
    const step = segments.length <= 3 ? 1 : 2;
    for (let i = 0; i < segments.length; i += step) {
      fallbackPages.push(segments.slice(i, i + step));
    }
    return fallbackPages;
  }

  return pages;
}

/**
 * High-fidelity Hogwarts Heraldic Crest Ornament matching Apple Books Screenshot 2
 * features 4 house quarters (Lion, Eagle, Serpent, Badger), central 'H', and Latin motto banner.
 */
function HogwartsCrest({ className = 'w-44 h-44 sm:w-48 sm:h-48' }) {
  return (
    <div className="flex flex-col items-center justify-center my-3 select-none">
      <div className="relative p-3.5 rounded-2xl bg-[#faf6ee] dark:bg-[#111114] border border-amber-900/20 dark:border-amber-400/20 shadow-md">
        <svg
          viewBox="0 0 240 240"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Shield Outline */}
          <path
            d="M120 18 C160 18 200 30 200 70 C200 135 155 190 120 215 C85 190 40 135 40 70 C40 30 80 18 120 18 Z"
            fill="#18181b"
            stroke="#c5a059"
            strokeWidth="5"
          />

          {/* Quarter 1: Gryffindor Red (Top Left) */}
          <path
            d="M120 22 C90 22 55 32 45 70 C45 105 70 120 120 120 L120 22 Z"
            fill="#740001"
            opacity="0.9"
          />

          {/* Quarter 2: Ravenclaw Blue (Top Right) */}
          <path
            d="M120 22 C150 22 185 32 195 70 C195 105 170 120 120 120 L120 22 Z"
            fill="#0e1a40"
            opacity="0.9"
          />

          {/* Quarter 3: Slytherin Green (Bottom Left) */}
          <path
            d="M45 70 C45 130 85 180 120 210 L120 120 C70 120 45 105 45 70 Z"
            fill="#1a472a"
            opacity="0.9"
          />

          {/* Quarter 4: Hufflepuff Yellow (Bottom Right) */}
          <path
            d="M195 70 C195 130 155 180 120 210 L120 120 C170 120 195 105 195 70 Z"
            fill="#ecb939"
            opacity="0.85"
          />

          {/* Center Dividing Lines */}
          <line x1="120" y1="20" x2="120" y2="212" stroke="#c5a059" strokeWidth="3" />
          <line x1="42" y1="120" x2="198" y2="120" stroke="#c5a059" strokeWidth="3" />

          {/* Quarter 1: Gryffindor Lion Silhouette */}
          <g transform="translate(68, 52) scale(0.7)">
            <path
              d="M18 10 C18 6 24 2 30 5 C34 7 36 12 34 16 C38 18 42 22 40 28 C38 32 34 34 30 36 C32 42 34 48 38 52 C32 52 26 48 24 44 C22 48 18 52 14 52 C16 46 16 40 18 34 C12 34 8 28 8 22 C8 16 14 12 18 10 Z"
              fill="#e6b800"
            />
          </g>

          {/* Quarter 2: Ravenclaw Eagle Silhouette */}
          <g transform="translate(138, 52) scale(0.7)">
            <path
              d="M32 8 C28 14 20 18 14 22 C22 24 30 26 36 30 C26 34 16 38 10 42 C20 44 32 42 40 46 C34 50 26 54 22 56 C34 54 44 48 48 40 C52 30 48 18 32 8 Z"
              fill="#dcdcdc"
            />
          </g>

          {/* Quarter 3: Slytherin Serpent Silhouette */}
          <g transform="translate(66, 130) scale(0.7)">
            <path
              d="M36 8 C26 6 16 12 14 22 C12 32 24 36 32 40 C38 44 38 52 32 56 C24 60 14 54 12 46 L6 48 C8 60 22 68 34 62 C44 56 46 44 38 36 C30 30 20 26 22 18 C24 12 32 10 38 14 Z"
              fill="#e0e0e0"
            />
          </g>

          {/* Quarter 4: Hufflepuff Badger Silhouette */}
          <g transform="translate(142, 132) scale(0.68)">
            <path
              d="M12 28 C16 20 26 14 36 16 C46 18 52 26 50 36 C42 36 34 34 26 38 C20 42 16 48 14 54 C10 48 8 40 10 32 Z"
              fill="#18181b"
            />
            <path d="M22 22 L40 28" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* Center Monogram Diamond Badge (H) */}
          <polygon
            points="120,95 138,120 120,145 102,120"
            fill="#121214"
            stroke="#c5a059"
            strokeWidth="2.5"
          />
          <text
            x="120"
            y="126"
            textAnchor="middle"
            fill="#c5a059"
            fontSize="18"
            fontFamily="serif"
            fontWeight="bold"
          >
            H
          </text>

          {/* Bottom Banner Ribbon */}
          <path
            d="M30 220 Q120 238 210 220 Q190 208 120 216 Q50 208 30 220 Z"
            fill="#f7edd8"
            stroke="#8c6d31"
            strokeWidth="1.5"
          />
          <text
            x="120"
            y="218"
            textAnchor="middle"
            fill="#4a3718"
            fontSize="7"
            fontFamily="serif"
            fontWeight="bold"
            letterSpacing="0.8"
          >
            DRACO DORMIENS NUNQUAM TITILLANDUS
          </text>
        </svg>
      </div>
    </div>
  );
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
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState('next'); // 'next' | 'prev'
  const [lastJumpPage, setLastJumpPage] = useState(1);
  const [showCoverSpread, setShowCoverSpread] = useState(false);

  const canvasRef = useRef(null);
  const bookContainerRef = useRef(null);
  const autoFlipLockRef = useRef(false);

  const isHarryPotter = useMemo(() => {
    return (currentNovel?.title || '').toLowerCase().includes('harry potter');
  }, [currentNovel?.title]);

  const chapterOpeningImg = useMemo(() => {
    if (segments && segments.length > 0) {
      const firstSegParsed = parseSegmentImage(segments[0]);
      if (firstSegParsed.imgUrl) return firstSegParsed.imgUrl;
    }
    return currentChapter?.image_url || null;
  }, [segments, currentChapter]);

  // Paginate prose into book pages
  const pages = useMemo(() => {
    const charsTarget = Math.max(500, Math.round(900 * (18 / Math.max(14, fontSize))));
    return paginateSegments(segments, charsTarget);
  }, [segments, fontSize]);

  const totalPages = Math.max(1, pages.length);
  // Total two-page spreads: 2 pages per spread
  const totalSpreads = Math.max(1, Math.ceil(totalPages / 2));

  // Determine which pages belong to the current spread
  const leftPageIdx = currentSpreadIndex * 2;
  const rightPageIdx = currentSpreadIndex * 2 + 1;
  const leftPageSegments = pages[leftPageIdx] || [];
  const rightPageSegments = pages[rightPageIdx] || [];
  const leftPageNum = leftPageIdx + 1;
  const rightPageNum = rightPageIdx + 1;

  // Auto-flip spread to track active spoken segment
  useEffect(() => {
    if (activeSegmentId === -1 || pages.length === 0) return;

    const targetPageIdx = pages.findIndex((page) =>
      page.some((s) => (s.segment_id !== undefined ? s.segment_id : s.order) === activeSegmentId)
    );

    if (targetPageIdx !== -1) {
      const targetSpreadIdx = Math.floor(targetPageIdx / 2);

      // If active segment is on Page 2 of Spread 0 while cover is showing, automatically switch to prose
      if (targetSpreadIdx === 0 && targetPageIdx === 1 && showCoverSpread) {
        setShowCoverSpread(false);
      }

      if (targetSpreadIdx !== currentSpreadIndex && !autoFlipLockRef.current) {
        setLastJumpPage(currentSpreadIndex * 2 + 1);
        setFlipDirection(targetSpreadIdx > currentSpreadIndex ? 'next' : 'prev');
        setIsFlipping(true);
        autoFlipLockRef.current = true;

        const timer = setTimeout(() => {
          setCurrentSpreadIndex(targetSpreadIdx);
          setIsFlipping(false);
          autoFlipLockRef.current = false;
        }, 350);

        return () => clearTimeout(timer);
      }
    }
  }, [activeSegmentId, pages, currentSpreadIndex, showCoverSpread]);

  // Turn to Next Spread
  const handleNextPage = useCallback(() => {
    if (currentSpreadIndex < totalSpreads - 1 && !isFlipping) {
      setLastJumpPage(currentSpreadIndex * 2 + 1);
      setFlipDirection('next');
      setIsFlipping(true);
      const nextSpread = Math.min(totalSpreads - 1, currentSpreadIndex + 1);
      setTimeout(() => {
        setCurrentSpreadIndex(nextSpread);
        setIsFlipping(false);
        const nextLeftPage = pages[nextSpread * 2];
        if (nextLeftPage && nextLeftPage.length > 0 && onSegmentClick) {
          const firstSeg = nextLeftPage[0];
          const segId = firstSeg.segment_id !== undefined ? firstSeg.segment_id : firstSeg.order;
          onSegmentClick(segId);
        }
      }, 300);
    }
  }, [currentSpreadIndex, totalSpreads, isFlipping, pages, onSegmentClick]);

  // Turn to Previous Spread
  const handlePrevPage = useCallback(() => {
    if (currentSpreadIndex > 0 && !isFlipping) {
      setLastJumpPage(currentSpreadIndex * 2 + 1);
      setFlipDirection('prev');
      setIsFlipping(true);
      const prevSpread = Math.max(0, currentSpreadIndex - 1);
      setTimeout(() => {
        setCurrentSpreadIndex(prevSpread);
        setIsFlipping(false);
        const prevLeftPage = pages[prevSpread * 2];
        if (prevLeftPage && prevLeftPage.length > 0 && onSegmentClick) {
          const firstSeg = prevLeftPage[0];
          const segId = firstSeg.segment_id !== undefined ? firstSeg.segment_id : firstSeg.order;
          onSegmentClick(segId);
        }
      }, 300);
    }
  }, [currentSpreadIndex, isFlipping, pages, onSegmentClick]);

  // Apple Books Jump-Back (matching Screenshot 1 bottom-left ↩ pill)
  const handleJumpBack = useCallback(() => {
    const targetSpread = Math.floor(Math.max(0, lastJumpPage - 1) / 2);
    if (targetSpread !== currentSpreadIndex && !isFlipping) {
      setLastJumpPage(currentSpreadIndex * 2 + 1);
      setFlipDirection(targetSpread > currentSpreadIndex ? 'next' : 'prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentSpreadIndex(targetSpread);
        setIsFlipping(false);
      }, 300);
    }
  }, [lastJumpPage, currentSpreadIndex, isFlipping]);

  // Keyboard navigation (Left / Right arrow keys & PageUp / PageDown)
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

  // WebGL / Canvas Hardware-Accelerated 3D Lighting & Center Spine Shader Simulation
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
      const w = (canvas.width = canvas.parentElement?.clientWidth || 900);
      const h = (canvas.height = canvas.parentElement?.clientHeight || 650);

      ctx.clearRect(0, 0, w, h);

      // 1. Center Book Spine Deep Shadow (Between Left and Right spread pages)
      const spineGradient = ctx.createLinearGradient(w / 2 - 40, 0, w / 2 + 40, 0);
      spineGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      spineGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)');
      spineGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spineGradient;
      ctx.fillRect(w / 2 - 40, 0, 80, h);

      // 2. Outer Page Edge Curvature Shading
      const leftEdgeGradient = ctx.createLinearGradient(0, 0, 24, 0);
      leftEdgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.14)');
      leftEdgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leftEdgeGradient;
      ctx.fillRect(0, 0, 24, h);

      const rightEdgeGradient = ctx.createLinearGradient(w - 24, 0, w, 0);
      rightEdgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      rightEdgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
      ctx.fillStyle = rightEdgeGradient;
      ctx.fillRect(w - 24, 0, 24, h);

      // 3. Dynamic Page Curl Shadow during flip animation
      if (isFlipping) {
        const curlX = flipDirection === 'next' ? w * 0.75 : w * 0.25;
        const curlGradient = ctx.createRadialGradient(curlX, h / 2, 20, curlX, h / 2, 240);
        curlGradient.addColorStop(0, 'rgba(250, 204, 21, 0.18)');
        curlGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.22)');
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

  // Render WTR-Lab TTS Yellow Highlight with intra-segment word tracking and inline EPUB illustrations
  const renderSegmentProse = (seg, isActive) => {
    const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
    const { imgUrl, cleanText } = parseSegmentImage(seg);
    const isDialogue = seg.type === 'dialogue';
    const rawText = isDialogue
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

    if (!isActive) {
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
          className="group cursor-pointer py-1.5 transition-colors duration-150 outline-none select-text"
        >
          <div className="flex items-center gap-2 mb-1">
            {isDialogue ? (
              <span className="font-sans text-[11px] font-semibold text-[var(--accent)] tracking-wider inline-flex items-center gap-1 select-none">
                <IconMic className="w-3 h-3 text-[var(--accent)]" />
                <span>{seg.speaker_name || 'Character'}</span>
              </span>
            ) : (
              <span className="font-sans text-[11px] font-medium theme-muted tracking-wider inline-flex items-center gap-1 select-none opacity-60">
                <IconBook className="w-3 h-3 opacity-60" />
                <span>{seg.speaker_name || 'Narrator'}</span>
              </span>
            )}
          </div>
          {imageElement}
          {rawText && (
            <p className={`leading-[1.85] tracking-[0.01em] text-justify indent-6 ${isDialogue ? 'italic font-serif theme-main' : 'theme-sub'}`}>
              {rawText}
            </p>
          )}
        </div>
      );
    }

    // Active segment: render WTR-Lab word-by-word inline highlight without a display box
    let textContent = null;
    if (rawText) {
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

        textContent = (
          <p
            data-active-segment="true"
            className={`leading-[1.85] tracking-[0.01em] text-justify indent-6 select-text ${
            isDialogue ? 'italic font-serif theme-main' : 'theme-sub'
          }`}>
            <mark className="bg-yellow-300/25 text-amber-100 rounded-xs">
              {tokens.map((token, idx) => {
                if (idx === activeTokenIdx) {
                  return (
                    <span
                      key={idx}
                      data-active-word="true"
                      style={{ display: 'inline', textIndent: '0px' }}
                      className="inline bg-[#FACC15] bg-yellow-400 text-slate-950 font-bold font-semibold rounded-xs"
                    >
                      {token}
                    </span>
                  );
                }
                return <React.Fragment key={idx}>{token}</React.Fragment>;
              })}
            </mark>
          </p>
        );
      } else {
        textContent = (
          <p
            data-active-segment="true"
            className={`leading-[1.85] tracking-[0.01em] text-justify indent-6 select-text ${
            isDialogue ? 'italic font-serif theme-main' : 'theme-sub'
          }`}>
            <mark
              data-active-word="true"
              style={{ display: 'inline', textIndent: '0px' }}
              className="inline bg-yellow-300/30 text-amber-100 rounded-xs"
            >
              {rawText}
            </mark>
          </p>
        );
      }
    }

    return (
      <div
        key={segId}
        data-active-segment="true"
        onClick={() => onSegmentClick && onSegmentClick(segId)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSegmentClick && onSegmentClick(segId);
          }
        }}
        className="group cursor-pointer py-1.5 transition-colors duration-150 outline-none select-text"
      >
        <div className="flex items-center gap-2 mb-1">
          {isDialogue ? (
            <span className="font-sans text-[11px] font-semibold text-[var(--accent)] tracking-wider inline-flex items-center gap-1 select-none">
              <IconMic className="w-3 h-3 text-[var(--accent)]" />
              <span>{seg.speaker_name || 'Character'}</span>
            </span>
          ) : (
            <span className="font-sans text-[11px] font-medium theme-heading tracking-wider inline-flex items-center gap-1 select-none">
              <IconBook className="w-3 h-3 opacity-60" />
              <span>{seg.speaker_name || 'Narrator'}</span>
            </span>
          )}

          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 dark:text-yellow-400 bg-amber-400/15 px-2 py-0.5 rounded-full border border-amber-400/30">
            <IconSoundwave className="w-3 h-3 animate-pulse" />
            <span>Reading</span>
          </span>
        </div>
        {imageElement}
        {textContent}
      </div>
    );
  };

  const isSpreadZero = currentSpreadIndex === 0;
  // On Spread 0: Only show cover artwork when explicitly toggled on by user
  const isCoverActiveOnSpreadZero = isSpreadZero && showCoverSpread;

  return (
    <div className="space-y-6 animate-fade-in select-none relative">
      {/* Minimalist Floating Apple Books Left Chevron (Matching Screenshot 1 & 2) */}
      <button
        aria-label="Previous Page"
        onClick={handlePrevPage}
        disabled={currentSpreadIndex === 0}
        className="fixed sm:absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-black/40 hover:bg-black/75 backdrop-blur-md border border-white/10 hover:border-white/30 transition-all disabled:opacity-0 disabled:pointer-events-none cursor-pointer shadow-xl group"
        title="Previous Page (Left Arrow)"
      >
        <IconChevronLeft className="w-6 h-6 -ml-0.5 group-hover:-translate-x-0.5 transition-transform" />
      </button>

      {/* Minimalist Floating Apple Books Right Chevron (Matching Screenshot 1 & 2) */}
      <button
        aria-label="Next Page"
        onClick={handleNextPage}
        disabled={currentSpreadIndex >= totalSpreads - 1}
        className="fixed sm:absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-black/40 hover:bg-black/75 backdrop-blur-md border border-white/10 hover:border-white/30 transition-all disabled:opacity-0 disabled:pointer-events-none cursor-pointer shadow-xl group"
        title="Next Page (Right Arrow)"
      >
        <IconChevronRight className="w-6 h-6 -mr-0.5 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* 3D Apple Books Two-Page Spread Stage */}
      <div className="relative max-w-6xl mx-auto perspective-1200 py-2 sm:py-4">
        {/* Apple Books Hardcover Canvas Container */}
        <div
          ref={bookContainerRef}
          className={`
            relative min-h-[640px] sm:min-h-[720px] rounded-3xl bg-[#050507] text-[#e5e5ea] border border-white/10
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

          {/* Two-Page Side-by-Side Spread: Left Page (Page 2k) | Right Page (Page 2k + 1) */}
          <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
            {/* ========================================================================= */}
            {/* LEFT PAGE: (Page 2k)                                                      */}
            {/* ========================================================================= */}
            <div
              className={`
                flex flex-col justify-between p-6 sm:p-10 lg:p-12 min-h-[580px] sm:min-h-[660px]
                ${fontFamily === 'serif' ? 'font-serif' : 'font-sans'}
              `}
            >
              {/* Left Page Running Head */}
              <div className="text-[11px] font-mono tracking-widest uppercase opacity-40 select-none pb-3 border-b border-white/5 flex items-center justify-between">
                <span className="truncate max-w-[200px]">
                  {currentNovel?.title || 'SyncTone Edition'}
                </span>
                <span className="hidden sm:inline">
                  {currentChapter?.title ? `Chapter ${currentChapter.chapter_number || 1}` : 'SyncTone Edition'}
                </span>
              </div>

              {/* Left Page Content */}
              <div className="flex-1 py-4 space-y-4 overflow-y-auto">
                {/* On Spread 0, render Chapter Opening Header */}
                {isSpreadZero && (
                  <div className="text-center space-y-2 mb-4 animate-fade-in">
                    <h1 className="text-sm sm:text-base font-serif font-bold tracking-widest uppercase text-amber-200/90">
                      {currentNovel?.title || 'Chapter Opening'}
                    </h1>
                    <h2 className="text-xs font-mono tracking-wider uppercase text-amber-400/80">
                      {currentChapter?.title || 'Chapter One'}
                    </h2>
                    {isHarryPotter ? (
                      <HogwartsCrest />
                    ) : chapterOpeningImg ? (
                      <div className="my-3 flex justify-center">
                        <img
                          src={chapterOpeningImg}
                          alt="Chapter opening illustration"
                          className="max-h-48 sm:max-h-56 rounded-xl border border-white/15 shadow-lg object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3 my-4 opacity-50 select-none">
                        <span className="h-px w-12 bg-gradient-to-r from-transparent to-amber-400/60" />
                        <span className="text-amber-400 text-xs">❦</span>
                        <span className="h-px w-12 bg-gradient-to-l from-transparent to-amber-400/60" />
                      </div>
                    )}
                  </div>
                )}

                {/* Left Page Prose Segments */}
                {leftPageSegments.length > 0 ? (
                  leftPageSegments.map((seg) => {
                    const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
                    const isActive = segId === activeSegmentId;
                    return renderSegmentProse(seg, isActive);
                  })
                ) : (
                  <div className="py-20 text-center opacity-40 font-serif italic text-sm">
                    No text on this page.
                  </div>
                )}
              </div>

              {/* Left Page Footer: Page Number (Screenshot 1 & 2) */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-center text-xs font-mono opacity-50 select-none">
                <span>Page {leftPageNum} of {totalPages}</span>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* RIGHT PAGE: (Page 2k + 1) or Illustrated Cover on Spread 0                 */}
            {/* ========================================================================= */}
            <div
              className={`
                flex flex-col justify-between p-6 sm:p-10 lg:p-12 min-h-[580px] sm:min-h-[660px]
                ${fontFamily === 'serif' ? 'font-serif' : 'font-sans'}
              `}
            >
              {/* Right Page Running Head */}
              <div className="text-[11px] font-mono tracking-widest uppercase opacity-40 select-none pb-3 border-b border-white/5 flex items-center justify-between">
                <span className="truncate max-w-[200px]">
                  {isCoverActiveOnSpreadZero
                    ? 'Deluxe Illustrated Edition'
                    : currentChapter?.title || 'Chapter Prose'}
                </span>
                <span className="hidden sm:inline">SyncTone Reader</span>
              </div>

              {/* Right Page Content */}
              <div className="flex-1 py-4 space-y-4 overflow-y-auto">
                {isCoverActiveOnSpreadZero ? (
                  /* Cover Showcase Panel (Matching Screenshot 1) */
                  <div className="flex-1 flex flex-col items-center justify-center py-4 px-2 text-center animate-fade-in">
                    <div className="relative group max-w-[340px] sm:max-w-[380px] w-full aspect-[2/3] max-h-[480px] rounded-2xl overflow-hidden shadow-2xl ring-2 ring-amber-500/30 transition-transform duration-300 hover:scale-[1.01]">
                      {/* MinaLima Ornate Gold Border Frame */}
                      <div className="absolute inset-0 border-4 border-amber-600/40 rounded-2xl pointer-events-none z-10" />
                      {currentNovel?.cover_object ? (
                        <img
                          src={currentNovel.cover_object}
                          alt={currentNovel?.title || 'Book Cover Artwork'}
                          className="w-full h-full object-cover rounded-xl shadow-inner mx-auto"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.nextElementSibling) {
                              e.currentTarget.nextElementSibling.style.display = 'block';
                            }
                          }}
                        />
                      ) : isHarryPotter ? (
                        <img
                          src="/covers/hp1_cover.jpg"
                          alt={currentNovel?.title || 'Harry Potter Cover'}
                          className="w-full h-full object-cover rounded-xl shadow-inner mx-auto"
                        />
                      ) : (
                        <NovelCover
                          title={currentNovel?.title}
                          author={currentNovel?.author_username}
                          coverUrl={null}
                          className="w-full h-full"
                        />
                      )}
                      {currentNovel?.cover_object && (
                        <div style={{ display: 'none' }} className="w-full h-full">
                          <NovelCover
                            title={currentNovel?.title}
                            author={currentNovel?.author_username}
                            coverUrl={null}
                            className="w-full h-full"
                          />
                        </div>
                      )}
                    </div>
                    <p className="mt-4 text-xs font-serif italic text-white/50 text-center tracking-wide">
                      {currentNovel?.title || 'SyncTone Edition'} • Illustrated Edition
                    </p>
                  </div>
                ) : (
                  /* Right Page Prose Segments */
                  rightPageSegments.length > 0 ? (
                    rightPageSegments.map((seg) => {
                      const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
                      const isActive = segId === activeSegmentId;
                      return renderSegmentProse(seg, isActive);
                    })
                  ) : (
                    <div className="py-20 text-center opacity-40 font-serif italic text-sm">
                      End of chapter prose.
                    </div>
                  )
                )}
              </div>

              {/* Right Page Footer: Page Number (Screenshot 1 & 2) */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-center text-xs font-mono opacity-50 select-none">
                <span>
                  {isCoverActiveOnSpreadZero
                    ? 'Cover Plate • Illustrated Showcase'
                    : rightPageIdx < totalPages
                    ? `Page ${rightPageNum} of ${totalPages}`
                    : 'End of Chapter'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Left Apple Books Jump-Back Pill (Matching Screenshot 1 ↩ 50) */}
          <div className="absolute bottom-3 left-4 sm:left-8 z-30">
            <button
              onClick={handleJumpBack}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-xs backdrop-blur-md border border-white/15 transition-all shadow-md cursor-pointer"
              title="Return to previous spread (Apple Books jump-back)"
            >
              <span className="text-[11px]">↩</span>
              <span className="font-mono text-[11px] font-bold">{lastJumpPage}</span>
            </button>
          </div>

          {/* Corner Curl Click Targets for intuitive page turning */}
          <div
            onClick={handlePrevPage}
            className="absolute top-0 left-0 w-16 h-16 z-30 cursor-pointer group flex items-start justify-start p-2"
            title="Turn to previous spread"
            aria-label="Turn page backward"
          >
            <div className="w-6 h-6 border-t-2 border-l-2 border-amber-400/20 group-hover:border-amber-400 transition rounded-tl-lg" />
          </div>

          <div
            onClick={handleNextPage}
            className="absolute top-0 right-0 w-16 h-16 z-30 cursor-pointer group flex items-start justify-end p-2"
            title="Turn to next spread"
            aria-label="Turn page forward"
          >
            <div className="w-6 h-6 border-t-2 border-r-2 border-amber-400/20 group-hover:border-amber-400 transition rounded-tr-lg" />
          </div>
        </div>
      </div>

      {/* Floating Apple Books Dock Controls */}
      <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 rounded-2xl glass-dock border theme-border shadow-lg">
        {/* Prev / Next Page Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentSpreadIndex === 0}
            className="px-2.5 py-1.5 rounded-xl theme-card border hover:border-amber-400 text-xs font-semibold text-white/80 hover:text-white transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-xs"
            title="Previous Page (Left Arrow)"
          >
            <IconChevronLeft className="w-3.5 h-3.5" />
            <span>Prev Page</span>
          </button>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentSpreadIndex >= totalSpreads - 1}
            className="px-2.5 py-1.5 rounded-xl theme-card border hover:border-amber-400 text-xs font-semibold text-white/80 hover:text-white transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-xs"
            title="Next Page (Right Arrow)"
          >
            <span>Next Page</span>
            <IconChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Spread Scrubber Slider */}
        <div className="flex-1 flex items-center gap-3 min-w-[180px]">
          <span className="text-xs font-mono font-bold theme-muted w-14 text-right">
            Spread {currentSpreadIndex + 1}
          </span>
          <input
            type="range"
            min={0}
            max={totalSpreads - 1}
            value={currentSpreadIndex}
            onChange={(e) => setCurrentSpreadIndex(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 accent-amber-400 cursor-pointer"
            aria-label="Book spread slider"
          />
          <span className="text-xs font-mono font-bold theme-muted w-12">
            / {totalSpreads}
          </span>
        </div>

        {/* Spread 0 Cover Toggle */}
        {isSpreadZero && (
          <button
            type="button"
            onClick={() => setShowCoverSpread((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-xl theme-card border hover:border-amber-400 text-xs font-semibold text-amber-300 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Toggle between full Cover Artwork and continuous two-page Prose"
          >
            <IconBook className="w-3.5 h-3.5" />
            <span>{showCoverSpread ? 'Show Prose Spread' : 'Show Cover Spread'}</span>
          </button>
        )}

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
