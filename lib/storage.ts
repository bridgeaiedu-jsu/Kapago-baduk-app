// =============================================================================
// 대국 저장/복원 — localStorage
// 수순(moveHistory)만 저장하고 로드 시 재생(replayMoves)으로 복원한다.
// =============================================================================

import type { Move } from "./game-logic";

const STORAGE_KEY = "baduk-game-v1";

export interface SavedGame {
  readonly size: number;
  readonly moves: readonly Move[];
}

export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    // 저장 불가(프라이빗 모드 등)여도 대국 진행에는 지장 없음
  }
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (
      typeof parsed?.size !== "number" ||
      !Array.isArray(parsed?.moves)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}
