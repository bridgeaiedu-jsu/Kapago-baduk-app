import { describe, expect, it } from "vitest";
import {
  BLACK,
  EMPTY,
  WHITE,
  calculateScore,
  coordToIndex,
  countTerritory,
  createInitialGameState,
  defaultKomi,
  getAdjacency,
  getGroup,
  pass,
  placeStone,
  pointName,
  replayMoves,
  serializeGrid,
  toggleDeadGroup,
  type GameState,
  type Move,
  type StoneColor,
} from "./game-logic";

/** 테스트 편의: "D4" 형태 대신 (row, col)로 연속 착수 */
function play(state: GameState, ...coords: [number, number][]): GameState {
  let current = state;
  for (const [row, col] of coords) {
    const result = placeStone(current, coordToIndex(row, col, current.size));
    if (!result.ok) throw new Error(`illegal move at ${row},${col}: ${result.reason}`);
    current = result.state;
  }
  return current;
}

/** 테스트 편의: 문자열 다이어그램으로 그리드 구성 (.빈칸 B흑 W백) */
function gridFrom(rows: string[]): { grid: Uint8Array; size: number } {
  const size = rows.length;
  const grid = new Uint8Array(size * size);
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      grid[r * size + c] = ch === "B" ? BLACK : ch === "W" ? WHITE : EMPTY;
    });
  });
  return { grid, size };
}

describe("좌표", () => {
  it("pointName은 GTP 표준(I 제외)을 따른다", () => {
    // col 8은 I를 건너뛰고 J
    expect(pointName(coordToIndex(0, 8, 19), 19)).toBe("J19");
    expect(pointName(coordToIndex(18, 0, 19), 19)).toBe("A1");
    expect(pointName(coordToIndex(15, 3, 19), 19)).toBe("D4");
  });

  it("getAdjacency는 모서리 2, 변 3, 중앙 4개의 이웃을 갖고 캐시된다", () => {
    const adj = getAdjacency(9);
    expect(adj[coordToIndex(0, 0, 9)]).toHaveLength(2);
    expect(adj[coordToIndex(0, 4, 9)]).toHaveLength(3);
    expect(adj[coordToIndex(4, 4, 9)]).toHaveLength(4);
    expect(getAdjacency(9)).toBe(adj); // 동일 참조 = 캐시
  });
});

describe("착수 기본", () => {
  it("흑부터 두고 차례가 교대된다", () => {
    const s0 = createInitialGameState(9);
    expect(s0.currentPlayer).toBe(BLACK);
    const s1 = play(s0, [4, 4]);
    expect(s1.grid[coordToIndex(4, 4, 9)]).toBe(BLACK);
    expect(s1.currentPlayer).toBe(WHITE);
    expect(s1.moveHistory).toHaveLength(1);
  });

  it("이미 돌이 있는 곳은 occupied", () => {
    const s1 = play(createInitialGameState(9), [4, 4]);
    const result = placeStone(s1, coordToIndex(4, 4, 9));
    expect(result).toEqual({ ok: false, reason: "occupied" });
  });

  it("종국 후 착수는 game-over", () => {
    const ended = pass(pass(createInitialGameState(9)));
    expect(ended.isGameOver).toBe(true);
    const result = placeStone(ended, 0);
    expect(result).toEqual({ ok: false, reason: "game-over" });
  });
});

describe("따냄", () => {
  it("활로가 없어진 단독 돌을 따내고 포로로 센다", () => {
    // 백 (0,0)을 흑 (0,1), (1,0)으로 포위 — 모서리 돌은 활로 2
    const s = play(
      createInitialGameState(9),
      [0, 1], // 흑
      [0, 0], // 백 (모서리)
      [1, 0] // 흑 → 백 따냄
    );
    expect(s.grid[coordToIndex(0, 0, 9)]).toBe(EMPTY);
    expect(s.captures.black).toBe(1);
    expect(s.captures.white).toBe(0);
  });

  it("여러 돌 그룹을 한 번에 따낸다", () => {
    // 백 2돌 (0,1)(0,2)를 흑이 포위
    const s = play(
      createInitialGameState(9),
      [0, 0], // 흑
      [0, 1], // 백
      [1, 1], // 흑
      [0, 2], // 백
      [1, 2], // 흑
      [5, 5], // 백 (팻감 아님, 그냥 다른 곳)
      [0, 3] // 흑 → 백 2돌 따냄
    );
    expect(s.grid[coordToIndex(0, 1, 9)]).toBe(EMPTY);
    expect(s.grid[coordToIndex(0, 2, 9)]).toBe(EMPTY);
    expect(s.captures.black).toBe(2);
  });

  it("따내면서 두는 수는 자살이 아니다", () => {
    // 흑이 (0,0)에 두면 자기 활로 0이지만 백 (0,1)을 따내므로 합법
    // 배치: 백(0,1) 흑(0,2), 백(1,0) 흑(1,1) — (0,0)은 백 활로 유일
    const s = play(
      createInitialGameState(9),
      [0, 2], // 흑
      [0, 1], // 백
      [1, 1], // 흑
      [1, 0], // 백
      [2, 0], // 흑 → 백(1,0) 단수
      [5, 5] // 백 다른 곳
    );
    // 흑 (0,0): 놓는 순간 활로 0이지만 백(0,1)? 아님 — 백(1,0)만 활로 0
    const result = placeStone(s, coordToIndex(0, 0, 9));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.grid[coordToIndex(1, 0, 9)]).toBe(EMPTY); // 백 따냄
      expect(result.state.grid[coordToIndex(0, 0, 9)]).toBe(BLACK);
    }
  });
});

describe("자살수", () => {
  it("자살수는 suicide로 거부된다", () => {
    // 흑 (0,1), (1,0)이 (0,0)을 감싼 상태에서 백이 (0,0) 착수 시도
    const s = play(
      createInitialGameState(9),
      [0, 1], // 흑
      [5, 5], // 백
      [1, 0] // 흑
    );
    const result = placeStone(s, coordToIndex(0, 0, 9));
    expect(result).toEqual({ ok: false, reason: "suicide" });
  });
});

describe("패(ko)", () => {
  /**
   * 표준 패 모양 (5x5):
   *   . B W . .
   *   B W . W .      ← (1,2)가 비어 있고 백이 감싼 형태
   *   . B W . .
   * 흑이 (1,2)에 두면 백 (1,1)을 따내고 패 발생
   */
  function koPosition(): GameState {
    return play(
      createInitialGameState(5),
      [0, 1], // 흑
      [0, 2], // 백
      [1, 0], // 흑
      [1, 3], // 백
      [2, 1], // 흑
      [2, 2], // 백
      [4, 4], // 흑 (대기)
      [1, 1] // 백 — 패 모양 완성
    );
  }

  it("패 따냄 직후 즉시 되따냄은 ko로 거부된다", () => {
    const s = play(koPosition(), [1, 2]); // 흑이 백(1,1) 따냄
    expect(s.grid[coordToIndex(1, 1, 5)]).toBe(EMPTY);
    expect(s.koPoint).toBe(coordToIndex(1, 1, 5));

    const retake = placeStone(s, coordToIndex(1, 1, 5));
    expect(retake).toEqual({ ok: false, reason: "ko" });
  });

  it("팻감 교환 후에는 되따냄이 허용된다", () => {
    let s = play(koPosition(), [1, 2]); // 흑 패 따냄
    s = play(s, [4, 0]); // 백 팻감(다른 곳)
    s = play(s, [4, 2]); // 흑 응수
    const retake = placeStone(s, coordToIndex(1, 1, 5)); // 백 되따냄
    expect(retake.ok).toBe(true);
  });

  it("동일 반상 위치의 재현은 superko로 거부된다", () => {
    // koPoint를 우회한 위치 재현을 인위적으로 구성:
    // 백이 (1,1)에 되따냈을 때 도달할 위치가 이미 등장했다고 가정
    const s = play(koPosition(), [1, 2]); // 흑 패 따냄, 백 차례
    const retakeResult = placeStone(
      { ...s, koPoint: null }, // 단수패 금지를 강제로 해제해도
      coordToIndex(1, 1, 5)
    );
    // 백 되따냄 → 패 따냄 직전 위치(koPosition + 흑(4,4) 시점과 동일 반상) 재현
    expect(retakeResult).toEqual({ ok: false, reason: "superko" });
  });

  it("positionHashes는 초기 위치를 포함하고 수마다 누적된다", () => {
    const s0 = createInitialGameState(5);
    expect(s0.positionHashes.has(serializeGrid(s0.grid))).toBe(true);
    const s1 = play(s0, [2, 2]);
    expect(s1.positionHashes.size).toBe(2);
    expect(s1.positionHashes.has(serializeGrid(s1.grid))).toBe(true);
  });
});

describe("패스와 종국", () => {
  it("패스가 moveHistory에 기록된다", () => {
    const s = pass(createInitialGameState(9));
    expect(s.moveHistory).toEqual([{ type: "pass", color: BLACK }]);
    expect(s.currentPlayer).toBe(WHITE);
    expect(s.isGameOver).toBe(false);
  });

  it("2연속 패스로 종국된다", () => {
    const s = pass(pass(createInitialGameState(9)));
    expect(s.isGameOver).toBe(true);
    expect(s.consecutivePasses).toBe(2);
  });

  it("패스 후 착수하면 연속 패스가 리셋된다", () => {
    const s = play(pass(createInitialGameState(9)), [4, 4]);
    expect(s.consecutivePasses).toBe(0);
  });

  it("패스는 koPoint를 지운다", () => {
    const s = play(
      createInitialGameState(5),
      [0, 1], [0, 2], [1, 0], [1, 3], [2, 1], [2, 2], [4, 4], [1, 1], [1, 2]
    );
    expect(s.koPoint).not.toBeNull();
    expect(pass(s).koPoint).toBeNull();
  });
});

describe("replayMoves", () => {
  it("수순 재생으로 동일한 최종 위치를 복원한다", () => {
    const s = play(
      createInitialGameState(9),
      [4, 4], [2, 2], [6, 6], [3, 3]
    );
    const withPass = pass(s);

    const stack = replayMoves(9, withPass.moveHistory as Move[]);
    const restored = stack[stack.length - 1];
    expect(serializeGrid(restored.grid)).toBe(serializeGrid(withPass.grid));
    expect(restored.currentPlayer).toBe(withPass.currentPlayer);
    expect(restored.captures).toEqual(withPass.captures);
    expect(stack).toHaveLength(6); // 초기 + 5수
  });

  it("잘못된 수를 만나면 직전까지만 재생한다", () => {
    const bad: Move[] = [
      { type: "move", index: 0, color: BLACK as StoneColor },
      { type: "move", index: 0, color: WHITE as StoneColor }, // occupied
    ];
    const stack = replayMoves(9, bad);
    expect(stack).toHaveLength(2); // 초기 + 1수
  });
});

describe("집 계산", () => {
  it("한 색으로 둘러싸인 빈 영역만 집이다", () => {
    const { grid, size } = gridFrom([
      ".B.W.",
      "BB.WW",
      ".B.W.",
      "BB.WW",
      ".B.W.",
    ]);
    const t = countTerritory(grid, size);
    // 좌측 열(0열) 3칸 흑집, 우측 열(4열) 3칸 백집, 가운데(2열)는 양색 접촉 = 공배
    expect(t.black).toBe(3);
    expect(t.white).toBe(3);
  });

  it("돌이 없는 반상은 어느 쪽 집도 아니다", () => {
    const t = countTerritory(new Uint8Array(25), 5);
    expect(t.black).toBe(0);
    expect(t.white).toBe(0);
  });
});

describe("계가", () => {
  it("덤은 반상 크기별로 다르다", () => {
    expect(defaultKomi(19)).toBe(6.5);
    expect(defaultKomi(13)).toBe(5.5);
    expect(defaultKomi(9)).toBe(5.5);
  });

  it("집 + 잡은 돌 + 덤으로 승자를 정한다", () => {
    // 흑집: 좌측 2열 × 5 = 10, 백집: 우측 1열 × 5 = 5
    const { grid } = gridFrom(["..BW.", "..BW.", "..BW.", "..BW.", "..BW."]);
    const state: GameState = { ...createInitialGameState(5), grid };
    const score = calculateScore(state, new Set(), 5.5);
    expect(score.blackTerritory).toBe(10); // 좌측 2열
    expect(score.whiteTerritory).toBe(5); // 우측 1열
    expect(score.black).toBe(10);
    expect(score.white).toBe(10.5);
    expect(score.winner).toBe("white");
  });

  it("사석은 반상에서 제거되고 상대 포로로 가산된다", () => {
    // 백 진영(우측) 안에 흑 사석 1개
    const { grid } = gridFrom(["..BW.", "..BW.", "..BWB", "..BW.", "..BW."]);
    const state: GameState = { ...createInitialGameState(5), grid };
    const deadIndex = coordToIndex(2, 4, 5); // 우측의 외로운 흑돌

    const before = calculateScore(state, new Set(), 5.5);
    // 사석 미마킹: 흑돌이 백집을 오염 → 백집 0
    expect(before.whiteTerritory).toBe(0);

    const after = calculateScore(state, new Set([deadIndex]), 5.5);
    expect(after.whiteTerritory).toBe(5); // 우측 열 복원
    expect(after.deadBlack).toBe(1);
    expect(after.white).toBe(5 + 1 + 5.5); // 집 + 사석포로 + 덤
  });

  it("덤이 정수면 무승부가 성립할 수 있다", () => {
    // 흑집 3, 백집 3 대칭 — 덤 0이면 동점
    const { grid } = gridFrom([".B.W.", "BB.WW", ".B.W.", "BB.WW", ".B.W."]);
    const state: GameState = { ...createInitialGameState(5), grid };
    const score = calculateScore(state, new Set(), 0);
    expect(score.black).toBe(3);
    expect(score.white).toBe(3);
    expect(score.winner).toBe("draw");
  });
});

describe("사석 토글", () => {
  it("그룹 전체가 함께 토글되고 재클릭으로 해제된다", () => {
    const { grid, size } = gridFrom(["BB...", "B....", ".....", ".....", "....."]);
    const marked = toggleDeadGroup(grid, size, new Set(), 0);
    expect(marked.size).toBe(3); // 흑 3돌 그룹 전체
    const unmarked = toggleDeadGroup(grid, size, marked, coordToIndex(1, 0, size));
    expect(unmarked.size).toBe(0);
  });

  it("빈칸 클릭은 무시된다", () => {
    const { grid, size } = gridFrom(["B....", ".....", ".....", ".....", "....."]);
    const result = toggleDeadGroup(grid, size, new Set(), coordToIndex(3, 3, size));
    expect(result.size).toBe(0);
  });
});

describe("getGroup", () => {
  it("그룹의 돌과 활로를 정확히 센다", () => {
    const { grid, size } = gridFrom(["BB...", "BW...", ".....", ".....", "....."]);
    const black = getGroup(grid, size, 0)!;
    expect(black.stones).toHaveLength(3);
    expect(black.liberties).toBe(2); // (0,2), (2,0) — (1,1)은 백돌이라 활로 아님
    const white = getGroup(grid, size, coordToIndex(1, 1, size))!;
    expect(white.stones).toHaveLength(1);
    expect(white.liberties).toBe(2); // (1,2),(2,1)
  });

  it("빈칸은 null", () => {
    expect(getGroup(new Uint8Array(25), 5, 12)).toBeNull();
  });
});
