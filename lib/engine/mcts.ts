// =============================================================================
// MCTS(UCT) 바둑 AI — 순수 TypeScript, 외부 자산 불필요
// -----------------------------------------------------------------------------
// 탐색 내부는 초경량 가변 시뮬레이터(단수패만, 초과패 무시)로 돌리고,
// 최종 선택 수는 호출 측에서 실제 규칙 엔진(placeStone)으로 재검증한다.
// 입문자 상대용 — 9×9·13×13 권장. KataGo류 신경망 엔진으로 교체 가능하도록
// chooseMove 인터페이스만 노출한다.
// =============================================================================

import {
  BLACK,
  EMPTY,
  WHITE,
  defaultKomi,
  getAdjacency,
  type GameState,
  type StoneColor,
} from "../game-logic";

export const PASS = -1;

export interface AiOptions {
  /** 트리 탐색 횟수 (플레이아웃 수) */
  readonly playouts: number;
  readonly komi?: number;
  /** 결정적 테스트용 시드 */
  readonly seed?: number;
  /** 직전 수가 패스였는지 — 이기고 있으면 패스로 종국 */
  readonly lastMoveWasPass?: boolean;
}

export interface AiResult {
  /** 선택한 수 (PASS = 패스). candidates는 방문수 내림차순 대안. */
  readonly move: number;
  readonly candidates: readonly { move: number; visits: number }[];
}

// -----------------------------------------------------------------------------
// 시드 가능한 PRNG (mulberry32)
// -----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------
// 경량 시뮬레이터 — 가변, 단수패만 (탐색 전용)
// -----------------------------------------------------------------------------

interface Sim {
  grid: Uint8Array;
  size: number;
  toPlay: StoneColor;
  koPoint: number; // -1 = 없음
  passes: number;
}

/** 그룹의 활로 존재 여부 + 돌 목록 수집 (out에 채움) */
function collectGroup(
  grid: Uint8Array,
  size: number,
  start: number,
  outStones: number[],
  visited: Uint8Array
): boolean {
  const adjacency = getAdjacency(size);
  const color = grid[start];
  let hasLiberty = false;
  outStones.length = 0;
  const stack = [start];
  visited[start] = 1;
  while (stack.length > 0) {
    const current = stack.pop()!;
    outStones.push(current);
    for (const neighbor of adjacency[current]) {
      const cell = grid[neighbor];
      if (cell === EMPTY) hasLiberty = true;
      else if (cell === color && !visited[neighbor]) {
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
  }
  return hasLiberty;
}

/** 시뮬레이터에서 착수 시도. 성공하면 sim을 변경하고 true. */
function simPlay(sim: Sim, index: number, scratch: SimScratch): boolean {
  const { grid, size } = sim;
  if (index === PASS) {
    sim.passes += 1;
    sim.koPoint = -1;
    sim.toPlay = sim.toPlay === BLACK ? WHITE : BLACK;
    return true;
  }
  if (grid[index] !== EMPTY || index === sim.koPoint) return false;

  const adjacency = getAdjacency(size);
  const me = sim.toPlay;
  const opponent = me === BLACK ? WHITE : BLACK;

  grid[index] = me;
  let capturedCount = 0;
  let lastCaptured = -1;

  for (const neighbor of adjacency[index]) {
    if (grid[neighbor] !== opponent) continue;
    scratch.visited.fill(0);
    if (!collectGroup(grid, size, neighbor, scratch.stones, scratch.visited)) {
      for (const stone of scratch.stones) {
        if (grid[stone] === opponent) {
          grid[stone] = EMPTY;
          capturedCount++;
          lastCaptured = stone;
        }
      }
    }
  }

  // 자살수 검사
  scratch.visited.fill(0);
  if (!collectGroup(grid, size, index, scratch.stones, scratch.visited)) {
    // 원상 복구 (따냄이 있었다면 활로가 생겼을 것이므로 여기 오면 따냄 0)
    grid[index] = EMPTY;
    return false;
  }

  sim.koPoint =
    capturedCount === 1 && scratch.stones.length === 1 ? lastCaptured : -1;
  sim.passes = 0;
  sim.toPlay = opponent;
  return true;
}

interface SimScratch {
  visited: Uint8Array;
  stones: number[];
}

/** 자기 진짜 눈(4방이 전부 자기 돌)은 롤아웃에서 메우지 않는다 */
function isOwnEye(sim: Sim, index: number): boolean {
  const adjacency = getAdjacency(sim.size);
  for (const neighbor of adjacency[index]) {
    if (sim.grid[neighbor] !== sim.toPlay) return false;
  }
  return adjacency[index].length > 0;
}

/** Tromp-Taylor 면적 계산: 돌 + 단색 귀속 빈 영역. 흑 기준 점수차. */
export function areaScore(
  grid: Uint8Array,
  size: number,
  komi: number
): number {
  const adjacency = getAdjacency(size);
  const total = size * size;
  let black = 0;
  let white = 0;
  const visited = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    if (grid[i] === BLACK) black++;
    else if (grid[i] === WHITE) white++;
    else if (!visited[i]) {
      // 빈 영역 flood fill
      let count = 0;
      let touchBlack = false;
      let touchWhite = false;
      const stack = [i];
      visited[i] = 1;
      while (stack.length > 0) {
        const current = stack.pop()!;
        count++;
        for (const neighbor of adjacency[current]) {
          const cell = grid[neighbor];
          if (cell === BLACK) touchBlack = true;
          else if (cell === WHITE) touchWhite = true;
          else if (!visited[neighbor]) {
            visited[neighbor] = 1;
            stack.push(neighbor);
          }
        }
      }
      if (touchBlack && !touchWhite) black += count;
      else if (touchWhite && !touchBlack) white += count;
    }
  }

  return black - white - komi;
}

/** 무작위 롤아웃 — 2연속 패스 또는 수 제한까지. 흑 승이면 1, 아니면 0. */
function rollout(
  sim: Sim,
  komi: number,
  random: () => number,
  scratch: SimScratch,
  moveBuffer: number[]
): number {
  const maxMoves = sim.size * sim.size * 2;
  let played = 0;

  while (sim.passes < 2 && played < maxMoves) {
    // 합법 후보 수집 (자기 눈 제외)
    moveBuffer.length = 0;
    for (let i = 0; i < sim.grid.length; i++) {
      if (sim.grid[i] === EMPTY && i !== sim.koPoint && !isOwnEye(sim, i)) {
        moveBuffer.push(i);
      }
    }
    let moved = false;
    // 무작위 순서로 최대 몇 번 시도 (자살수 등은 건너뜀)
    while (moveBuffer.length > 0) {
      const pick = Math.floor(random() * moveBuffer.length);
      const move = moveBuffer[pick];
      moveBuffer[pick] = moveBuffer[moveBuffer.length - 1];
      moveBuffer.pop();
      if (simPlay(sim, move, scratch)) {
        moved = true;
        break;
      }
    }
    if (!moved) simPlay(sim, PASS, scratch);
    played++;
  }

  return areaScore(sim.grid, sim.size, komi) > 0 ? 1 : 0;
}

// -----------------------------------------------------------------------------
// UCT 트리 탐색
// -----------------------------------------------------------------------------

interface Node {
  readonly move: number; // 이 노드로 이끈 수 (루트는 PASS 자리에 -2)
  readonly parent: Node | null;
  /** 이 수를 둔 색 (루트는 상대) */
  readonly mover: StoneColor;
  children: Node[];
  untried: number[];
  visits: number;
  /** mover 관점의 승수 */
  wins: number;
}

const UCB_C = 1.4;

function legalCandidates(sim: Sim, scratch: SimScratch): number[] {
  const moves: number[] = [];
  for (let i = 0; i < sim.grid.length; i++) {
    if (sim.grid[i] === EMPTY && i !== sim.koPoint && !isOwnEye(sim, i)) {
      // 빠른 사전 필터만 — 자살수는 확장 시점에 simPlay가 거른다
      moves.push(i);
    }
  }
  void scratch;
  return moves;
}

function selectChild(node: Node): Node {
  let best: Node = node.children[0];
  let bestValue = -Infinity;
  const logN = Math.log(node.visits + 1);
  for (const child of node.children) {
    const exploit = child.wins / (child.visits + 1e-9);
    const explore = UCB_C * Math.sqrt(logN / (child.visits + 1e-9));
    const value = exploit + explore;
    if (value > bestValue) {
      bestValue = value;
      best = child;
    }
  }
  return best;
}

/**
 * 현재 국면에서 AI의 다음 수를 고른다.
 * 반환 수는 반드시 실제 엔진(placeStone)으로 재검증할 것 — 탐색은 초과패를 무시한다.
 */
export function chooseMove(state: GameState, options: AiOptions): AiResult {
  const size = state.size;
  const komi = options.komi ?? defaultKomi(size);
  const random = mulberry32(options.seed ?? (Math.random() * 2 ** 31) | 0);
  const me = state.currentPlayer;

  const rootSim: Sim = {
    grid: state.grid.slice(),
    size,
    toPlay: me,
    koPoint: state.koPoint ?? -1,
    passes: 0,
  };
  const scratch: SimScratch = {
    visited: new Uint8Array(size * size),
    stones: [],
  };
  const moveBuffer: number[] = [];

  // 상대가 패스했고 지금 면적으로 이기고 있으면 패스로 종국
  if (options.lastMoveWasPass) {
    const myLead =
      me === BLACK
        ? areaScore(rootSim.grid, size, komi)
        : -areaScore(rootSim.grid, size, komi);
    if (myLead > 0) {
      return { move: PASS, candidates: [{ move: PASS, visits: 0 }] };
    }
  }

  const rootUntried = legalCandidates(rootSim, scratch);
  if (rootUntried.length === 0) {
    return { move: PASS, candidates: [{ move: PASS, visits: 0 }] };
  }

  const opponent = me === BLACK ? WHITE : BLACK;
  const root: Node = {
    move: -2,
    parent: null,
    mover: opponent,
    children: [],
    untried: rootUntried,
    visits: 0,
    wins: 0,
  };

  const sim: Sim = {
    grid: new Uint8Array(size * size),
    size,
    toPlay: me,
    koPoint: -1,
    passes: 0,
  };

  for (let iteration = 0; iteration < options.playouts; iteration++) {
    // 루트 상태 복원
    sim.grid.set(rootSim.grid);
    sim.toPlay = rootSim.toPlay;
    sim.koPoint = rootSim.koPoint;
    sim.passes = rootSim.passes;

    // 1) 선택
    let node = root;
    while (node.untried.length === 0 && node.children.length > 0) {
      node = selectChild(node);
      simPlay(sim, node.move, scratch);
    }

    // 2) 확장 — 시뮬레이터가 거부하는 수(자살수)는 버리고 다음 후보
    while (node.untried.length > 0) {
      const pick = Math.floor(random() * node.untried.length);
      const move = node.untried[pick];
      node.untried[pick] = node.untried[node.untried.length - 1];
      node.untried.pop();
      const mover = sim.toPlay;
      if (simPlay(sim, move, scratch)) {
        const child: Node = {
          move,
          parent: node,
          mover,
          children: [],
          untried: legalCandidates(sim, scratch),
          visits: 0,
          wins: 0,
        };
        node.children.push(child);
        node = child;
        break;
      }
    }

    // 3) 롤아웃
    const blackWin = rollout(sim, komi, random, scratch, moveBuffer);

    // 4) 역전파 — 각 노드 mover 관점의 승패
    let cursor: Node | null = node;
    while (cursor !== null) {
      cursor.visits++;
      const moverWon =
        cursor.mover === BLACK ? blackWin === 1 : blackWin === 0;
      if (moverWon) cursor.wins++;
      cursor = cursor.parent;
    }
  }

  if (root.children.length === 0) {
    return { move: PASS, candidates: [{ move: PASS, visits: 0 }] };
  }

  const candidates = root.children
    .map((child) => ({ move: child.move, visits: child.visits }))
    .sort((a, b) => b.visits - a.visits);

  return { move: candidates[0].move, candidates };
}
