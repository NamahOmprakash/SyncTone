import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getSpeakerColor } from '../utils/speakerColors';
import { parseSegmentImage } from '../utils/segmentUtils';
import { measureAndPaginateSegments } from '../utils/readerLayoutEngine';
import NovelCover from './NovelCover';
import { paginateSegments } from '../reader/paginate';
import { useBookFit } from '../reader/useBookFit';
import { derivePageIndexFromAnchor, getAnchorSegmentIdFromPage } from '../reader/anchor';
import PageNavButtons from '../reader/PageNavButtons';
import SpineShadowCanvas from '../reader/SpineShadowCanvas';
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
 * High-fidelity Hogwarts Heraldic Crest Ornament matching Apple Books Screenshot 2
 * features 4 house quarters (Lion, Eagle, Serpent, Badger), central 'H', and Latin motto banner.
 */
function HogwartsCrest({ className = 'w-44 h-44 sm:w-48 sm:h-48' }) {
  return (
    <div className="flex flex-col items-center justify-center my-3 select-none">
      <div className="relative p-3.5 rounded-2xl bg-[var(--accent-surface)] border border-[var(--border-subtle)] shadow-sm dark:shadow-md">
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

          {/* Quarter 2: Charcoal (Top Right) */}
          <path
            d="M120 22 C150 22 185 32 195 70 C195 105 170 120 120 120 L120 22 Z"
            fill="#4A4A46"
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
  nextChapter = null,
  prevChapter = null,
  onNextChapter,
  onBack,
  onSwitchToNormal,
  fontFamily = 'serif',
  fontSize = 18,
  isFocusMode = false,
  onToggleFocusMode,
  onPageChange,
}) {
  const { isDark } = useTheme();
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState('next'); // 'next' | 'prev'
  const [lastJumpPage, setLastJumpPage] = useState(1);
  const [showCoverSpread, setShowCoverSpread] = useState(false);

  const chapterTransitioningRef = useRef(false);

  // Reset spread when chapter changes
  useEffect(() => {
    chapterTransitioningRef.current = false;
    setCurrentSpreadIndex(0);
    setShowCoverSpread(false);
  }, [currentChapter?.id, currentChapter?.chapter_number]);

  const bookContainerRef = useRef(null);
  const stageRef = useRef(null);
  const fit = useBookFit(stageRef);
  const anchorSegmentIdRef = useRef(null);
  const autoFlipLockRef = useRef(false);
  const lastAutoFlippedSegRef = useRef(-1);

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

  // Paginate prose into book pages using fit engine contentBox
  const pages = useMemo(() => {
    return measureAndPaginateSegments(segments, {
      containerWidth: fit.contentBox?.w || 440,
      containerHeight: fit.contentBox?.h || (isFocusMode ? 750 : 640),
      fontSize,
      lineHeight: 1.85,
    });
  }, [segments, fit.contentBox?.w, fit.contentBox?.h, fontSize, isFocusMode]);

  const totalPages = Math.max(1, pages.length);
  const isSingleLayout = fit.layout === 'single';
  const totalSpreads = isSingleLayout ? totalPages : Math.max(1, Math.ceil(totalPages / 2));

  // Determine which pages belong to the current spread
  const leftPageIdx = isSingleLayout ? currentSpreadIndex : currentSpreadIndex * 2;
  const rightPageIdx = isSingleLayout ? -1 : currentSpreadIndex * 2 + 1;
  const leftPageSegments = pages[leftPageIdx] || [];
  const rightPageSegments = rightPageIdx >= 0 ? pages[rightPageIdx] || [] : [];
  const leftPageNum = leftPageIdx + 1;
  const rightPageNum = rightPageIdx >= 0 ? rightPageIdx + 1 : 0;

  // Track anchor when user turns spread
  useEffect(() => {
    if (pages.length > 0) {
      const pageIdx = isSingleLayout ? currentSpreadIndex : currentSpreadIndex * 2;
      const anchor = getAnchorSegmentIdFromPage(pages, pageIdx);
      if (anchor != null) {
        anchorSegmentIdRef.current = anchor;
      }
    }
  }, [currentSpreadIndex, pages, isSingleLayout]);

  // Report page updates to parent Reader toolbar
  useEffect(() => {
    if (onPageChange) {
      onPageChange({
        current: leftPageNum,
        total: totalPages,
        spread: currentSpreadIndex,
        totalSpreads,
      });
    }
  }, [leftPageNum, totalPages, currentSpreadIndex, totalSpreads, onPageChange]);

  // Restore spread index from anchor after re-pagination (e.g. font scale A+/A- or live resize)
  useEffect(() => {
    if (anchorSegmentIdRef.current != null && pages.length > 0) {
      const targetPageIdx = derivePageIndexFromAnchor(pages, anchorSegmentIdRef.current);
      const targetSpreadIdx = isSingleLayout ? targetPageIdx : Math.floor(targetPageIdx / 2);
      if (targetSpreadIdx >= 0 && targetSpreadIdx < totalSpreads) {
        setCurrentSpreadIndex(targetSpreadIdx);
      }
    }
  }, [pages, isSingleLayout, totalSpreads]);

  // Auto-flip spread to track active spoken segment & fragment
  useEffect(() => {
    if (activeSegmentId === -1 || pages.length === 0) {
      lastAutoFlippedSegRef.current = -1;
      return;
    }

    const targetPageIdx = pages.findIndex((page) =>
      page.some((s) => {
        const sId = s.segment_id !== undefined ? s.segment_id : s.order;
        if (sId !== activeSegmentId) return false;
        if (s._fragmentCount > 1 && typeof segmentProgress === 'number') {
          return (
            segmentProgress >= (s._wordStartRatio || 0) &&
            (segmentProgress < (s._wordEndRatio || 1) || s._fragmentIndex === s._fragmentCount - 1)
          );
        }
        return true;
      })
    );

    if (targetPageIdx !== -1) {
      const targetSpreadIdx = isSingleLayout ? targetPageIdx : Math.floor(targetPageIdx / 2);
      const flipKey = `${activeSegmentId}_spread_${targetSpreadIdx}`;
      if (flipKey === lastAutoFlippedSegRef.current) return;
      lastAutoFlippedSegRef.current = flipKey;

      // If active segment is on Page 2 of Spread 0 while cover is showing, automatically switch to prose
      if (!isSingleLayout && targetSpreadIdx === 0 && targetPageIdx === 1 && showCoverSpread) {
        setShowCoverSpread(false);
      }

      if (targetSpreadIdx !== currentSpreadIndex && !autoFlipLockRef.current) {
        setLastJumpPage(isSingleLayout ? currentSpreadIndex + 1 : currentSpreadIndex * 2 + 1);
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
  }, [activeSegmentId, segmentProgress, pages, currentSpreadIndex, showCoverSpread, isSingleLayout]);

  // Turn to Next Spread
  const handleNextPage = useCallback(() => {
    if (currentSpreadIndex === 0 && showCoverSpread) {
      setShowCoverSpread(false);
      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => setIsFlipping(false), 280);
      return;
    }
    if (currentSpreadIndex >= totalSpreads - 1) {
      if (nextChapter && onNextChapter && !chapterTransitioningRef.current) {
        chapterTransitioningRef.current = true;
        setFlipDirection('next');
        setIsFlipping(true);
        setTimeout(() => setIsFlipping(false), 280);
        setTimeout(() => {
          chapterTransitioningRef.current = false;
        }, 1200);
        onNextChapter();
      }
      return;
    }
    setCurrentSpreadIndex((prev) => {
      if (prev >= totalSpreads - 1) return prev;
      setLastJumpPage(isSingleLayout ? prev + 1 : prev * 2 + 1);
      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => setIsFlipping(false), 280);
      return prev + 1;
    });
  }, [totalSpreads, currentSpreadIndex, showCoverSpread, nextChapter, onNextChapter, isSingleLayout]);

  // Turn to Previous Spread (Fixes previous page button bug on Spread 0 and cover transitions)
  const handlePrevPage = useCallback(() => {
    if (currentSpreadIndex === 0) {
      if (!showCoverSpread && currentNovel?.cover_object) {
        setShowCoverSpread(true);
        setFlipDirection('prev');
        setIsFlipping(true);
        setTimeout(() => setIsFlipping(false), 280);
      }
      return;
    }
    setCurrentSpreadIndex((prev) => {
      if (prev <= 0) return 0;
      setLastJumpPage(isSingleLayout ? prev + 1 : prev * 2 + 1);
      setFlipDirection('prev');
      setIsFlipping(true);
      setTimeout(() => setIsFlipping(false), 280);
      return prev - 1;
    });
  }, [currentSpreadIndex, showCoverSpread, currentNovel?.cover_object, isSingleLayout]);

  // Apple Books Jump-Back (matching Screenshot 1 bottom-left ↩ pill)
  const handleJumpBack = useCallback(() => {
    const targetSpread = isSingleLayout
      ? Math.max(0, lastJumpPage - 1)
      : Math.floor(Math.max(0, lastJumpPage - 1) / 2);
    if (targetSpread !== currentSpreadIndex && !isFlipping) {
      setLastJumpPage(isSingleLayout ? currentSpreadIndex + 1 : currentSpreadIndex * 2 + 1);
      setFlipDirection(targetSpread > currentSpreadIndex ? 'next' : 'prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentSpreadIndex(targetSpread);
        setIsFlipping(false);
      }, 300);
    }
  }, [lastJumpPage, currentSpreadIndex, isFlipping, isSingleLayout]);

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

  // Render WTR-Lab TTS Yellow Highlight with intra-segment word tracking and inline EPUB illustrations
  const renderSegmentProse = (seg, isActive) => {
    const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
    const fragKey = `${segId}_frag_${seg._fragmentIndex || 0}`;
    const { imgUrl, cleanText } = parseSegmentImage(seg);
    const isDialogue = seg.type === 'dialogue';
    const rawText = isDialogue
      ? (cleanText ? `"${cleanText.replace(/^["“”]|["“”]$/g, '')}"` : '')
      : cleanText;

    // Standalone illustration segment (Apple Books full-page illustration)
    if (imgUrl && !rawText) {
      return (
        <div
          key={fragKey}
          data-active-segment={isActive ? 'true' : undefined}
          onClick={() => onSegmentClick && onSegmentClick(segId)}
          className="my-auto py-2 flex items-center justify-center cursor-pointer"
        >
          <img
            src={imgUrl}
            alt="Book illustration"
            className="max-h-[480px] sm:max-h-[540px] w-auto mx-auto rounded-lg shadow-md object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      );
    }

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
          key={fragKey}
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
              <span className="font-sans text-[11px] font-semibold text-[var(--accent-text)] tracking-wider inline-flex items-center gap-1 select-none">
                <IconMic className="w-3 h-3 text-[var(--accent-text)]" />
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

        const fragCount = seg._fragmentCount || 1;
        const startRatio = seg._wordStartRatio !== undefined ? seg._wordStartRatio : 0;
        const endRatio = seg._wordEndRatio !== undefined ? seg._wordEndRatio : 1;
        const localProgress =
          fragCount > 1
            ? Math.max(0, Math.min(1, (segmentProgress - startRatio) / (endRatio - startRatio || 1)))
            : segmentProgress;

        const totalWords = Math.max(1, nonWhitespaceIndices.length);
        const targetWordIdx = Math.min(
          totalWords - 1,
          Math.max(0, Math.floor(localProgress * totalWords))
        );
        const activeTokenIdx = nonWhitespaceIndices[targetWordIdx] ?? -1;

        textContent = (
          <p
            data-active-segment="true"
            className={`leading-[1.85] tracking-[0.01em] text-justify indent-6 select-text ${
            isDialogue ? 'italic font-serif theme-main' : 'theme-sub'
          }`}>
            <mark className="bg-[var(--accent-surface)] text-[var(--text-main)] rounded">
              {tokens.map((token, idx) => {
                if (idx === activeTokenIdx) {
                  return (
                    <span
                      key={idx}
                      data-active-word="true"
                      style={{
                        display: 'inline',
                        textIndent: '0px',
                      }}
                      className="inline bg-yellow-400 text-stone-900 font-bold rounded px-1 shadow-xs"
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
              className="inline bg-[var(--accent-surface)] text-[var(--text-main)] rounded"
            >
              {rawText}
            </mark>
          </p>
        );
      }
    }

    return (
      <div
        key={fragKey}
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
            <span className="font-sans text-[11px] font-semibold text-[var(--accent-text)] tracking-wider inline-flex items-center gap-1 select-none">
              <IconMic className="w-3 h-3 text-[var(--accent-text)]" />
              <span>{seg.speaker_name || 'Character'}</span>
            </span>
          ) : (
            <span className="font-sans text-[11px] font-medium theme-heading tracking-wider inline-flex items-center gap-1 select-none">
              <IconBook className="w-3 h-3 opacity-60" />
              <span>{seg.speaker_name || 'Narrator'}</span>
            </span>
          )}

          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent-text)] bg-[var(--accent-surface)] px-2 py-0.5 rounded-full border border-[var(--border-focus)]/40">
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
  const leftHasImage = leftPageSegments.some((s) => parseSegmentImage(s).imgUrl);

  // Prev / Next button enablement logic matching Moon+ Reader Pro & Apple Books
  // Prev is only disabled if on Spread 0 AND (cover is already showing OR novel has no cover)
  // If on Spread 0 with prose (!showCoverSpread), Prev is ENABLED to flip back to Cover!
  const isPrevDisabled = currentSpreadIndex === 0 && (showCoverSpread || !currentNovel?.cover_object);
  const isOnFinalSpread = currentSpreadIndex >= totalSpreads - 1 && !showCoverSpread;
  const isNextDisabled = isOnFinalSpread ? !nextChapter : false;
  const nextSpreadTitle = isOnFinalSpread && nextChapter
    ? (nextChapter.title
        ? `Next Chapter: ${nextChapter.title}`
        : (nextChapter.chapter_number
            ? `Next Chapter: Chapter ${nextChapter.chapter_number}`
            : 'Next Chapter'))
    : 'Next Page (Right Arrow)';

  const isSegmentFragmentActive = useCallback(
    (seg) => {
      const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
      if (segId !== activeSegmentId) return false;
      const fragCount = seg._fragmentCount || 1;
      if (fragCount > 1 && typeof segmentProgress === 'number') {
        const startRatio = seg._wordStartRatio !== undefined ? seg._wordStartRatio : 0;
        const endRatio = seg._wordEndRatio !== undefined ? seg._wordEndRatio : 1;
        const fragIdx = seg._fragmentIndex || 0;
        return (
          segmentProgress >= startRatio &&
          (segmentProgress < endRatio || fragIdx === fragCount - 1)
        );
      }
      return true;
    },
    [activeSegmentId, segmentProgress]
  );

  return (
    <div
      className={
        isFocusMode
          ? 'fixed inset-0 z-50 bg-[var(--bg-page)] flex flex-col justify-between px-3 sm:px-8 pt-3 pb-24 overflow-hidden animate-fade-in select-none w-screen h-screen'
          : 'w-full flex-1 flex flex-col justify-between items-center animate-fade-in select-none relative overflow-hidden py-2 min-h-0'
      }
    >
      {/* Floating Exit Focus Button */}
      {isFocusMode && onToggleFocusMode && (
        <div className="fixed top-4 right-6 z-50">
          <button
            type="button"
            onClick={onToggleFocusMode}
            className="px-3.5 py-1.5 rounded-full bg-stone-900/10 hover:bg-stone-900/20 dark:bg-white/10 dark:hover:bg-white/20 text-stone-800 dark:text-white/90 text-xs font-semibold backdrop-blur-md border border-stone-300 dark:border-white/15 transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            title="Exit Focus Mode (Esc)"
          >
            <span>Exit Focus</span>
            <span className="text-[10px] font-mono opacity-60">Esc</span>
          </button>
        </div>
      )}

      {/* Floating Apple Books Chevrons */}
      <PageNavButtons
        onPrev={handlePrevPage}
        onNext={handleNextPage}
        canPrev={!isPrevDisabled}
        canNext={!isNextDisabled}
        nextTitle={nextSpreadTitle}
      />

      {/* 3D Apple Books Two-Page Spread Stage */}
      <div
        ref={stageRef}
        className={`relative w-full perspective-1200 flex flex-col justify-center items-center ${
          isFocusMode ? 'flex-1 min-h-0 py-1' : 'flex-1 min-h-0 py-1 my-1'
        }`}
      >
        {/* Apple Books Hardcover Canvas Container */}
        <div
          ref={bookContainerRef}
          className={`
            relative ${isFocusMode ? 'min-h-[calc(100vh-140px)]' : ''} rounded-2xl
            bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)]
            shadow-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between
            ${isFlipping ? (flipDirection === 'next' ? 'page-curl-flip-next' : 'page-curl-flip-prev') : ''}
          `}
          style={{
            width: fit.book?.w ? `${fit.book.w}px` : (typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : '900px'),
            height: fit.book?.h ? `${fit.book.h}px` : (typeof window !== 'undefined' && window.innerHeight < 640 ? '440px' : '580px'),
            maxWidth: '100%',
            maxHeight: '100%',
            margin: '0 auto',
            transformStyle: 'preserve-3d',
            fontSize: `${fontSize}px`,
          }}
        >
          {/* Hardware-accelerated canvas lighting overlay */}
          <SpineShadowCanvas
            isDark={isDark}
            isFlipping={isFlipping}
            flipDirection={flipDirection}
          />

          {/* Two-Page Side-by-Side Spread or Single-Page Mobile Surface */}
          <div className={`relative z-10 flex-1 h-full min-h-0 grid ${isSingleLayout ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-[var(--border-subtle)]'}`}>
            {/* ========================================================================= */}
            {/* LEFT PAGE: (Page 2k) or Single Page on Mobile                             */}
            {/* ========================================================================= */}
            <div
              className={`
                flex flex-col justify-between h-full min-h-0 p-5 sm:p-7 lg:p-8
                ${fontFamily === 'serif' ? 'font-serif' : 'font-sans'}
              `}
            >
              {/* Left Page Running Head */}
              <div className="text-[11px] font-mono tracking-widest uppercase opacity-60 dark:opacity-40 select-none pb-2 sm:pb-3 border-b border-stone-200 dark:border-white/5 flex items-center justify-between text-stone-600 dark:text-stone-300 flex-shrink-0">
                <span className="truncate max-w-[200px]">
                  {currentNovel?.title || 'SyncTone Edition'}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[var(--text-sub)] font-semibold font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                  {currentChapter?.title ? `Chapter ${currentChapter.chapter_number || 1}` : 'SyncTone Edition'}
                </span>
              </div>

              {/* Left Page Content */}
              <div className="flex-1 min-h-0 py-2 sm:py-3 space-y-3 sm:space-y-4 overflow-y-auto">
                {/* On Spread 0, render Chapter Opening Header */}
                {isSpreadZero && (
                  <div className="text-center space-y-2 mb-4 animate-fade-in">
                    <h1 className="text-sm sm:text-base font-serif font-bold tracking-widest uppercase text-[var(--accent-text)]">
                      {currentNovel?.title || 'Chapter Opening'}
                    </h1>
                    <h2 className="text-xs font-mono tracking-wider uppercase text-[var(--text-sub)]">
                      {currentChapter?.title || 'Chapter One'}
                    </h2>
                    {!leftHasImage && isHarryPotter ? (
                      <HogwartsCrest />
                    ) : !leftHasImage && chapterOpeningImg ? (
                      <div className="my-3 flex justify-center">
                        <img
                          src={chapterOpeningImg}
                          alt="Chapter opening illustration"
                          className="max-h-48 sm:max-h-56 rounded-xl border border-stone-200 dark:border-white/15 shadow-lg object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3 my-4 opacity-60 dark:opacity-50 select-none">
                        <span className="h-px w-12 bg-gradient-to-r from-transparent to-[var(--brand-bronze,#A88462)]/50" />
                        <span className="text-[var(--accent-text)] text-xs">❦</span>
                        <span className="h-px w-12 bg-gradient-to-l from-transparent to-[var(--brand-bronze,#A88462)]/50" />
                      </div>
                    )}
                  </div>
                )}

                {/* Left Page Prose Segments */}
                {leftPageSegments.length > 0 ? (
                  leftPageSegments.map((seg) => {
                    const isActive = isSegmentFragmentActive(seg);
                    return renderSegmentProse(seg, isActive);
                  })
                ) : (
                  <div className="py-20 text-center opacity-40 font-serif italic text-sm">
                    No text on this page.
                  </div>
                )}
              </div>

              {/* Left Page Footer: Page Number (Screenshot 1 & 2) */}
              <div className="pt-2 sm:pt-3 border-t border-stone-200 dark:border-white/5 flex items-center justify-center text-xs font-mono opacity-60 dark:opacity-50 select-none text-stone-600 dark:text-stone-300 flex-shrink-0">
                <span>Page {leftPageNum} of {totalPages}</span>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* RIGHT PAGE: (Page 2k + 1) or Illustrated Cover on Spread 0                 */}
            {/* ========================================================================= */}
            {!isSingleLayout && (
            <div
              className={`
                flex flex-col justify-between h-full min-h-0 p-5 sm:p-7 lg:p-8
                ${fontFamily === 'serif' ? 'font-serif' : 'font-sans'}
              `}
            >
              {/* Right Page Running Head */}
              <div className="text-[11px] font-mono tracking-widest uppercase opacity-60 dark:opacity-40 select-none pb-2 sm:pb-3 border-b border-stone-200 dark:border-white/5 flex items-center justify-between text-stone-600 dark:text-stone-300 flex-shrink-0">
                <span className="truncate max-w-[200px]">
                  {isCoverActiveOnSpreadZero
                    ? 'Deluxe Illustrated Edition'
                    : currentChapter?.title || 'Chapter Prose'}
                </span>
                <span className="hidden sm:inline">SyncTone Reader</span>
              </div>

              {/* Right Page Content */}
              <div className="flex-1 min-h-0 py-2 sm:py-3 space-y-3 sm:space-y-4 overflow-y-auto">
                {isCoverActiveOnSpreadZero ? (
                  /* Cover Showcase Panel (Matching Screenshot 1) */
                  <div className="flex-1 flex flex-col items-center justify-center py-4 px-2 text-center animate-fade-in">
                    <div className="relative group max-w-[340px] sm:max-w-[380px] w-full aspect-[2/3] max-h-[480px] rounded-2xl overflow-hidden shadow-2xl ring-2 ring-[var(--brand-bronze,#A88462)]/30 transition-transform duration-300 hover:scale-[1.01]">
                      {/* MinaLima Ornate Gold Border Frame */}
                      <div className="absolute inset-0 border-4 border-[var(--brand-bronze,#A88462)]/40 rounded-2xl pointer-events-none z-10" />
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
                          coverUrl={currentNovel?.cover_object}
                          className="w-full h-full"
                        />
                      )}
                      {currentNovel?.cover_object && (
                        <div style={{ display: 'none' }} className="w-full h-full">
                          <NovelCover
                            title={currentNovel?.title}
                            author={currentNovel?.author_username}
                            coverUrl={currentNovel?.cover_object}
                            className="w-full h-full"
                          />
                        </div>
                      )}
                    </div>
                    <p className="mt-4 text-xs font-serif italic text-stone-500 dark:text-white/50 text-center tracking-wide">
                      {currentNovel?.title || 'SyncTone Edition'} • Illustrated Edition
                    </p>
                  </div>
                ) : (
                  /* Right Page Prose Segments */
                  rightPageSegments.length > 0 ? (
                    rightPageSegments.map((seg) => {
                      const isActive = isSegmentFragmentActive(seg);
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
              <div className="pt-2 sm:pt-3 border-t border-stone-200 dark:border-white/5 flex items-center justify-center text-xs font-mono opacity-60 dark:opacity-50 select-none text-stone-600 dark:text-stone-300 flex-shrink-0">
                <span>
                  {isCoverActiveOnSpreadZero
                    ? 'Cover Plate • Illustrated Showcase'
                    : rightPageIdx < totalPages
                    ? `Page ${rightPageNum} of ${totalPages}`
                    : 'End of Chapter'}
                </span>
              </div>
            </div>
            )}
          </div>

          {/* Bottom Left Apple Books Jump-Back Pill (Matching Screenshot 1 ↩ 50) */}
          {lastJumpPage > 0 &&
            lastJumpPage !== leftPageNum &&
            lastJumpPage !== rightPageNum && (
            <div className="absolute bottom-3 left-4 sm:left-8 z-30 animate-fade-in">
              <button
                type="button"
                onClick={handleJumpBack}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900/5 hover:bg-stone-900/10 dark:bg-white/10 dark:hover:bg-white/20 text-stone-700 dark:text-white/80 text-xs backdrop-blur-md border border-stone-300/80 dark:border-white/15 transition-all shadow-md cursor-pointer"
                title="Return to previous spread (Apple Books jump-back)"
              >
                <span className="text-[11px]">↩</span>
                <span className="font-mono text-[11px] font-bold">{lastJumpPage}</span>
              </button>
            </div>
          )}

          {/* Corner Curl Click Targets for intuitive page turning */}
          <div
            role="button"
            tabIndex={isPrevDisabled ? -1 : 0}
            onClick={isPrevDisabled ? undefined : handlePrevPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!isPrevDisabled) handlePrevPage();
              }
            }}
            className={`absolute top-0 left-0 w-16 h-16 z-30 group flex items-start justify-start p-2 ${
              isPrevDisabled ? 'opacity-0 pointer-events-none' : 'cursor-pointer'
            }`}
            title="Turn to previous spread"
            aria-label="Turn page backward"
          >
            <div className="w-6 h-6 border-t-2 border-l-2 border-[var(--brand-walnut,#6B4A2E)]/40 group-hover:border-[var(--brand-bronze,#A88462)] transition rounded-tl-lg" />
          </div>

          <div
            role="button"
            tabIndex={isNextDisabled ? -1 : 0}
            onClick={isNextDisabled ? undefined : handleNextPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!isNextDisabled) handleNextPage();
              }
            }}
            className={`absolute top-0 right-0 w-16 h-16 z-30 group flex items-start justify-end p-2 ${
              isNextDisabled ? 'opacity-0 pointer-events-none' : 'cursor-pointer'
            }`}
            title={isOnFinalSpread && nextChapter ? nextSpreadTitle : "Turn to next spread"}
            aria-label="Turn page forward"
          >
            <div className="w-6 h-6 border-t-2 border-r-2 border-[var(--brand-walnut,#6B4A2E)]/40 group-hover:border-[var(--brand-bronze,#A88462)] transition rounded-tr-lg" />
          </div>
        </div>
      </div>

      {/* Floating Apple Books Dock Controls */}
      <div className="w-full max-w-3xl sm:max-w-4xl mx-auto flex flex-nowrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-xl glass-dock border theme-border shadow-md flex-shrink-0 text-xs my-1 overflow-x-auto">
        {/* Prev / Next Page Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={isPrevDisabled}
            className="px-2.5 py-1.5 rounded-xl theme-card border hover:border-[var(--accent)] text-xs font-semibold theme-sub hover:theme-main transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-xs"
            title="Previous Page (Left Arrow)"
          >
            <IconChevronLeft className="w-3.5 h-3.5" />
            <span>Prev Page</span>
          </button>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={isNextDisabled}
            className="px-2.5 py-1.5 rounded-xl theme-card border hover:border-[var(--accent)] text-xs font-semibold theme-sub hover:theme-main transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-xs"
            title={nextSpreadTitle}
          >
            <span>{isOnFinalSpread && nextChapter ? 'Next Chapter' : 'Next Page'}</span>
            <IconChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Spread Scrubber Slider */}
        <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-[140px] sm:min-w-[180px]">
          <span className="text-xs font-mono font-bold theme-muted w-14 text-right flex-shrink-0">
            Spread {currentSpreadIndex + 1}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSpreads - 1)}
            value={currentSpreadIndex}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (val !== currentSpreadIndex) {
                setLastJumpPage(currentSpreadIndex * 2 + 1);
                setCurrentSpreadIndex(val);
                if (val > 0) {
                  setShowCoverSpread(false);
                }
              }
            }}
            className="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
            aria-label="Book spread slider"
          />
          <span className="text-xs font-mono font-bold theme-muted w-10 sm:w-12 flex-shrink-0">
            / {totalSpreads}
          </span>
        </div>

        {/* Spread 0 Cover Toggle */}
        {isSpreadZero && (
          <button
            type="button"
            onClick={() => setShowCoverSpread((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-xl theme-card border hover:border-[var(--accent)] text-xs font-semibold text-[var(--accent-text)] transition flex items-center gap-1.5 cursor-pointer shadow-xs flex-shrink-0"
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
            className="px-3 py-1.5 rounded-xl theme-card border hover:border-[var(--accent)] text-xs font-semibold theme-sub transition flex items-center gap-1.5 cursor-pointer shadow-xs flex-shrink-0"
          >
            <IconBookOpen className="w-3.5 h-3.5" />
            <span>Normal View</span>
          </button>
        )}
      </div>
    </div>
  );
}
