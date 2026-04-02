# Minesweeper — C++ Backend + HTML/CSS/JS Frontend

A complete Minesweeper with **strict separation of concerns**:
- **All game rules** → pure C++ (`backend/GameEngine.h`)
- **All UI design** → pure CSS (`frontend/styles.css`)
- **Rendering/animation** → JavaScript (`frontend/game.js`)

---

## What's in the HUD

```
┌──────────┬──────────┬──────┬──────────┬──────────┐
│  FOUND   │  FLAGS   │  🙂  │  MINES   │   TIME   │
│   000    │   000    │      │   015    │   000    │
└──────────┴──────────┴──────┴──────────┴──────────┘
```

| Counter | Meaning |
|---------|---------|
| **FOUND** | Mines you have **correctly flagged** — starts at 0, +1 each real mine flagged |
| **FLAGS** | **Total flags** placed (mine OR safe cell — every flag counts) |
| **MINES** | Total mines on the board for the current difficulty |
| **TIME** | Seconds elapsed since your first click |

---

## Difficulty Levels

| Level | Grid | Mines |
|-------|------|-------|
| Easy | 10 × 10 | 15 |
| Medium | 18 × 18 | 60 |
| Hard | 24 × 24 | 120 |

---

## Project Structure

```
minesweeper-v2/
│
├── backend/
│   ├── GameEngine.h        ← ALL game rules (pure C++, no graphics)
│   └── wasm_bridge.cpp     ← Emscripten C API exported to WebAssembly
│
├── frontend/
│   ├── index.html          ← HTML structure ONLY (no logic)
│   ├── styles.css          ← ALL visual design + animations (CSS only)
│   ├── engine-adapter.js   ← WASM bridge + identical JS fallback engine
│   ├── game.js             ← Auto-fit layout, rendering, animations, events
│   └── engine.js           ← (generated) C++ compiled to WASM
│
├── build-wasm.sh           ← Compile C++ to WASM (optional)
└── README.md               ← This file
```

---

## ▶ HOW TO RUN — STEP BY STEP

### ─────────────────────────────────────────────────
### METHOD 1: Just Open the File  *(easiest, no install)*
### ─────────────────────────────────────────────────

This uses the **JS fallback engine** — identical game rules to the C++ version.

**Step 1** — Download and unzip the project

```
minesweeper-v2/
└── frontend/
    └── index.html   ← open this
```

**Step 2** — Double-click `frontend/index.html`

```
Open in: Chrome, Firefox, Edge, or Safari
```

**Step 3** — Play immediately.

The HUD will show `⚙ C++ Rules (JS)` — confirming JS engine is active.

> No installation. No server. No dependencies.

---

### ─────────────────────────────────────────────────
### METHOD 2: Python Local Server  *(recommended for development)*
### ─────────────────────────────────────────────────

**Step 1** — Check Python is installed

```bash
python3 --version
# Should print: Python 3.x.x
```

If not installed: https://www.python.org/downloads/

**Step 2** — Open your terminal and navigate to the frontend folder

```bash
# Mac / Linux
cd /path/to/minesweeper-v2/frontend

# Windows (Command Prompt)
cd C:\path\to\minesweeper-v2\frontend

# Windows (PowerShell)
cd C:\path\to\minesweeper-v2\frontend
```

**Step 3** — Start the server

```bash
python3 -m http.server 8080
```

You should see:
```
Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

**Step 4** — Open the game in your browser

```
http://localhost:8080
```

**Step 5** — To stop the server, press `Ctrl + C` in the terminal.

---

### ─────────────────────────────────────────────────
### METHOD 3: VS Code Live Server  *(for VS Code users)*
### ─────────────────────────────────────────────────

**Step 1** — Install VS Code: https://code.visualstudio.com

**Step 2** — Install the "Live Server" extension
- Open VS Code → Extensions (Ctrl+Shift+X)
- Search: `Live Server`
- Install by Ritwick Dey

**Step 3** — Open the project folder
- File → Open Folder → select `minesweeper-v2`

**Step 4** — Right-click `frontend/index.html` → **"Open with Live Server"**

**Step 5** — Browser opens automatically at `http://127.0.0.1:5500/frontend/`

---

### ─────────────────────────────────────────────────
### METHOD 4: Node.js `http-server`
### ─────────────────────────────────────────────────

**Step 1** — Install Node.js: https://nodejs.org

**Step 2** — Install http-server globally

```bash
npm install -g http-server
```

**Step 3** — Navigate to frontend and serve

```bash
cd minesweeper-v2/frontend
http-server -p 8080
```

**Step 4** — Open `http://localhost:8080` in your browser.

---

### ─────────────────────────────────────────────────
### METHOD 5: With Real C++ WebAssembly  *(advanced)*
### ─────────────────────────────────────────────────

This compiles the actual C++ rules engine to WebAssembly.
The HUD will show `⚙ C++ WebAssembly`.

**Step 1** — Install Emscripten SDK

```bash
# Any OS with bash (Linux, macOS, WSL on Windows)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

To make it permanent, add this to your `~/.bashrc` or `~/.zshrc`:
```bash
source /path/to/emsdk/emsdk_env.sh
```

**Step 2** — Compile C++ to WebAssembly

```bash
cd minesweeper-v2
chmod +x build-wasm.sh
./build-wasm.sh
```

Output:
```
frontend/engine.js    — JS loader module
frontend/engine.wasm  — compiled C++ binary
```

**Step 3** — Serve locally (WASM requires HTTP, not file://)

```bash
cd frontend
python3 -m http.server 8080
```

**Step 4** — Open `http://localhost:8080`

The HUD shows `⚙ C++ WebAssembly` — real C++ is now running in your browser.

---

## Controls

| Input | Action |
|-------|--------|
| Left-click | Reveal cell |
| Right-click | Place / remove flag |
| Long-press (mobile) | Place flag |
| `R` | Restart current game |
| `1` | Switch to Easy |
| `2` | Switch to Medium |
| `3` | Switch to Hard |

---

## Game Rules

1. **First click is always safe** — mines are placed *after* your first left-click, with a 3×3 safe zone.
2. **Left-click** reveals:
   - Mine → game over, all mines shown
   - Number (1–8) → adjacent mine count
   - Blank (0) → auto-reveals all connected blank cells (flood fill)
3. **Right-click** toggles a flag:
   - Flag on real mine → FOUND counter +1
   - Flag on any cell → FLAGS counter +1
   - Remove any flag → FLAGS counter -1
4. **Win** when every non-mine cell is revealed.
5. Flagged cells are protected — unflag to reveal.

---

## Architecture — Layer Separation

| File | What it contains | What it does NOT contain |
|------|-----------------|--------------------------|
| `GameEngine.h` | All C++ game rules | No graphics, no DOM, no CSS |
| `wasm_bridge.cpp` | C API for WASM | No game logic |
| `index.html` | HTML structure | No `onclick`, no JS logic |
| `styles.css` | All CSS design + animations | No JavaScript |
| `engine-adapter.js` | WASM + JS mirror bridge | No rendering |
| `game.js` | DOM rendering, animations | No game rules |

---

## Browser Compatibility

| Browser | Works | WASM |
|---------|-------|------|
| Chrome 80+ | ✅ | ✅ |
| Firefox 75+ | ✅ | ✅ |
| Edge 80+ | ✅ | ✅ |
| Safari 14+ | ✅ | ✅ |
| Mobile Chrome | ✅ | ✅ |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Scrollbar appears | Resize window — layout auto-adjusts |
| Game too small | Use Medium or Easy on small screens |
| WASM not loading | Must use HTTP server (Method 2–5), not `file://` |
| Right-click opens menu | Normal in some OS outside browser — works inside browser |
| Font looks wrong | Wait for Google Fonts to load (needs internet) |
