# Phase 8 Deliverables: Docked Bottom Audio Bar & Voice Synthesis Studio Parity

**Branch**: `design/noir-mono`  
**Status**: Completed  
**Reference Specifications**:
- `docs/design-preview/audio-player.html` (Screen 4: Dark & Light)
- `docs/design-preview/voice-studio.html` (Screen 5: Dark & Light)
- `docs/noir-mono-spec.md` (Sections 9.1, 9.2, 9.3, 9.4, 9.6, 9.8, 9.9)
- `docs/editorial-orange-gaps.md`

---

## 1. Executive Summary

Phase 8 completes visual and interactive concept parity for the final two core screens of the Noir Monochrome redesign:
1. **Screen 4: Docked Bottom Audio Bar** (`AudioPlayer.jsx`, `index.css`)
2. **Screen 5: Voice Synthesis Studio & Cast Roster** (`NovelDetails.jsx` Cast Studio, `CharacterRoster.jsx`, `SynthesisProgressBar.jsx`, `UploadView.jsx`)

All components conform strictly to the Noir Monochrome design language: 100% neutral grey chrome (`#0B0B0D` to `#F2F2F3`), sharp corners (radius 0–2px), 1px hairlines (`var(--border-subtle)` / `var(--border-strong)`), inverted high-contrast primary CTAs, authentic real-data bindings with zero fabricated statistics, and the Section 9.4 strict invariant restricting the `--signal` dot strictly to actively playing or synthesizing audio states.

---

## 2. Key Architectural Deliverables

### 2.1 Screen 4: Docked Bottom Audio Bar (`AudioPlayer.jsx` & `index.css`)
- **Pinned Fixed Base**:
  - Height: strictly `72px` (`min-h-[72px]`, `--dock-safe-bottom`).
  - Position: `fixed; bottom: 0; left: 0; right: 0; z-index: 50`.
  - Surface: Opaque `--bg-bar` (`#141416` in dark, `#F7F7F8` in light) with 1px top hairline `var(--border-subtle)`.
  - Zero glassmorphism blur, zero rounded pill dock shapes.
- **Left Cluster (`.audio-track-info`)**:
  - 48×48px sharp book jacket artwork (`.audio-track-art`) with volume identifier (`VOL.01` etc.) or novel thumbnail.
  - Chapter title (`.audio-track-title`) in `Inter` semi-bold (`text-xs sm:text-[13px] font-semibold text-[var(--text-main)] truncate`).
  - Monospace metadata subline (`.audio-track-sub`) showing author username and current active speaker turn.
  - Millisecond-accurate live timecode readout (`.audio-track-timecode`): `04:12.84 / 38:14.00`.
- **Central Cluster (`.audio-central-cluster`)**:
  - Transport buttons (`.audio-control-buttons`):
    - `◀◀ 10s` (Skip back 10s).
    - Segment turn navigation (`IconPrev` / `IconNext`).
    - Inverted primary boxed CTA (`.btn-play-pause.boxed-btn-primary`): `[▶ PLAY]` / `[❚❚ PAUSE]` with high-contrast text.
    - `10s ▶▶` (Skip forward 10s).
  - Audio Scrubber Row (`.audio-scrubber-row`):
    - Monospace current timecode (`.scrubber-current-time`): `04:12`.
    - Hairline track bar with played fill (`var(--text-main)`), buffered fill, and sharp scrubber thumb.
    - Monospace total duration: `38:14`.
    - Floating hover timecode badge with sharp 0–1px corners.
- **Right Cluster (`.audio-right-cluster`)**:
  - Signal Dot (Section 9.4): strictly rendered when `isPlaying === true`. Paused or stopped playback displays no signal dot.
  - Monospace status label: `FOLLOW ALONG`.
  - Playback speed button: `1.0×` (cycles 0.75×, 1.0×, 1.25×, 1.5×, 2.0×).
  - Volume control button and sharp popover slider with percentage indicator.
  - Expand Reader action (`📖 [READER]`) linking directly into reader mode for the active chapter.
- **Mobile Responsiveness (<640px)**:
  - Pinned top edge hairline scrubber line (`.mobile-top-scrubber`).
  - Prominent mobile primary play/pause CTA (`.mobile-play-btn`).
  - Zero overflow or horizontal scroll (`scrollWidth == windowWidth`).

---

### 2.2 Screen 5: Voice Synthesis Studio (`NovelDetails.jsx`, `CharacterRoster.jsx`, `SynthesisProgressBar.jsx`)
- **Studio Card Container (`.studio-card-container`)**:
  - Integrated into the novel details stage and accessible via the `VOICE STUDIO` button and `CAST` tab.
  - Studio Header (`.studio-header`): Brand symbol with `VOICE SYNTHESIS STUDIO // ENSEMBLE & TIMBRE` (Section 9.3 compliant: removed concept `ENGINE V3.2` placeholder) and boxed `CLOSE [×]` action returning to overview.
  - Segmented sharp sub-tabs: `CAST`, `VOICES`, `SETTINGS`, `GENERATE`.
- **Persistent Synthesis Banner (`.synthesis-banner-box` & `SynthesisProgressBar.jsx`)**:
  - Replaced all legacy rounded pills, bronze fills, and glassmorphism.
  - Sharp boxed container (`border border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-[1px]`).
  - Active status badge with animated `--signal` dot strictly when synthesis is in progress (`status === 'synthesizing' || status === 'generating'`). When complete or ready, displays neutral monochrome dot.
  - Hairline 2px progress track with high-contrast `var(--text-main)` fill.
  - Monospace progress details: `PROGRESS: X% COMPLETE // X OF Y VOICES ASSIGNED`.
- **Sub-Tab 1: Cast Panel (`#tab-panel-cast`)**:
  - Header: `// CHARACTER VOICE ASSIGNMENTS` with `+ ADD CHARACTER` button.
  - Grid of character cards (`.roster-grid > .character-card`):
    - Header: Character name and role badge (`NARRATOR`, `SPEAKER A`, `SPEAKER B`...).
    - Monospace traits list: `MODEL: <voiceId>`, `PITCH OFFSET: +0.00 ST`, `CADENCE PACE: 1.00×`, `STATUS: ● ASSIGNED`.
    - Authentic sample dialogue quote in Newsreader italic serif.
- **Sub-Tab 2: Voices Panel (`#tab-panel-voices`)**:
  - Header: `// NEURAL VOICE LIBRARY` with registered voice models.
  - Detailed model cards displaying character archetype, vocal timbre descriptions, and frequency readiness (`48kHz PCM`).
- **Sub-Tab 3: Settings Panel (`#tab-panel-settings`)**:
  - Interactive sliders for synthesis timbre parameters: Emotional Range, Breath Phoneme Rate, Acoustic Reverb, and Pacing Multiplier.
- **Sub-Tab 4: Generate Panel (`#tab-panel-generate`)**:
  - Direct chapter synthesis triggers and audio generation status.
- **Character Roster Drawer (`CharacterRoster.jsx`)**:
  - Fixed slide-out drawer on Reader view updated with sharp boxed cards, neutral speaker dots, and high-contrast voice assignment selects for writers and administrators.
- **Upload Publishing Portal (`UploadView.jsx`)**:
  - Restyled to sharp monochrome cards, hairlines, and boxed action buttons.

---

## 3. Geometric & Typographic Measurements (Section 9.9)

- **Pinned Top Header**: `56px` (`h-14`)
- **Pinned Audio Dock**: `72px` (`min-h-[72px]`, `--dock-safe-bottom`)
- **Cover Jacket Artwork**: `48×48px` sharp square (`rounded-[1px]`)
- **Signal Dot Diameter**: strictly $\le 8\text{px}$ (`6.31:1` AA contrast)
- **Micro Monospace Labels**: `10px`–`11px` (`0.08em`–`0.14em` letter-spacing)
- **Informational Text**: `12px`
- **Body & Headings**: `13px`–`15px`
- **Corner Radii**: strictly `0px` to `2px` across all buttons, inputs, tabs, and cards.

---

## 4. Verification Record

- **Vitest Suite**: 19 test files passed (136/136 tests green).
- **Vite Build**: Clean production build (`AudioPlayer`: 13.96 kB / 4.18 kB gzip, `NovelDetails`: 27.27 kB / 6.46 kB gzip).
- **Parity Sheets**:
  - `docs/parity/audio-player-dark.png`
  - `docs/parity/audio-player-light.png`
  - `docs/parity/voice-studio-dark.png`
  - `docs/parity/voice-studio-light.png`
  - `docs/parity/measurements.json`
- **Git Branch**: `design/noir-mono`

