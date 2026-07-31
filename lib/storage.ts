// =============================================================================
// 대국 저장/복원 — localStorage
// 수순(moveHistory)만 저장하고 로드 시 재생(replayMoves)으로 복원한다.
// =============================================================================

import type { Move } from "./game-logic";

/** 반상 크기별 독립 슬롯 — 9로를 열어도 19로 대국이 지워지지 않는다 */
function storageKey(size: number): string {
  return `baduk-game-v1:${size}`;
}

export interface SavedGame {
  readonly size: number;
  readonly moves: readonly Move[];
}

export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(storageKey(game.size), JSON.stringify(game));
  } catch {
    // 저장 불가(프라이빗 모드 등)여도 대국 진행에는 지장 없음
  }
}

export function loadGame(size: number): SavedGame | null {
  try {
    const raw = localStorage.getItem(storageKey(size));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (
      typeof parsed?.size !== "number" ||
      parsed.size !== size ||
      !Array.isArray(parsed?.moves)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGame(size: number): void {
  try {
    localStorage.removeItem(storageKey(size));
  } catch {
    // 무시
  }
}
