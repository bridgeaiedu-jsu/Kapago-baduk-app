import { describe, expect, it } from "vitest";
import {
  BLACK,
  WHITE,
  calculateScore,
  coordToIndex,
  createInitialGameState,
  pass,
  placeStone,
  replayMoves,
  serializeGrid,
  type GameState,
} from "./game-logic";
import { exportSGF, importSGF } from "./sgf";

function play(state: GameState, ...coords: [number, number][]): GameState {
  let current = state;
  for (const [row, col] of coords) {
    const result = placeStone(current, coordToIndex(row, col, current.size));
    if (!result.ok) throw new Error(`illegal move: ${result.reason}`);
    current = result.state;
  }
  return current;
}

describe("exportSGF", () => {
  it("헤더에 FF·GM·SZ·KM을 기록한다", () => {
    const sgf = exportSGF(9, []);
    expect(sgf).toContain("FF[4]");
    expect(sgf).toContain("GM[1]");
    expect(sgf).toContain("SZ[9]");
    expect(sgf).toContain("KM[5.5]");
    expect(sgf.startsWith("(")).toBe(true);
    expect(sgf.endsWith(")")).toBe(true);
  });

  it("수순을 SGF 좌표([열][행])로 기록한다", () => {
    const s = play(createInitialGameState(9), [3, 2]); // row 3, col 2 → "cd"
    const sgf = exportSGF(9, s.moveHistory);
    expect(sgf).toContain(";B[cd]");
  });

  it("패스는 빈 값으로 기록한다", () => {
    const s = pass(createInitialGameState(9));
    const sgf = exportSGF(9, s.moveHistory);
    expect(sgf).toContain(";B[]");
  });

  it("계가 결과가 있으면 RE를 기록한다", () => {
    const ended = pass(pass(createInitialGameState(9)));
    const score = calculateScore(ended); // 빈 반상 → 백이 덤만큼 승
    const sgf = exportSGF(9, ended.moveHistory, { score });
    expect(sgf).toContain("RE[W+5.5]");
  });
});

describe("importSGF", () => {
  it("내보낸 기보를 그대로 복원한다 (라운드트립)", () => {
    let s = play(
      createInitialGameState(9),
      [4, 4], [2, 2], [6, 6], [2, 6]
    );
    s = pass(s);
    s = play(s, [3, 3]);

    const sgf = exportSGF(9, s.moveHistory);
    const parsed = importSGF(sgf);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.size).toBe(9);
    expect(parsed.moves).toEqual(s.moveHistory);

    // 재생하면 동일한 반상
    const stack = replayMoves(parsed.size, parsed.moves);
    expect(serializeGrid(stack[stack.length - 1].grid)).toBe(
      serializeGrid(s.grid)
    );
  });

  it("외부 스타일(줄바꿈·주석·escape)을 파싱한다", () => {
    const sgf = `(;FF[4]GM[1]SZ[19]
      PB[Lee]PW[Kim]KM[6.5]
      C[대국 전 코멘트 \\] 대괄호 escape]
      ;B[pd]C[first move]
      ;W[dp]
      ;B[tt]
    )`;
    const parsed = importSGF(sgf);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.size).toBe(19);
    expect(parsed.moves).toHaveLength(3);
    // pd → col 'p'(15), row 'd'(3)
    expect(parsed.moves[0]).toEqual({
      type: "move",
      index: 3 * 19 + 15,
      color: BLACK,
    });
    expect(parsed.moves[1]).toEqual({
      type: "move",
      index: 15 * 19 + 3,
      color: WHITE,
    });
    // tt = 패스 (FF[3] 호환)
    expect(parsed.moves[2]).toEqual({ type: "pass", color: BLACK });
  });

  it("분기가 있으면 메인라인(첫 분기)만 따라간다", () => {
    const sgf = "(;FF[4]GM[1]SZ[9];B[aa](;W[bb];B[cc])(;W[dd];B[ee]))";
    const parsed = importSGF(sgf);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.moves).toHaveLength(3); // aa, bb, cc — dd/ee 분기는 무시
    expect(parsed.moves[1]).toEqual({
      type: "move",
      index: 1 * 9 + 1,
      color: WHITE,
    });
    expect(parsed.moves[2]).toEqual({
      type: "move",
      index: 2 * 9 + 2,
      color: BLACK,
    });
  });

  it("SZ가 없으면 19로 간주한다", () => {
    const parsed = importSGF("(;FF[4]GM[1];B[pd])");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.size).toBe(19);
  });

  it("지원하지 않는 입력을 사유와 함께 거부한다", () => {
    expect(importSGF("hello")).toEqual({ ok: false, reason: "invalid" });
    expect(importSGF("(;FF[4]GM[2]SZ[19];B[aa])")).toEqual({
      ok: false,
      reason: "not-go",
    });
    expect(importSGF("(;FF[4]GM[1]SZ[7];B[aa])")).toEqual({
      ok: false,
      reason: "bad-size",
    });
    expect(importSGF("(;FF[4]GM[1]SZ[19]AB[dd][pp];W[pd])")).toEqual({
      ok: false,
      reason: "handicap",
    });
    // 반상 밖 좌표
    expect(importSGF("(;FF[4]GM[1]SZ[9];B[kk])")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
