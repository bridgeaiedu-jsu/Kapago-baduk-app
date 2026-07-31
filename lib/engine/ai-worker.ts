// =============================================================================
// AI Web Worker — MCTS 탐색을 메인 스레드 밖에서 실행 (UI 멈춤 방지)
// 요청마다 수순을 재생해 국면을 재구성하는 무상태 설계.
// =============================================================================

import { replayMoves, type Move } from "../game-logic";
import { chooseMove } from "./mcts";

export interface AiRequest {
  readonly id: number;
  readonly size: number;
  readonly moves: readonly Move[];
  readonly playouts: number;
  readonly lastMoveWasPass: boolean;
}

export interface AiResponse {
  readonly id: number;
  /** 착수 인덱스, PASS(-1)면 패스 */
  readonly move: number;
}

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, size, moves, playouts, lastMoveWasPass } = event.data;
  const stack = replayMoves(size, moves);
  const state = stack[stack.length - 1];
  const result = chooseMove(state, { playouts, lastMoveWasPass });
  const response: AiResponse = { id, move: result.move };
  self.postMessage(response);
};
