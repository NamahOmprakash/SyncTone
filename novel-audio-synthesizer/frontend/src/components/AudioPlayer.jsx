import React, { useState, useCallback, useRef, useEffect } from 'react';
import AudioVisualizer from './AudioVisualizer';
import { formatNovelAuthor } from '../utils/authorDisplay';
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
  if (!ms || isNaN(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatHoverTime(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimecodeWithMs(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '00:00.00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

function formatSpeed(val) {
  if (typeof val !== 'number') return '1.0×';
  return Number.isInteger(val) ? `${val}.0×` : `${val}×`;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function AudioPlayer({
  audioRef,
  audioUrl,
  isPlaying,
  currentTimeMs = 0,
  totalDurationMs: propTotalDurationMs = 0,
  onToggle,
  onSetPlaybackRate,
  onSeek,
  onPlay,
  onPause,
  onEnded,
  onLoadedMetadata,
  onError,
  currentNovel,
  currentChapter,
  onSeekSegment,
  playbackMode = 'studio',
  onTogglePlaybackMode,
  ttsEngine = 'msedge-tts',
  onChangeTtsEngine,
  isFollowingAlong: propIsFollowingAlong,
  onToggleFollowAlong,
  onSetVolume,
  isInReader = false,
  isBuffering: propIsBuffering,
  error: propError,
  speed: propSpeed,
}) {
  const [speed, setSpeed] = useState(propSpeed || 1.0);
  useEffect(() => {
    if (typeof propSpeed === 'number' && propSpeed > 0) {
      setSpeed(propSpeed);
    }
  }, [propSpeed]);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [localFollowAlong, setLocalFollowAlong] = useState(true);
  const followAlong = propIsFollowingAlong !== undefined ? propIsFollowingAlong : localFollowAlong;
  const handleToggleFollowAlong = useCallback(() => {
    if (onToggleFollowAlong) {
      onToggleFollowAlong();
    } else {
      setLocalFollowAlong((prev) => !prev);
    }
  }, [onToggleFollowAlong]);
  const [hoverTimeMs, setHoverTimeMs] = useState(null);
  const [hoverFraction, setHoverFraction] = useState(0);
  const [bufferedFraction, setBufferedFraction] = useState(0);
  const [isBufferingState, setIsBufferingState] = useState(false);
  const isBuffering = propIsBuffering ?? isBufferingState;
  const [localError, setLocalError] = useState(null);
  const error = playbackMode === 'tts' ? null : (propError || localError);
  const scrubberTrackRef = useRef(null);

  const totalDurationMs =
    propTotalDurationMs > 0
      ? propTotalDurationMs
      : currentChapter?.total_duration_ms || currentChapter?.duration_ms || 0;

  const progressFraction = totalDurationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / totalDurationMs)) : 0;

  // Direct scale update to avoid react re-render latency
  const scrubScaleStyle = {
    transform: `scaleX(${progressFraction})`,
    transformOrigin: 'left',
    transition: isPlaying ? 'transform 120ms linear' : 'none',
  };

  const bufferedScaleStyle = {
    transform: `scaleX(${bufferedFraction})`,
    transformOrigin: 'left',
  };

  const updateBufferedFraction = useCallback(() => {
    if (!audioRef?.current || totalDurationMs <= 0) return;
    const audio = audioRef.current;
    if (audio.buffered && audio.buffered.length > 0) {
      try {
        const endSec = audio.buffered.end(audio.buffered.length - 1);
        const fraction = Math.min(1, Math.max(0, (endSec * 1000) / totalDurationMs));
        setBufferedFraction(fraction);
      } catch (_) {}
    }
  }, [audioRef, totalDurationMs]);

  useEffect(() => {
    updateBufferedFraction();
  }, [currentTimeMs, updateBufferedFraction]);

  useEffect(() => {
    setLocalError(null);
    setIsBufferingState(false);
    setBufferedFraction(0);
  }, [audioUrl]);

  useEffect(() => {
    if (playbackMode === 'tts') {
      setLocalError(null);
    }
  }, [playbackMode]);

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

  const handleScrubberMouseMove = (e) => {
    if (!scrubberTrackRef.current || totalDurationMs <= 0) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverFraction(fraction);
    setHoverTimeMs(Math.round(fraction * totalDurationMs));
  };

  const handleScrubberMouseLeave = () => {
    setHoverTimeMs(null);
  };

  const handleSkip = useCallback(
    (seconds) => {
      if (playbackMode === 'tts') {
        if (onSeek) {
          const maxMs = totalDurationMs > 0 ? totalDurationMs : Infinity;
          const targetMs = Math.max(0, Math.min(maxMs, currentTimeMs + seconds * 1000));
          onSeek(targetMs, isPlaying);
        } else if (onSeekSegment) {
          onSeekSegment(seconds < 0 ? -1 : 1);
        }
        return;
      }
      if (!audioRef?.current) {
        if (onSeek) {
          const maxMs = totalDurationMs > 0 ? totalDurationMs : Infinity;
          const targetMs = Math.max(0, Math.min(maxMs, currentTimeMs + seconds * 1000));
          onSeek(targetMs, isPlaying);
        } else if (onSeekSegment) {
          onSeekSegment(seconds < 0 ? -1 : 1);
        }
        return;
      }
      if (totalDurationMs <= 0 && onSeekSegment) {
        onSeekSegment(seconds < 0 ? -1 : 1);
        return;
      }
      const targetMs = Math.max(
        0,
        Math.min(totalDurationMs, Math.round((audioRef.current.currentTime + seconds) * 1000))
      );
      if (onSeek) {
        onSeek(targetMs, isPlaying);
      } else {
        audioRef.current.currentTime = targetMs / 1000;
      }
    },
    [audioRef, totalDurationMs, playbackMode, onSeekSegment, onSeek, currentTimeMs, isPlaying]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleSkip(-5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleSkip(5);
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      onToggle?.();
    }
  };

  const handleSpeedChange = () => {
    const currentIdx = SPEED_OPTIONS.indexOf(speed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    const newSpeed = SPEED_OPTIONS[nextIdx];
    setSpeed(newSpeed);
    if (onSetPlaybackRate) onSetPlaybackRate(newSpeed);
    if (audioRef?.current) audioRef.current.playbackRate = newSpeed;
  };

  const handleVolumeToggle = useCallback(() => {
    const nextMuted = !(isMuted || volume === 0);
    const nextVolume = !nextMuted && volume === 0 ? 1.0 : volume;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(1.0);
    }
    if (audioRef?.current) {
      audioRef.current.muted = nextMuted;
      audioRef.current.volume = nextVolume;
    }
    onSetVolume?.({ volume: nextVolume, muted: nextMuted });
  }, [audioRef, isMuted, volume, onSetVolume]);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    const nextMuted = val === 0;
    setVolume(val);
    setIsMuted(nextMuted);
    if (audioRef?.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = nextMuted;
    }
    onSetVolume?.({ volume: val, muted: nextMuted });
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

      // 2. Avoid double-triggering Space on focused buttons, links, or interactive sliders
      if (e.code === 'Space' || e.key === ' ') {
        if (tagName === 'button' || tagName === 'a' || target?.getAttribute?.('role') === 'slider') {
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
        if (details?.seekTime === undefined) return;
        const targetMs = Math.max(0, Math.round(details.seekTime * 1000));
        if (onSeek) {
          onSeek(targetMs, isPlaying);
        } else if (audioRef?.current) {
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
  }, [isPlaying, onToggle, currentNovel, currentChapter, audioRef, handleSkip, onSeek]);

  // Persist playback position to localStorage for Continue Listening (Section 12.B)
  useEffect(() => {
    if (!currentChapter?.id || !currentNovel) return;
    const nObj = currentNovel?.novel || currentNovel;
    if (!nObj?.id || currentTimeMs <= 0) return;
    try {
      const record = {
        novelId: nObj.id,
        novelTitle: nObj.title,
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        chapterNumber: currentChapter.chapter_number || 1,
        currentTimeMs,
        totalDurationMs,
        updatedAt: Date.now(),
      };
      localStorage.setItem(`synctone_listening_${nObj.id}`, JSON.stringify(record));
      localStorage.setItem('synctone_last_listening', JSON.stringify(record));
    } catch (_) {}
  }, [currentNovel, currentChapter, currentTimeMs, totalDurationMs]);

  const novelObj = currentNovel?.novel || currentNovel;
  const authorDisplay = formatNovelAuthor(novelObj);
  const narratorDisplay =
    novelObj?.narrator ||
    novelObj?.narrator_name ||
    novelObj?.narrator_voice_label ||
    currentChapter?.narrator ||
    '';
  const sublineText =
    authorDisplay && narratorDisplay
      ? `${authorDisplay} • ${narratorDisplay}`
      : authorDisplay || narratorDisplay || novelObj?.title || currentChapter?.title || 'SyncTone';

  return (
    <footer
      className="audio-player-dock px-3 sm:px-6 flex items-center select-none"
      aria-label="Floating Audio Dock"
    >
      {/* Hidden audio element for audio sync engine */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="auto"
        onPlay={(e) => {
          setIsBufferingState(false);
          onPlay?.(e);
        }}
        onPause={(e) => {
          setIsBufferingState(false);
          onPause?.(e);
        }}
        onEnded={onEnded}
        onLoadedMetadata={(e) => {
          setIsBufferingState(false);
          updateBufferedFraction();
          onLoadedMetadata?.(e);
        }}
        onProgress={updateBufferedFraction}
        onWaiting={() => setIsBufferingState(true)}
        onPlaying={() => {
          setIsBufferingState(false);
          setLocalError(null);
        }}
        onCanPlay={() => {
          setIsBufferingState(false);
          updateBufferedFraction();
        }}
        onError={(e) => {
          setIsBufferingState(false);
          if (audioUrl && playbackMode !== 'tts') {
            setLocalError('Audio track unavailable');
          }
          onError?.(e);
        }}
      />

      {/* High-contrast Monochrome Error Alert */}
      {error && (
        <div
          role="alert"
          className="absolute -top-10 left-3 right-3 sm:left-auto sm:right-6 px-3 py-1 bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-strong)] rounded-lg text-[11px] font-mono shadow-xl flex items-center gap-2 z-50 animate-fadeIn"
        >
          <span className="font-bold text-[var(--text-main)]">[!]</span>
          <span className="truncate">{error}</span>
          <button
            type="button"
            onClick={() => setLocalError(null)}
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer font-bold px-1"
            title="Dismiss error"
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      )}

      {/* Mobile Top Edge Scrubber Line (Phase 8 Parity) */}
      <div
        className="mobile-top-scrubber"
        onClick={handleScrubberClick}
        role="presentation"
        aria-hidden="true"
      >
        <div className="scrubber-buffered-fill" style={bufferedScaleStyle} />
        <div className="scrubber-played-fill" style={scrubScaleStyle} />
      </div>

      {/* Main 3-zone container */}
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3 xl:gap-5">
        {/* Left: Track Information */}
        <div className="audio-track-info flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 max-w-[130px] xs:max-w-[165px] sm:max-w-[190px] xl:max-w-[240px]">
          {/* 40x40 on mobile, 48x48 on desktop Book Jacket Artwork */}
          <div className="audio-track-art w-10 h-10 sm:w-12 sm:h-12 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg flex items-center justify-center font-mono text-[10px] text-[var(--text-sub)] shrink-0 overflow-hidden shadow-xs">
            {novelObj?.cover_object ? (
              <img src={novelObj.cover_object} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-mono font-bold tracking-wider text-[var(--text-muted)]">
                VOL.{String(currentChapter?.chapter_number || 1).padStart(2, '0')}
              </span>
            )}
          </div>

          <div className="audio-track-text min-w-0 flex flex-col justify-center">
            <h4 className="audio-track-title text-[12px] sm:text-[13px] font-semibold text-[var(--text-main)] truncate leading-tight font-sans">
              {currentChapter?.title || 'Chapter Audio Track'}
            </h4>
            <p className="audio-track-sub text-[10px] text-[var(--text-sub)] font-mono truncate mt-0.5 hidden sm:block">
              {sublineText}
            </p>
            <div className="audio-track-timecode text-[10px] font-mono text-[var(--text-muted)] tabular-nums mt-0.5 flex items-center gap-1.5 truncate">
              <span className="hidden sm:inline">{formatTimecodeWithMs(currentTimeMs)} / {formatTimecodeWithMs(totalDurationMs)}</span>
              <span className="sm:hidden">{formatTime(currentTimeMs)} / {formatTime(totalDurationMs)}</span>
              {isBuffering && (
                <span className="text-[var(--text-main)] font-semibold tracking-wider animate-pulse">
                  [BUFFERING]
                </span>
              )}
              {error && !isBuffering && (
                <span className="text-[var(--text-main)] font-semibold tracking-wider">
                  [OFFLINE]
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Playback Transport Buttons & Scrubber */}
        <div className="audio-central-cluster hidden sm:flex flex-1 min-w-[200px] max-w-[330px] lg:max-w-[360px] xl:max-w-[420px] mx-auto flex-col justify-center gap-1 px-1">
          {/* Transport Buttons Row */}
          <div className="audio-control-buttons flex items-center justify-center gap-1.5 sm:gap-2">
            {/* Skip -10s */}
            <button
              onClick={() => handleSkip(-10)}
              className="boxed-btn px-2.5 sm:px-3 py-1 text-[11px] font-mono text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-full active:scale-90 transition-transform"
              title="Skip back 10 seconds (J)"
              aria-label="Skip back 10 seconds"
            >
              <span>◀◀ 10s</span>
            </button>

            {/* Previous Turn (TTS segment mode) */}
            {playbackMode === 'tts' && onSeekSegment && (
              <button
                onClick={() => onSeekSegment(-1)}
                className="boxed-btn px-2 sm:px-2.5 py-1 text-[11px] font-mono text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-full active:scale-90 transition-transform"
                title="Previous dialogue turn"
                aria-label="Previous turn"
              >
                <IconPrev className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Play / Pause Toggle Button (Inverted Primary CTA) */}
            <button
              onClick={onToggle}
              className="btn-play-pause boxed-btn-primary px-4 sm:px-5 py-1.5 text-[11px] font-mono cursor-pointer flex items-center gap-1.5 rounded-full shadow-md hover:scale-105 active:scale-90 transition-all duration-200"
              aria-label={isBuffering ? 'Audio buffering' : isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {isBuffering ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[var(--on-accent)] border-t-transparent animate-spin inline-block" />
                  <span className="hidden sm:inline">BUFFERING</span>
                </>
              ) : isPlaying ? (
                <>
                  <IconPause className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">PAUSE</span>
                </>
              ) : (
                <>
                  <IconPlay className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span className="hidden sm:inline">PLAY</span>
                </>
              )}
            </button>

            {/* Next Turn (TTS segment mode) */}
            {playbackMode === 'tts' && onSeekSegment && (
              <button
                onClick={() => onSeekSegment(1)}
                className="boxed-btn px-2 sm:px-2.5 py-1 text-[11px] font-mono text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-full active:scale-90 transition-transform"
                title="Next dialogue turn"
                aria-label="Next turn"
              >
                <IconNext className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Skip +10s */}
            <button
              onClick={() => handleSkip(10)}
              className="boxed-btn px-2.5 sm:px-3 py-1 text-[11px] font-mono text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-full active:scale-90 transition-transform"
              title="Skip forward 10 seconds (L)"
              aria-label="Skip forward 10 seconds"
            >
              <span>10s ▶▶</span>
            </button>
          </div>

          {/* Scrubber Track Row */}
          <div className="audio-scrubber-row w-full flex items-center gap-2">
            <span className="scrubber-current-time text-[10px] font-mono text-[var(--text-muted)] w-8 sm:w-10 text-right select-none tabular-nums font-medium">
              {formatTime(currentTimeMs)}
            </span>

            <div
              ref={scrubberTrackRef}
              onClick={handleScrubberClick}
              onMouseMove={handleScrubberMouseMove}
              onMouseLeave={handleScrubberMouseLeave}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              role="slider"
              aria-label="Audio scrubber"
              aria-valuemin={0}
              aria-valuemax={Math.floor(totalDurationMs / 1000)}
              aria-valuenow={Math.floor(currentTimeMs / 1000)}
              className="scrubber-track-bar flex-1 py-1.5 cursor-pointer relative flex items-center group focus:outline-none"
            >
              {/* Scrubber timecode hover preview badge */}
              {hoverTimeMs !== null && (
                <div
                  className="absolute -top-7 pointer-events-none transform -translate-x-1/2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-strong)] shadow-lg z-30 transition-transform duration-75"
                  style={{ left: `${hoverFraction * 100}%` }}
                >
                  {formatHoverTime(hoverTimeMs)}
                </div>
              )}

              {/* Background Track Bar */}
              <div className="w-full h-1.5 bg-[var(--border-subtle)] relative overflow-hidden group-hover:h-2 transition-all rounded-full">
                {/* Buffered Fill */}
                <div
                  className="scrubber-buffered-fill absolute left-0 top-0 bottom-0 bg-[var(--border-strong)] rounded-full will-change-transform"
                  style={{
                    transform: `scaleX(${bufferedFraction})`,
                    transformOrigin: 'left',
                    width: '100%',
                  }}
                />
                {/* Played Fill */}
                <div
                  className="scrubber-played-fill absolute left-0 top-0 bottom-0 bg-[var(--text-main)] rounded-full will-change-transform"
                  style={{
                    transform: `scaleX(${progressFraction})`,
                    transformOrigin: 'left',
                    width: '100%',
                  }}
                />
              </div>

              {/* Scrubber Thumb Indicator on hover */}
              <div
                className="scrubber-thumb absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-100 shadow-md"
                style={{ left: `${progressFraction * 100}%` }}
              />
            </div>

            <span className="text-[10px] font-mono text-[var(--text-muted)] w-8 sm:w-10 select-none tabular-nums font-medium">
              {formatTime(totalDurationMs)}
            </span>
          </div>
        </div>

        {/* Right: Signal Dot, Engine Mode, TTS Dropdown, Speed & Volume Controls */}
        <div className="audio-right-cluster flex items-center gap-1 sm:gap-2.5 shrink-0 min-w-0">
          {/* Mobile Play/Pause CTA (shown on narrow screens <640px) */}
          <button
            onClick={onToggle}
            className="mobile-play-btn boxed-btn-primary px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-mono sm:hidden cursor-pointer flex items-center gap-1 rounded-full shadow-md active:scale-90 transition-all shrink-0"
            aria-label={isBuffering ? 'Audio buffering' : isPlaying ? 'Pause audio' : 'Play audio'}
          >
            {isBuffering ? (
              <span className="w-3 h-3 border-2 border-current border-t-transparent animate-spin inline-block" />
            ) : isPlaying ? (
              <>
                <IconPause className="w-3 h-3 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <IconPlay className="w-3 h-3 fill-current ml-0.5" />
                <span>PLAY</span>
              </>
            )}
          </button>

          {/* Signal Dot: Active strictly when isPlaying per Section 9.4 on mobile */}
          {followAlong && isPlaying && (
            <span
              className="signal-dot sm:hidden"
              title="Active Audio Playback"
              aria-label="Audio playing visualizer"
            />
          )}

          {/* Animated Audio Waveform Visualizer (Section 8) */}
          <div className="hidden xl:flex items-center px-2 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
            <AudioVisualizer
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              audioElement={audioRef?.current || null}
              barCount={10}
              height={14}
            />
          </div>

          {/* Follow Along / Live Sync Toggle */}
          <button
            type="button"
            onClick={handleToggleFollowAlong}
            className={`boxed-btn px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-mono cursor-pointer hidden md:inline-flex items-center gap-1.5 rounded-full active:scale-95 transition-all shrink-0 whitespace-nowrap ${
              followAlong && isPlaying
                ? 'text-[var(--text-main)] border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
            }`}
            title={followAlong ? 'Follow Along: Active (click to disable)' : 'Follow Along: Paused (click to enable)'}
            aria-pressed={followAlong}
            aria-label="Toggle Follow Along"
          >
            {followAlong && isPlaying ? (
              <span className="signal-dot" title="Active Audio Playback" />
            ) : (
              <span className="dot text-[var(--text-muted)]" />
            )}
            <span className="font-bold tracking-wider hidden lg:inline">FOLLOW ALONG</span>
            <span className="font-bold tracking-wider lg:hidden">FOLLOW</span>
          </button>

          {/* Multi-Engine Selector Dropdown */}
          {onChangeTtsEngine && (
            <div className="relative hidden md:flex items-center shrink-0">
              <select
                value={ttsEngine}
                onChange={(e) => onChangeTtsEngine(e.target.value)}
                className="boxed-btn px-2 py-1 text-[11px] font-mono bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-strong)] cursor-pointer focus:outline-none rounded-xl shadow-xs transition-all max-w-[138px] xl:max-w-[162px] truncate"
                title={`TTS Engine: ${
                  ttsEngine === 'msedge-tts'
                    ? 'Microsoft Edge Cloud Neural TTS'
                    : ttsEngine === 'kokoro-tts'
                    ? 'Kokoro-TTS Local ONNX Fallback'
                    : ttsEngine === 'paradee-tts'
                    ? 'Paradee-8M-v1.2 Micro Neural ONNX'
                    : ttsEngine === 'paradee-mixed'
                    ? 'Paradee-8M (Primary 4) + Machine TTS (5th+ Cast)'
                    : 'Machine Local OS Speech Synthesis'
                }`}
                aria-label="Select TTS Engine"
              >
                <option value="msedge-tts">Microsoft TTS</option>
                <option value="kokoro-tts">Kokoro-TTS</option>
                <option value="paradee-tts">Paradee-8M</option>
                <option value="paradee-mixed">Paradee + Machine (Mixed)</option>
                <option value="machine-tts">Machine TTS</option>
              </select>
            </div>
          )}

          {/* Playback Engine Mode Toggle */}
          {onTogglePlaybackMode && (
            <button
              type="button"
              onClick={() => onTogglePlaybackMode?.()}
              className="boxed-btn px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-mono cursor-pointer flex items-center gap-1 sm:gap-1.5 rounded-full active:scale-95 transition-all shrink-0 whitespace-nowrap"
              title={
                playbackMode === 'tts'
                  ? 'Voice TTS: Playing live character TTS segment-by-segment. Click to switch to Studio Track.'
                  : 'Studio Track: Playing pre-rendered stitched full-chapter audio. Click to switch to Voice TTS.'
              }
              aria-label={`Playback engine: ${playbackMode === 'tts' ? 'Voice TTS' : 'Studio Track'}`}
            >
              {playbackMode === 'tts' && isPlaying ? (
                <span className="signal-dot" />
              ) : (
                <span className="dot text-[var(--text-muted)]" />
              )}
              <span className="hidden sm:inline">
                {playbackMode === 'tts' ? 'VOICE TTS' : 'STUDIO'}
              </span>
              <span className="sm:hidden">
                {playbackMode === 'tts' ? 'TTS' : 'STU'}
              </span>
            </button>
          )}

          {/* Playback Speed Button */}
          <button
            onClick={handleSpeedChange}
            className="boxed-btn px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px] font-mono text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-full active:scale-95 transition-all shrink-0"
            title="Cycle playback speed"
            aria-label={`Playback speed: ${speed}x`}
          >
            <span>{formatSpeed(speed)}</span>
          </button>

          {/* Expand Reader Button (shown only outside ReaderView) */}
          {!isInReader && currentChapter?.id && (
            <a
              href={`/reader/${currentChapter.id}`}
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== 'undefined') {
                  window.history.pushState(null, '', `/reader/${currentChapter.id}`);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
              className="boxed-btn px-2 py-1 text-[11px] font-mono text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer hidden md:flex items-center gap-1 rounded-full active:scale-95 transition-all shrink-0"
              title="Expand Reader"
              aria-label="Expand Reader"
            >
              <span aria-hidden="true">📖</span>
              <span className="hidden xl:inline text-[10px]">READER</span>
            </a>
          )}

          {/* Volume Control */}
          <div
            className="relative flex items-center"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
            onFocus={() => setShowVolumeSlider(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setShowVolumeSlider(false);
              }
            }}
          >
            <button
              onClick={handleVolumeToggle}
              className="boxed-btn p-1.5 text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-full active:scale-95 transition-all"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            >
              {isMuted || volume === 0 ? (
                <IconVolumeMute className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <IconVolume className="w-3.5 h-3.5 text-[var(--text-main)]" />
              )}
            </button>

            {/* Volume Slider Popover */}
            {showVolumeSlider && (
              <div
                className="absolute bottom-full mb-2 right-0 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl flex flex-col items-center gap-1.5 z-50 animate-fadeIn"
                role="region"
                aria-label="Volume slider popover"
              >
                <span className="text-[10px] font-mono font-bold text-[var(--text-main)] select-none">
                  {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1.5 accent-[var(--accent)] cursor-pointer rounded-full"
                  aria-label="Volume level"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
