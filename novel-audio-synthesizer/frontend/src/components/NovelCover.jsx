import React, { useState } from 'react';

// Curated artistic cover styles for literary genres
const COVER_STYLES = {
  harry: {
    bg: 'bg-gradient-to-br from-[#121330] via-[#1e2048] to-[#0a0a18]',
    border: 'border-amber-500/30',
    spine: 'border-l-amber-500/50',
    accentText: 'text-amber-400',
    subText: 'text-indigo-200',
    glow: 'rgba(99, 102, 241, 0.25)',
    emblem: (
      <svg className="w-12 h-12 text-amber-400/90 mx-auto drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    eyebrow: 'WIZARDING CHRONICLES',
    subtitle: "The Philosopher's Stone",
  },
  sherlock: {
    bg: 'bg-gradient-to-br from-[#1a120b] via-[#281b10] to-[#0c0805]',
    border: 'border-amber-600/35',
    spine: 'border-l-amber-600/50',
    accentText: 'text-amber-300',
    subText: 'text-amber-200/80',
    glow: 'rgba(217, 119, 6, 0.25)',
    emblem: (
      <svg className="w-12 h-12 text-amber-300/90 mx-auto drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-5-5" />
        <path strokeLinecap="round" d="M11 8v6M8 11h6" strokeWidth="1" opacity="0.6" />
      </svg>
    ),
    eyebrow: 'VICTORIAN MYSTERIES',
    subtitle: 'Baker Street Archives',
  },
  classic: {
    bg: 'bg-gradient-to-br from-[#141824] via-[#1f2638] to-[#0c0e17]',
    border: 'border-indigo-400/30',
    spine: 'border-l-indigo-400/50',
    accentText: 'text-indigo-300',
    subText: 'text-slate-300',
    glow: 'rgba(99, 102, 241, 0.2)',
    emblem: (
      <svg className="w-12 h-12 text-indigo-300/90 mx-auto drop-shadow-[0_0_10px_rgba(129,140,248,0.4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    eyebrow: 'LITERARY MASTERPIECE',
    subtitle: 'Full Cast Edition',
  },
  fantasy: {
    bg: 'bg-gradient-to-br from-[#1a0e24] via-[#2c143d] to-[#0d0714]',
    border: 'border-purple-400/30',
    spine: 'border-l-purple-400/50',
    accentText: 'text-purple-300',
    subText: 'text-purple-200/80',
    glow: 'rgba(168, 85, 247, 0.2)',
    emblem: (
      <svg className="w-12 h-12 text-purple-300/90 mx-auto drop-shadow-[0_0_10px_rgba(192,132,252,0.4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    eyebrow: 'EPIC HIGH FANTASY',
    subtitle: 'Ensemble Voice Edition',
  },
};

function getCoverStyle(title = '') {
  const t = title.toLowerCase();
  if (t.includes('harry') || t.includes('potter')) return COVER_STYLES.harry;
  if (t.includes('sherlock') || t.includes('holmes')) return COVER_STYLES.sherlock;
  if (t.includes('fantasy') || t.includes('magic')) return COVER_STYLES.fantasy;
  return COVER_STYLES.classic;
}

export default function NovelCover({
  title = 'Untitled Novel',
  author = '',
  coverUrl = null,
  className = '',
}) {
  const [imgError, setImgError] = useState(false);
  const style = getCoverStyle(title);

  // If real image URL is valid, render image with rich book spine & ambient shadow
  if (coverUrl && !imgError) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={coverUrl}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setImgError(true)}
          loading="lazy"
        />
        {/* Book spine lighting */}
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 shadow-[inset_0_0_1px_rgba(255,255,255,0.2)] pointer-events-none" />
      </div>
    );
  }

  // Generative Artistic Hardcover: Rich book design with spine binding, foil borders, and literary emblem
  return (
    <div
      className={`relative w-full h-full ${style.bg} border ${style.border} border-l-[6px] ${style.spine} flex flex-col justify-between p-4 sm:p-5 select-none overflow-hidden ${className}`}
      style={{
        boxShadow: `inset 4px 0 12px rgba(0, 0, 0, 0.7), inset 1px 0 0 rgba(255, 255, 255, 0.15), 0 8px 24px ${style.glow}`,
      }}
      aria-hidden="true"
    >
      {/* Ornate Gold/Foil Inner Border Frame */}
      <div className="absolute inset-2 sm:inset-2.5 border border-white/10 rounded pointer-events-none" />
      <div className="absolute inset-2.5 sm:inset-3 border border-dashed border-white/5 rounded pointer-events-none" />

      {/* Subtle corner flourish */}
      <div className="absolute top-3 right-3 text-[9px] font-mono text-white/30 pointer-events-none">
        ✦
      </div>
      <div className="absolute bottom-3 left-3 text-[9px] font-mono text-white/30 pointer-events-none">
        ✦
      </div>

      {/* Top: Category Eyebrow & Star Seal */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-white/60">
          {style.eyebrow}
        </span>
        <span className="text-[10px] text-amber-400 font-mono font-bold">
          ★ 9.4
        </span>
      </div>

      {/* Center: Mythic Emblem & Genre Crest */}
      <div className="relative z-10 my-auto text-center py-2 space-y-2">
        <div className="transform transition-transform duration-300 group-hover:scale-110">
          {style.emblem}
        </div>

        <div className="space-y-0.5">
          <p className={`text-[10px] font-mono tracking-widest uppercase font-bold ${style.accentText}`}>
            {style.subtitle}
          </p>
        </div>
      </div>

      {/* Bottom: Decorative Publisher Ribbon */}
      <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] font-mono tracking-widest text-white/40 uppercase">
        <span>SyncTone Editions</span>
        <span>Dramatic Cast</span>
      </div>

      {/* Ambient Lighting Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/5 pointer-events-none" />
      {/* Book spine shadow */}
      <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/80 to-transparent pointer-events-none" />
    </div>
  );
}
