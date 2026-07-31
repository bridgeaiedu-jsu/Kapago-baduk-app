import { describe, expect, it } from "vitest";
import {
  BLACK,
  EMPTY,
  WHITE,
  coordToIndex,
  createInitialGameState,
  placeStone,
  type GameState,
} from "../game-logic";
import { PASS, areaScore, chooseMove } from "./mcts";

function play(state: GameState, ...coords: [number, number][]): GameState {
  let current = state;
  for (const [row, col] of coords) {
    const result = placeStone(current, coordToIndex(row, col, current.size));
    if (!result.ok) throw new Error(`illegal: ${result.reason}`);
    current = result.state;
  }
  return current;
}

function gridFrom(rows: string[]): Uint8Array {
  const size = rows.length;
  const grid = new Uint8Array(size * size);
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      grid[r * size + c] = ch === "B" ? BLACK : ch === "W" ? WHITE : EMPTY;
    });
  });
  return grid;
}

describe("areaScore (Tromp-Taylor)", () => {
  it("돌 + 단색 빈 영역을 면적으로 센다", () => {
    const grid = gridFrom(["..BW.", "..BW.", "..BW.", "..BW.", "..BW."]);
    // 흑: 돌 5 + 좌측 10 = 15, 백: 돌 5 + 우측 5 = 10
    expect(areaScore(grid, 5, 0)).toBe(5);
    expect(areaScore(grid, 5, 5.5)).toBe(-0.5);
  });
});

describe("chooseMove", () => {
  it("단수인 상대 돌을 따내는 수를 찾는다", () => {
    // 5×5: 백 (2,2)가 흑 3방 포위 — 단수. 흑 차례, (1,2)가 따내는 수.
    const state = play(
      createInitialGameState(5),
      [2, 1], // 흑
      [2, 2], // 백
      [3, 2], // 흑
      [0, 0], // 백 (딴전)
      [2, 3], // 흑 → 백 단수
      [0, 1] // 백 (딴전)
    );
    expect(state.currentPlayer).toBe(BLACK);

    const result = chooseMove(state, { playouts: 1500, seed: 42, komi: 5.5 });
    expect(result.move).toBe(coordToIndex(1, 2, 5));
  });

  it("반환한 수는 실제 엔진에서도 합법이다 (자가 대국 20수)", () => {
    let state = createInitialGameState(5);
    for (let i = 0; i < 20 && !state.isGameOver; i++) {
      const result = chooseMove(state, { playouts: 120, seed: 1000 + i });
      if (result.move === PASS) break;
      const applied = placeStone(state, result.move);
      expect(applied.ok).toBe(true);
      if (applied.ok) state = applied.state;
    }
    expect(state.moveHistory.length).toBeGreaterThan(5);
  });

  it("상대가 패스했고 이기고 있으면 패스로 종국한다", () => {
    // 흑이 압도적인 반상
    const base = createInitialGameState(5);
    const grid = gridFrom(["BB.BB", "BBBBB", ".B.B.", "BBBBB", "BB.BW"]);
    const state: GameState = { ...base, grid, currentPlayer: BLACK };

    const result = chooseMove(state, {
      playouts: 50,
      seed: 7,
      komi: 5.5,
      lastMoveWasPass: true,
    });
    expect(result.move).toBe(PASS);
  });

  it("둘 곳이 전혀 없으면 패스한다", () => {
    // 반상이 흑으로 가득 (자기 눈 2개만 남음 → 후보 없음)
    const base = createInitialGameState(5);
    const rows = ["BBBBB", "BBBBB", "BB.BB", "BBBBB", "BBBB."];
    const state: GameState = {
      ...base,
      grid: gridFrom(rows),
      currentPlayer: BLACK,
    };
    const result = chooseMove(state, { playouts: 30, seed: 3 });
    expect(result.move).toBe(PASS);
  });
});
