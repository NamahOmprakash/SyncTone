import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  IconPlay,
  IconPause,
  IconPrev,
  IconNext,
  IconSkipBack,
  IconSkipForward,
  IconVolume,
  IconVolumeMute,
  IconSoundwave,
} from './icons';

function formatTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function AudioPlayer({
  audioRef,
  audioUrl,
  isPlaying,
  currentTimeMs = 0,
  totalDurationMs = 0,
  onToggle,
  onSetPlaybackRate,
  onSeek,
  onPlay,
  onPause,
  onEnded,
  onLoadedMetadata,
  currentNovel,
  currentChapter,
  onSeekSegment,
}) {
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const scrubberTrackRef = useRef(null);

  const progressFraction = totalDurationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / totalDurationMs)) : 0;

  // Direct scale update to avoid react re-render latency
  const scrubScaleStyle = {
    transform: `scaleX(${progressFraction})`,
    transformOrigin: 'left',
  };

  const handleSeekFromClientX = useCallback(
    (clientX) => {
      if (!audioRef?.current || totalDurationMs <= 0 || !scrubberTrackRef.current) return;
      const rect = scrubberTrackRef.current.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const targetMs = Math.round(fraction * totalDurationMs);
      if (onSeek) {
        onSeek(targetMs, isPlaying);
      } else {
        audioRef.current.currentTime = targetMs / 1000;
      }
    },
    [audioRef, totalDurationMs, onSeek, isPlaying]
  );

  const handleScrubberClick = (e) => {
    handleSeekFromClientX(e.clientX);
  };

  const handleKeyDown = (e) => {
    if (!audioRef?.current) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      audioRef.current.currentTime = Math.min(totalDurationMs / 1000, audioRef.current.currentTime + 5);
    } else if (e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleSkip = useCallback(
    (seconds) => {
      if (!audioRef?.current) return;
      audioRef.current.currentTime = Math.max(
        0,
        Math.min(totalDurationMs / 1000, audioRef.current.currentTime + seconds)
      );
    },
    [audioRef, totalDurationMs]
  );

  const handleSpeedChange = () => {
    const currentIdx = SPEED_OPTIONS.indexOf(speed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    const newSpeed = SPEED_OPTIONS[nextIdx];
    setSpeed(newSpeed);
    if (onSetPlaybackRate) onSetPlaybackRate(newSpeed);
    if (audioRef?.current) audioRef.current.playbackRate = newSpeed;
  };

  const handleVolumeToggle = useCallback(() => {
    if (!audioRef?.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
      audioRef.current.volume = volume || 1.0;
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  }, [audioRef, isMuted, volume]);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef?.current) {
      audioRef.current.volume = val;
      if (val === 0) {
        audioRef.current.muted = true;
        setIsMuted(true);
      } else {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
    }
  };

  // Global Keyboard Shortcuts (Space, J, L, M) with strict focus/input guards
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // 1. Ignore events in editable elements
      const target = e.target;
      const tagName = target?.tagName?.toLowerCase();
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }

      // 2. Avoid double-triggering Space on focused buttons or links
      if (e.code === 'Space' || e.key === ' ') {
        if (tagName === 'button' || tagName === 'a') {
          return;
        }
        e.preventDefault();
        onToggle?.();
        return;
      }

      // 3. J: skip back 10s
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleSkip(-10);
        return;
      }

      // 4. L: skip forward 10s
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleSkip(10);
        return;
      }

      // 5. M: mute toggle
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleVolumeToggle();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onToggle, handleSkip, handleVolumeToggle]);

  // Media Session API integration (hardware media keys & lockscreen controls)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (currentNovel && currentChapter) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentChapter.title || 'Chapter Audio Track',
        artist: currentNovel.title || 'SyncTone',
        album: currentNovel.author_username ? `By ${currentNovel.author_username}` : 'SyncTone Audio',
      });
    }

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isPlaying) onToggle?.();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isPlaying) onToggle?.();
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        handleSkip(-(details?.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        handleSkip(details?.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (audioRef?.current && details?.seekTime !== undefined) {
          audioRef.current.currentTime = details.seekTime;
        }
      });
    } catch (_) {}

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch (_) {}
    };
  }, [isPlaying, onToggle, currentNovel, currentChapter, audioRef, handleSkip]);

  return (
    <footer
      className="fixed bottom-0 left-0 md:left-[72px] right-0 z-40 glass-dock border-t px-4 py-2.5 sm:py-3 shadow-2xl transition-colors duration-200"
      aria-label="Floating Audio Dock"
    >
      {/* Hidden audio element for audio sync engine */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
      />

      <div className="max-w-5xl mx-auto flex flex-col gap-1.5">
        {/* Scrubber Track with 44px Touch Target & Accessible Slider */}
        <div className="w-full flex items-center gap-3">
          <span className="text-[11px] font-mono theme-muted w-10 text-right select-none font-bold">
            {formatTime(currentTimeMs)}
          </span>

          <div
            ref={scrubberTrackRef}
            onClick={handleScrubberClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="slider"
            aria-label="Audio scrubber"
            aria-valuemin={0}
            aria-valuemax={Math.floor(totalDurationMs / 1000)}
            aria-valuenow={Math.floor(currentTimeMs / 1000)}
            className="flex-1 py-3 cursor-pointer relative flex items-center group focus:outline-none"
          >
            {/* Background Track */}
            <div className="w-full h-1.5 bg-[var(--bg-surface)] border theme-border rounded-full relative overflow-hidden group-hover:h-2.5 transition-all">
              {/* Progress Bar updated with transform: scaleX (Zero Layout Shift) */}
              <div
                className="h-full w-full bg-gradient-to-r from-[var(--accent)] to-indigo-400 rounded-full will-change-transform"
                style={scrubScaleStyle}
              />
            </div>
            {/* Scrubber Thumb Indicator on hover */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-120 transform -translate-x-1/2 group-hover:scale-125 border border-black/20"
              style={{
                left: `${progressFraction * 100}%`,
              }}
            />
          </div>

          <span className="text-[11px] font-mono theme-muted w-10 select-none font-bold">
            {formatTime(totalDurationMs)}
          </span>
        </div>

        {/* Player Controls & Track Metadata Row */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Track Information */}
          <div className="flex items-center gap-3 min-w-0 max-w-[200px] sm:max-w-xs">
            <div className="w-9 h-9 rounded-xl theme-card border flex items-center justify-center text-[var(--accent)] shadow-xs flex-shrink-0">
              {isPlaying ? (
                <div className="flex items-end gap-0.5 h-4 w-4 justify-center">
                  <span className="w-1 bg-[var(--accent)] rounded-full eq-bar-1" />
                  <span className="w-1 bg-[var(--accent)] rounded-full eq-bar-2" />
                  <span className="w-1 bg-[var(--accent)] rounded-full eq-bar-3" />
                </div>
              ) : (
                <IconSoundwave className="w-4 h-4 text-[var(--accent)]" />
              )}
            </div>

            <div className="min-w-0">
              <h4 className="text-xs font-bold theme-heading truncate leading-tight">
                {currentChapter?.title || 'Chapter Audio Track'}
              </h4>
              <p className="text-[10px] theme-muted font-mono truncate mt-0.5">
                {currentNovel?.title || 'SyncTone Audio'}
              </p>
            </div>
          </div>

          {/* Center: Playback Transport Buttons (44px Accessible Hit Targets) */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Skip -10s */}
            <button
              onClick={() => handleSkip(-10)}
              className="w-11 h-11 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition flex items-center justify-center cursor-pointer"
              title="Skip back 10 seconds (J)"
              aria-label="Skip back 10 seconds"
            >
              <IconSkipBack className="w-4 h-4" />
            </button>

            {/* Previous Turn */}
            <button
              onClick={() => onSeekSegment && onSeekSegment(-1)}
              className="w-11 h-11 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition flex items-center justify-center cursor-pointer"
              title="Previous dialogue turn"
              aria-label="Previous turn"
            >
              <IconPrev className="w-4 h-4" />
            </button>

            {/* Play / Pause Toggle Button */}
            <button
              onClick={onToggle}
              className="w-11 h-11 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-bold flex items-center justify-center shadow-lg transition-transform duration-120 hover:scale-105 active:scale-95 focus:outline-none cursor-pointer"
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            >
              <span className="transition-all duration-120 transform scale-100 opacity-100 flex items-center justify-center">
                {isPlaying ? (
                  <IconPause className="w-5 h-5 fill-current" />
                ) : (
                  <IconPlay className="w-5 h-5 fill-current ml-0.5" />
                )}
              </span>
            </button>

            {/* Next Turn */}
            <button
              onClick={() => onSeekSegment && onSeekSegment(1)}
              className="w-11 h-11 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition flex items-center justify-center cursor-pointer"
              title="Next dialogue turn"
              aria-label="Next turn"
            >
              <IconNext className="w-4 h-4" />
            </button>

            {/* Skip +10s */}
            <button
              onClick={() => handleSkip(10)}
              className="w-11 h-11 rounded-xl theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition flex items-center justify-center cursor-pointer"
              title="Skip forward 10 seconds (L)"
              aria-label="Skip forward 10 seconds"
            >
              <IconSkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Audio Speed & Volume Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Speed Pill Selector */}
            <button
              onClick={handleSpeedChange}
              className="px-2.5 py-1 rounded-lg theme-card border hover:border-[var(--border-focus)] text-xs font-mono font-bold transition shadow-xs cursor-pointer"
              title="Cycle playback speed"
              aria-label={`Playback speed: ${speed}x`}
            >
              <span>{speed}x</span>
            </button>

            {/* Volume Control */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={handleVolumeToggle}
                className="p-2 rounded-lg theme-muted hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              >
                {isMuted || volume === 0 ? (
                  <IconVolumeMute className="w-4 h-4 text-rose-400" />
                ) : (
                  <IconVolume className="w-4 h-4" />
                )}
              </button>

              {/* Volume Slider Popover */}
              {showVolumeSlider && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 p-2.5 rounded-xl theme-card border shadow-xl flex flex-col items-center gap-1 z-50 modal-panel-enter origin-bottom">
                  <span className="text-[10px] font-mono theme-muted">
                    {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1.5 accent-[var(--accent)] cursor-pointer"
                    aria-label="Volume level"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
