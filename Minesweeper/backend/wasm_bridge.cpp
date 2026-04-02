// ================================================================
//  wasm_bridge.cpp  —  Emscripten WebAssembly Bridge
//  ----------------------------------------------------------------
//  Exports flat C functions that JavaScript calls via ccall/cwrap.
//  All actual game rules are in GameEngine.h.
//
//  COMPILE COMMAND:
//    emcc wasm_bridge.cpp -o ../frontend/engine.js \
//      -s EXPORTED_FUNCTIONS="['_ms_init','_ms_left_click',
//        '_ms_right_click','_ms_get_cell','_ms_get_state',
//        '_ms_get_found','_ms_get_total_flags',
//        '_ms_get_rows','_ms_get_cols','_ms_get_total_mines',
//        '_ms_changed_count','_ms_changed_r','_ms_changed_c',
//        '_ms_get_first_click']" \
//      -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
//      -s MODULARIZE=1 \
//      -s EXPORT_NAME="MinesweeperEngine" \
//      -s ALLOW_MEMORY_GROWTH=1 \
//      -s ENVIRONMENT="web" \
//      --std=c++17 -O2
// ================================================================

#include "GameEngine.h"
#include <emscripten/emscripten.h>

static GameEngine engine;

extern "C" {

// 0=Easy(10x10,15), 1=Medium(18x18,60), 2=Hard(24x24,120)
EMSCRIPTEN_KEEPALIVE
void ms_init(int diff) {
    switch (diff) {
        case 1:  engine.init(GameEngine::MEDIUM); break;
        case 2:  engine.init(GameEngine::HARD);   break;
        default: engine.init(GameEngine::EASY);   break;
    }
}

// Returns: bit0=hitMine, bit1=won
EMSCRIPTEN_KEEPALIVE
int ms_left_click(int r, int c) {
    auto res = engine.leftClick(r, c);
    int flags = 0;
    if (res.hitMine) flags |= 1;
    if (res.won)     flags |= 2;
    return flags;
}

// Returns: +1, -1, or 0
EMSCRIPTEN_KEEPALIVE
int ms_right_click(int r, int c) {
    return engine.rightClick(r, c);
}

// Packed cell: bits 0-3=adjacent, 4=revealed, 5=flagged,
//              6=mine, 7=wrongFlag, 8=exploded
EMSCRIPTEN_KEEPALIVE
int ms_get_cell(int r, int c) {
    const Cell& cell = engine.at(r, c);
    int p = cell.adjacent & 0xF;
    if (cell.isRevealed)  p |= (1<<4);
    if (cell.isFlagged)   p |= (1<<5);
    if (cell.isMine)      p |= (1<<6);
    if (cell.isWrongFlag) p |= (1<<7);
    if (cell.isExploded)  p |= (1<<8);
    return p;
}

EMSCRIPTEN_KEEPALIVE int ms_get_rows()        { return engine.rows(); }
EMSCRIPTEN_KEEPALIVE int ms_get_cols()        { return engine.cols(); }
EMSCRIPTEN_KEEPALIVE int ms_get_total_mines() { return engine.totalMines(); }
EMSCRIPTEN_KEEPALIVE int ms_get_found()       { return engine.foundMines(); }
EMSCRIPTEN_KEEPALIVE int ms_get_total_flags() { return engine.totalFlags(); }
EMSCRIPTEN_KEEPALIVE int ms_get_state()       { return static_cast<int>(engine.state()); }
EMSCRIPTEN_KEEPALIVE int ms_get_first_click() { return engine.firstClick() ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int ms_changed_count()   { return engine.changedCount(); }
EMSCRIPTEN_KEEPALIVE int ms_changed_r(int i)  { return engine.changedR(i); }
EMSCRIPTEN_KEEPALIVE int ms_changed_c(int i)  { return engine.changedC(i); }

} // extern "C"
