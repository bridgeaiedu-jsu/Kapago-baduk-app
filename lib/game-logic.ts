// =============================================================================
// 바둑 규칙 엔진 — 순수 함수, UI 비의존
// -----------------------------------------------------------------------------
// 자료구조: Uint8Array 1차원 그리드 (0=빈칸, 1=흑, 2=백), 정수 인덱스 좌표.
// 패 규칙: 단수패(koPoint) + 위치 초과패(positional superko, 직렬화 해시 집합).
// 계가: 집(territory) + 잡은 돌 + 사석(dead stones) — 일본/한국식.
// =============================================================================

export const EMPTY = 0 as const;
export const BLACK = 1 as const;
export const WHITE = 2 as const;

export type StoneColor = typeof BLACK | typeof WHITE;
export type CellState = typeof EMPTY | StoneColor;
export type BoardGrid = Uint8Array;

export type Move =
  | { type: "move"; index: number; color: StoneColor }
  | { type: "pass"; color: StoneColor };

export interface GameState {
  readonly size: number;
  readonly grid: BoardGrid;
  readonly currentPlayer: StoneColor;
  /** 각 색이 잡은 상대 돌 수 */
  readonly captures: { readonly black: number; readonly white: number };
  readonly moveHistory: readonly Move[];
  /** 단수패로 즉시 되따냄이 금지된 교차점 (없으면 null) */
  readonly koPoint: number | null;
  readonly consecutivePasses: number;
  readonly isGameOver: boolean;
  /** 등장했던 모든 반상 위치의 직렬화 집합 — 초과패 검사용 */
  readonly positionHashes: ReadonlySet<string>;
}

export type MoveError = "game-over" | "occupied" | "ko" | "suicide" | "superko";

export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: MoveError };

// -----------------------------------------------------------------------------
// 좌표
// -----------------------------------------------------------------------------

/** GTP 표준 가로 좌표 문자 (I 제외) */
export const GTP_LETTERS = "ABCDEFGHJKLMNOPQRST";

export function coordToIndex(row: number, col: number, size: number): number {
  return row * size + col;
}

export function indexToCoord(
  index: number,
  size: number
): { row: number; col: number } {
  return { row: Math.floor(index / size), col: index % size };
}

/** 화면·스크린리더용 교차점 이름 (예: "D4"). row 0이 반상 최상단. */
export function pointName(index: number, size: number): string {
  const { row, col } = indexToCoord(index, size);
  return `${GTP_LETTERS[col]}${size - row}`;
}

export function opponentOf(color: StoneColor): StoneColor {
  return color === BLACK ? WHITE : BLACK;
}

// -----------------------------------------------------------------------------
// 인접 테이블 — 반상 크기별 1회 계산 후 캐시
// -----------------------------------------------------------------------------

const adjacencyCache = new Map<number, ReadonlyArray<readonly number[]>>();

export function getAdjacency(size: number): ReadonlyArray<readonly number[]> {
  const cached = adjacencyCache.get(size);
  if (cached) return cached;

  const table: number[][] = new Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const neighbors: number[] = [];
      if (row > 0) neighbors.push((row - 1) * size + col);
      if (row < size - 1) neighbors.push((row + 1) * size + col);
      if (col > 0) neighbors.push(row * size + col - 1);
      if (col < size - 1) neighbors.push(row * size + col + 1);
      table[row * size + col] = neighbors;
    }
  }
  adjacencyCache.set(size, table);
  return table;
}

// -----------------------------------------------------------------------------
// 그룹 탐색
// -----------------------------------------------------------------------------

export interface Group {
  readonly color: StoneColor;
  readonly stones: readonly number[];
  readonly liberties: number;
}

/** index의 돌이 속한 그룹과 활로 수. 빈칸이면 null. */
export function getGroup(
  grid: BoardGrid,
  size: number,
  index: number
): Group | null {
  const color = grid[index];
  if (color === EMPTY) return null;

  const adjacency = getAdjacency(size);
  const stones: number[] = [];
  const liberties = new Set<number>();
  const visited = new Uint8Array(size * size);
  const stack = [index];
  visited[index] = 1;

  while (stack.length > 0) {
    const current = stack.pop()!;
    stones.push(current);
    for (const neighbor of adjacency[current]) {
      if (visited[neighbor]) continue;
      const cell = grid[neighbor];
      if (cell === EMPTY) {
        liberties.add(neighbor);
      } else if (cell === color) {
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
  }

  return { color: color as StoneColor, stones, liberties: liberties.size };
}

// -----------------------------------------------------------------------------
// 초기화 / 직렬화
// -----------------------------------------------------------------------------

/** 반상 위치를 초과패 검사용 문자열 키로 직렬화 */
export function serializeGrid(grid: BoardGrid): string {
  let out = "";
  for (let i = 0; i < grid.length; i++) out += grid[i];
  return out;
}

export function createInitialGameState(size: number): GameState {
  const grid = new Uint8Array(size * size);
  return {
    size,
    grid,
    currentPlayer: BLACK,
    captures: { black: 0, white: 0 },
    moveHistory: [],
    koPoint: null,
    consecutivePasses: 0,
    isGameOver: false,
    positionHashes: new Set([serializeGrid(grid)]),
  };
}

// -----------------------------------------------------------------------------
// 착수
// -----------------------------------------------------------------------------

export function placeStone(state: GameState, index: number): MoveResult {
  if (state.isGameOver) return { ok: false, reason: "game-over" };

  const { grid, size, currentPlayer } = state;
  if (grid[index] !== EMPTY) return { ok: false, reason: "occupied" };
  if (state.koPoint === index) return { ok: false, reason: "ko" };

  const adjacency = getAdjacency(size);
  const opponent = opponentOf(currentPlayer);
  const newGrid = grid.slice();
  newGrid[index] = currentPlayer;

  // 이웃 상대 그룹 중 활로가 없어진 그룹 제거
  const capturedIndices: number[] = [];
  for (const neighbor of adjacency[index]) {
    if (newGrid[neighbor] !== opponent) continue;
    const group = getGroup(newGrid, size, neighbor);
    if (group && group.liberties === 0) {
      for (const stone of group.stones) {
        if (newGrid[stone] === opponent) {
          newGrid[stone] = EMPTY;
          capturedIndices.push(stone);
        }
      }
    }
  }

  // 자살수 금지
  const ownGroup = getGroup(newGrid, size, index)!;
  if (ownGroup.liberties === 0) return { ok: false, reason: "suicide" };

  // 위치 초과패(positional superko): 과거에 등장한 위치의 재현 금지
  const newHash = serializeGrid(newGrid);
  if (state.positionHashes.has(newHash)) {
    return { ok: false, reason: "superko" };
  }

  // 단수패: 돌 1개로 1점을 따냈고 그 돌의 활로가 1일 때만 성립
  let koPoint: number | null = null;
  if (
    capturedIndices.length === 1 &&
    ownGroup.stones.length === 1 &&
    ownGroup.liberties === 1
  ) {
    koPoint = capturedIndices[0];
  }

  const newPositionHashes = new Set(state.positionHashes);
  newPositionHashes.add(newHash);

  return {
    ok: true,
    state: {
      size,
      grid: newGrid,
      currentPlayer: opponent,
      captures: {
        black:
          state.captures.black +
          (currentPlayer === BLACK ? capturedIndices.length : 0),
        white:
          state.captures.white +
          (currentPlayer === WHITE ? capturedIndices.length : 0),
      },
      moveHistory: [
        ...state.moveHistory,
        { type: "move", index, color: currentPlayer },
      ],
      koPoint,
      consecutivePasses: 0,
      isGameOver: false,
      positionHashes: newPositionHashes,
    },
  };
}

export function pass(state: GameState): GameState {
  if (state.isGameOver) return state;
  const newPasses = state.consecutivePasses + 1;
  return {
    ...state,
    currentPlayer: opponentOf(state.currentPlayer),
    moveHistory: [
      ...state.moveHistory,
      { type: "pass", color: state.currentPlayer },
    ],
    koPoint: null,
    consecutivePasses: newPasses,
    isGameOver: newPasses >= 2,
  };
}

// -----------------------------------------------------------------------------
// 기보 재생 — 저장된 대국 복원용
// -----------------------------------------------------------------------------

/**
 * 수순을 처음부터 재생해 상태 스택을 만든다.
 * 유효하지 않은 수를 만나면 그 직전까지의 스택을 반환한다.
 */
export function replayMoves(size: number, moves: readonly Move[]): GameState[] {
  const stack: GameState[] = [createInitialGameState(size)];
  for (const move of moves) {
    const current = stack[stack.length - 1];
    if (move.type === "pass") {
      stack.push(pass(current));
    } else {
      const result = placeStone(current, move.index);
      if (!result.ok) break;
      stack.push(result.state);
    }
  }
  return stack;
}

// -----------------------------------------------------------------------------
// 사석 표시
// -----------------------------------------------------------------------------

/**
 * 종국 후 사석 마킹: index의 돌이 속한 그룹 전체를 토글한 새 집합을 반환.
 * 빈칸을 누르면 기존 집합을 그대로 반환.
 */
export function toggleDeadGroup(
  grid: BoardGrid,
  size: number,
  deadStones: ReadonlySet<number>,
  index: number
): Set<number> {
  const next = new Set(deadStones);
  const group = getGroup(grid, size, index);
  if (!group) return next;

  const markDead = !next.has(index);
  for (const stone of group.stones) {
    if (markDead) next.add(stone);
    else next.delete(stone);
  }
  return next;
}

// -----------------------------------------------------------------------------
// 계가
// -----------------------------------------------------------------------------

export function defaultKomi(size: number): number {
  return size === 19 ? 6.5 : 5.5;
}

export interface TerritoryResult {
  readonly black: number;
  readonly white: number;
  /** 흑 집으로 판정된 교차점 목록 (표시용) */
  readonly blackPoints: readonly number[];
  readonly whitePoints: readonly number[];
}

/** 빈 영역별 flood fill — 한 색으로만 둘러싸인 영역만 그 색의 집 */
export function countTerritory(grid: BoardGrid, size: number): TerritoryResult {
  const adjacency = getAdjacency(size);
  const total = size * size;
  const visited = new Uint8Array(total);
  const blackPoints: number[] = [];
  const whitePoints: number[] = [];

  for (let start = 0; start < total; start++) {
    if (grid[start] !== EMPTY || visited[start]) continue;

    const region: number[] = [];
    const borders = new Set<StoneColor>();
    const stack = [start];
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop()!;
      region.push(current);
      for (const neighbor of adjacency[current]) {
        const cell = grid[neighbor];
        if (cell !== EMPTY) {
          borders.add(cell as StoneColor);
        } else if (!visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    if (borders.size === 1) {
      const owner = borders.values().next().value!;
      if (owner === BLACK) blackPoints.push(...region);
      else whitePoints.push(...region);
    }
  }

  return {
    black: blackPoints.length,
    white: whitePoints.length,
    blackPoints,
    whitePoints,
  };
}

export interface ScoreResult {
  readonly black: number;
  readonly white: number;
  readonly komi: number;
  readonly winner: "black" | "white" | "draw";
  readonly blackTerritory: number;
  readonly whiteTerritory: number;
  /** 사석 수 (흑 사석 = 백의 포로) */
  readonly deadBlack: number;
  readonly deadWhite: number;
  readonly territory: TerritoryResult;
}

/**
 * 일본/한국식 계가: 집 + 잡은 돌 + 사석.
 * deadStones에 마킹된 돌은 반상에서 제거되어 상대의 포로로 가산된다.
 */
export function calculateScore(
  state: GameState,
  deadStones: ReadonlySet<number> = new Set(),
  komi: number = defaultKomi(state.size)
): ScoreResult {
  const cleaned = state.grid.slice();
  let deadBlack = 0;
  let deadWhite = 0;
  for (const index of deadStones) {
    if (cleaned[index] === BLACK) deadBlack++;
    else if (cleaned[index] === WHITE) deadWhite++;
    cleaned[index] = EMPTY;
  }

  const territory = countTerritory(cleaned, state.size);
  const black = territory.black + state.captures.black + deadWhite;
  const white = territory.white + state.captures.white + deadBlack + komi;

  return {
    black,
    white,
    komi,
    winner: black > white ? "black" : white > black ? "white" : "draw",
    blackTerritory: territory.black,
    whiteTerritory: territory.white,
    deadBlack,
    deadWhite,
    territory,
  };
}
