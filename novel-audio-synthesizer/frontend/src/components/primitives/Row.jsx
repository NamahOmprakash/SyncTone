import React, { useRef, useState, useEffect, useCallback } from 'react';
import { IconChevronLeft, IconChevronRight } from '../icons';

/**
 * Shared Row / Carousel Primitive.
 * - Smooth scroll snap.
 * - Shows navigation arrows only when content overflows.
 * - Supports keyboard horizontal scroll with arrow keys when focused.
 */
export function Row({
  children,
  className = '',
  itemWidth = 260,
  gap = 20,
}) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  const scrollByDistance = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = (itemWidth + gap) * 2;
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      scrollByDistance('left');
    } else if (e.key === 'ArrowRight') {
      scrollByDistance('right');
    }
  };

  return (
    <div className={`relative group/row ${className}`}>
      {/* Left Chevron Button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByDistance('left')}
          aria-label="Scroll left"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full theme-surface border border-[var(--border-hover)] text-[var(--text-main)] shadow-xl flex items-center justify-center opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <IconChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Snap Scroll Container */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex gap-4 sm:gap-5 overflow-x-auto pb-4 pt-1 px-1 scroll-smooth snap-x snap-mandatory focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>

      {/* Right Chevron Button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByDistance('right')}
          aria-label="Scroll right"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full theme-surface border border-[var(--border-hover)] text-[var(--text-main)] shadow-xl flex items-center justify-center opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <IconChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
