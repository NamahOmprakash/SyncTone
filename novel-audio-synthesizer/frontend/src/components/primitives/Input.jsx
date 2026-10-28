import React, { forwardRef } from 'react';

/**
 * Shared accessible Input Primitive.
 * - Minimum 44px touch target.
 * - Linked label via htmlFor & id.
 * - Explicit aria-invalid & aria-describedby for errors and helper text.
 * - Visible focus ring (2px outline, 2px offset) passing >= 3:1 contrast.
 * - Zero layout shift on focus, hover, or validation state.
 */
export const Input = forwardRef(function Input(
  {
    id,
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    error,
    helperText,
    icon: Icon,
    rightElement,
    disabled = false,
    required = false,
    className = '',
    autoComplete,
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;
  const helperId = helperText && inputId ? `${inputId}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold theme-sub flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-[var(--danger)] ml-0.5" aria-hidden="true">*</span>}
          </span>
        </label>
      )}

      <div className="relative flex items-center w-full">
        {Icon && (
          <div className="absolute left-3.5 pointer-events-none theme-muted shrink-0 flex items-center justify-center">
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className={`w-full min-h-[44px] rounded-xl bg-[var(--bg-card)] border text-xs sm:text-sm theme-heading placeholder:text-[var(--text-muted)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-page)] disabled:opacity-50 disabled:cursor-not-allowed ${
            Icon ? 'pl-10' : 'pl-3.5'
          } ${rightElement ? 'pr-10' : 'pr-3.5'} ${
            error
              ? 'border-[var(--danger)] focus:border-[var(--danger)]'
              : 'border-[var(--border-subtle)] hover:border-[var(--border-hover)] focus:border-[var(--accent)]'
          }`}
          {...props}
        />

        {rightElement && (
          <div className="absolute right-3 shrink-0 flex items-center justify-center">
            {rightElement}
          </div>
        )}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-[var(--danger)] font-medium mt-0.5">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs theme-muted mt-0.5">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
