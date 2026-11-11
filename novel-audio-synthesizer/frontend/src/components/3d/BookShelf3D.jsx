import React, { useState, useRef, useEffect, useCallback } from 'react';
import NovelCover from '../NovelCover';
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlay,
  IconBook,
  IconX,
  IconSoundwave,
} from '../icons';

// Sophisticated cloth/leather spine color palette matching classic luxury editions
const SPINE_PALETTES = [
  { bg: '#18181C', border: '#2A2A32', text: '#F2F2F5', foil: '#C5A059' }, // Noir Obsidian
  { bg: '#241416', border: '#3E2024', text: '#F5EBEB', foil: '#D4AF37' }, // Deep Crimson
  { bg: '#141E18', border: '#1E3224', text: '#EBF5EE', foil: '#C5A059' }, // Forest Green
  { bg: '#141A24', border: '#202C3E', text: '#EBF0F5', foil: '#C5A059' }, // Midnight Navy
  { bg: '#221A14', border: '#3A2C20', text: '#F5F0EB', foil: '#D4AF37' }, // Dark Walnut
  { bg: '#1E1424', border: '#32203E', text: '#F3EBF5', foil: '#C5A059' }, // Imperial Plum
];

export default function BookShelf3D({
  novels = [],
  onSelectNovel,
  onStartListening,
}) {
  const [selectedNovelId, setSelectedNovelId] = useState(null);
  const [hoveredNovelId, setHoveredNovelId] = useState(null);
  const shelfScrollRef = useRef(null);

  const selectedNovel = novels.find((n) => n.id === selectedNovelId) || null;

  const scrollShelf = (direction) => {
    if (shelfScrollRef.current) {
      shelfScrollRef.current.scrollBy({
        left: direction * 320,
        behavior: 'smooth',
      });
    }
  };

  const handleBookClick = (novel) => {
    if (selectedNovelId === novel.id) {
      setSelectedNovelId(null);
    } else {
      setSelectedNovelId(novel.id);
    }
  };

  // Keyboard shortcut: Press Escape to close pulled-forward book inspector
  useEffect(() => {
    if (!selectedNovelId) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedNovelId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNovelId]);

  return (
    <div className="w-full relative flex flex-col space-y-6 animate-fade-in select-none">
      {/* Shelf Header Banner */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-sub)]">
            // INTERACTIVE PHYSICAL BOOKSHELF
          </span>
          <span className="text-[11px] font-mono text-[var(--text-muted)] hidden sm:inline">
            • Click any volume spine to pull forward
          </span>
        </div>

        {/* Shelf Navigation Chevrons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollShelf(-1)}
            className="boxed-btn p-1.5 rounded-full text-[var(--text-sub)] hover:text-[var(--text-main)] active:scale-90 transition-all cursor-pointer shadow-xs"
            aria-label="Scroll shelf left"
          >
            <IconChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollShelf(1)}
            className="boxed-btn p-1.5 rounded-full text-[var(--text-sub)] hover:text-[var(--text-main)] active:scale-90 transition-all cursor-pointer shadow-xs"
            aria-label="Scroll shelf right"
          >
            <IconChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3D BOOKSHELF VIEWPORT STAGE                                              */}
      {/* ========================================================================= */}
      <div
        className="relative w-full rounded-3xl bg-[var(--bg-card)] border border-[var(--border-strong)] p-6 sm:p-8 lg:p-10 shadow-2xl overflow-hidden"
        style={{
          perspective: '1200px',
          background: 'var(--stage-gradient)',
        }}
      >
        {/* Bookshelf Wooden / Obsidian Back Wall */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

        {/* Horizontal Books Container */}
        <div
          ref={shelfScrollRef}
          className="relative z-10 flex items-end gap-3 sm:gap-4 overflow-x-auto pb-8 pt-12 px-4 scrollbar-none"
          style={{
            transformStyle: 'preserve-3d',
            minHeight: '340px',
          }}
        >
          {novels.map((novel, idx) => {
            const isSelected = selectedNovelId === novel.id;
            const isHovered = hoveredNovelId === novel.id;
            const palette = SPINE_PALETTES[idx % SPINE_PALETTES.length];
            // Proportional width variation (28mm to 42mm physical thickness)
            const spineWidth = 44 + (idx % 4) * 4;

            return (
              <div
                key={novel.id}
                onClick={() => handleBookClick(novel)}
                onMouseEnter={() => setHoveredNovelId(novel.id)}
                onMouseLeave={() => setHoveredNovelId(null)}
                className="relative flex-shrink-0 cursor-pointer group transition-all duration-300"
                style={{
                  width: `${spineWidth}px`,
                  height: '290px',
                  transformStyle: 'preserve-3d',
                  transform: isSelected
                    ? 'translateZ(60px) translateY(-32px) rotateY(-20deg) scale(1.04)'
                    : isHovered
                    ? 'translateZ(28px) translateY(-14px)'
                    : 'translateZ(0px) translateY(0px)',
                  zIndex: isSelected ? 30 : isHovered ? 20 : 10,
                }}
                role="button"
                tabIndex={0}
                aria-label={`Physical Book Spine: ${novel.title} by ${novel.author_username || 'Author'}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBookClick(novel);
                  }
                }}
              >
                {/* 3D Physical Spine Body */}
                <div
                  className="w-full h-full rounded-t-sm rounded-b-xs relative overflow-hidden flex flex-col justify-between py-3 px-1 border-t border-r border-l shadow-xl"
                  style={{
                    backgroundColor: palette.bg,
                    borderColor: palette.border,
                    boxShadow: isSelected
                      ? '-12px 16px 28px rgba(0, 0, 0, 0.85), inset 2px 0 6px rgba(255, 255, 255, 0.15)'
                      : '-6px 10px 18px rgba(0, 0, 0, 0.65), inset 2px 0 4px rgba(255, 255, 255, 0.08)',
                  }}
                >
                  {/* Spine Curvature Highlight Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-white/12 to-black/50 pointer-events-none" />

                  {/* Top Gold Headband Stripes */}
                  <div className="relative z-10 w-full flex flex-col items-center gap-0.5">
                    <div
                      className="w-full h-1"
                      style={{ backgroundColor: palette.foil, opacity: 0.8 }}
                    />
                    <div
                      className="w-3/4 h-0.5"
                      style={{ backgroundColor: palette.foil, opacity: 0.5 }}
                    />
                    <span
                      className="text-[9px] font-mono font-bold mt-1 tracking-wider"
                      style={{ color: palette.foil }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Vertical Novel Title */}
                  <div className="relative z-10 flex-1 flex items-center justify-center my-2">
                    <span
                      className="font-sans font-bold text-xs uppercase tracking-widest truncate max-h-[170px]"
                      style={{
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        color: palette.text,
                        transform: 'rotate(180deg)',
                      }}
                      title={novel.title}
                    >
                      {novel.title}
                    </span>
                  </div>

                  {/* Bottom Gold Tailband & SyncTone Imprint */}
                  <div className="relative z-10 w-full flex flex-col items-center gap-0.5">
                    <span
                      className="text-[7px] font-mono tracking-widest font-semibold uppercase mb-1"
                      style={{ color: palette.foil }}
                    >
                      SYNCTONE
                    </span>
                    <div
                      className="w-3/4 h-0.5"
                      style={{ backgroundColor: palette.foil, opacity: 0.5 }}
                    />
                    <div
                      className="w-full h-1"
                      style={{ backgroundColor: palette.foil, opacity: 0.8 }}
                    />
                  </div>
                </div>

                {/* Ground Shadow on Shelf Ledge */}
                <div
                  className="absolute -bottom-2 left-0 right-0 h-3 rounded-full bg-black/75 blur-xs transition-opacity duration-300"
                  style={{
                    opacity: isSelected ? 0.35 : isHovered ? 0.6 : 0.8,
                    transform: isSelected ? 'scaleX(0.8) translateY(6px)' : 'scaleX(1)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Solid Hardwood / Brass Shelf Ledge Floor */}
        <div className="relative z-20 w-full h-4 bg-gradient-to-r from-[#18181b] via-[#27272a] to-[#18181b] border-t-2 border-[#C5A059]/40 shadow-2xl flex items-center justify-between px-6">
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#C5A059]/60 to-transparent" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PULLED-FORWARD 3D BOOK INSPECTOR PANEL                                   */}
      {/* ========================================================================= */}
      {selectedNovel && (
        <div className="w-full p-6 sm:p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl animate-fade-in relative flex flex-col lg:flex-row gap-8 items-center justify-between">
          {/* Close Panel Button */}
          <button
            type="button"
            onClick={() => setSelectedNovelId(null)}
            className="absolute top-4 right-4 p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
            aria-label="Put book back on shelf"
            title="Put book back on shelf (Esc)"
          >
            <IconX className="w-5 h-5" />
          </button>

          {/* Left: 3D Turned Book Showcase */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div
              className="relative w-48 sm:w-56 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl cursor-pointer group"
              style={{
                boxShadow: '-18px 22px 35px rgba(0, 0, 0, 0.85)',
              }}
              onClick={() => onSelectNovel && onSelectNovel(selectedNovel.id)}
              title="Click to view full novel details"
            >
              <NovelCover
                coverUrl={selectedNovel.cover_object}
                title={selectedNovel.title}
                author={selectedNovel.author_username}
                id={selectedNovel.id}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {/* Spine highlight overlay */}
              <div className="absolute top-0 left-0 bottom-0 w-3 bg-gradient-to-r from-white/30 via-white/10 to-transparent pointer-events-none" />
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)] mt-2 uppercase tracking-wider">
              Selected Volume
            </span>
          </div>

          {/* Right: Comprehensive Literary Metadata & Action Buttons */}
          <div className="flex-1 space-y-4 max-w-2xl min-w-0">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-[var(--accent-text)] uppercase tracking-wider">
                + {selectedNovel.global_tone || 'CANONICAL MASTERPIECE'}
              </span>
              <h3 className="text-xl sm:text-2xl font-serif font-bold text-[var(--text-main)] leading-tight">
                {selectedNovel.title}
              </h3>
              <p className="text-xs font-mono text-[var(--text-sub)]">
                By {selectedNovel.author_username || 'Classic Author'} • Narrated by{' '}
                {selectedNovel.narrator_name || 'Studio Cast'}
              </p>
            </div>

            <p className="text-xs sm:text-sm font-sans text-[var(--text-sub)] leading-relaxed line-clamp-4">
              {selectedNovel.synopsis ||
                'Experience classic literature transformed with character voice assignment, generative ambient soundscapes, and synchronized reading text.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onStartListening && onStartListening(selectedNovel)}
                className="boxed-btn-primary px-6 py-2.5 text-xs font-mono uppercase rounded-full inline-flex items-center gap-2 shadow-md hover:scale-[1.03] active:scale-[0.96] transition-all cursor-pointer"
              >
                <IconPlay className="w-3.5 h-3.5 fill-current" />
                <span>Listen Now</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectNovel && onSelectNovel(selectedNovel.id)}
                className="boxed-btn px-5 py-2.5 text-xs font-mono uppercase rounded-full inline-flex items-center gap-2 text-[var(--text-main)] hover:border-[var(--text-main)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <IconBook className="w-3.5 h-3.5" />
                <span>Read Novel</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedNovelId(null)}
                className="boxed-btn px-4 py-2.5 text-xs font-mono uppercase rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] transition cursor-pointer"
              >
                Put Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

