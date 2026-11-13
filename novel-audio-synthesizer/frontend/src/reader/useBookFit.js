import { useState, useEffect, useRef, useCallback } from 'react';
import { fitBook } from './fitBook';

/**
 * CONTRACT 2 — FROZEN SPECIFICATION
 * useBookFit(stageRef, opts) -> { ...fitBookResult, ready: boolean }
 *
 * Single source of truth for both Normal and 3D book modes.
 * - Watches stage element dimensions via ResizeObserver.
 * - rAF-throttled to avoid layout thrashing.
 * - Preserves previous layout for hysteresis stability against flapping.
 */
export function useBookFit(stageRef, opts = {}) {
  const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [fitState, setFitState] = useState(() => {
    const defaultW = typeof window !== 'undefined' ? (window.innerWidth || 1024) : 1024;
    const defaultH = typeof window !== 'undefined' ? Math.max(300, (window.innerHeight || 768) - 185) : 583;
    return {
      ...fitBook({ w: defaultW, h: defaultH }, opts),
      ready: true,
    };
  });

  const prevLayoutRef = useRef(fitState.layout || 'single');
  const rafIdRef = useRef(null);

  const measureAndFit = useCallback(() => {
    if (!stageRef?.current) return;
    const el = stageRef.current;
    let w = el.clientWidth || 0;
    let h = el.clientHeight || 0;

    if (w <= 0 || h <= 0) {
      if (typeof window !== 'undefined') {
        w = window.innerWidth || 1024;
        h = Math.max(300, (window.innerHeight || 768) - 185);
      } else {
        return;
      }
    }

    const currentOpts = optsRef.current || {};
    const result = fitBook(
      { w, h },
      {
        ...currentOpts,
        prevLayout: prevLayoutRef.current,
      }
    );

    prevLayoutRef.current = result.layout;
    setFitState((prev) => {
      if (
        prev.ready &&
        prev.layout === result.layout &&
        prev.book.w === result.book.w &&
        prev.book.h === result.book.h &&
        prev.contentBox.w === result.contentBox.w &&
        prev.contentBox.h === result.contentBox.h
      ) {
        return prev;
      }
      return {
        ...result,
        ready: true,
      };
    });
  }, [stageRef, isJsdom]);

  useEffect(() => {
    const el = stageRef?.current;
    if (!el) return;

    // Initial measurement
    measureAndFit();

    // ResizeObserver throttled via requestAnimationFrame
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(measureAndFit);
      });
      resizeObserver.observe(el);
    } else {
      const handleWindowResize = () => {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(measureAndFit);
      };
      window.addEventListener('resize', handleWindowResize);
      return () => {
        window.removeEventListener('resize', handleWindowResize);
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      };
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [stageRef, measureAndFit]);

  return fitState;
}

export default useBookFit;

