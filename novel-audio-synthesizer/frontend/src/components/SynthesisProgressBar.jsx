import React from 'react';
import {
  IconMic,
  IconScroll,
  IconSoundwave,
  IconCheck,
  IconX,
} from './icons';

export default function SynthesisProgressBar({
  status = 'idle',
  percentComplete = 0,
  currentSegment = null,
  totalSegments = null,
  message = '',
  error = null,
  isConnected = false,
  onDismiss = null,
}) {
  if (status === 'idle') return null;

  const isComplete = status === 'complete';
  const isFailed = status === 'failed';
  const isGenerating = status === 'synthesizing' || status === 'generating' || status === 'parsing' || status === 'stitching';

  let StatusIcon = IconMic;
  if (status === 'parsing') {
    StatusIcon = IconScroll;
  } else if (status === 'stitching') {
    StatusIcon = IconSoundwave;
  } else if (isComplete) {
    StatusIcon = IconCheck;
  } else if (isFailed) {
    StatusIcon = IconX;
  }

  return (
    <div
      className="synthesis-banner-box bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3 animate-fadeIn shadow-md"
      role="region"
      aria-label="Chapter Audio Progress"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-main)] flex items-center justify-center flex-shrink-0 shadow-xs">
            <StatusIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-sub)] border border-[var(--border-subtle)] shadow-xs">
                {status}
              </span>
              {isConnected && !isComplete && !isFailed && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-main)] font-mono font-medium">
                  {/* Section 9.4: signal dot strictly for live generating state */}
                  {isGenerating ? (
                    <span className="signal-dot" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                  )}
                  <span>Live Sync</span>
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-[var(--text-main)] mt-1 truncate">
              {error || message || 'Processing audio chapter...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-bold text-[var(--text-main)] font-mono">
            {Math.round(percentComplete)}%
          </span>
          {(isComplete || isFailed) && onDismiss && (
            <button
              onClick={onDismiss}
              className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition cursor-pointer"
              aria-label="Dismiss progress"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Container */}
      <div
        className="w-full bg-[var(--bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--border-subtle)] shadow-xs"
        role="progressbar"
        aria-label="Audio synthesis progress"
        aria-valuenow={Math.round(percentComplete)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-300 bg-[var(--text-main)]"
          style={{ width: `${Math.max(3, Math.min(100, percentComplete))}%` }}
        />
      </div>

      {/* Segment Counter */}
      {currentSegment !== null && totalSegments !== null && (
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono pt-0.5">
          <span>
            Synthesizing audio segment <strong className="text-[var(--text-main)] font-bold">{currentSegment}</strong> of {totalSegments}
          </span>
          <span>{totalSegments - currentSegment} remaining</span>
        </div>
      )}
    </div>
  );
}
