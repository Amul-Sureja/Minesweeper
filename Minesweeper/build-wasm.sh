#!/usr/bin/env bash
# ================================================================
#  build-wasm.sh  —  Compile C++ backend to WebAssembly
#  ----------------------------------------------------------------
#  Run this to get the actual C++ code running in the browser.
#  Without this, the game still works via the JS fallback engine
#  (engine-adapter.js) which implements identical rules.
#
#  PREREQUISITES:
#    Emscripten SDK — https://emscripten.org/docs/getting_started
#
#  INSTALL EMSCRIPTEN:
#    git clone https://github.com/emscripten-core/emsdk.git
#    cd emsdk
#    ./emsdk install latest
#    ./emsdk activate latest
#    source ./emsdk_env.sh     # add to ~/.bashrc for persistence
#
#  THEN RUN:
#    chmod +x build-wasm.sh
#    ./build-wasm.sh
# ================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

echo ""
echo "==================================================================="
echo "  Building C++ Minesweeper Engine → WebAssembly"
echo "==================================================================="
echo ""

emcc "$BACKEND/wasm_bridge.cpp" \
  -I "$BACKEND" \
  -o "$FRONTEND/engine.js" \
  -s EXPORTED_FUNCTIONS="['_ms_init','_ms_left_click','_ms_right_click',
    '_ms_get_cell','_ms_get_state','_ms_get_found','_ms_get_total_flags',
    '_ms_get_rows','_ms_get_cols','_ms_get_total_mines',
    '_ms_changed_count','_ms_changed_r','_ms_changed_c',
    '_ms_get_first_click']" \
  -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="MinesweeperEngine" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT="web" \
  --std=c++17 \
  -O2

echo ""
echo "==================================================================="
echo "  Done! Output:"
echo "    frontend/engine.js   — JS loader"
echo "    frontend/engine.wasm — C++ compiled to WASM"
echo ""
echo "  Open the game with a local server (required for WASM):"
echo "    cd frontend"
echo "    python3 -m http.server 8080"
echo "    Then open: http://localhost:8080"
echo "==================================================================="
