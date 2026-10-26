import React, { useRef } from 'react';

/**
 * Shared accessible Tabs primitive.
 * - Roving tabindex with arrow key navigation (Left/Right).
 * - Full ARIA support (role="tablist", role="tab", aria-selected, aria-controls).
 * - Zero layout shift active states.
 */
export function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
  size = 'md',
}) {
  const tabListRef = useRef(null);

  const handleKeyDown = (e, index) => {
    let newIndex = index;
    if (e.key === 'ArrowRight') {
      newIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      newIndex = 0;
    } else if (e.key === 'End') {
      newIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    onChange(tabs[newIndex].id);

    // Focus the newly selected tab
    if (tabListRef.current) {
      const buttons = tabListRef.current.querySelectorAll('[role="tab"]');
      buttons[newIndex]?.focus();
    }
  };

  const sizeClasses = {
    sm: 'text-xs py-1.5 px-3',
    md: 'text-xs sm:text-sm py-2 px-4',
    lg: 'text-sm py-2.5 px-5',
  }[size] || 'text-xs sm:text-sm py-2 px-4';

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-orientation="horizontal"
      className={`inline-flex items-center gap-1 p-1 rounded-xl theme-surface border border-[var(--border-subtle)] ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-150 cursor-pointer select-none ${sizeClasses} ${
              isActive
                ? 'bg-[var(--accent)] text-[var(--on-accent)] font-semibold shadow-xs'
                : 'theme-sub hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive
                    ? 'bg-black/20 text-current'
                    : 'theme-surface text-[var(--text-muted)]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
