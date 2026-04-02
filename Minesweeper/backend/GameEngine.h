#pragma once
// ================================================================
//  GameEngine.h  —  Pure C++ Minesweeper Rules Engine
//  ----------------------------------------------------------------
//  NO graphics. NO SFML. Only game logic.
//  This compiles to WebAssembly via Emscripten so the HTML/CSS/JS
//  frontend can call it via a clean C API (see wasm_bridge.cpp).
//  Without Emscripten, engine-adapter.js provides an identical
//  JavaScript mirror of every rule here.
//
//  RULES IMPLEMENTED:
//    - Dynamic grid sizes: Easy 10x10, Medium 18x18, Hard 24x24
//    - Mine placement after first click (3x3 safe zone)
//    - Adjacency count calculation (8-directional)
//    - Recursive flood-fill reveal for blank cells
//    - Flag toggle: +1 found when placed on real mine, -1 when removed
//    - Total flags counter (ALL flags, mine or not)
//    - Win: all non-mine cells revealed
//    - Lose: mine cell left-clicked
// ================================================================

#include <vector>
#include <set>
#include <functional>
#include <utility>
#include <random>
#include <chrono>
#include <cmath>
#include <algorithm>

// ── Single cell state ────────────────────────────────────────────
struct Cell {
    bool isMine      = false;
    bool isRevealed  = false;
    bool isFlagged   = false;
    bool isWrongFlag = false;  // flagged safe cell, shown after loss
    bool isExploded  = false;  // the specific mine player clicked
    int  adjacent    = 0;      // count of neighbouring mines (0-8)

    void reset() {
        isMine = isRevealed = isFlagged = isWrongFlag = isExploded = false;
        adjacent = 0;
    }
};

// ── Result returned from leftClick() ────────────────────────────
struct RevealResult {
    bool hitMine = false;
    bool won     = false;
    std::vector<std::pair<int,int>> changed; // cells that changed state
};

// ── Main engine ──────────────────────────────────────────────────
class GameEngine {
public:
    enum class State { Idle, Playing, Over, Won };

    // Difficulty presets  {rows, cols, mines}
    struct Preset { int rows, cols, mines; };
    static constexpr Preset EASY   { 10, 10, 15  };
    static constexpr Preset MEDIUM { 18, 18, 60  };
    static constexpr Preset HARD   { 24, 24, 120 };

    GameEngine() { init(EASY); }

    // ── Start / restart ──────────────────────────────────────────
    void init(Preset p) {
        rows_        = p.rows;
        cols_        = p.cols;
        totalMines_  = p.mines;
        foundMines_  = 0;      // mines correctly flagged
        totalFlags_  = 0;      // ALL flags placed (mine or safe)
        revealedSafe_= 0;
        firstClick_  = true;
        state_       = State::Idle;
        mineSet_.clear();
        grid_.assign(rows_, std::vector<Cell>(cols_));
        changedBuf_.clear();
    }

    // ── Left click ───────────────────────────────────────────────
    RevealResult leftClick(int r, int c) {
        RevealResult res;
        changedBuf_.clear();
        if (state_ == State::Over || state_ == State::Won) return res;

        Cell& cell = grid_[r][c];
        if (cell.isRevealed || cell.isFlagged) return res;

        // First click: place mines, start game
        if (firstClick_) {
            placeMines(r, c);
            firstClick_ = false;
            state_      = State::Playing;
        }

        if (cell.isMine) {
            cell.isExploded = true;
            cell.isRevealed = true;
            changedBuf_.push_back({r, c});
            triggerLoss(res);
            res.hitMine = true;
            state_ = State::Over;
        } else {
            floodReveal(r, c);
            if (revealedSafe_ == safeCells()) {
                res.won = true;
                state_  = State::Won;
            }
        }

        res.changed = changedBuf_;
        return res;
    }

    // ── Right click (flag toggle) ────────────────────────────────
    // Returns: +1 correct flag placed, -1 correct flag removed, 0 other
    int rightClick(int r, int c) {
        if (state_ == State::Over || state_ == State::Won) return 0;
        if (firstClick_) return 0;
        Cell& cell = grid_[r][c];
        if (cell.isRevealed) return 0;

        if (cell.isFlagged) {
            cell.isFlagged = false;
            --totalFlags_;
            if (cell.isMine) { --foundMines_; return -1; }
            return 0;
        } else {
            cell.isFlagged = true;
            ++totalFlags_;
            if (cell.isMine) { ++foundMines_; return +1; }
            return 0;
        }
    }

    // ── Accessors ────────────────────────────────────────────────
    const Cell& at(int r, int c) const { return grid_[r][c]; }
    Cell&       at(int r, int c)       { return grid_[r][c]; }

    int   rows()         const { return rows_; }
    int   cols()         const { return cols_; }
    int   totalMines()   const { return totalMines_; }
    int   foundMines()   const { return foundMines_; }
    int   totalFlags()   const { return totalFlags_; }
    int   safeCells()    const { return rows_ * cols_ - totalMines_; }
    int   revealedSafe() const { return revealedSafe_; }
    bool  firstClick()   const { return firstClick_; }
    State state()        const { return state_; }

    // Changed cell buffer (populated by leftClick / rightClick)
    int  changedCount()  const { return (int)changedBuf_.size(); }
    int  changedR(int i) const { return changedBuf_[i].first; }
    int  changedC(int i) const { return changedBuf_[i].second; }

    // Iterate neighbours (8-directional)
    void forNeighbours(int r, int c,
                       std::function<void(int,int)> fn) const {
        for (int dr = -1; dr <= 1; ++dr)
            for (int dc = -1; dc <= 1; ++dc) {
                if (!dr && !dc) continue;
                int nr = r+dr, nc = c+dc;
                if (nr >= 0 && nr < rows_ && nc >= 0 && nc < cols_)
                    fn(nr, nc);
            }
    }

private:
    int rows_, cols_, totalMines_;
    std::vector<std::vector<Cell>> grid_;
    std::set<int> mineSet_;
    std::vector<std::pair<int,int>> changedBuf_;

    int  foundMines_   = 0;
    int  totalFlags_   = 0;
    int  revealedSafe_ = 0;
    bool firstClick_   = true;
    State state_       = State::Idle;

    // Place mines after first click, safe zone = 3x3 around click
    void placeMines(int safeR, int safeC) {
        auto inSafe = [&](int r, int c) {
            return std::abs(r-safeR) <= 1 && std::abs(c-safeC) <= 1;
        };
        std::mt19937 rng(
            static_cast<unsigned>(
                std::chrono::steady_clock::now().time_since_epoch().count()
            )
        );
        std::uniform_int_distribution<int> dr(0, rows_-1), dc(0, cols_-1);
        int placed = 0;
        while (placed < totalMines_) {
            int r = dr(rng), c = dc(rng), idx = r*cols_+c;
            if (!inSafe(r, c) && !mineSet_.count(idx)) {
                mineSet_.insert(idx);
                grid_[r][c].isMine = true;
                ++placed;
            }
        }
        // Calculate adjacency
        for (int r = 0; r < rows_; ++r)
            for (int c = 0; c < cols_; ++c) {
                if (grid_[r][c].isMine) continue;
                int cnt = 0;
                forNeighbours(r, c, [&](int nr, int nc) {
                    if (grid_[nr][nc].isMine) ++cnt;
                });
                grid_[r][c].adjacent = cnt;
            }
    }

    // Flood-fill reveal
    void floodReveal(int r, int c) {
        Cell& cell = grid_[r][c];
        if (cell.isRevealed || cell.isFlagged) return;
        cell.isRevealed = true;
        ++revealedSafe_;
        changedBuf_.push_back({r, c});
        if (cell.adjacent == 0)
            forNeighbours(r, c, [&](int nr, int nc) {
                floodReveal(nr, nc);
            });
    }

    // Reveal all mines after hitting one
    void triggerLoss(RevealResult& res) {
        for (int r = 0; r < rows_; ++r)
            for (int c = 0; c < cols_; ++c) {
                Cell& cell = grid_[r][c];
                if (cell.isMine && !cell.isRevealed && !cell.isFlagged) {
                    cell.isRevealed = true;
                    changedBuf_.push_back({r, c});
                }
                if (cell.isFlagged && !cell.isMine)
                    cell.isWrongFlag = true;
            }
    }
};
