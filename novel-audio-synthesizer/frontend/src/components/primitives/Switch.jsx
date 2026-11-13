import React from 'react';

/**
 * Shared Switch Primitive.
 * - WCAG 2.1 / 2.2 AA accessible toggle with role="switch" and aria-checked.
 * - Enforces minimum 44px touch target area.
 * - Zero layout shift; animated purely via translate-x and opacity.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  id,
  name,
  label,
  'aria-label': ariaLabel,
  className = '',
  ...props
}) {
  const handleClick = () => {
    if (disabled) return;
    onChange?.(!checked);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  return (
    <div className={`inline-flex items-center gap-3 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
      <button
        type="button"
        role="switch"
        id={id}
        name={name}
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex items-center justify-center p-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-transform active:scale-[0.98] ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
        {...props}
      >
        {/* Track */}
        <span
          className={`w-11 h-6 rounded-full transition-colors duration-200 border border-[var(--border-subtle)] ${
            checked
              ? 'bg-[var(--accent)] border-[var(--accent)]'
              : 'bg-[var(--bg-hover)]'
          }`}
        />
        {/* Thumb */}
        <span
          className={`absolute left-2.5 top-2.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out-cubic ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>

      {label && (
        <label
          htmlFor={id}
          onClick={handleClick}
          className={`text-xs sm:text-sm font-medium ${
            disabled ? 'cursor-not-allowed theme-muted' : 'cursor-pointer text-[var(--text-main)]'
          }`}
        >
          {label}
        </label>
      )}
    </div>
  );
}

export default Switch;
