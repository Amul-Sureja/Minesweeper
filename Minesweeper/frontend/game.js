/**
 * game.js  —  Minesweeper Frontend Controller
 * ─────────────────────────────────────────────────────────────────
 * Responsibilities:
 *   • Auto-fit: calculates cell size so board always fits the screen
 *   • Board DOM building and per-cell updates
 *   • All animations: reveal wave, explosion, win sweep, flag bounce
 *   • HUD updates: Found Mines, Total Flags, Total Mines, Timer
 *   • Modal overlay for win/lose
 *   • Routes all clicks to EngineAdapter (C++ rules)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

// ── Difficulty configs ────────────────────────────────────────────
// Easy: 10×10 / 15 mines, Medium: 18×18 / 60 mines, Hard: 24×24 / 120
const DIFFS = [
  { rows:10, cols:10, mines:15,  label:'Easy 10×10'   },
  { rows:18, cols:18, mines:60,  label:'Med 18×18'    },
  { rows:24, cols:24, mines:120, label:'Hard 24×24'   },
];

// ── Number colours (matches image) ───────────────────────────────
const NUM_CLASS = ['','n1','n2','n3','n4','n5','n6','n7','n8'];

// ── Animation timing (ms) ─────────────────────────────────────────
const T_REVEAL   = 20;   // stagger between flooded reveal cells
const T_EXPLODE  = 16;   // stagger between mine reveals after loss
const T_WIN_CELL = 18;   // stagger between win-sweep cells

// ── State ─────────────────────────────────────────────────────────
let engine    = null;
let diff      = 0;        // active difficulty index
let foundCnt  = 0;        // mines correctly flagged
let flagsCnt  = 0;        // total flags placed (all, mine or not)
let timerSec  = 0;
let timerHnd  = null;
let cells     = [];       // 2D array of <div> elements
let animIds   = [];       // pending setTimeout ids

// ── DOM refs ──────────────────────────────────────────────────────
let boardEl, foundVal, flagsVal, timerVal, minesVal;
let faceBtn, statusBar, overlayEl, engTag;

// ════════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════════
async function boot() {
  boardEl   = document.getElementById('board');
  foundVal  = document.getElementById('found-val');
  flagsVal  = document.getElementById('flags-val');
  timerVal  = document.getElementById('timer-val');
  minesVal  = document.getElementById('mines-val');
  faceBtn   = document.getElementById('face-btn');
  statusBar = document.getElementById('status-bar');
  overlayEl = document.getElementById('overlay');
  engTag    = document.getElementById('engine-tag');

  // Load engine (WASM or JS fallback)
  engine = new EngineAdapter();
  await engine.load();
  if (engTag) engTag.textContent = engine.mode === 'wasm'
    ? '⚙ C++ WebAssembly'
    : '⚙ C++ Rules (JS)';

  // Difficulty buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      diff = parseInt(btn.dataset.d);
      newGame();
    });
  });

  // Face button
  faceBtn.addEventListener('click', newGame);

  // Modal play-again
  document.getElementById('modal-btn').addEventListener('click', () => {
    overlayEl.className = 'overlay';
    newGame();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') newGame();
    if (e.key === '1') document.querySelectorAll('.diff-btn')[0].click();
    if (e.key === '2') document.querySelectorAll('.diff-btn')[1].click();
    if (e.key === '3') document.querySelectorAll('.diff-btn')[2].click();
  });

  // Prevent right-click context menu on board
  boardEl.addEventListener('contextmenu', e => e.preventDefault());

  // Resize listener — recalculate cell size if window resizes
  window.addEventListener('resize', () => {
    if (engine) applyFitLayout();
  });

  newGame();
}

// ════════════════════════════════════════════════════════════════
//  AUTO-FIT LAYOUT
//  Calculates the largest cell size that fits the screen
// ════════════════════════════════════════════════════════════════
function applyFitLayout() {
  const d      = DIFFS[diff];
  const rows   = engine.rows || d.rows;
  const cols   = engine.cols || d.cols;

  // Available screen space
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Estimate header heights (title+diff+hud+status+hints = ~140px)
  const CHROME_H = 148;
  const CHROME_W = 20;   // shell padding left+right
  const BOARD_PAD = 12;  // board internal padding (5px each side + border)
  const GAP = 3;

  // Maximum cell size that fits both width and height
  const maxCellW = Math.floor((vw - CHROME_W - BOARD_PAD - (cols-1)*GAP) / cols);
  const maxCellH = Math.floor((vh - CHROME_H - BOARD_PAD - (rows-1)*GAP) / rows);

  // Clamp between 22px (min playable) and 42px (max comfortable)
  const cs = Math.max(22, Math.min(42, Math.min(maxCellW, maxCellH)));
  const fs = Math.max(10, Math.floor(cs * 0.42));
  const bv = cs >= 30 ? 3 : 2;
  const cg = cs >= 30 ? 3 : 2;

  // Apply CSS variables
  const root = document.documentElement;
  root.style.setProperty('--cs', cs + 'px');
  root.style.setProperty('--cg', cg + 'px');
  root.style.setProperty('--bv', bv + 'px');
  root.style.setProperty('--fs', fs + 'px');

  // Set board grid columns
  boardEl.style.gridTemplateColumns = `repeat(${cols}, ${cs}px)`;

  // Set shell width to exactly fit the board
  const shellW = cols * cs + (cols-1)*cg + BOARD_PAD + CHROME_W;
  document.getElementById('game-shell').style.width = shellW + 'px';
}

// ════════════════════════════════════════════════════════════════
//  NEW GAME
// ════════════════════════════════════════════════════════════════
function newGame() {
  // Cancel all pending animations
  animIds.forEach(clearTimeout);
  animIds = [];

  stopTimer();
  timerSec = 0;
  foundCnt = 0;
  flagsCnt = 0;

  engine.newGame(diff);

  // Reset HUD
  setVal(foundVal, 0, '000');
  setVal(flagsVal, 0, '000');
  setVal(timerVal, 0, '000');
  setVal(minesVal, 0, String(DIFFS[diff].mines).padStart(3,'0'));

  setFace('smile');
  overlayEl.className = 'overlay';
  statusBar.textContent = 'Left-click: reveal  ·  Right-click: flag';

  buildBoard();
}

// ════════════════════════════════════════════════════════════════
//  BUILD BOARD DOM
// ════════════════════════════════════════════════════════════════
function buildBoard() {
  // Apply auto-fit cell sizing first
  applyFitLayout();

  const rows = engine.rows;
  const cols = engine.cols;

  boardEl.innerHTML = '';
  cells = Array.from({ length: rows }, () => Array(cols));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const el = document.createElement('div');
      el.className = 'cell H';

      // Click handlers
      el.addEventListener('click',       ()  => handleLeft(r, c));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); handleRight(r, c); });

      // Hover ripple
      el.addEventListener('mouseenter', () => el.classList.add('hov'));
      el.addEventListener('mouseleave', () => el.classList.remove('hov'));

      // Touch: long-press = right click
      let touchTimer = null;
      el.addEventListener('touchstart', e => {
        e.preventDefault();
        touchTimer = setTimeout(() => { touchTimer=null; handleRight(r,c); }, 420);
      }, { passive: false });
      el.addEventListener('touchend', () => {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer=null; handleLeft(r,c); }
      });
      el.addEventListener('touchmove', () => {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer=null; }
      });

      boardEl.appendChild(el);
      cells[r][c] = el;
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  INPUT HANDLERS
// ════════════════════════════════════════════════════════════════
function handleLeft(r, c) {
  if (engine.state === 2 || engine.state === 3) return;

  const wasFirst = engine.firstClick;
  const result   = engine.leftClick(r, c);
  if (!result.changed.length) return;

  // Start timer on first real action
  if (wasFirst && engine.state === 1) startTimer();

  if (result.hitMine) {
    stopTimer();
    setFace('dead');
    statusBar.textContent = '💥 Mine hit! Press R or click 🙂 to restart.';
    animateExplosion(r, c, result.changed);
    schedule(() => showModal(false), result.changed.length * T_EXPLODE + 700);
  } else {
    animateReveal(result.changed);
    if (result.won) {
      stopTimer();
      setFace('cool');
      statusBar.textContent = '🏆 You cleared the field!';
      const delay = result.changed.length * T_REVEAL + 80;
      schedule(() => {
        animateWinSweep();
        schedule(() => showModal(true), engine.rows * engine.cols * T_WIN_CELL + 500);
      }, delay);
    }
  }
}

function handleRight(r, c) {
  if (engine.state === 2 || engine.state === 3) return;
  if (engine.firstClick) return;  // no flags before mines placed

  const delta = engine.rightClick(r, c);

  // Update counters
  foundCnt += delta;
  if (delta === 1)       flagsCnt++;
  else if (delta === -1) flagsCnt--;
  else {
    // Flag on safe cell
    const cell = engine.getCell(r, c);
    if (cell.isFlagged)  flagsCnt++;
    else                  flagsCnt--;
  }

  foundCnt = Math.max(0, foundCnt);
  flagsCnt  = Math.max(0, flagsCnt);

  // Sync with engine's total flags (most reliable source)
  flagsCnt = engine.totalFlags;
  foundCnt = engine.foundMines;

  setVal(foundVal, foundCnt, String(foundCnt).padStart(3,'0'));
  setVal(flagsVal, flagsCnt, String(flagsCnt).padStart(3,'0'));

  updateCell(r, c);

  // Flag bounce animation
  const el = cells[r][c];
  const cell2 = engine.getCell(r, c);
  if (cell2.isFlagged) {
    el.classList.remove('anim-flag');
    void el.offsetWidth;
    el.classList.add('anim-flag');
    el.addEventListener('animationend', () => el.classList.remove('anim-flag'), { once:true });
  }
}

// ════════════════════════════════════════════════════════════════
//  CELL DISPLAY UPDATE
// ════════════════════════════════════════════════════════════════
function updateCell(r, c) {
  const el   = cells[r][c];
  const cell = engine.getCell(r, c);
  const ev   = (r + c) % 2 === 0;

  // Clear all state classes and content
  el.className = 'cell';
  el.innerHTML  = '';
  el.style.color = '';

  if (cell.isExploded) {
    el.classList.add('EX');
    el.innerHTML = mineSVG('rgba(255,255,255,0.95)');
  } else if (cell.isRevealed && cell.isMine) {
    el.classList.add('R', 'MS', ev ? 'ev' : 'od');
    el.innerHTML = mineSVG('#2a1000');
  } else if (cell.isRevealed) {
    el.classList.add('R', ev ? 'ev' : 'od');
    if (cell.adjacent > 0) {
      el.classList.add(NUM_CLASS[cell.adjacent]);
      el.textContent = cell.adjacent;
    }
  } else if (cell.isWrongFlag) {
    el.classList.add('WF', 'R', ev ? 'ev' : 'od');
    el.innerHTML = wrongFlagSVG();
  } else if (cell.isFlagged) {
    el.classList.add('F');
    el.innerHTML = flagSVG();
  } else {
    el.classList.add('H');
  }
}

// ════════════════════════════════════════════════════════════════
//  ANIMATIONS
// ════════════════════════════════════════════════════════════════

// Staggered reveal wave
function animateReveal(changed) {
  changed.forEach(([r, c], i) => {
    schedule(() => {
      updateCell(r, c);
      const el = cells[r][c];
      el.classList.add('anim-reveal');
      el.addEventListener('animationend', () => el.classList.remove('anim-reveal'), { once:true });
    }, i * T_REVEAL);
  });
}

// Explosion: hit cell first, then mines expand outward
function animateExplosion(hitR, hitC, changed) {
  // Hit cell
  updateCell(hitR, hitC);
  cells[hitR][hitC].classList.add('anim-explode');

  // Other mines sorted by distance from hit
  const rest = changed.filter(([r,c]) => !(r===hitR && c===hitC));
  rest.sort((a,b) =>
    Math.hypot(a[0]-hitR, a[1]-hitC) - Math.hypot(b[0]-hitR, b[1]-hitC)
  );
  rest.forEach(([r, c], i) => {
    schedule(() => {
      updateCell(r, c);
      cells[r][c].classList.add('anim-mine');
    }, 200 + i * T_EXPLODE);
  });
}

// Win sweep — diagonal wave from top-left
function animateWinSweep() {
  const rows = engine.rows, cols = engine.cols;
  const order = [];
  for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) order.push([r,c]);
  order.sort((a,b) => (a[0]+a[1]) - (b[0]+b[1]));
  order.forEach(([r,c], i) => {
    schedule(() => cells[r][c].classList.add('anim-win'), i * T_WIN_CELL);
  });
}

// ════════════════════════════════════════════════════════════════
//  MODAL OVERLAY
// ════════════════════════════════════════════════════════════════
function showModal(won) {
  overlayEl.className = 'overlay show ' + (won ? 'overlay-win' : 'overlay-lose');
  document.getElementById('modal-icon').textContent  = won ? '🎉' : '💥';
  document.getElementById('modal-title').textContent = won ? 'Field Cleared!' : 'Mine Hit!';
  document.getElementById('modal-sub').textContent   = won
    ? 'Congratulations! All safe cells revealed.'
    : 'You triggered a mine. Better luck next time!';

  // Stats grid
  document.getElementById('ms-time').textContent  = timerSec + 's';
  document.getElementById('ms-found').textContent = foundCnt + '/' + engine.totalMines;
  document.getElementById('ms-flags').textContent = flagsCnt + ' placed';
  document.getElementById('ms-diff').textContent  = DIFFS[diff].label;

  document.getElementById('ms-time').style.color  = 'var(--timer-col)';
  document.getElementById('ms-found').style.color = won ? '#40e080' : 'var(--found-col)';
  document.getElementById('ms-flags').style.color = 'var(--flags-col)';
  document.getElementById('ms-diff').style.color  = 'var(--hud-accent)';
}

// ════════════════════════════════════════════════════════════════
//  HUD HELPERS
// ════════════════════════════════════════════════════════════════
function setVal(el, _n, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  el.addEventListener('animationend', () => el.classList.remove('pulse'), { once:true });
}

function setFace(s) {
  const map = { smile:'🙂', dead:'😵', cool:'😎', wow:'😮' };
  if (faceBtn) faceBtn.textContent = map[s] || '🙂';
}

// ════════════════════════════════════════════════════════════════
//  TIMER
// ════════════════════════════════════════════════════════════════
function startTimer() {
  stopTimer();
  timerHnd = setInterval(() => {
    timerSec = Math.min(999, timerSec + 1);
    if (timerVal) timerVal.textContent = String(timerSec).padStart(3,'0');
  }, 1000);
}
function stopTimer() {
  if (timerHnd) { clearInterval(timerHnd); timerHnd = null; }
}

// ════════════════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════════════════
function schedule(fn, ms) {
  const id = setTimeout(fn, ms);
  animIds.push(id);
  return id;
}

// ── SVG helpers ───────────────────────────────────────────────────
function mineSVG(bodyColor = '#1a0a00') {
  const spikes = [0,45,90,135,180,225,270,315].map(a => {
    const r = a * Math.PI / 180;
    const x1=(12+6.2*Math.cos(r)).toFixed(1), y1=(12+6.2*Math.sin(r)).toFixed(1);
    const x2=(12+9.4*Math.cos(r)).toFixed(1), y2=(12+9.4*Math.sin(r)).toFixed(1);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${bodyColor}" stroke-width="1.8" stroke-linecap="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 24 24" width="14" height="14" style="display:block">
    <circle cx="12" cy="12" r="5.4" fill="${bodyColor}"/>
    ${spikes}
    <circle cx="9.8" cy="9.8" r="1.8" fill="rgba(255,255,255,0.38)"/>
  </svg>`;
}

function flagSVG() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" style="display:block">
    <line x1="7" y1="2" x2="7" y2="22" stroke="#7a4a20" stroke-width="2" stroke-linecap="round"/>
    <polygon points="7,3 19,8.5 7,14" fill="#e03030"/>
    <line x1="5" y1="22" x2="9" y2="22" stroke="#7a4a20" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function wrongFlagSVG() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" style="display:block">
    <line x1="7" y1="2" x2="7" y2="22" stroke="#7a4a20" stroke-width="2" stroke-linecap="round"/>
    <polygon points="7,3 19,8.5 7,14" fill="#e03030" opacity="0.35"/>
    <line x1="5" y1="22" x2="9" y2="22" stroke="#7a4a20" stroke-width="2" stroke-linecap="round"/>
    <line x1="3" y1="3" x2="21" y2="21" stroke="red" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="21" y1="3" x2="3"  y2="21" stroke="red" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

// ── Start when DOM ready ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
