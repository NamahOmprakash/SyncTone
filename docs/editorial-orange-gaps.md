# Editorial Orange Redesign — Spec Gaps & Non-Existent Features

> [!NOTE]
> Per **HARD CONSTRAINT 2 & 4** of the Editorial Orange Redesign specification:
> *"Restyle only what exists. If a spec'd element does not exist in the app (e.g. bookmarks, queue, reading settings beyond A-/A+, voice previews), do NOT invent or mock it; list it in `docs/editorial-orange-gaps.md` for later."*
> This document logs all features or UI elements referenced in general reader/player specifications that do not exist in the SyncTone codebase, ensuring no agent invents, mocks, or introduces unsolicited state.

---

## Inventory of Spec Gaps

| Feature Area | Spec Reference / Assumption | Actual Codebase Reality | Architectural Disposition |
| :--- | :--- | :--- | :--- |
| **Bookmarks** | Reader bookmarking controls, saved quote lists, or bookmark navigation. | Only mentioned in static copy in [`ProfileView.jsx`](file:///Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/frontend/src/components/ProfileView.jsx#L96). No database schema, API route, or UI bookmark button exists in `ReaderView` or `OpenGLPageReader`. | **HELD / DO NOT INVENT**. Do not create bookmark buttons or mock storage. |
| **Playback Queue** | Up-next playlist, queue drawer, or track reordering in `AudioPlayer`. | Audio playback operates on a single chapter timeline (`chapterManifest.timeline`). Progress auto-advances intra-chapter, but no inter-novel or multi-chapter queue data structure exists. | **HELD / DO NOT INVENT**. Keep `AudioPlayer` docked controls strictly bound to the active chapter audio stream. |
| **Reading Settings beyond A-/A+** | Granular line-height, paragraph margin spacing, letter spacing, or hyphenation controls. | [`SettingsModal.jsx`](file:///Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/frontend/src/components/SettingsModal.jsx) only exposes **Theme** (Dark/Light), **Book Font** (Serif/Sans), and **Text Size** (A- / A+ in px steps). | **HELD / FROZEN**. Preserve current settings copy and controls exactly as held per user amendment. |
| **Voice Audio Previews** | "Listen to voice sample" audition button in voice selection menus. | [`CharacterRoster.jsx`](file:///Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/frontend/src/components/CharacterRoster.jsx) and `SettingsModal.jsx` list available voice archetypes in native HTML `<select>` elements. No audio preview audition endpoint or UI trigger exists. | **HELD / DO NOT INVENT**. Maintain existing dropdown selector without mock audio playback triggers. |
| **Sepia / Third Atmosphere** | E-reader sepia / warm paper mode. | SyncTone strictly supports two atmospheres: **Warm Editorial** (`html.light`) and **Midnight Listening** (`:root, html.dark`). | **CONFIRMED OMITTED**. Obey binary user theme toggle; no sepia mode exists or will be added. |
| **Generative Cover Presets** | Cover palette modification. | [`NovelCover.jsx`](file:///Users/mohdfaizankhan/SyncTone-/novel-audio-synthesizer/frontend/src/components/NovelCover.jsx) defines 6 procedural canvas cover presets (`emerald`, `amber`, `sky`, `purple`, `rose`, `indigo`). | **PRESERVED & INDEPENDENT**. Cover presets remain frozen and unchanged. |
| **Manual Add Character** | `+ ADD CHARACTER` button in Voice Studio / Character Roster. | Characters are derived deterministically by backend LLM/NLP parser from chapter manuscripts. No API endpoint exists to insert arbitrary character profiles out-of-band. | **DISABLED & LABELED**. Displayed disabled with tooltip explaining automatic manuscript extraction; logged as gap per Section 9.3. |

