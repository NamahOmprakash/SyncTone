import React from 'react';

/**
 * Shared accessible Skeleton primitive.
 * - Geometric matching of cards, rows, covers, and prose to eliminate CLS (0.00).
 * - Animated via opacity pulse only (no heavy background-position or layout-shifting transforms).
 * - Respects prefers-reduced-motion (freezes animation, retains static placeholder).
 * - ARIA aria-busy="true" / aria-hidden="true".
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
  ...props
}) {
  const baseClasses =
    'bg-[var(--bg-hover)] animate-pulse rounded-md border border-[var(--border-subtle)] shrink-0';

  if (variant === 'card') {
    return (
      <div
        role="status"
        aria-label="Loading content"
        aria-busy="true"
        className={`w-full p-3 sm:p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col ${className}`}
        {...props}
      >
        {/* 3:4 Cover Skeleton */}
        <div className="w-full aspect-[3/4] rounded-lg bg-[var(--bg-hover)] animate-pulse mb-3 border border-[var(--border-subtle)]" />

        {/* Eyebrow */}
        <div className="w-20 h-3 rounded bg-[var(--bg-hover)] animate-pulse mb-2" />

        {/* Title */}
        <div className="w-3/4 h-5 rounded bg-[var(--bg-hover)] animate-pulse mb-2" />

        {/* Author */}
        <div className="w-1/2 h-3.5 rounded bg-[var(--bg-hover)] animate-pulse mb-3" />

        {/* Synopsis 2-line reserve */}
        <div className="w-full h-8 rounded bg-[var(--bg-hover)] animate-pulse mb-4" />

        {/* Divider */}
        <div className="w-full h-px bg-[var(--border-subtle)] mb-3 mt-auto" />

        {/* Footer meta */}
        <div className="flex items-center justify-between">
          <div className="w-16 h-3 rounded bg-[var(--bg-hover)] animate-pulse" />
          <div className="w-14 h-6 rounded-lg bg-[var(--bg-hover)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <div
        role="status"
        aria-label="Loading row"
        aria-busy="true"
        className={`w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center gap-3 ${className}`}
        {...props}
      >
        <div className="w-12 h-16 rounded-md bg-[var(--bg-hover)] animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="w-1/3 h-4 rounded bg-[var(--bg-hover)] animate-pulse" />
          <div className="w-1/4 h-3 rounded bg-[var(--bg-hover)] animate-pulse" />
        </div>
        <div className="w-16 h-8 rounded-lg bg-[var(--bg-hover)] animate-pulse shrink-0" />
      </div>
    );
  }

  if (variant === 'circle') {
    return (
      <div
        aria-hidden="true"
        className={`rounded-full ${baseClasses} ${className}`}
        style={{ width: width || '40px', height: height || '40px' }}
        {...props}
      />
    );
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`${baseClasses} ${className}`}
          style={{
            width: width || '100%',
            height: height || '16px',
            marginBottom: count > 1 && i < count - 1 ? '8px' : undefined,
          }}
          {...props}
        />
      ))}
    </>
  );
}

export default Skeleton;
