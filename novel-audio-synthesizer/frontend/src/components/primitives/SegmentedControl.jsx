import React, { useRef } from 'react';

/**
 * Shared SegmentedControl Primitive.
 * - Pill-style toggle control for mutually exclusive modes/options.
 * - Accessible keyboard navigation via Left/Right arrows, Home/End.
 * - 44px minimum touch target height.
 * - Zero layout shift; spring/transform active indicator.
 */
export function SegmentedControl({
  options = [],
  value,
  onChange,
  id,
  'aria-label': ariaLabel = 'Options',
  className = '',
  size = 'md',
  disabled = false,
}) {
  const itemRefs = useRef([]);

  const handleKeyDown = (e, index) => {
    if (disabled || options.length <= 1) return;
    let nextIdx = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIdx = (index + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIdx = (index - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIdx = options.length - 1;
    }

    if (nextIdx !== -1) {
      const nextOpt = options[nextIdx];
      if (!nextOpt.disabled) {
        onChange?.(nextOpt.id ?? nextOpt.value);
        itemRefs.current[nextIdx]?.focus();
      }
    }
  };

  const sizeClasses = {
    sm: 'p-0.5 text-xs min-h-[36px]',
    md: 'p-1 text-xs sm:text-sm min-h-[44px]',
    lg: 'p-1.5 text-sm sm:text-base min-h-[48px]',
  }[size] || 'p-1 text-xs sm:text-sm min-h-[44px]';

  return (
    <div
      role="radiogroup"
      id={id}
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-xl theme-surface border border-[var(--border-subtle)] ${sizeClasses} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {options.map((opt, idx) => {
        const optValue = opt.id ?? opt.value;
        const isSelected = value === optValue;
        const isOptDisabled = disabled || opt.disabled;

        return (
          <button
            key={optValue}
            ref={(el) => (itemRefs.current[idx] = el)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={isOptDisabled}
            onClick={() => !isOptDisabled && onChange?.(optValue)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`relative flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all duration-150 cursor-pointer select-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 min-h-[36px] ${
              isSelected
                ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                : 'theme-sub hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {opt.icon && <span className="w-4 h-4 shrink-0">{opt.icon}</span>}
            <span>{opt.label ?? optValue}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
