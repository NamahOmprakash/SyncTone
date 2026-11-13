/* ==========================================================================
   SyncTone — Noir Monochrome Design System Preview Script
   Handles instant theme toggling, screen switching, audio scrubber, and UI state
   ========================================================================== */

(function () {
  'use strict';

  // State Management
  const state = {
    theme: localStorage.getItem('synctone_preview_theme') || 'dark',
    activeScreen: 'home',
    viewport: 'desktop',
    isPlaying: false, // Default paused to showcase inverted [▶ PLAY] CTA
    currentTime: 252.84, // 04:12.84
    duration: 2294.0,   // 38:14.00
    fontSize: 1.18,
    fontFamily: 'Newsreader',
    synthesisProgress: 74,
  };

  // DOM Elements & Theme Handling
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('synctone_preview_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }

    // Update any theme toggle buttons on the page
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.innerHTML =
        theme === 'dark'
          ? '<span class="dot"></span> THEME: DARK'
          : '<span class="dot"></span> THEME: LIGHT';
    });

    const harnessToggle = document.getElementById('harness-theme-toggle');
    if (harnessToggle) {
      if (theme === 'dark') {
        harnessToggle.innerHTML = '● DARK MODE';
        harnessToggle.style.background = '#27272A';
        harnessToggle.style.color = '#FFFFFF';
        harnessToggle.style.borderColor = '#3F3F46';
      } else {
        harnessToggle.innerHTML = '○ LIGHT MODE';
        harnessToggle.style.background = '#E4E4E6';
        harnessToggle.style.color = '#0B0B0D';
        harnessToggle.style.borderColor = '#D0D0D4';
      }
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  function showScreen(screenId) {
    state.activeScreen = screenId;
    const screens = document.querySelectorAll('.preview-screen-view');
    const pills = document.querySelectorAll('.preview-tab-pill');

    pills.forEach((pill) => {
      if (pill.getAttribute('data-screen') === screenId) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    if (screenId === 'all') {
      screens.forEach((s) => (s.style.display = 'block'));
    } else {
      screens.forEach((s) => {
        if (s.id === `screen-${screenId}`) {
          s.style.display = 'block';
        } else {
          s.style.display = 'none';
        }
      });
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function setViewport(vp) {
    state.viewport = vp;
    const stage = document.querySelector('.preview-stage-container');
    const btnDesktop = document.getElementById('btn-vp-desktop');
    const btnMobile = document.getElementById('btn-vp-mobile');

    if (!stage) return;

    if (vp === 'mobile') {
      stage.classList.add('preview-viewport-mobile');
      if (btnMobile) btnMobile.classList.add('active');
      if (btnDesktop) btnDesktop.classList.remove('active');
    } else {
      stage.classList.remove('preview-viewport-mobile');
      if (btnDesktop) btnDesktop.classList.add('active');
      if (btnMobile) btnMobile.classList.remove('active');
    }
  }

  // Audio Player Logic
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  function formatShortTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateScrubber() {
    const playedPercent = (state.currentTime / state.duration) * 100;
    document.querySelectorAll('.scrubber-played-fill').forEach((el) => {
      el.style.width = `${playedPercent}%`;
    });
    document.querySelectorAll('.scrubber-thumb').forEach((el) => {
      el.style.left = `${playedPercent}%`;
    });
    document.querySelectorAll('.audio-track-timecode').forEach((el) => {
      el.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
    });
    document.querySelectorAll('.scrubber-current-time').forEach((el) => {
      el.textContent = formatShortTime(state.currentTime);
    });
  }

  function updatePlayPauseUI() {
    const label = state.isPlaying ? '⏸ PAUSE' : '▶ PLAY';
    document.querySelectorAll('.btn-play-pause, #btn-play-pause').forEach((btn) => {
      btn.innerHTML = label;
    });
    document.querySelectorAll('.audio-player-dock .signal-dot').forEach((dot) => {
      dot.style.opacity = state.isPlaying ? '1' : '0.6';
    });
  }

  function togglePlayPause() {
    state.isPlaying = !state.isPlaying;
    updatePlayPauseUI();
  }

  function seekFromEvent(e, element) {
    const rect = element.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    state.currentTime = percent * state.duration;
    updateScrubber();
  }

  // Reader Controls
  function adjustFontSize(delta) {
    state.fontSize = Math.max(0.9, Math.min(1.6, state.fontSize + delta));
    const readerBody = document.querySelector('.reader-body-text');
    if (readerBody) {
      readerBody.style.fontSize = `${state.fontSize}rem`;
    }
  }

  function toggleFontFamily() {
    state.fontFamily = state.fontFamily === 'Newsreader' ? 'Inter' : 'Newsreader';
    const readerBody = document.querySelector('.reader-body-text');
    const btn = document.getElementById('btn-toggle-font');
    if (readerBody) {
      readerBody.style.fontFamily = `var(--font-${state.fontFamily === 'Newsreader' ? 'serif' : 'sans'})`;
    }
    if (btn) {
      btn.textContent = state.fontFamily === 'Newsreader' ? 'NEWSREADER SERIF' : 'INTER SANS';
    }
  }

  // Init on DOM Load
  document.addEventListener('DOMContentLoaded', () => {
    // Check URL parameters
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get('theme');
    const screenParam = params.get('screen');
    const vpParam = params.get('viewport');

    if (themeParam && (themeParam === 'dark' || themeParam === 'light')) {
      state.theme = themeParam;
    }
    applyTheme(state.theme);

    if (screenParam) {
      showScreen(screenParam);
    } else {
      showScreen('home');
    }

    if (vpParam === 'mobile') {
      setViewport('mobile');
    }

    // Bind theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', toggleTheme);
    });

    const harnessToggle = document.getElementById('harness-theme-toggle');
    if (harnessToggle) {
      harnessToggle.addEventListener('click', toggleTheme);
    }

    // Bind Screen Switcher Pills
    document.querySelectorAll('.preview-tab-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const screenId = e.currentTarget.getAttribute('data-screen');
        if (screenId) showScreen(screenId);
      });
    });

    // Bind Viewport Switchers
    const btnDesktop = document.getElementById('btn-vp-desktop');
    if (btnDesktop) {
      btnDesktop.addEventListener('click', () => setViewport('desktop'));
    }
    const btnMobile = document.getElementById('btn-vp-mobile');
    if (btnMobile) {
      btnMobile.addEventListener('click', () => setViewport('mobile'));
    }

    // Audio Scrubber Click (Desktop & Mobile)
    document.querySelectorAll('.scrubber-track-bar, .mobile-top-scrubber').forEach((bar) => {
      bar.addEventListener('click', (e) => seekFromEvent(e, bar));
    });

    // Play/Pause Buttons
    document.querySelectorAll('.btn-play-pause, #btn-play-pause').forEach((btn) => {
      btn.addEventListener('click', togglePlayPause);
    });

    // Initial Play/Pause UI state
    updatePlayPauseUI();
    updateScrubber();

    // Reader Font Buttons
    const btnFontMinus = document.getElementById('btn-font-minus');
    if (btnFontMinus) btnFontMinus.addEventListener('click', () => adjustFontSize(-0.08));
    const btnFontPlus = document.getElementById('btn-font-plus');
    if (btnFontPlus) btnFontPlus.addEventListener('click', () => adjustFontSize(0.08));
    const btnToggleFont = document.getElementById('btn-toggle-font');
    if (btnToggleFont) btnToggleFont.addEventListener('click', toggleFontFamily);

    // Tab Switching Buttons (Novel Detail & Voice Studio)
    document.querySelectorAll('.tab-btn').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const parentBar = e.currentTarget.closest('.tabs-bar');
        if (parentBar) {
          parentBar.querySelectorAll('.tab-btn').forEach((t) => t.classList.remove('active'));
          e.currentTarget.classList.add('active');
        }
        const targetTab = e.currentTarget.getAttribute('data-tab');
        const container = e.currentTarget.closest('.detail-stage') || e.currentTarget.closest('.studio-card-container');
        if (container && targetTab) {
          container.querySelectorAll('.tab-content-panel').forEach((panel) => {
            if (panel.id === `tab-panel-${targetTab}`) {
              panel.style.display = 'block';
            } else {
              panel.style.display = 'none';
            }
          });
        }
      });
    });

    // Time ticker for audio simulation (only advances when playing)
    setInterval(() => {
      if (state.isPlaying) {
        state.currentTime = (state.currentTime + 0.25) % state.duration;
        updateScrubber();
      }
    }, 250);
  });

  // Expose to window for testing / automated verification
  window.SyncTonePreview = {
    applyTheme,
    toggleTheme,
    showScreen,
    setViewport,
    state,
  };
})();
