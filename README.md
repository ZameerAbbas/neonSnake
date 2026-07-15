# 🐍 NeonSnake

> A modern, production-quality Snake game built with pure HTML, Tailwind CSS (CDN), and vanilla JavaScript — no frameworks, no libraries, no build tools required.

![NeonSnake Preview](https://img.shields.io/badge/NeonSnake-Premium%20Snake%20Game-39ff14?style=for-the-badge&labelColor=020817)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&labelColor=020817)
![HTML](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

## 📋 Project Overview

NeonSnake reimagines the classic Snake game with a premium, polished aesthetic. It features a dark glassmorphism UI, neon glow effects, smooth animations, and a fully modular JavaScript engine — all without a single external dependency beyond Tailwind CSS via CDN.

The codebase is written to production standards: clean, well-commented, easy to extend, and optimised for performance through DOM cell pooling and CSS transform-based positioning.

---

## ✨ Features

### Gameplay
- 🕹️ **Classic Snake mechanics** — grow by eating food, avoid walls and yourself
- 🚫 **Instant-reverse prevention** — the snake cannot flip 180° in one move
- 📈 **Buffered direction input** — keypresses are queued so rapid inputs are safe
- 🍎 **Randomised food spawning** — food never appears inside the snake
- 🏆 **High score persistence** — saved to `localStorage`, survives page refresh
- ▶️ **Pause / Resume** — at any time during gameplay
- 🔄 **Restart without refresh** — full game reset with state cleanup

### Difficulty Levels
| Level  | Tick Speed | Score Multiplier |
|--------|-----------|-----------------|
| Easy   | 160ms     | ×1.0            |
| Medium | 110ms     | ×1.5            |
| Hard   | 70ms      | ×2.5            |

### Design
- 🌑 **Dark theme** with radial gradient background
- 🪟 **Glassmorphism** cards with frosted-glass blur
- 💚 **Neon green snake** with glow and per-segment shading (head / body / tail)
- 🔴 **Pulsing red food** with animated radial glow
- ✨ **Micro-animations** — score pop, game-over shake, food pulse, title flicker
- 📱 **Responsive layout** — adapts cell size at mobile breakpoints
- 🎨 **Modern typography** — Inter (UI) + JetBrains Mono (scores)

### Accessibility
- Semantic HTML with `<main>`, `<header>`, `<section>`, `<footer>`
- `aria-label` on all interactive elements
- `aria-pressed` on difficulty toggle buttons
- `aria-live` on score counter and status badge
- Visible `:focus-visible` outlines on all focusable elements
- No colour-only information — status uses text labels + icons

### Audio
- Web Audio API placeholder tones (no audio files required)
  - **Click** — short square-wave blip on button press
  - **Eat** — ascending two-tone sine chime on food consumption
  - **Game Over** — descending sawtooth crash on death

---

## 📁 Folder Structure

```
snake-game/
├── index.html   ← Full HTML, Tailwind config, all styles, game layout
├── script.js    ← Modular game engine (CONFIG, UIManager, GameEngine, InputHandler)
└── README.md    ← This file
```

> No build step. No `node_modules`. No bundler. Open `index.html` and play.

---

## 🛠️ Technologies Used

| Technology      | Version / Source  | Purpose                          |
|----------------|-------------------|----------------------------------|
| HTML5           | Native            | Document structure & semantics   |
| CSS3            | Native            | Animations, keyframes, variables  |
| Tailwind CSS    | CDN (latest)      | Utility-first layout & spacing   |
| Vanilla JS (ES6+)| Native           | Game engine, DOM management      |
| Web Audio API   | Native            | Synthesised sound effects        |
| `localStorage`  | Native            | High score persistence           |
| Google Fonts    | CDN               | Inter + JetBrains Mono typefaces |

> **No canvas libraries, game engines, React, jQuery, Bootstrap, or TypeScript.**

---

## 🚀 How to Run

### Option 1 — Open directly (simplest)
1. Download or clone this repository.
2. Double-click `index.html` to open it in your default browser.
3. That's it — the game loads instantly.

### Option 2 — Local HTTP server (recommended to avoid CORS quirks)
```bash
# Using Python (built into macOS/Linux):
python3 -m http.server 8080

# Using Node.js npx:
npx serve .

# Then open:
http://localhost:8080
```

### Option 3 — VS Code Live Server
1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` → **Open with Live Server**.

---

## 🎮 Controls

| Key(s)              | Action                |
|---------------------|-----------------------|
| `↑` / `W`           | Move Up               |
| `↓` / `S`           | Move Down             |
| `←` / `A`           | Move Left             |
| `→` / `D`           | Move Right            |
| `P`                 | Pause / Resume        |
| `R`                 | Restart               |
| `Enter` / `Space`   | Start / Resume / Restart |

---

## 🏗️ Architecture

The JavaScript is structured as a set of **immediately-invoked module objects** (IIFE pattern) to encapsulate state without a build tool:

```
CONFIG          → Immutable game constants (grid size, speeds, keys, etc.)
SoundManager    → Web Audio API tone synthesis (swap in real files later)
UIManager       → All DOM manipulation (cell pool, overlays, score, status)
GameEngine      → Core game state, update loop, collision detection, lifecycle
InputHandler    → Keyboard event wiring → GameEngine.queueDirection()
wireButtons()   → Click handler wiring for all UI buttons
init()          → DOMContentLoaded bootstrap
```

### Key Performance Decisions
- **DOM cell pool** — Snake segments reuse existing `<div>` nodes; no create/destroy per tick.
- **CSS `transform: translate()`** — Position updates avoid layout reflow (GPU-composited).
- **`setInterval` loop** — Simpler than `requestAnimationFrame` for discrete-grid games; properly cleared on pause/restart/death.
- **Direction buffering** — `nextDir` is applied once per tick to prevent multi-step direction changes from a burst of key events.

---

## 🔮 Future Improvements

The following features are planned and architecturally easy to add:

### 🎵 Sound Effects
Replace `SoundManager.playTone()` with `new Audio('./sounds/eat.mp3').play()` calls once audio files are available.

### 📱 Touch Controls
Add a D-pad overlay for mobile, or detect swipe gestures with `touchstart`/`touchend` events, forwarding them to `GameEngine.queueDirection()`.

### 🎨 Multiple Themes
Extend `CONFIG` with a `THEMES` object and swap CSS custom properties (`--neon-green`, etc.) at runtime.

### 🧱 Obstacles
Add a `walls` array to the game state, spawn random wall segments, and check them in the `_collidesWithWall()` function.

### ⚡ Power-Ups
Introduce a secondary item type (speed boost, score multiplier, invincibility) with a timed effect system alongside the food spawn logic.

### ✖️ Multiplier Mode
Add a combo counter that increases the score multiplier for consecutive food items eaten without dying.

### 🏅 Leaderboard
POST scores to a serverless function (e.g., Cloudflare Workers, Vercel Edge) and display a top-10 list fetched on game-over.

### 🌐 Multiplayer
Use WebSockets to sync two snakes on the same board in real time.

---

## 📄 License

MIT © NeonSnake. Free to use, modify, and distribute.
