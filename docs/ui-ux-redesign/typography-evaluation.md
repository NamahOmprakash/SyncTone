# SyncTone — Typography Evaluation & Specification

## 1. Evaluation of Font Pairing Options

To solve SyncTone's typographic hierarchy and move away from generic system fonts (Inter, Arial, Roboto), three genuine pairing options were benchmarked against actual SyncTone screens (Hero titles, chapter reading prose, dialogue blocks, narrator badges, audio progress timestamps, and form controls).

---

### Option A: Plus Jakarta Sans + Literata (Selected Direction)

| Category | Typeface | Rationale |
|---|---|---|
| **Display & UI** | **Plus Jakarta Sans** (Weights: 400, 500, 600, 700, 800) | A geometric neo-grotesque with high x-height, open counters, and distinctive geometric terminals. Unlike Inter, it carries human warmth and contemporary editorial presence. Excels at both 40px display titles and 11px micro-metadata badges. |
| **Reading Prose** | **Literata** (Variable opsz 7..72, Weights: 400, 500, 600, 700, Italics) | Originally commissioned by Google for Google Books, designed specifically for prolonged continuous on-screen reading across varied lighting conditions. Optical sizing ensures small text maintains open apertures while large text is elegant. Its true italics provide distinctive rendering for multi-character dialogue. |
| **Technical Mono** | **JetBrains Mono** (Weight: 500) | Clean tabular numerals and monospace alignment for audio segment timestamps, voice speaker IDs, and synthesis bitrate markers. |

**Verdict**: **Selected (Score: 9.6/10)**. Seamlessly balances the digital audiobook player experience with long-form literary comfort. Respects the 2-primary-family constraint (Plus Jakarta Sans for all UI/navigation/controls, Literata solely for novel prose).

---

### Option B: Fraunces + Outfit + Newsreader

| Category | Typeface | Evaluation |
|---|---|---|
| **Display** | Fraunces | Expressive variable serif with dramatic soft-axis styling. Beautiful for posters, but becomes visually distracting when rendered in multi-line novel synopses. |
| **UI** | Outfit | Clean geometric sans, but low contrast in small modal labels and high character width increases mobile line wrapping. |
| **Reading** | Newsreader | High-grade editorial serif, but lacks the optical compactness of Literata on sub-400px mobile viewports. |

**Verdict**: Rejected. Excessive expressive serif ornamentation conflicts with the technical precision of audio playback and multi-voice controls.

---

### Option C: Satoshi + Lora

| Category | Typeface | Evaluation |
|---|---|---|
| **Display & UI** | Satoshi | Modern neo-grotesque, but requires custom webfont hosting with license variability. |
| **Reading** | Lora | Calligraphic roots give it charm, but looser letter-spacing causes longer paragraph heights and higher scroll fatigue. |

**Verdict**: Rejected. Good general pair, but lacks the specialized digital-book legibility engineered into Literata.

---

## 2. Definitive Typographic Hierarchy & Scale

SyncTone uses a 1.25 (Major Third) modular type scale with explicit letter-spacing (tracking) and line-heights:

| Token | Family | Weight | Size | Line Height | Tracking | Purpose |
|---|---|---|---|---|---|---|
| `display-2xl` | Plus Jakarta Sans | 800 | 44px (2.75rem) | 1.1 | -0.03em | Hero novel title, primary showcase |
| `display-xl` | Plus Jakarta Sans | 700 | 32px (2.0rem) | 1.2 | -0.025em | Section hero, novel detail title |
| `heading-lg` | Plus Jakarta Sans | 700 | 24px (1.5rem) | 1.25 | -0.02em | Section headers, modal titles |
| `heading-md` | Plus Jakarta Sans | 600 | 18px (1.125rem) | 1.35 | -0.015em | Card titles, drawer headers |
| `subhead` | Plus Jakarta Sans | 600 | 15px (0.9375rem) | 1.4 | -0.01em | Navigation tabs, channel filters |
| `body-ui` | Plus Jakarta Sans | 400/500 | 14px (0.875rem) | 1.5 | 0.0em | Control labels, synopsis, character roster |
| `caption` | Plus Jakarta Sans | 600 | 12px (0.75rem) | 1.4 | +0.02em | Badges, channel tags, chapter counts |
| `micro` | Plus Jakarta Sans | 700 | 10px (0.625rem) | 1.2 | +0.06em | Audio status badges, pill tags |
| `prose-reading` | Literata | 400 | 18px (1.125rem) | 1.75 | +0.005em | Chapter narration body copy (65ch measure) |
| `prose-dialogue`| Literata | 400 Italic | 18px (1.125rem) | 1.75 | +0.01em | Character spoken dialogue with speaker border |
| `mono-code` | JetBrains Mono | 500 | 12px (0.75rem) | 1.4 | 0.0em | Audio timestamps, voice IDs, segment index |

---

## 3. Webfont Delivery & Performance Rules

1. **Preconnect**: DNS preconnect and prefetch to `https://fonts.googleapis.com` and `https://fonts.gstatic.com` with `crossorigin`.
2. **Font Display**: `display=swap` to prevent Flash of Invisible Text (FOIT) while maintaining zero layout shift (CLS < 0.02).
3. **Weight Pruning**: Only required font weights (400, 500, 600, 700, 800) are loaded; no unused intermediate cuts.
4. **CSS Fallbacks**:
   - `font-sans`: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
   - `font-serif`: `'Literata', Georgia, Cambria, 'Times New Roman', serif`
   - `font-mono`: `'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace`
