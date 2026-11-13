import React, { useState, useEffect } from 'react';

const EDITIONS = [
  {
    bg: 'bg-gradient-to-br from-[#1B1B1E] via-[#141416] to-[#0B0B0D]',
    border: 'border-[#5E5E66]/40 border-l-[#F2F2F3]',
    accentText: 'text-[#F2F2F3]',
    authorText: 'text-[#A9A9AF]',
    titleClass: 'text-[#F2F2F3]',
    glow: 'rgba(0,0,0,0.6)',
    eyebrow: 'NOCTURNE OBSIDIAN',
    edition: 'Obsidian Foil Edition',
    emblem: <polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2" />,
    color: 'text-[#F2F2F3]',
  },
  {
    bg: 'bg-gradient-to-br from-[#232327] via-[#1B1B1E] to-[#141416]',
    border: 'border-[#44444A]/40 border-l-[#A9A9AF]',
    accentText: 'text-[#A9A9AF]',
    authorText: 'text-[#898992]',
    titleClass: 'text-[#F2F2F3]',
    glow: 'rgba(0,0,0,0.5)',
    eyebrow: 'CARBON SLATE',
    edition: 'Monochrome Edition',
    emblem: <circle cx="12" cy="12" r="8" strokeWidth="1.2" />,
    color: 'text-[#A9A9AF]',
  },
  {
    bg: 'bg-gradient-to-br from-[#2A2A2E] via-[#1F1F23] to-[#141416]',
    border: 'border-[#5E5E66]/40 border-l-[#898992]',
    accentText: 'text-[#DCDCDF]',
    authorText: 'text-[#A9A9AF]',
    titleClass: 'text-[#F2F2F3]',
    glow: 'rgba(0,0,0,0.5)',
    eyebrow: 'GRAPHITE ASH',
    edition: 'Master Binding Edition',
    emblem: <path strokeLinecap="round" d="M12 6v13m-9-12C4 6 6 5 8 5s4 1 4 2m0 0c0-1 2-2 4-2s4 1 5 2v13c-1-1-3-2-5-2s-4 1-4 2" />,
    color: 'text-[#DCDCDF]',
  },
  {
    bg: 'bg-gradient-to-br from-[#FFFFFF] via-[#F7F7F8] to-[#EFEFF0]',
    border: 'border-[#D0D0D4]/60 border-l-[#0B0B0D]',
    accentText: 'text-[#0B0B0D]',
    authorText: 'text-[#4F4F56]',
    titleClass: 'text-[#0B0B0D]',
    glow: 'rgba(0,0,0,0.15)',
    eyebrow: 'ALABASTER VELLUM',
    edition: 'Archival Vellum Edition',
    emblem: <path strokeLinecap="round" d="M12 7v10M8 12h8" />,
    color: 'text-[#0B0B0D]',
    isLight: true,
  },
  {
    bg: 'bg-gradient-to-br from-[#141416] via-[#0B0B0D] to-[#050506]',
    border: 'border-[#5E5E66]/50 border-l-[#F2F2F3]',
    accentText: 'text-[#F2F2F3]',
    authorText: 'text-[#A9A9AF]',
    titleClass: 'text-[#F2F2F3]',
    glow: 'rgba(0,0,0,0.7)',
    eyebrow: 'PURE MONOCHROME',
    edition: 'First Edition Print',
    emblem: <path strokeLinecap="round" d="M12 4v16m-8-8l8-8 8 8" />,
    color: 'text-[#F2F2F3]',
  },
];

export const COVER_STYLES = {
  champagne: EDITIONS[0],
  gold: EDITIONS[0],
  amber: EDITIONS[0],
  sage: EDITIONS[1],
  walnut: EDITIONS[2],
  alabaster: EDITIONS[3],
  obsidian: EDITIONS[4],
  espresso: EDITIONS[4],
  chocolate: EDITIONS[2],
  charcoal: EDITIONS[4],
};

export const CANONICAL_COVERS = {
  'the little prince': '/covers/the-little-prince-cover.jpg',
  'little prince': '/covers/the-little-prince-cover.jpg',
  'harry potter and the philosopher\'s stone': '/covers/harry-potter-philosophers-stone-cover.jpg',
  'harry potter': '/covers/harry-potter-philosophers-stone-cover.jpg',
  'the adventures of sherlock holmes': '/covers/adventures-of-sherlock-holmes-cover.jpg',
  'sherlock holmes': '/covers/adventures-of-sherlock-holmes-cover.jpg',
  'a study in scarlet': '/covers/a-study-in-scarlet-cover.jpg',
  'the great gatsby': '/covers/the-great-gatsby-cover.jpg',
  'the hobbit': '/covers/the-hobbit-cover.jpg',
  '1984': '/covers/1984-george-orwell-cover.jpg',
  'pride and prejudice': '/covers/pride-and-prejudice-cover.jpg',
  'alice\'s adventures in wonderland': '/covers/alices-adventures-in-wonderland-cover.jpg',
  'alices adventures in wonderland': '/covers/alices-adventures-in-wonderland-cover.jpg',
  'frankenstein': '/covers/frankenstein-mary-shelley-cover.jpg',
  'dracula': '/covers/dracula-bram-stoker-cover.jpg',
  'jane eyre': '/covers/jane-eyre-cover.jpg',
  'moby-dick': '/covers/moby-dick-cover.jpg',
  'moby dick': '/covers/moby-dick-cover.jpg',
  'the picture of dorian gray': '/covers/picture-of-dorian-gray-cover.jpg',
  'dorian gray': '/covers/picture-of-dorian-gray-cover.jpg',
  'the count of monte cristo': '/covers/count-of-monte-cristo-cover.jpg',
  'count of monte cristo': '/covers/count-of-monte-cristo-cover.jpg',
};

export function getCoverStyle(title = '', id = '', index = 0) {
  if (typeof index === 'number' && index >= 0) {
    return EDITIONS[index % EDITIONS.length];
  }
  const seed = `${title || ''}#${id || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return EDITIONS[Math.abs(hash) % EDITIONS.length];
}

export default function NovelCover({
  title = 'Untitled Novel',
  author = '',
  coverUrl = null,
  className = '',
  id = '',
  index = 0,
  hideEyebrow = false,
}) {
  const displayTitle = typeof title === 'string' && title.trim() ? title : 'Untitled Novel';
  const displayAuthor = typeof author === 'string' ? author.trim() : '';
  const style = getCoverStyle(displayTitle, id, index);

  const normalizedTitle = (displayTitle || '').toLowerCase().trim();
  const canonicalFallback = CANONICAL_COVERS[normalizedTitle] ||
    Object.entries(CANONICAL_COVERS).find(([k]) => normalizedTitle.includes(k))?.[1] ||
    null;

  const initialSrc = coverUrl || canonicalFallback;
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const nextSrc = coverUrl || canonicalFallback;
    setCurrentSrc(nextSrc);
    setImgError(false);
  }, [coverUrl, canonicalFallback]);

  const handleImageError = () => {
    if (currentSrc && currentSrc.startsWith('/static/covers/')) {
      setCurrentSrc(currentSrc.replace('/static/covers/', '/covers/'));
      return;
    }
    if (currentSrc && currentSrc.endsWith('.webp')) {
      setCurrentSrc(currentSrc.replace(/\.webp$/, '.jpg'));
      return;
    }
    if (canonicalFallback && currentSrc !== canonicalFallback) {
      setCurrentSrc(canonicalFallback);
      return;
    }
    setImgError(true);
  };

  if (currentSrc && !imgError) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={currentSrc}
          alt={displayTitle}
          className="volume-cover-img w-full h-full object-cover"
          onError={handleImageError}
          loading="lazy"
        />
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/60 to-transparent pointer-events-none" />
      </div>
    );
  }

  const light = style.isLight;
  return (
    <div
      className={`volume-cover-img relative w-full h-full ${style.bg} border border-l-[6px] ${style.border} flex flex-col justify-between p-3.5 sm:p-5 select-none overflow-hidden ${className}`}
      style={{ boxShadow: `inset 4px 0 12px rgba(0,0,0,${light ? '0.2' : '0.7'}),0 8px 24px ${style.glow}` }}
      aria-hidden="true"
    >
      <div className={`absolute inset-2 sm:inset-2.5 border ${light ? 'border-black/20' : 'border-white/10'} rounded-lg pointer-events-none`} />
      <div className={`absolute top-2.5 right-2.5 text-[8px] font-mono ${light ? 'text-black/50' : 'text-white/60'}`}>✦</div>
      <div className={`absolute bottom-2.5 left-2.5 text-[8px] font-mono ${light ? 'text-black/50' : 'text-white/60'}`}>✦</div>

      <div className="relative z-10 flex items-center justify-between">
        {!hideEyebrow ? (
          <span className={`text-[8px] sm:text-[9px] font-mono font-bold tracking-widest uppercase ${light ? 'text-black/75' : 'text-white/75'}`}>
            {style.eyebrow}
          </span>
        ) : <span />}
        <span className={`text-[8px] sm:text-[9px] font-mono font-semibold ${light ? 'text-black/60' : 'text-white/60'}`}>
          ✦ Edition
        </span>
      </div>

      <div className="relative z-10 my-auto text-center py-1 sm:py-2 space-y-1.5 sm:space-y-2">
        <svg className={`w-9 h-9 sm:w-11 sm:h-11 ${style.color} mx-auto drop-shadow-md transform transition-transform duration-300 group-hover:scale-105`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          {style.emblem}
        </svg>

        <div className="space-y-1 px-1">
          <div
            className={`font-serif font-bold text-center leading-tight text-[11px] sm:text-xs md:text-sm line-clamp-2 cover-typeset-title ${style.titleClass}`}
            data-title={displayTitle}
          />
          {displayAuthor && (
            <div
              className={`text-[8px] sm:text-[9px] font-mono tracking-widest uppercase text-center truncate cover-typeset-author ${style.authorText}`}
              data-author={`By ${displayAuthor}`}
            />
          )}
          <p className={`text-[8px] sm:text-[9px] font-mono tracking-wider uppercase font-semibold ${style.accentText} pt-0.5 opacity-85`}>
            {style.edition}
          </p>
        </div>
      </div>

      <div className={`relative z-10 pt-1.5 sm:pt-2 border-t ${light ? 'border-black/20 text-black/65' : 'border-white/10 text-white/50'} flex items-center justify-between text-[8px] sm:text-[9px] font-mono tracking-widest uppercase`}>
        <span>SyncTone</span>
        <span>Full Cast</span>
      </div>

      <div className={`absolute inset-0 ${light ? 'bg-gradient-to-t from-black/10 via-transparent to-white/20' : 'bg-gradient-to-t from-black/50 via-transparent to-white/5'} pointer-events-none`} />
      <div className={`absolute inset-y-0 left-0 w-2.5 ${light ? 'bg-gradient-to-r from-black/20 to-transparent' : 'bg-gradient-to-r from-black/80 to-transparent'} pointer-events-none`} />
    </div>
  );
}
