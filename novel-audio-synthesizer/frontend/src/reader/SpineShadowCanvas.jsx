import React, { useRef, useEffect } from 'react';

/**
 * SpineShadowCanvas Component
 * Renders the hardware-accelerated 2D canvas lighting overlay for:
 * 1. Center book spine deep shadow
 * 2. Outer page edge curvature shading
 * 3. Dynamic page curl shadow during flip animation
 */
export default function SpineShadowCanvas({
  isDark = true,
  isFlipping = false,
  flipDirection = null,
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return;

    let ctx;
    try {
      ctx = canvas.getContext('2d');
    } catch (_) {
      return;
    }
    if (!ctx) return;

    let animId;

    const renderShader = () => {
      const parent = canvas.parentElement;
      const w = (canvas.width = parent?.clientWidth || 900);
      const h = (canvas.height = parent?.clientHeight || 650);

      ctx.clearRect(0, 0, w, h);

      // 1. Center Book Spine Deep Shadow (Between Left and Right spread pages)
      const spineGradient = ctx.createLinearGradient(w / 2 - 40, 0, w / 2 + 40, 0);
      spineGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      spineGradient.addColorStop(0.5, isDark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.12)');
      spineGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spineGradient;
      ctx.fillRect(w / 2 - 40, 0, 80, h);

      // 2. Outer Page Edge Curvature Shading
      const leftEdgeGradient = ctx.createLinearGradient(0, 0, 24, 0);
      leftEdgeGradient.addColorStop(0, isDark ? 'rgba(0, 0, 0, 0.14)' : 'rgba(0, 0, 0, 0.05)');
      leftEdgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leftEdgeGradient;
      ctx.fillRect(0, 0, 24, h);

      const rightEdgeGradient = ctx.createLinearGradient(w - 24, 0, w, 0);
      rightEdgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      rightEdgeGradient.addColorStop(1, isDark ? 'rgba(0, 0, 0, 0.14)' : 'rgba(0, 0, 0, 0.05)');
      ctx.fillStyle = rightEdgeGradient;
      ctx.fillRect(w - 24, 0, 24, h);

      // 3. Dynamic Page Curl Shadow during flip animation
      if (isFlipping) {
        const curlX = flipDirection === 'next' ? w * 0.75 : w * 0.25;
        const curlGradient = ctx.createRadialGradient(curlX, h / 2, 20, curlX, h / 2, 240);
        curlGradient.addColorStop(0, isDark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.14)');
        curlGradient.addColorStop(0.5, isDark ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.10)');
        curlGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = curlGradient;
        ctx.fillRect(0, 0, w, h);
      }
    };

    renderShader();

    const handleResize = () => {
      animId = requestAnimationFrame(renderShader);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isFlipping, flipDirection, isDark]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none z-20 w-full h-full ${className}`}
      aria-hidden="true"
    />
  );
}

