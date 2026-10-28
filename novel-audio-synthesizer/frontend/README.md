# SyncTone — React 18 Frontend Web Application

The frontend web client for **SyncTone**—an automated multi-voice novel library and audiobook synthesizer with 60fps synchronized text highlighting.

---

## 🛠️ Technology Stack

- **Framework:** React 18 + Vite 5 (Pure ES Modules & JSX)
- **Styling:** Tailwind CSS 3 (curated typography, dark/light contrast)
- **Testing:** Vitest 1.6 + `@testing-library/react` + JSDOM
- **Audio Clock:** Continuous `requestAnimationFrame` loop with $O(\log N)$ binary search over MongoDB `manifest.timeline[]`
- **State Management:** React Context (`AuthContext`) + Custom Domain Hooks

---

## 🚀 Quickstart & Scripts

Ensure backend services (PostgreSQL 16, MongoDB 7.0, OpenStack Swift, and Express API Gateway) are running.

```bash
# Navigate to frontend directory
cd novel-audio-synthesizer/frontend

# Install dependencies
npm install

# Run Vite development server on port 5173
npm run dev

# Run Vitest automated test suite (28 tests across 7 test suites)
npm test

# Build production bundle into dist/
npm run build
```

---

## 📂 Architecture & Component Structure

```
novel-audio-synthesizer/frontend/src/
├── App.jsx                     # Top-level shell, navigation views, and docked audio dock
├── main.jsx                    # Application entry point with AuthProvider wrapping
├── index.css                   # Tailwind CSS imports & animations
│
├── components/
│   ├── NovelCatalog.jsx        # Verified & Community novel browsing, search filter, cover cards
│   ├── NovelDetails.jsx        # Novel overview, narrator info, chapters directory, character cast
│   ├── ReaderView.jsx          # 60fps synchronized text view with dialogue badges and click-to-seek
│   ├── AudioPlayer.jsx         # Docked bottom audio player, progress scrubber, and speed controls
│   ├── CharacterRoster.jsx     # Slide-out drawer with character quotes, line counts, and voice overrides
│   ├── SynthesisProgressBar.jsx# Real-time WebSocket synthesis/parsing progress bar
│   ├── AuthModal.jsx           # Accessible login and registration dialog (credentials: 'include')
│   ├── AddNovelModal.jsx       # Writer/Admin novel creation modal
│   ├── UploadChapterModal.jsx  # Writer/Admin prose upload modal
│   └── SettingsModal.jsx       # TTS engine information and status
│
├── hooks/
│   ├── useAuth.js              # Consumes AuthContext (user, role, isWriterOrAdmin, login, logout)
│   ├── useAudioSync.js         # 60fps requestAnimationFrame audio clock with throttled re-renders
│   ├── usePlaybackProgress.js  # 4NF playback_history & playback_positions auto-resume and auto-save
│   └── useSynthesisProgress.js # WebSocket client for /api/ws/progress/:chapter_id
│
├── context/
│   └── AuthContext.jsx         # Cookie-based session state (restores on mount via GET /api/auth/me)
│
├── services/
│   └── api.js                  # Shared API client strictly enforcing credentials: 'include'
│
└── utils/
    └── speakerColors.js        # Accessible high-contrast speaker palette and deterministic hash resolver
```

---

## 🛡️ Non-Negotiable Engineering Rules Enforced

1. **The Cookie Rule:** Auth tokens are set and consumed strictly via `httpOnly, Secure, SameSite=Lax` cookies. Session JWTs are never stored in `localStorage` or `sessionStorage`. Native `<audio src="...">` and WebSocket connections automatically leverage browser-managed cookies.
2. **Stream URL Mapping Rule:** Chapter audio source resolves via `manifest.audio_url || manifest.audio_stream_url || '/api/stream/${chapter_id}'`, ensuring compatibility with OpenStack Swift and local audio fallbacks.
3. **Zero `timeupdate` for Highlighting:** Text highlighting relies strictly on `requestAnimationFrame` and binary search in `useAudioSync.js` to deliver jitter-free 60fps tracking. Highlighting state updates are throttled to segment boundary transitions to prevent full-document re-renders.
4. **Atomic 4NF Playback Persistence:** Progress updates synchronize with the normalized `playback_history` and `playback_positions` tables via `POST /api/playback/progress` on pause, seek, and throttled periodic ticks.
