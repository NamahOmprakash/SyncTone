# PROJECT: SYNCTONE - NOIR MONOCHROME REDESIGN (FULL UI/UX CHANGE)

## 0. AUTHORIZATION AND PRECEDENCE
Owner's written authorization for a FULL visual and UX redesign (colors, typography,
layout, component shapes, navigation structure, geometry, editorial-voice copy; still NO
technical or backend wording). Supersedes `docs/noir-yellow-spec.md` (withdrawn: the yellow
accent was a misreading), `docs/editorial-orange-spec.md` and `THEME_LOCK` v1. Changes happen
phase by phase after my approval of each phase's preview.
REFERENCES (study both, sample real pixels): `docs/design-reference/reference-hero.png`
(THE SITE'S TRUE THEME, primary) and `docs/design-reference/reference.png` (a viewer overlay;
ignore its yellow button, rounded pill dock and light top bar: they are the Awwwards
viewer's chrome, NOT the theme). Adopt style language only; never copy brand names, text
or imagery.
FROZEN: business logic, API integrations, auth, database behaviour, audio synthesis and
sync (`useAudioSync`, `usePlaybackProgress`, `useSynthesisProgress`), reading anchors, route
paths/deep links, user data, PWA/offline behaviour, sanitizer.

## 1. DESIGN LANGUAGE (from reference-hero.png)
STRICTLY MONOCHROME. No yellow, no green, no orange fills, no blue, no purple: the only
hues allowed anywhere in the UI chrome are neutral greys plus one tiny signal dot
(section 3). Book cover art and user images are content, not theme.
- Page = tall vertical gradient: near-black at the top fading to mid grey then light
  grey at the bottom (hero/landing stages); app screens use flat near-black/off-white
  surfaces with the same neutral family.
- Display headline: giant, ultra-heavy, uppercase, tight tracking, filled with a grey
  vertical gradient; a second word skewed italic that fades into the background.
- Micro UI: monospace, uppercase, small, letter-spaced; nav items prefixed with "+";
  boxed buttons with a 1px border, SHARP corners (radius 0-2px) and a small round dot.
- Tilted hero object: a 3D-tilted book/cover (CSS perspective transform) in place of the
  tilted monitor; small mono credit left, short sans blurb right.
- Hairlines, tiny caps labels, generous empty space, no shadows beyond subtle depth, no
  pills, no rounded cards, no glassmorphism, no decorative gradients other than the
  neutral stage gradient and the headline gradient.

## 2. TOKENS (re-value the EXISTING custom properties; add only the listed new ones; values are estimates: sample the reference, then preview before applying)
Existing: `--bg-page` `--bg-surface` `--bg-card` `--bg-hover` `--text-main` `--text-sub` `--text-muted`
`--accent` `--accent-hover` `--accent-surface` `--on-accent` `--border-subtle` `--border-strong`
`--border-focus` `--top10-active` `--card-accent` `--speaker-a` + status tokens.
New: `--stage-gradient` (4 stops), `--headline-gradient`, `--signal`, `--bg-bar`.
DARK (default): page `#0B0B0D`, surface `#141416`, card `#1B1B1E`, hover `#232327`, border
`#2E2E33`, border-strong `#44444A`, text `#F2F2F3`, text-sub `#A9A9AF`, text-muted `~#81818A`
(verify >= 4.5:1), stage gradient `#0A0A0C` -> `#2A2A2E` -> `#7B7B7E` -> `#C2C2C4`,
headline gradient `~#B4B4B6` -> `#3A3A3E`.
LIGHT (inversion, same structure): page `#EFEFF0`, surface `#F7F7F8`, card `#FFFFFF`, hover
`#E4E4E6`, border `#D0D0D4`, text `#0B0B0D`, text-sub `#4F4F56`, muted `#6E6E75`, stage gradient
`#F4F4F5` -> `#D9D9DB` -> `#8A8A8D` -> `#1A1A1C` (mirrored), headline gradient dark-to-light fade.
ACCENT = INVERSE, NOT A HUE: `--accent` = text-main (dark: `#F2F2F3`, light: `#0B0B0D`),
`--on-accent` = opposite page color (dark: `#0B0B0D`, light: `#FFFFFF`).
STATUS TOKENS: replace hue fills with icons, text weight, high-contrast borders and
neutral badges; if a color is strictly required by accessibility, use a single-hue
dot $\le 8\text{px}$, never a filled card.

## 3. SIGNAL DOT (ONE EXCEPTION TO ZERO-HUE)
One single color token: `--signal: #FF5A1F` (dark) / `#F05010` (light) (or an equivalent single
saturated signal hue, sampled from reference if present; else standard signal red/orange).
STRICT RULES:
- Size $\le 8\text{px}$ diameter. Circular.
- ONLY for "live", "recording", "playing", "generating" states (e.g. playing track, audio
  sync listening, active synthesis job).
- NEVER on static icons, cards, backgrounds, borders, badges, tags or un-playing buttons.
- At most ONE signal dot visible per viewport at any time (the primary active element).

## 4. TYPOGRAPHY
Display: Inter (or existing sans) 800/900, uppercase, tight tracking (-0.03em to -0.05em).
Secondary display: skewed italic (transform: skewX(-10deg) or italic face) fading gradient.
Prose: Newsreader (keep existing serif body for long reading).
Micro labels / Nav / Badges: JetBrains Mono (or existing mono), 10-12px, letter-spacing
0.08-0.14em, uppercase. Prefix nav items with "+".

## 5. GEOMETRY AND SHAPES
- Radius: strictly 0-2px everywhere in the UI chrome. No pills, no rounded-xl, no 12px
  corners. Buttons are sharp rectangles with 1px border.
- Cards: monolithic flat surfaces with 1px hairline borders (`--border-subtle`).
- Dock / player: pinned bottom bar with 1px top border, solid `--bg-bar`, no blur glass, no
  floating rounded pill. Height = 72px (`--dock-safe-bottom`).
- Top bar: pinned top bar, 56px, solid `--bg-bar`, 1px bottom border.
- Hero 3D object: tilted book jacket / vinyl cover at perspective 1200px, rotateY(-18deg),
  rotateX(8deg), subtle drop shadow.

## 9. CONCEPT PARITY (the approved previews are the acceptance target)
### 9.1 Targets
`docs/design-preview/*` (Home, Novel detail, Reader, Audio bar, Voice studio;
Dark and Light) plus `docs/design-reference/reference-hero.png` for the hero. Build the
REAL screens to match them: layout, grid, spacing, type scale, borders, sharp boxes,
nav, bars, tags, tabs, states. Match fully.

### 9.2 REAL DATA ONLY
Concept text is placeholder. Bind every element to real data and
handlers. If the app has no real data/feature for an element, omit it and log it in
`docs/editorial-orange-gaps.md`. Never fabricate numbers, versions or stats.

### 9.3 NO TECHNICAL WORDING (still in force)
Replace concept strings:
- "ENGINE V3.2", "SYNTHESIS MATRIX", "NEURAL MODEL", "DIALOGUE SEGMENTS", "SAMPLE
  ACCURACY", "SYNC DRIFT", "LOSSLESS 48KHZ // DUAL-CHANNEL", "ZERO COMPRESSION",
  "NEURAL READY" -> remove, or an "AT A GLANCE" block with real fields only
  (chapters, duration, cast size, narrator).
- "ARCHIVE VOLUME 08 // PRODUCTION SYSTEM", "VOL. 07", "ARCHIVE" -> real data only;
  nav items only for routes that exist (e.g. LIBRARY, VOICES, READER, PROFILE).
- "MODEL: Neural-Bass-UK-M", "PITCH OFFSET", "CADENCE PACE", "ASSIGNED & LOCKED" ->
  "VOICE", "PITCH", "PACE", "ASSIGNED" using current friendly Settings copy.
- "LIVE SYNC", "[AUDIO SYNC 04:12.84 - SPEAKER 8]" -> "FOLLOW ALONG" and
  "NOW SPEAKING: <character>" only if backed by real sync data.

### 9.4 SIGNAL DOT
Only for live/playing/generating state (playing track, FOLLOW ALONG on,
generating audio). Every other bullet is a neutral dot (text-main color).

### 9.5 HERO
Line 1 spans ~80-85% of the content width at 1440 (reference-hero.png
proportions), line 2 skewed italic fading out. Suggested copy: "STORIES THAT /
SPEAK" (owner may override). At 390px it may wrap to 3 lines, never clip.

### 9.6 NAV
Top bar only (desktop and tablet): no left rail. Mobile: compact top bar plus a
bottom nav sheet in the same language. Player bar: 72px, bottom, `--dock-safe-bottom`.

### 9.7 READER
Keeps BOTH modes (Normal and the 3D book spread) with the fit engine; the
single-column concept is the Normal-mode layout only.

### 9.8 MIN TEXT SIZES
Micro labels >= 11px, informational text >= 12px, body >= 14px;
all informational text >= 4.5:1 on its real local background.

### 9.9 PARITY GATE for every screen
Playwright captures the real screen at 1440x900 (Dark and Light) and 390x844, assembled side by side with its concept image into `docs/parity/<screen>-<theme>.png`, plus a checklist of every structural element (present / omitted + reason / differs + reason). Report measured heights (top bar 56, player bar 72) and type sizes.

