/**
 * engine-adapter.js
 * ─────────────────────────────────────────────────────────────────
 * Provides a unified API for game.js regardless of whether the
 * C++ WebAssembly engine is available or not.
 *
 * MODE 1 — WASM:  Loads engine.js (compiled from wasm_bridge.cpp).
 *                 All rules run as native C++ in the browser.
 * MODE 2 — JS:    JSGameEngine class below — a 1-to-1 JavaScript
 *                 port of GameEngine.h. Identical rules, always.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// ════════════════════════════════════════════════════════════════
//  JS ENGINE  — mirrors GameEngine.h exactly
//  Difficulties: Easy 10x10/15, Medium 18x18/60, Hard 24x24/120
// ════════════════════════════════════════════════════════════════
class JSGameEngine {
  static PRESETS = [
    { rows:10, cols:10, mines:15  },   // 0 Easy
    { rows:18, cols:18, mines:60  },   // 1 Medium
    { rows:24, cols:24, mines:120 },   // 2 Hard
  ];

  constructor() { this._initState(0); }

  _initState(diff) {
    const p = JSGameEngine.PRESETS[diff] || JSGameEngine.PRESETS[0];
    this._rows        = p.rows;
    this._cols        = p.cols;
    this._totalMines  = p.mines;
    this._foundMines  = 0;   // correctly flagged mines
    this._totalFlags  = 0;   // ALL flags placed
    this._revealedSafe= 0;
    this._firstClick  = true;
    this._state       = 0;   // 0=Idle,1=Playing,2=Over,3=Won
    this._mineSet     = new Set();
    this._changed     = [];
    this._grid        = Array.from({ length: p.rows }, () =>
      Array.from({ length: p.cols }, () => ({
        isMine: false, isRevealed: false, isFlagged: false,
        isWrongFlag: false, isExploded: false, adjacent: 0
      }))
    );
  }

  init(diff) { this._initState(diff); }

  // ── Left click ───────────────────────────────────────────────
  leftClick(r, c) {
    this._changed = [];
    if (this._state === 2 || this._state === 3) return 0;
    const cell = this._grid[r][c];
    if (cell.isRevealed || cell.isFlagged) return 0;

    if (this._firstClick) {
      this._placeMines(r, c);
      this._firstClick = false;
      this._state = 1;
    }

    let flags = 0;
    if (cell.isMine) {
      cell.isExploded = true;
      cell.isRevealed = true;
      this._changed.push([r, c]);
      // Expose all other mines + mark wrong flags
      for (let rr = 0; rr < this._rows; rr++)
        for (let cc = 0; cc < this._cols; cc++) {
          const cl = this._grid[rr][cc];
          if (cl.isMine && !cl.isRevealed && !cl.isFlagged) {
            cl.isRevealed = true;
            this._changed.push([rr, cc]);
          }
          if (cl.isFlagged && !cl.isMine) cl.isWrongFlag = true;
        }
      flags |= 1;
      this._state = 2;
    } else {
      this._flood(r, c);
      if (this._revealedSafe === this._safeCells()) {
        flags |= 2;
        this._state = 3;
      }
    }
    return flags;
  }

  // ── Right click ──────────────────────────────────────────────
  rightClick(r, c) {
    if (this._state === 2 || this._state === 3) return 0;
    if (this._firstClick) return 0;
    const cell = this._grid[r][c];
    if (cell.isRevealed) return 0;

    if (cell.isFlagged) {
      cell.isFlagged = false;
      this._totalFlags--;
      if (cell.isMine) { this._foundMines--; return -1; }
      return 0;
    } else {
      cell.isFlagged = true;
      this._totalFlags++;
      if (cell.isMine) { this._foundMines++; return +1; }
      return 0;
    }
  }

  // ── Packed cell (same bit layout as C++ wasm_bridge) ─────────
  getCell(r, c) {
    const cell = this._grid[r][c];
    let p = cell.adjacent & 0xF;
    if (cell.isRevealed)  p |= (1 << 4);
    if (cell.isFlagged)   p |= (1 << 5);
    if (cell.isMine)      p |= (1 << 6);
    if (cell.isWrongFlag) p |= (1 << 7);
    if (cell.isExploded)  p |= (1 << 8);
    return p;
  }

  // ── Accessors ────────────────────────────────────────────────
  get rows()          { return this._rows; }
  get cols()          { return this._cols; }
  get totalMines()    { return this._totalMines; }
  get foundMines()    { return this._foundMines; }
  get totalFlags()    { return this._totalFlags; }
  get state()         { return this._state; }
  get firstClick()    { return this._firstClick; }
  get changedCount()  { return this._changed.length; }
  changedR(i)         { return this._changed[i][0]; }
  changedC(i)         { return this._changed[i][1]; }
  _safeCells()        { return this._rows * this._cols - this._totalMines; }

  // ── Private ──────────────────────────────────────────────────
  _nb(r, c) {
    const n = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r+dr, nc = c+dc;
        if (nr >= 0 && nr < this._rows && nc >= 0 && nc < this._cols)
          n.push([nr, nc]);
      }
    return n;
  }

  _placeMines(safeR, safeC) {
    const ok = (r, c) => Math.abs(r-safeR) <= 1 && Math.abs(c-safeC) <= 1;
    let placed = 0;
    while (placed < this._totalMines) {
      const r = Math.floor(Math.random() * this._rows);
      const c = Math.floor(Math.random() * this._cols);
      const idx = r * this._cols + c;
      if (!ok(r, c) && !this._mineSet.has(idx)) {
        this._mineSet.add(idx);
        this._grid[r][c].isMine = true;
        placed++;
      }
    }
    for (let r = 0; r < this._rows; r++)
      for (let c = 0; c < this._cols; c++) {
        if (this._grid[r][c].isMine) continue;
        let cnt = 0;
        this._nb(r, c).forEach(([nr,nc]) => {
          if (this._grid[nr][nc].isMine) cnt++;
        });
        this._grid[r][c].adjacent = cnt;
      }
  }

  _flood(r, c) {
    const cell = this._grid[r][c];
    if (cell.isRevealed || cell.isFlagged) return;
    cell.isRevealed = true;
    this._revealedSafe++;
    this._changed.push([r, c]);
    if (cell.adjacent === 0)
      this._nb(r, c).forEach(([nr, nc]) => this._flood(nr, nc));
  }
}

// ════════════════════════════════════════════════════════════════
//  ENGINE ADAPTER  —  unified API for game.js
// ════════════════════════════════════════════════════════════════
class EngineAdapter {
  constructor() {
    this._wasm = null;
    this._js   = null;
    this._mode = 'js';
  }

  async load() {
    if (typeof MinesweeperEngine !== 'undefined') {
      try {
        this._wasm = await MinesweeperEngine();
        this._mode = 'wasm';
        console.log('[Engine] Running C++ via WebAssembly');
      } catch(e) {
        console.warn('[Engine] WASM failed, using JS engine:', e.message);
      }
    }
    if (this._mode !== 'wasm') {
      this._js   = new JSGameEngine();
      this._mode = 'js';
      console.log('[Engine] Running JS fallback (same rules as C++ GameEngine.h)');
    }
    return this;
  }

  newGame(diff) {
    if (this._mode === 'wasm') this._wasm._ms_init(diff);
    else                        this._js.init(diff);
  }

  leftClick(r, c) {
    let flags, count;
    if (this._mode === 'wasm') {
      flags = this._wasm._ms_left_click(r, c);
      count = this._wasm._ms_changed_count();
    } else {
      flags = this._js.leftClick(r, c);
      count = this._js.changedCount;
    }
    const changed = [];
    for (let i = 0; i < count; i++) {
      const rr = this._mode === 'wasm' ? this._wasm._ms_changed_r(i) : this._js.changedR(i);
      const cc = this._mode === 'wasm' ? this._wasm._ms_changed_c(i) : this._js.changedC(i);
      changed.push([rr, cc]);
    }
    return { hitMine: !!(flags & 1), won: !!(flags & 2), changed };
  }

  rightClick(r, c) {
    return this._mode === 'wasm'
      ? this._wasm._ms_right_click(r, c)
      : this._js.rightClick(r, c);
  }

  getCell(r, c) {
    const p = this._mode === 'wasm'
      ? this._wasm._ms_get_cell(r, c)
      : this._js.getCell(r, c);
    return {
      adjacent:    p & 0xF,
      isRevealed:  !!(p & (1<<4)),
      isFlagged:   !!(p & (1<<5)),
      isMine:      !!(p & (1<<6)),
      isWrongFlag: !!(p & (1<<7)),
      isExploded:  !!(p & (1<<8)),
    };
  }

  get rows()       { return this._mode==='wasm' ? this._wasm._ms_get_rows()        : this._js.rows; }
  get cols()       { return this._mode==='wasm' ? this._wasm._ms_get_cols()        : this._js.cols; }
  get totalMines() { return this._mode==='wasm' ? this._wasm._ms_get_total_mines() : this._js.totalMines; }
  get foundMines() { return this._mode==='wasm' ? this._wasm._ms_get_found()       : this._js.foundMines; }
  get totalFlags() { return this._mode==='wasm' ? this._wasm._ms_get_total_flags() : this._js.totalFlags; }
  get state()      { return this._mode==='wasm' ? this._wasm._ms_get_state()       : this._js.state; }
  get firstClick() { return this._mode==='wasm' ? !!(this._wasm._ms_get_first_click()) : this._js.firstClick; }
  get mode()       { return this._mode; }
}

window.EngineAdapter = EngineAdapter;
