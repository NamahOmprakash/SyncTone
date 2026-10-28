/**
 * SyncTone Motion Design Tokens & Utilities
 * Single Source of Truth for Durations, Easings, and Springs.
 * Strictly enforces compositor-only animation (transform & opacity).
 */

export const MOTION_DURATIONS = {
  instant: 0,
  micro: 120,
  standard: 200,
  moderate: 320,
  deliberate: 500,
};

export const MOTION_EASINGS = {
  // Apple/Linear-style swift natural entrance and exit
  natural: 'cubic-bezier(0.16, 1, 0.3, 1)',
  // Pure CSS linear() critically damped spring with zero overshoot bounce
  spring:
    'linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.932 38.4%, 0.976 45.6%, 0.995 53.6%, 1 63.8%)',
  linear: 'linear',
};

/**
 * Returns true if the user's OS has requested reduced motion.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Helper to execute a View Transition safely with fallback for older browsers.
 * Used for route changes and theme crossfades without layout shifts.
 */
export function executeViewTransition(callback) {
  if (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    !prefersReducedMotion()
  ) {
    return document.startViewTransition(callback);
  }
  // Immediate fallback
  callback();
  return {
    finished: Promise.resolve(),
    ready: Promise.resolve(),
    updateCallbackDone: Promise.resolve(),
  };
}

export default {
  durations: MOTION_DURATIONS,
  easings: MOTION_EASINGS,
  prefersReducedMotion,
  executeViewTransition,
};
