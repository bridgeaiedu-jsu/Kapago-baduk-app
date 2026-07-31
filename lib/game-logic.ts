export type StoneColor = "black" | "white";
export type CellState = StoneColor | null;
export type BoardState = CellState[][];

export interface GameState {
  board: BoardState;
  currentPlayer: StoneColor;
  captures: { black: number; white: number };
  moveHistory: { row: number; col: number; color: StoneColor }[];
  koPoint: { row: number; col: number } | null;
  consecutivePasses: number;
  isGameOver: boolean;
}

export function createEmptyBoard(size: number): BoardState {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function createInitialGameState(size: number): GameState {
  return {
    board: createEmptyBoard(size),
    currentPlayer: "black",
    captures: { black: 0, white: 0 },
    moveHistory: [],
    koPoint: null,
    consecutivePasses: 0,
    isGameOver: false,
  };
}

function getNeighbors(
  row: number,
  col: number,
  size: number
): { row: number; col: number }[] {
  const neighbors: { row: number; col: number }[] = [];
  if (row > 0) neighbors.push({ row: row - 1, col });
  if (row < size - 1) neighbors.push({ row: row + 1, col });
  if (col > 0) neighbors.push({ row, col: col - 1 });
  if (col < size - 1) neighbors.push({ row, col: col + 1 });
  return neighbors;
}

function getGroup(
  board: BoardState,
  row: number,
  col: number
): { stones: Set<string>; liberties: Set<string> } {
  const size = board.length;
  const color = board[row][col];
  const stones = new Set<string>();
  const liberties = new Set<string>();
  const visited = new Set<string>();
  const stack = [{ row, col }];

  while (stack.length > 0) {
    const pos = stack.pop()!;
    const key = `${pos.row},${pos.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (board[pos.row][pos.col] === null) {
      liberties.add(key);
      continue;
    }

    if (board[pos.row][pos.col] !== color) continue;

    stones.add(key);
    for (const neighbor of getNeighbors(pos.row, pos.col, size)) {
      stack.push(neighbor);
    }
  }

  return { stones, liberties };
}

function cloneBoard(board: BoardState): BoardState {
  return board.map((row) => [...row]);
}

function boardsEqual(a: BoardState, b: BoardState): boolean {
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export function placeStone(
  state: GameState,
  row: number,
  col: number
): GameState | null {
  const { board, currentPlayer } = state;
  const size = board.length;

  if (board[row][col] !== null) return null;

  if (
    state.koPoint &&
    state.koPoint.row === row &&
    state.koPoint.col === col
  ) {
    return null;
  }

  const newBoard = cloneBoard(board);
  newBoard[row][col] = currentPlayer;

  const opponent: StoneColor = currentPlayer === "black" ? "white" : "black";
  let capturedCount = 0;
  const capturedPositions: { row: number; col: number }[] = [];

  for (const neighbor of getNeighbors(row, col, size)) {
    if (newBoard[neighbor.row][neighbor.col] === opponent) {
      const group = getGroup(newBoard, neighbor.row, neighbor.col);
      if (group.liberties.size === 0) {
        for (const stoneKey of group.stones) {
          const [r, c] = stoneKey.split(",").map(Number);
          newBoard[r][c] = null;
          capturedCount++;
          capturedPositions.push({ row: r, col: c });
        }
      }
    }
  }

  const ownGroup = getGroup(newBoard, row, col);
  if (ownGroup.liberties.size === 0) {
    return null;
  }

  let koPoint: { row: number; col: number } | null = null;
  if (capturedCount === 1 && ownGroup.stones.size === 1) {
    koPoint = capturedPositions[0];
  }

  const newCaptures = { ...state.captures };
  newCaptures[currentPlayer] += capturedCount;

  return {
    board: newBoard,
    currentPlayer: opponent,
    captures: newCaptures,
    moveHistory: [...state.moveHistory, { row, col, color: currentPlayer }],
    koPoint,
    consecutivePasses: 0,
    isGameOver: false,
  };
}

export function pass(state: GameState): GameState {
  const opponent: StoneColor =
    state.currentPlayer === "black" ? "white" : "black";
  const newPasses = state.consecutivePasses + 1;

  return {
    ...state,
    currentPlayer: opponent,
    koPoint: null,
    consecutivePasses: newPasses,
    isGameOver: newPasses >= 2,
  };
}

export function countTerritory(board: BoardState): {
  black: number;
  white: number;
} {
  const size = board.length;
  const visited = new Set<string>();
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      if (board[r][c] !== null || visited.has(key)) continue;

      const territory = new Set<string>();
      const borders = new Set<StoneColor>();
      const stack = [{ row: r, col: c }];

      while (stack.length > 0) {
        const pos = stack.pop()!;
        const posKey = `${pos.row},${pos.col}`;
        if (visited.has(posKey) || territory.has(posKey)) continue;

        if (board[pos.row][pos.col] !== null) {
          borders.add(board[pos.row][pos.col]!);
          continue;
        }

        territory.add(posKey);
        visited.add(posKey);

        for (const neighbor of getNeighbors(pos.row, pos.col, size)) {
          stack.push(neighbor);
        }
      }

      if (borders.size === 1) {
        const owner = borders.values().next().value!;
        if (owner === "black") blackTerritory += territory.size;
        else whiteTerritory += territory.size;
      }
    }
  }

  return { black: blackTerritory, white: whiteTerritory };
}

export function calculateScore(
  state: GameState,
  komi: number = 6.5
): { black: number; white: number; winner: string } {
  const territory = countTerritory(state.board);
  const black = territory.black + state.captures.black;
  const white = territory.white + state.captures.white + komi;

  return {
    black,
    white,
    winner: black > white ? "흑 승" : white > black ? "백 승" : "무승부",
  };
}
