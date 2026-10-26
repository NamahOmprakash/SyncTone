# SyncTone — Design Direction

## Visual Identity: "Literary Cinema"

SyncTone should feel like opening a premium digital book — cinematic in presentation, literary in craft, and effortless in interaction. Not a streaming service clone. Not an admin dashboard. A purpose-built reading and listening experience.

---

## 1. Color System

### Dark Theme (Default)
```
Background:     #0A0E17  (Deep ink black — not pure black, not blue-grey)
Surface:        #12172A  (Elevated panels)
Card:           #1A2036  (Content containers)
Hover:          #232B44  (Interactive highlight)

Text Primary:   #F1F5F9  (Near-white, high contrast)
Text Secondary: #94A3B8  (Readable grey)
Text Muted:     #64748B  (De-emphasized)

Accent:         #818CF8  (Indigo-400 — the signature SyncTone color)
Accent Hover:   #6366F1  (Indigo-500)
Accent Surface: rgba(129, 140, 248, 0.08)  (Tinted backgrounds)

Success:        #34D399  (Emerald for completed states)
Warning:        #FBBF24  (Amber for pending/synthesis)
Error:          #F87171  (Rose for failures)

Border:         rgba(255, 255, 255, 0.06)
```

### Sepia Theme
```
Background:     #F5E6C8  (Warm parchment)
Surface:        #EDD9B5
Card:           #E5CCA3
Text Primary:   #2C1810
Accent:         #92400E  (Warm amber-brown)
```

### Light Theme
```
Background:     #FAFBFC  (Cool off-white)
Surface:        #FFFFFF
Card:           #F1F5F9
Text Primary:   #0F172A
Accent:         #4F46E5  (Indigo-600)
```

---

## 2. Typography
 
### Type Scale (1.25 Modular Scale)
| Role | Font | Weight | Size | Usage |
|---|---|---|---|---|
| Display 2XL | Plus Jakarta Sans | 800 | 44px | Novel titles in hero sections |
| Display XL | Plus Jakarta Sans | 700 | 32px | Section headers, detail titles |
| Heading LG | Plus Jakarta Sans | 700 | 24px | Modal titles, drawer titles |
| Subheading | Plus Jakarta Sans | 600 | 16-18px | Card titles, tab labels |
| Body UI | Plus Jakarta Sans | 400/500 | 14-16px | UI text, descriptions, forms |
| Reading Prose | Literata | 400 | 16-22px | Chapter prose (user-adjustable, opsz auto) |
| Reading Dialogue | Literata | 400 Italic | 16-22px | Character spoken lines with speaker border |
| Caption | Plus Jakarta Sans | 600 | 11-13px | Badges, timestamps, channel tags |
| Mono | JetBrains Mono | 500 | 12px | Voice IDs, segment index, timecodes |

### Reading Typography Rules
- **Measure**: 60-75 characters per line (optimal reading measure)
- **Line height**: 1.75 for body prose (literary cadence, not cramped)
- **Paragraph spacing**: 1.25em between prose segments
- **Dialogue**: Italic Literata with subtle left speaker border
- **Narration**: Regular weight Literata, comfortable cadence

---

## 3. Spacing & Grid

### Spacing Scale (8px base)
```
4px   — Tight gaps (badge padding, inline spacing)
8px   — Component internal padding
12px  — Related element spacing
16px  — Section element spacing
24px  — Card padding, component gaps
32px  — Section spacing
48px  — Page section dividers
64px  — Major layout breaks
```

### Layout
- **Sidebar**: 72px fixed icon rail on desktop, hidden on mobile (bottom bar instead)
- **Max content width**: 1280px (7xl) for catalog, 768px (3xl) for reader
- **Card grid**: CSS Grid with responsive columns (1 → 2 → 3)

---

## 4. Component Design Principles

### Navigation
- **Desktop**: Fixed left icon rail (72px) — Home, Search (future), Profile
- **Mobile**: Bottom navigation bar with 4 tabs
- **Breadcrumbs**: Text-based path in top header for orientation
- **No hamburger menus** on desktop

### Novel Cards
- **2:3 aspect ratio covers** as the primary visual
- Title overlaid at bottom with gradient fade
- Metadata below: author, narrator badge, synopsis excerpt
- Hover: Subtle lift (2px Y translate + shadow increase), not scale transforms
- Channel indicator: Small pill badge, not dominating the card

### Novel Details
- **Hero section**: Blurred cover as ambient backdrop, elevated cover poster, title + metadata
- **Two-column layout**: Chapters list (left, wider) + Production info (right, narrower)
- **Chapter list**: Clean tracklist with number, title, duration, status pill, play action
- **Character cast**: Card grid with name, voice, sample quote

### Reader
- **Clean reading surface**: Maximum focus on text
- **Sticky controls**: Font/theme/width controls pinned at top, minimal visual weight
- **Active segment**: Subtle left border highlight (2px accent) + slight background tint, NOT pulsing glow
- **Dialogue vs Narration**: Visual distinction through typography, not heavy card borders

### Audio Player
- **Docked at bottom**: Always visible when in reader, frosted glass background
- **Controls**: Skip back, Play/Pause, Skip forward, Speed, Scrubber
- **Time display**: Current / Total in monospace
- **Scrubber**: Full-width bar with accent fill and draggable thumb on hover

### Modals
- **Centered overlay with backdrop blur**
- **Auth**: Clean form with email/password, register/login toggle, guest access link
- **Add Novel / Upload Chapter**: Form-focused, no decorative elements

---

## 5. Iconography

Replace ALL emoji with consistent SVG icons. Use a minimal, geometric icon set:
- Inline SVG paths for core icons (play, pause, skip, search, home, settings, etc.)
- Consistent 20x20 or 24x24 sizing
- Stroke-based icons (1.5-2px stroke) for navigation
- Fill-based icons for action buttons (play/pause)

---

## 6. Motion & Transitions

### Rules
1. **Duration**: 150-300ms for micro-interactions, 300-500ms for page transitions
2. **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` for standard, `cubic-bezier(0.16, 1, 0.3, 1)` for exits
3. **Reduced motion**: Respect `prefers-reduced-motion` — disable decorative animations
4. **No infinite loops** on visible UI elements (except audio "playing" indicator)

### Specific Animations
- **Card hover**: `transform: translateY(-2px)` + `box-shadow` increase (150ms)
- **Modal entrance**: `opacity: 0 → 1` + `scale: 0.97 → 1` (250ms)
- **View transitions**: `opacity` crossfade (200ms)
- **Active segment**: `background-color` transition (200ms), no keyframe animations
- **Player controls**: `scale: 0.95 → 1` on press (100ms)

---

## 7. Design Rationale

### Why "Literary Cinema" and not "OTT Streaming Clone"
SyncTone is fundamentally a *reading* application with audio enhancement. Users spend minutes reading text — the interface must prioritize reading comfort over visual spectacle. Netflix/OTT patterns (hero billboards, hover preview cards, Top 10 carousels) are optimized for *browsing* video thumbnails, not *reading* literature.

**Adaptation**: Borrow the editorial confidence and dark aesthetic from streaming platforms, but apply it to a content-first, typography-driven reading experience.

### Why Replace Emoji with SVG Icons
- Emoji render differently across platforms (Windows vs macOS vs Android)
- Emoji have fixed visual weight that can't match the interface's design system
- Professional products use purpose-designed iconography
- Accessibility: screen readers handle semantic SVG better than decorative emoji

### Why Reduce Glassmorphism
- The current implementation uses `backdrop-filter: blur()` on nearly every surface
- Excessive blur reduces text readability and creates visual noise
- Reserve glassmorphism for 1-2 key elements (floating player dock, mobile nav) where the layering effect genuinely helps

### Why Simplify the Active Segment Animation
- The current `glow-border` keyframe animation (2.5s infinite) creates constant visual motion in the reading area
- Continuous animation in a reading context is fatiguing
- Replace with a static accent border + subtle background tint that clearly marks the active segment without demanding attention

---

*Design Direction established: October 2026*
*Evidence base: 8 award-winning websites, 3 competitive products, private project documentation*
