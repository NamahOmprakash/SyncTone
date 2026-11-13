import React from 'react';
import { IconChevronLeft, IconChevronRight } from '../components/icons';

/**
 * PageNavButtons Component
 * Renders the floating Prev / Next page chevrons.
 * In Phase 1, Agent C positions these inside the reserved gutter so they
 * never intersect or overlap the content box.
 */
export default function PageNavButtons({
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  prevTitle = 'Previous Page (Left Arrow)',
  nextTitle = 'Next Page (Right Arrow)',
  className = '',
}) {
  return (
    <>
      {/* Left Navigation Chevron */}
      <button
        type="button"
        aria-label="Previous Page"
        onClick={onPrev}
        disabled={!canPrev}
        className={`gutter-chevron gutter-chevron-left ${className}`}
        title={prevTitle}
      >
        <span aria-hidden="true" className="text-xl">‹</span>
      </button>

      {/* Right Navigation Chevron */}
      <button
        type="button"
        aria-label="Next Page"
        onClick={onNext}
        disabled={!canNext}
        className={`gutter-chevron gutter-chevron-right ${className}`}
        title={nextTitle}
      >
        <span aria-hidden="true" className="text-xl">›</span>
      </button>
    </>
  );
}

