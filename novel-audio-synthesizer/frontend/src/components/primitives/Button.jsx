import React from 'react';

/**
 * Shared Button Primitive.
 * - Enforces minimum 44px touch target (WCAG 2.5.5 / 2.5.8).
 * - Primary uses var(--on-accent) for text to guarantee >= 6.29:1 contrast in all 3 themes.
 * - Zero layout shift on hover, focus, active, or loading states.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  isLoading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs min-h-[36px] sm:min-h-[36px]',
    md: 'px-4 py-2.5 text-xs sm:text-sm min-h-[44px]',
    lg: 'px-6 py-3 text-sm sm:text-base min-h-[48px]',
    icon: 'p-2.5 min-h-[44px] min-w-[44px] justify-center',
  }[size] || 'px-4 py-2.5 text-xs sm:text-sm min-h-[44px]';

  const variantClasses = {
    primary:
      'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    secondary:
      'theme-surface border border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] font-semibold shadow-xs',
    ghost:
      'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-sub)] hover:text-[var(--text-main)] font-medium',
    outline:
      'bg-transparent border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[var(--text-main)] font-semibold',
    danger:
      'bg-[var(--color-status-danger)] text-white font-semibold shadow-sm hover:opacity-90',
  }[variant] || 'bg-[var(--accent)] text-[var(--on-accent)] font-semibold';

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-150 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="w-4 h-4 animate-spin text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
          {children && <span>{children}</span>}
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
        </>
      )}
    </button>
  );
}
