import React, { useState, useRef, useId } from 'react';

/**
 * Shared accessible Tooltip primitive.
 * - Shows on hover AND focus.
 * - Dismisses on Escape key.
 * - Proper aria-describedby linkage.
 * - Zero layout shift on trigger element.
 */
export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className = '',
}) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);
  const tooltipId = useId();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const handleFocus = () => {
    setIsVisible(true);
  };

  const handleBlur = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isVisible) {
      setIsVisible(false);
    }
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position] || 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {React.cloneElement(children, {
        'aria-describedby': isVisible ? tooltipId : undefined,
      })}

      {isVisible && content && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 pointer-events-none px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-[var(--bg-elevated)] text-[var(--text-main)] border border-[var(--border-strong)] shadow-lg backdrop-blur-md whitespace-nowrap animate-fade-in ${positionClasses} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}

export default Tooltip;
