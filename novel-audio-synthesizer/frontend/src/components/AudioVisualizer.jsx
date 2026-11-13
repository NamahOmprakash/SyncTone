import React, { useEffect, useRef, useState } from 'react';

/**
 * AudioVisualizer Component
 * Immersive real-time audio waveform visualization for SyncTone.
 * Reflects actual audio playback via Web Audio API when available,
 * with speech-cadence algorithmic simulation for TTS/stream fallback.
 * Strictly adheres to Noir Monochrome visual palette.
 */
export default function AudioVisualizer({
  isPlaying = false,
  isBuffering = false,
  audioElement = null,
  barCount = 14,
  className = '',
  height = 16,
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const [useFallback, setUseFallback] = useState(true);

  // Initialize Web Audio API Analyser if possible
  useEffect(() => {
    if (!audioElement || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      // Check if already connected to prevent "already connected" error
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
        const analyser = audioCtxRef.current.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

        try {
          const source = audioCtxRef.current.createMediaElementSource(audioElement);
          source.connect(analyser);
          analyser.connect(audioCtxRef.current.destination);
          sourceRef.current = source;
          setUseFallback(false);
        } catch (_) {
          // If media element already connected or cross-origin restricted, use speech fallback
          setUseFallback(true);
        }
      }
    } catch (_) {
      setUseFallback(true);
    }

    return () => {
      // AudioContext retained across track changes to avoid recreation overhead
    };
  }, [audioElement]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx;
    try {
      ctx = canvas.getContext?.('2d');
    } catch (_) {
      return;
    }
    if (!ctx) return;

    // Check reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, width, h);

      const isDark = !document.documentElement.classList.contains('light');
      const barColor = isDark ? '#F2F2F3' : '#0B0B0D';
      const mutedColor = isDark ? '#5E5E66' : '#A9A9AF';

      const barWidth = Math.max(2, (width - (barCount - 1) * 2) / barCount);
      const gap = 2;

      phase += 0.08;

      for (let i = 0; i < barCount; i++) {
        let barHeight = 2; // minimum baseline resting height

        if (prefersReducedMotion) {
          barHeight = isPlaying ? h * 0.5 : 2;
        } else if (isBuffering) {
          // Pulsing sine wave during buffering
          const wave = Math.sin(phase * 1.5 + i * 0.45);
          barHeight = Math.max(3, (wave * 0.5 + 0.5) * (h * 0.65));
        } else if (isPlaying) {
          if (!useFallback && analyserRef.current && dataArrayRef.current) {
            // Real Web Audio frequency data
            analyserRef.current.getByteFrequencyData(dataArrayRef.current);
            const freqIndex = Math.min(i * 2, dataArrayRef.current.length - 1);
            const val = dataArrayRef.current[freqIndex] / 255;
            barHeight = Math.max(3, val * (h - 2));
          } else {
            // Natural speech cadence multi-harmonic simulation
            const s1 = Math.sin(phase * 2.2 + i * 0.8);
            const s2 = Math.cos(phase * 3.1 - i * 0.5);
            const s3 = Math.sin(phase * 1.3 + i * 1.2);
            const norm = (s1 * 0.4 + s2 * 0.35 + s3 * 0.25 + 1) / 2; // 0 to 1
            const bellCurve = Math.sin((i / (barCount - 1)) * Math.PI); // center-weighted
            barHeight = Math.max(3, (norm * 0.75 + 0.25) * bellCurve * (h - 2));
          }
        } else {
          // Idle / Paused: gentle calm resting state
          barHeight = 2.5;
        }

        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2; // vertically centered in player dock

        ctx.fillStyle = isPlaying ? barColor : mutedColor;
        ctx.beginPath();
        // Rounded bar caps
        const radius = Math.min(barWidth / 2, barHeight / 2);
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, radius);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, isBuffering, useFallback, barCount]);

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      title={isBuffering ? 'Audio Buffering...' : isPlaying ? 'Audio Playing' : 'Audio Paused'}
      aria-label="Audio Waveform Visualizer"
    >
      <canvas
        ref={canvasRef}
        width={barCount * 4}
        height={height}
        className="block"
        style={{ width: `${barCount * 4}px`, height: `${height}px` }}
      />
    </div>
  );
}

