import React from 'react';

/**
 * Shared StatusBadge Primitive.
 * Uses additive semantic tokens with verified >= 5.17:1 contrast across all themes and surfaces.
 * Color is never the only signal: always pairs with explicit icon and text label.
 */
export function StatusBadge({
  status = 'info',
  label,
  children,
  icon: CustomIcon,
  className = '',
  size = 'md',
}) {
  const text = label || children;

  const statusConfig = {
    success: {
      colorVar: 'var(--color-status-success)',
      defaultIcon: '✓',
    },
    warning: {
      colorVar: 'var(--color-status-warning)',
      defaultIcon: '▲',
    },
    danger: {
      colorVar: 'var(--color-status-danger)',
      defaultIcon: '✕',
    },
    info: {
      colorVar: 'var(--color-status-info)',
      defaultIcon: 'ℹ',
    },
    narrator: {
      colorVar: 'var(--color-speaker-narrator)',
      defaultIcon: '✦',
    },
    dialogue: {
      colorVar: 'var(--color-speaker-dialogue)',
      defaultIcon: '💬',
    },
    system: {
      colorVar: 'var(--color-speaker-system)',
      defaultIcon: '⚙',
    },
  }[status] || {
    colorVar: 'var(--color-status-info)',
    defaultIcon: 'ℹ',
  };

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-[11px] px-2.5 py-1 gap-1.5',
    lg: 'text-xs px-3 py-1.5 gap-2',
  }[size] || 'text-[11px] px-2.5 py-1 gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded-lg border select-none transition-colors ${sizeClasses} ${className}`}
      style={{
        color: statusConfig.colorVar,
        borderColor: `color-mix(in srgb, ${statusConfig.colorVar} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${statusConfig.colorVar} 10%, transparent)`,
      }}
    >
      {CustomIcon ? (
        <CustomIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
      ) : (
        <span className="text-[10px] opacity-80 shrink-0" aria-hidden="true">
          {statusConfig.defaultIcon}
        </span>
      )}
      <span className="truncate">{text}</span>
    </span>
  );
}
