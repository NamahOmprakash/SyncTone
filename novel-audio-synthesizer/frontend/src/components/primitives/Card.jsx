import React from 'react';

/**
 * Shared accessible Card Primitive for Novel & Audio items.
 * - Enforces equal-height geometry in grid rows.
 * - Stretched-link pattern with sibling action buttons (no nested interactive elements).
 * - Lift via translateY(-4px) and opacity-fade accent ring (ZERO layout shift).
 * - Synopsis zone strictly reserved to 44px (2 lines at 22px leading) to eliminate reflow.
 * - Responsive: row format <640px, vertical equal-height >=640px.
 */
export function Card({
  cover,
  eyebrow,
  title,
  author,
  narrator,
  synopsis,
  footerMeta,
  onPrimaryClick,
  onPlayClick,
  badge,
  className = '',
  aspectRatio = '3/4',
  ...props
}) {
  return (
    <article
      className={`novel-card-hybrid group w-full p-3 sm:p-3.5 ${className}`}
      {...props}
    >
      {/* 3:4 Aspect Ratio Cover Art */}
      <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-[var(--bg-hover)] border border-[var(--border-subtle)] mb-3 shrink-0 flex items-end justify-between p-2">
        {cover ? (
          <div className="absolute inset-0 w-full h-full">
            {cover}
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-hover)] via-[var(--bg-surface)] to-[var(--accent-surface)]" />
        )}

        {/* Badges layer */}
        <div className="relative z-10 flex items-center justify-between w-full">
          {badge && (
            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-sub)] border border-[var(--border-subtle)] backdrop-blur-md">
              {badge}
            </span>
          )}
        </div>
      </div>

      {/* Eyebrow / Genre */}
      {eyebrow && (
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] mb-1 truncate">
          {eyebrow}
        </p>
      )}

      {/* Title with Stretched Link Pattern */}
      <h3 className="font-serif text-[15px] sm:text-[16px] font-semibold leading-snug theme-heading mb-1 line-clamp-1">
        {onPrimaryClick ? (
          <button
            type="button"
            onClick={onPrimaryClick}
            className="text-left focus:outline-none focus:underline after:absolute after:inset-0 after:z-0 cursor-pointer"
          >
            {title}
          </button>
        ) : (
          title
        )}
      </h3>

      {/* Author */}
      {author && (
        <p className="text-xs font-medium theme-sub mb-1.5 truncate">
          {author}
        </p>
      )}

      {/* Narrator Pill */}
      {narrator && (
        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium theme-sub bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2 py-0.5 mb-2 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" aria-hidden="true" />
          <span className="truncate">{narrator}</span>
        </div>
      )}

      {/* Reserved 2-Line Synopsis Box */}
      {synopsis && (
        <p className="font-serif text-xs leading-[1.375rem] theme-sub synopsis-reserved-box mb-3">
          {synopsis}
        </p>
      )}

      {/* Divider */}
      <div className="w-full h-px bg-[var(--border-subtle)] mb-2.5 mt-auto" />

      {/* Action Row pinned to bottom */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-mono theme-sub gap-2 pt-0.5">
        <span className="tabular-nums truncate">{footerMeta}</span>
        {onPlayClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlayClick();
            }}
            aria-label={`Play ${title}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--accent-surface)] hover:bg-[var(--accent)] text-[var(--text-main)] hover:text-[var(--on-accent)] border border-[var(--border-subtle)] font-sans font-semibold text-xs transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Play</span>
          </button>
        )}
      </div>
    </article>
  );
}

export default Card;
