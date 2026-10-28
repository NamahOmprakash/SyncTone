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

  let StatusIcon = IconMic;
  let barColor = 'bg-[var(--accent)]';

  if (status === 'parsing') {
    StatusIcon = IconScroll;
  } else if (status === 'stitching') {
    StatusIcon = IconSoundwave;
  } else if (isComplete) {
    StatusIcon = IconCheck;
    barColor = 'bg-emerald-500';
  } else if (isFailed) {
    StatusIcon = IconX;
    barColor = 'bg-rose-500';
  }

  return (
    <div
      className="theme-card rounded-2xl border p-4 shadow-lg space-y-3 animate-fadeIn"
      role="region"
      aria-label="Chapter Audio Progress"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-surface)] border border-[var(--border-focus)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <StatusIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md theme-surface theme-sub border">
                {status}
              </span>
              {isConnected && !isComplete && !isFailed && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Sync
                </span>
              )}
            </div>
            <p className="text-xs font-semibold theme-heading mt-1 truncate">
              {error || message || 'Processing audio chapter...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-bold theme-heading font-mono">
            {Math.round(percentComplete)}%
          </span>
          {(isComplete || isFailed) && onDismiss && (
            <button
              onClick={onDismiss}
              className="theme-muted hover:text-[var(--text-main)] text-xs p-1 rounded-lg transition"
              aria-label="Dismiss progress"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Container */}
      <div
        className="w-full bg-[var(--bg-surface)] rounded-full h-2 overflow-hidden border theme-border"
        role="progressbar"
        aria-valuenow={Math.round(percentComplete)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.max(3, Math.min(100, percentComplete))}%` }}
        />
      </div>

      {/* Segment Counter */}
      {currentSegment !== null && totalSegments !== null && (
        <div className="flex items-center justify-between text-[11px] theme-muted font-mono pt-0.5">
          <span>
            Synthesizing audio segment <strong className="theme-heading font-bold">{currentSegment}</strong> of {totalSegments}
          </span>
          <span>{totalSegments - currentSegment} remaining</span>
        </div>
      )}
    </div>
  );
}
