/**
 * NeonSnake — script.js
 * ──────────────────────────────────────────────────────────────────────────
 * A fully self-contained, modular Snake game engine.
 * No external libraries. No canvas. Pure DOM + requestAnimationFrame loop.
 *
 * Architecture
 * ────────────
 *  CONFIG          → Immutable game constants
 *  State           → Single mutable state object (managed by GameEngine)
 *  SoundManager    → Placeholder audio API (stubbed for future sound files)
 *  UIManager       → All DOM reads/writes are centralised here
 *  GameEngine      → Core update loop, collision detection, game lifecycle
 *  InputHandler    → Keyboard event wiring
 *  init()          → Bootstrap on DOMContentLoaded
 * ──────────────────────────────────────────────────────────────────────────
 */

"use strict";

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG
   Immutable constants. Change these to tweak gameplay globally.
═══════════════════════════════════════════════════════════════════════════ */
const CONFIG = Object.freeze({
  /** Number of cells horizontally. */
  COLS: 20,
  /** Number of cells vertically. */
  ROWS: 20,
  /** Visual pixel size of each cell (must match --cell-size CSS var). */
  CELL_SIZE: 20, // updated responsively

  /**
   * Difficulty settings:
   *   intervalMs  — game tick in milliseconds (lower = faster)
   *   scoreMulti  — score multiplier per food eaten
   */
  DIFFICULTY: {
    easy:   { intervalMs: 160, scoreMulti: 1 },
    medium: { intervalMs: 110, scoreMulti: 1.5 },
    hard:   { intervalMs: 70,  scoreMulti: 2.5 },
  },

  /** localStorage key for persisting the high score. */
  HIGH_SCORE_KEY: "neonsnake_highscore_v1",

  /** Base points awarded per food item eaten (before difficulty multiplier). */
  BASE_SCORE_PER_FOOD: 10,

  /** Starting snake length (number of body segments). */
  INITIAL_LENGTH: 4,

  /** Direction vectors. */
  DIRECTIONS: Object.freeze({
    UP:    { x:  0, y: -1 },
    DOWN:  { x:  0, y:  1 },
    LEFT:  { x: -1, y:  0 },
    RIGHT: { x:  1, y:  0 },
  }),

  /** Mapping from key codes to direction names. */
  KEY_MAP: Object.freeze({
    ArrowUp:    "UP",
    ArrowDown:  "DOWN",
    ArrowLeft:  "LEFT",
    ArrowRight: "RIGHT",
    KeyW:       "UP",
    KeyS:       "DOWN",
    KeyA:       "LEFT",
    KeyD:       "RIGHT",
  }),
});

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Returns a random integer in [min, max) exclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Checks whether two direction vectors are directly opposite.
 * Prevents the snake from instantly reversing into itself.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {boolean}
 */
function isOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

/**
 * Retrieve the computed CSS variable value for --cell-size from :root.
 * Returns an integer (pixels). Falls back to CONFIG.CELL_SIZE if unavailable.
 * @returns {number}
 */
function readCellSizeFromCSS() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--cell-size")
    .trim();
  return parseInt(raw, 10) || CONFIG.CELL_SIZE;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOUND MANAGER
   ─────────────────────────────────────────────────────────────────────────
   Placeholder implementations using the Web Audio API to generate simple
   tones. Swap `playTone()` for real audio file loading in a future update.
═══════════════════════════════════════════════════════════════════════════ */
const SoundManager = (() => {
  /** Lazily-created AudioContext shared across calls. */
  let _ctx = null;

  /**
   * Returns (or creates) the shared AudioContext.
   * Browsers require a user gesture before creating audio contexts.
   * @returns {AudioContext|null}
   */
  function _getContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _ctx;
  }

  /**
   * Plays a short synthesised tone.
   * @param {number} freq      - Frequency in Hz
   * @param {number} duration  - Duration in seconds
   * @param {string} [type]    - OscillatorType: 'sine'|'square'|'sawtooth'|'triangle'
   * @param {number} [gain]    - Volume 0–1
   */
  function playTone(freq, duration, type = "sine", gain = 0.15) {
    const ctx = _getContext();
    if (!ctx) return;

    try {
      const oscillator = ctx.createOscillator();
      const gainNode   = ctx.createGain();

      oscillator.type      = type;
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      // Quick fade-out to avoid clicks
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (_) {
      // Silently ignore audio errors — the game should never break because of sound
    }
  }

  return {
    /** Short positive blip — button click / UI interaction. */
    click() {
      playTone(600, 0.06, "square", 0.08);
    },

    /** Ascending two-tone chime — snake eats food. */
    eat() {
      playTone(520, 0.07, "sine", 0.12);
      setTimeout(() => playTone(780, 0.1, "sine", 0.10), 70);
    },

    /** Descending heavy hit — snake dies. */
    gameOver() {
      playTone(220, 0.12, "sawtooth", 0.18);
      setTimeout(() => playTone(130, 0.3, "sawtooth", 0.15), 120);
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   UI MANAGER
   ─────────────────────────────────────────────────────────────────────────
   All DOM reads and writes go through this module.
   The GameEngine must NEVER touch DOM elements directly.
═══════════════════════════════════════════════════════════════════════════ */
const UIManager = (() => {
  /* ── DOM Element References ────────────────────────────────────────── */
  const board         = document.getElementById("game-board");
  const scoreDisplay  = document.getElementById("score-display");
  const highScoreDisp = document.getElementById("high-score-display");
  const finalScore    = document.getElementById("final-score");
  const newHSBadge    = document.getElementById("new-highscore-badge");

  const overlayStart    = document.getElementById("overlay-start");
  const overlayPause    = document.getElementById("overlay-pause");
  const overlayGameover = document.getElementById("overlay-gameover");

  const statusBadge = document.getElementById("status-badge");
  const statusText  = document.getElementById("status-text");

  const btnPauseTop   = document.getElementById("btn-pause-top");
  const btnRestartTop = document.getElementById("btn-restart-top");

  /* ── Cell pool for efficient DOM reuse ────────────────────────────── */
  /**
   * Instead of destroying and recreating DOM nodes every tick, we maintain a
   * pool of <div> elements for snake segments and a single food element.
   * Elements are added/removed from the pool lazily.
   */
  /** @type {HTMLElement[]} Pool of snake segment divs (indexed by segment). */
  const _cellPool = [];
  /** @type {HTMLElement|null} The food element. */
  let _foodEl = null;

  /* ── Board Sizing ─────────────────────────────────────────────────── */
  let _cellSize = readCellSizeFromCSS();

  /**
   * Applies pixel dimensions to the board element based on grid size.
   * Called once on init and on window resize.
   */
  function resizeBoard() {
    _cellSize = readCellSizeFromCSS();
    const w = CONFIG.COLS * _cellSize;
    const h = CONFIG.ROWS * _cellSize;
    board.style.width  = `${w}px`;
    board.style.height = `${h}px`;
  }

  /* ── Cell Factory ─────────────────────────────────────────────────── */
  /**
   * Creates a new generic game cell div.
   * @returns {HTMLElement}
   */
  function _createCell() {
    const el = document.createElement("div");
    el.style.width      = `${_cellSize}px`;
    el.style.height     = `${_cellSize}px`;
    el.style.position   = "absolute";
    el.style.boxSizing  = "border-box";
    el.style.willChange = "transform"; // GPU hint
    return el;
  }

  /**
   * Positions an element using CSS transform (avoids layout reflow).
   * @param {HTMLElement} el
   * @param {number} x   - Grid column
   * @param {number} y   - Grid row
   */
  function _positionEl(el, x, y) {
    el.style.transform = `translate(${x * _cellSize}px, ${y * _cellSize}px)`;
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  return {

    /** Resize the board. Call on load and on resize. */
    resizeBoard,

    /**
     * Renders the entire snake using the cell pool.
     * Each segment is given a CSS class reflecting its role (head/body/tail).
     * @param {{ x: number, y: number }[]} segments - Snake body array (head first)
     */
    renderSnake(segments) {
      const len = segments.length;

      // Grow pool if needed
      while (_cellPool.length < len) {
        const el = _createCell();
        el.setAttribute("aria-hidden", "true");
        board.appendChild(el);
        _cellPool.push(el);
      }

      // Shrink pool if snake got shorter (shouldn't happen normally, but guard anyway)
      while (_cellPool.length > len) {
        const el = _cellPool.pop();
        if (el.parentNode) el.parentNode.removeChild(el);
      }

      // Update each segment
      for (let i = 0; i < len; i++) {
        const el  = _cellPool[i];
        const seg = segments[i];

        _positionEl(el, seg.x, seg.y);

        // Assign role-based class for styling
        el.className = "snake-cell " + (
          i === 0       ? "snake-head" :
          i === len - 1 ? "snake-tail" :
                          "snake-body"
        );
      }
    },

    /**
     * Renders or moves the food element.
     * @param {{ x: number, y: number }} pos
     */
    renderFood(pos) {
      if (!_foodEl) {
        // Create the food element once
        _foodEl = document.createElement("div");
        _foodEl.className = "food-cell";
        _foodEl.setAttribute("aria-hidden", "true");
        _foodEl.setAttribute("role", "img");
        _foodEl.setAttribute("aria-label", "Food");
        const inner = document.createElement("div");
        inner.className = "food-inner";
        _foodEl.appendChild(inner);
        board.appendChild(_foodEl);
      }
      _positionEl(_foodEl, pos.x, pos.y);
    },

    /**
     * Clears all rendered cells from the board and resets the pool.
     * Called when restarting.
     */
    clearBoard() {
      // Remove all pool cells
      _cellPool.forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      _cellPool.length = 0;

      // Remove food
      if (_foodEl && _foodEl.parentNode) {
        _foodEl.parentNode.removeChild(_foodEl);
      }
      _foodEl = null;
    },

    /**
     * Updates the score counter. Triggers a pop animation on change.
     * @param {number} score
     */
    updateScore(score) {
      const prev = scoreDisplay.textContent;
      const next = String(score);
      if (prev !== next) {
        scoreDisplay.textContent = next;
        // Trigger pop animation
        scoreDisplay.classList.remove("pop");
        void scoreDisplay.offsetWidth; // force reflow to restart animation
        scoreDisplay.classList.add("pop");
      }
    },

    /**
     * Updates the high score display.
     * @param {number} highScore
     */
    updateHighScore(highScore) {
      highScoreDisp.textContent = String(highScore);
    },

    /**
     * Shows the game-over overlay with final score and optional new-high-score badge.
     * @param {number} score
     * @param {boolean} isNewHighScore
     */
    showGameOver(score, isNewHighScore) {
      finalScore.textContent = String(score);
      overlayGameover.classList.remove("hidden");

      if (isNewHighScore) {
        newHSBadge.classList.remove("hidden");
      } else {
        newHSBadge.classList.add("hidden");
      }

      // Shake the board for dramatic effect
      board.classList.remove("shake");
      void board.offsetWidth;
      board.classList.add("shake");
    },

    /** Hides the game-over overlay. */
    hideGameOver() {
      overlayGameover.classList.add("hidden");
    },

    /** Shows the pause overlay. */
    showPause() {
      overlayPause.classList.remove("hidden");
    },

    /** Hides the pause overlay. */
    hidePause() {
      overlayPause.classList.add("hidden");
    },

    /** Shows the start (welcome) overlay. */
    showStart() {
      overlayStart.classList.remove("hidden");
    },

    /** Hides the start overlay. */
    hideStart() {
      overlayStart.classList.add("hidden");
    },

    /**
     * Updates the status badge.
     * @param {'idle'|'playing'|'paused'|'dead'} state
     */
    setStatus(state) {
      const labels = {
        idle:    "Ready",
        playing: "Playing",
        paused:  "Paused",
        dead:    "Game Over",
      };
      statusBadge.className = `status-badge ${state}`;
      statusText.textContent = labels[state] ?? "Ready";
    },

    /**
     * Toggles visibility of the top-bar action buttons.
     * @param {boolean} showPause   - Show the pause button
     * @param {boolean} showRestart - Show the restart button
     */
    setActionButtons(showPause, showRestart) {
      if (showPause) {
        btnPauseTop.classList.remove("hidden");
      } else {
        btnPauseTop.classList.add("hidden");
      }

      if (showRestart) {
        btnRestartTop.classList.remove("hidden");
      } else {
        btnRestartTop.classList.add("hidden");
      }
    },

    /**
     * Updates the Pause button label (Pause ↔ Resume).
     * @param {boolean} isPaused
     */
    setPauseButtonLabel(isPaused) {
      btnPauseTop.textContent = isPaused ? "Resume" : "Pause";
      btnPauseTop.setAttribute("aria-label", isPaused ? "Resume the game" : "Pause the game");
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   GAME ENGINE
   ─────────────────────────────────────────────────────────────────────────
   Owns all mutable game state. Coordinates the update loop.
═══════════════════════════════════════════════════════════════════════════ */
const GameEngine = (() => {

  /* ── Internal State ───────────────────────────────────────────────── */

  /** Current mutable state of the game. Reset by _resetState(). */
  let state = {
    /** @type {'idle'|'playing'|'paused'|'dead'} */
    phase: "idle",

    /** Snake body segments. Index 0 is the head. */
    /** @type {{ x: number, y: number }[]} */
    snake: [],

    /** Current movement direction vector. */
    dir: { ...CONFIG.DIRECTIONS.RIGHT },

    /**
     * Queued next direction — buffered so rapid key presses don't skip
     * the collision check before the next tick.
     * @type {{ x: number, y: number }|null}
     */
    nextDir: null,

    /** Food position. @type {{ x: number, y: number }|null} */
    food: null,

    /** Current numeric score. */
    score: 0,

    /** Whether the food was just eaten this tick (triggers growth). */
    ateFood: false,

    /** Active difficulty key. @type {'easy'|'medium'|'hard'} */
    difficulty: "easy",
  };

  /** High score is persisted separately from the per-game state. */
  let highScore = 0;

  /**
   * ID returned by setInterval — needed to clear/restart the loop.
   * @type {number|null}
   */
  let _intervalId = null;

  /* ── State Initialisation ─────────────────────────────────────────── */

  /**
   * Resets snake position, score, food, and direction.
   * Preserves `difficulty` (so the player doesn't have to re-select after restart).
   */
  function _resetState() {
    const startX = Math.floor(CONFIG.COLS / 2);
    const startY = Math.floor(CONFIG.ROWS / 2);

    // Build the initial snake pointing right
    const snake = [];
    for (let i = 0; i < CONFIG.INITIAL_LENGTH; i++) {
      snake.push({ x: startX - i, y: startY });
    }

    state.phase   = "playing";
    state.snake   = snake;
    state.dir     = { ...CONFIG.DIRECTIONS.RIGHT };
    state.nextDir = null;
    state.food    = null;
    state.score   = 0;
    state.ateFood = false;
    // `state.difficulty` is intentionally preserved across resets
  }

  /* ── Food Spawning ────────────────────────────────────────────────── */

  /**
   * Places food at a random cell not occupied by the snake.
   * Retries until a free cell is found (safe for typical board sizes).
   */
  function _spawnFood() {
    const snakeSet = new Set(state.snake.map(s => `${s.x},${s.y}`));

    let pos;
    let attempts = 0;
    do {
      pos = {
        x: randInt(0, CONFIG.COLS),
        y: randInt(0, CONFIG.ROWS),
      };
      attempts++;
      // Prevent infinite loop on a nearly-full board (extremely rare)
      if (attempts > CONFIG.COLS * CONFIG.ROWS) break;
    } while (snakeSet.has(`${pos.x},${pos.y}`));

    state.food = pos;
  }

  /* ── High Score ───────────────────────────────────────────────────── */

  /** Loads high score from localStorage. */
  function _loadHighScore() {
    const stored = parseInt(localStorage.getItem(CONFIG.HIGH_SCORE_KEY), 10);
    highScore = isNaN(stored) ? 0 : stored;
  }

  /**
   * Saves new high score if it exceeds the stored value.
   * @param {number} score
   * @returns {boolean} Whether a new high score was set.
   */
  function _saveHighScore(score) {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(CONFIG.HIGH_SCORE_KEY, String(highScore));
      return true;
    }
    return false;
  }

  /* ── Score Calculation ────────────────────────────────────────────── */

  /**
   * Calculates points earned for eating one food item, applying the
   * difficulty multiplier.
   * @returns {number}
   */
  function _calcScore() {
    const multi = CONFIG.DIFFICULTY[state.difficulty].scoreMulti;
    return Math.round(CONFIG.BASE_SCORE_PER_FOOD * multi);
  }

  /* ── Collision Detection ──────────────────────────────────────────── */

  /**
   * Checks whether a position collides with any snake body segment
   * (excluding a given ignore index — used to skip the current head position
   * before the move is committed, so we're checking the new head position).
   * @param {{ x: number, y: number }} pos
   * @returns {boolean}
   */
  function _collidesWithSnake(pos) {
    // We exclude the very last tail segment because it will have moved
    // by the time the new head lands there (unless growth is happening).
    const limit = state.ateFood ? state.snake.length : state.snake.length - 1;
    for (let i = 0; i < limit; i++) {
      if (state.snake[i].x === pos.x && state.snake[i].y === pos.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether a position is outside the board boundaries.
   * @param {{ x: number, y: number }} pos
   * @returns {boolean}
   */
  function _collidesWithWall(pos) {
    return (
      pos.x < 0 || pos.x >= CONFIG.COLS ||
      pos.y < 0 || pos.y >= CONFIG.ROWS
    );
  }

  /* ── Game Loop ────────────────────────────────────────────────────── */

  /**
   * Single game tick. Called by setInterval at the current difficulty speed.
   * Responsible for:
   *  1. Committing the buffered direction change
   *  2. Computing the new head position
   *  3. Running collision checks (wall + self)
   *  4. Checking food consumption
   *  5. Mutating the snake array
   *  6. Triggering UI render
   */
  function _tick() {
    if (state.phase !== "playing") return;

    /* 1. Commit buffered direction */
    if (state.nextDir && !isOpposite(state.nextDir, state.dir)) {
      state.dir = state.nextDir;
    }
    state.nextDir = null;

    /* 2. Compute new head */
    const head    = state.snake[0];
    const newHead = {
      x: head.x + state.dir.x,
      y: head.y + state.dir.y,
    };

    /* 3. Collision checks */
    if (_collidesWithWall(newHead) || _collidesWithSnake(newHead)) {
      _die();
      return;
    }

    /* 4. Food consumption check */
    state.ateFood =
      state.food !== null &&
      newHead.x === state.food.x &&
      newHead.y === state.food.y;

    if (state.ateFood) {
      state.score += _calcScore();
      SoundManager.eat();
      UIManager.updateScore(state.score);
      _spawnFood();
    }

    /* 5. Update snake array */
    state.snake.unshift(newHead); // Add new head at front
    if (!state.ateFood) {
      state.snake.pop();          // Remove tail (no growth)
    }

    /* 6. Render */
    UIManager.renderSnake(state.snake);
    UIManager.renderFood(state.food);
  }

  /**
   * Triggers death sequence:
   *  - Stops the game loop
   *  - Persists high score
   *  - Updates UI into game-over state
   */
  function _die() {
    state.phase = "dead";
    _stopLoop();

    const isNewHS = _saveHighScore(state.score);
    UIManager.updateHighScore(highScore);
    UIManager.setStatus("dead");
    UIManager.setActionButtons(false, false);
    UIManager.showGameOver(state.score, isNewHS);
    SoundManager.gameOver();
  }

  /* ── Loop Control ─────────────────────────────────────────────────── */

  /** Starts the interval-based game loop at the current difficulty speed. */
  function _startLoop() {
    _stopLoop(); // Safety — clear any existing interval
    const ms = CONFIG.DIFFICULTY[state.difficulty].intervalMs;
    _intervalId = setInterval(_tick, ms);
  }

  /** Clears the game loop interval. */
  function _stopLoop() {
    if (_intervalId !== null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  return {

    /** Initialises the engine: loads high score and sizes the board. */
    init() {
      _loadHighScore();
      UIManager.resizeBoard();
      UIManager.updateHighScore(highScore);
      UIManager.setStatus("idle");
      UIManager.showStart();
    },

    /** Starts a brand-new game from scratch. */
    start() {
      UIManager.clearBoard();
      UIManager.hideStart();
      UIManager.hideGameOver();
      UIManager.hidePause();

      _resetState();
      _spawnFood();

      UIManager.renderSnake(state.snake);
      UIManager.renderFood(state.food);
      UIManager.updateScore(0);
      UIManager.setStatus("playing");
      UIManager.setActionButtons(true, true);
      UIManager.setPauseButtonLabel(false);

      _startLoop();
    },

    /** Toggles pause/resume. */
    togglePause() {
      if (state.phase === "playing") {
        state.phase = "paused";
        _stopLoop();
        UIManager.showPause();
        UIManager.setStatus("paused");
        UIManager.setPauseButtonLabel(true);
      } else if (state.phase === "paused") {
        state.phase = "playing";
        _startLoop();
        UIManager.hidePause();
        UIManager.setStatus("playing");
        UIManager.setPauseButtonLabel(false);
      }
    },

    /** Restarts the current game (same difficulty). */
    restart() {
      if (state.phase === "idle") {
        this.start();
        return;
      }
      UIManager.clearBoard();
      UIManager.hideGameOver();
      UIManager.hidePause();

      _stopLoop();
      _resetState();
      _spawnFood();

      UIManager.renderSnake(state.snake);
      UIManager.renderFood(state.food);
      UIManager.updateScore(0);
      UIManager.setStatus("playing");
      UIManager.setPauseButtonLabel(false);
      UIManager.setActionButtons(true, true);

      _startLoop();
    },

    /** Returns to the main menu / welcome screen. */
    returnToMenu() {
      _stopLoop();
      state.phase = "idle";

      UIManager.clearBoard();
      UIManager.hideGameOver();
      UIManager.hidePause();
      UIManager.setStatus("idle");
      UIManager.updateScore(0);
      UIManager.setActionButtons(false, false);
      UIManager.showStart();
    },

    /**
     * Buffers a direction change from a keypress.
     * The change is applied at the next game tick to prevent same-tick
     * double-moves.
     * @param {string} dirName - One of 'UP'|'DOWN'|'LEFT'|'RIGHT'
     */
    queueDirection(dirName) {
      if (state.phase !== "playing") return;

      const newDir = CONFIG.DIRECTIONS[dirName];
      if (!newDir) return;

      // Disallow reversal into self
      if (isOpposite(newDir, state.dir)) return;

      state.nextDir = { ...newDir };
    },

    /**
     * Changes difficulty. Only effective when not actively playing.
     * @param {'easy'|'medium'|'hard'} level
     */
    setDifficulty(level) {
      if (!CONFIG.DIFFICULTY[level]) return;
      state.difficulty = level;
    },

    /** Returns current game phase for external checks. */
    getPhase() {
      return state.phase;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   INPUT HANDLER
   ─────────────────────────────────────────────────────────────────────────
   Wires keyboard events to GameEngine. Centralised here to avoid polluting
   the engine with browser APIs.
═══════════════════════════════════════════════════════════════════════════ */
const InputHandler = (() => {

  /**
   * Keys that should be prevented from default browser action
   * (e.g., arrow keys scrolling the page).
   */
  const PREVENT_DEFAULTS = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Space", "KeyP",
  ]);

  /**
   * Handles keydown events. Maps key codes to engine actions.
   * @param {KeyboardEvent} e
   */
  function _onKeyDown(e) {
    // Prevent browser scroll on game keys
    if (PREVENT_DEFAULTS.has(e.code)) {
      e.preventDefault();
    }

    // Direction controls
    if (CONFIG.KEY_MAP[e.code]) {
      GameEngine.queueDirection(CONFIG.KEY_MAP[e.code]);
      return;
    }

    const phase = GameEngine.getPhase();

    // P key — pause/resume
    if (e.code === "KeyP") {
      if (phase === "playing" || phase === "paused") {
        GameEngine.togglePause();
        SoundManager.click();
      }
      return;
    }

    // R key — restart
    if (e.code === "KeyR") {
      if (phase === "playing" || phase === "paused" || phase === "dead") {
        GameEngine.restart();
        SoundManager.click();
      }
      return;
    }

    // Enter / Space — start or restart
    if (e.code === "Enter" || e.code === "Space") {
      if (phase === "idle") {
        GameEngine.start();
        SoundManager.click();
      } else if (phase === "dead") {
        GameEngine.restart();
        SoundManager.click();
      } else if (phase === "paused") {
        GameEngine.togglePause();
        SoundManager.click();
      }
    }
  }

  return {
    /** Attaches the global keyboard listener. */
    attach() {
      document.addEventListener("keydown", _onKeyDown);
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTON WIRING
   ─────────────────────────────────────────────────────────────────────────
   Connects all UI buttons to GameEngine + SoundManager.
   Kept separate from InputHandler for clarity.
═══════════════════════════════════════════════════════════════════════════ */
function wireButtons() {
  /* ── Difficulty buttons ─────────────────────────────────────────── */
  const diffButtons = {
    easy:   document.getElementById("diff-easy"),
    medium: document.getElementById("diff-medium"),
    hard:   document.getElementById("diff-hard"),
  };

  Object.entries(diffButtons).forEach(([level, btn]) => {
    btn.addEventListener("click", () => {
      // Cannot change difficulty mid-game
      if (GameEngine.getPhase() === "playing") return;

      // Update active styling and aria-pressed
      Object.values(diffButtons).forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");

      GameEngine.setDifficulty(level);
      SoundManager.click();
    });
  });

  /* ── Start button ──────────────────────────────────────────────── */
  document.getElementById("btn-start").addEventListener("click", () => {
    GameEngine.start();
    SoundManager.click();
  });

  /* ── Pause overlay Resume button ───────────────────────────────── */
  document.getElementById("btn-resume").addEventListener("click", () => {
    GameEngine.togglePause();
    SoundManager.click();
  });

  /* ── Game-over overlay buttons ─────────────────────────────────── */
  document.getElementById("btn-restart").addEventListener("click", () => {
    GameEngine.restart();
    SoundManager.click();
  });

  document.getElementById("btn-mainmenu").addEventListener("click", () => {
    GameEngine.returnToMenu();
    SoundManager.click();
  });

  /* ── Top-bar Pause button ─────────────────────────────────────── */
  document.getElementById("btn-pause-top").addEventListener("click", () => {
    GameEngine.togglePause();
    SoundManager.click();
  });

  /* ── Top-bar Restart button ───────────────────────────────────── */
  document.getElementById("btn-restart-top").addEventListener("click", () => {
    GameEngine.restart();
    SoundManager.click();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESPONSIVE RESIZE HANDLER
   ─────────────────────────────────────────────────────────────────────────
   Recomputes cell size on window resize (the CSS var changes at breakpoints).
   Uses debouncing to avoid thrashing during continuous resize events.
═══════════════════════════════════════════════════════════════════════════ */
function attachResizeHandler() {
  let _resizeTimer = null;

  window.addEventListener("resize", () => {
    if (_resizeTimer) clearTimeout(_resizeTimer);

    _resizeTimer = setTimeout(() => {
      // Only safe to resize when not actively playing (avoids visual glitch)
      UIManager.resizeBoard();
    }, 150);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOTSTRAP
   ─────────────────────────────────────────────────────────────────────────
   DOMContentLoaded guard ensures all elements exist before wiring.
═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // 1. Wire all button click handlers
  wireButtons();

  // 2. Attach keyboard input handler
  InputHandler.attach();

  // 3. Attach responsive resize handler
  attachResizeHandler();

  // 4. Initialise the engine (loads high score, sizes board, shows start screen)
  GameEngine.init();
});
