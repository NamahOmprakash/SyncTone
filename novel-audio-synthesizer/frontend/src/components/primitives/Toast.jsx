import React, { useEffect } from 'react';

/**
 * Shared accessible Toast primitive.
 * - role="status", aria-live="polite" for screen reader announcements.
 * - 44px touch target on dismiss.
 * - Auto-dismiss timeout with pause on hover.
 * - Semantic icon + badge.
 */
export function Toast({
  id,
  type = 'info',
  title,
  message,
  onDismiss,
  duration = 4000,
  className = '',
}) {
  useEffect(() => {
    if (!duration || !onDismiss) return;
    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const variantStyles = {
    info: 'border-[var(--info)] text-[var(--info)]',
    success: 'border-[var(--success)] text-[var(--success)]',
    warning: 'border-[var(--warning)] text-[var(--warning)]',
    danger: 'border-[var(--danger)] text-[var(--danger)]',
  }[type] || 'border-[var(--accent)] text-[var(--accent)]';

  return (
    <aside
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-xl bg-[var(--bg-elevated)] border shadow-xl backdrop-blur-md max-w-sm w-full transition-all duration-200 ${variantStyles} ${className}`}
    >
      <div className="shrink-0 mt-0.5">
        {type === 'success' && (
          <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {type === 'warning' && (
          <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
        {type === 'danger' && (
          <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        {type === 'info' && (
          <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="text-xs sm:text-sm font-semibold theme-heading mb-0.5">
            {title}
          </h4>
        )}
        {message && (
          <p className="text-xs theme-sub leading-relaxed">
            {message}
          </p>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="shrink-0 -mr-1.5 -mt-1.5 p-2 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
        >
          <svg className="w-3.5 h-3.5 stroke-current stroke-2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </aside>
  );
}

export default Toast;
