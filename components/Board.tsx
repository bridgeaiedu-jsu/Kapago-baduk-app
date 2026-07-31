"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BLACK,
  EMPTY,
  GTP_LETTERS,
  WHITE,
  calculateScore,
  createInitialGameState,
  indexToCoord,
  pass,
  placeStone,
  pointName,
  replayMoves,
  toggleDeadGroup,
  type GameState,
  type MoveError,
  type StoneColor,
} from "@/lib/game-logic";
import { clearGame, loadGame, saveGame } from "@/lib/storage";

// -----------------------------------------------------------------------------
// 상수
// -----------------------------------------------------------------------------

const STAR_POINTS: Record<number, [number, number][]> = {
  9: [
    [2, 2], [2, 6], [4, 4], [6, 2], [6, 6],
  ],
  13: [
    [3, 3], [3, 9], [6, 6], [9, 3], [9, 9],
  ],
  19: [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15],
  ],
};

/** viewBox 좌표계 — 화면 픽셀과 무관한 추상 단위 (반응형은 CSS가 담당) */
const CELL = 40;
const PAD = 46;

const MOVE_ERROR_TEXT: Record<MoveError, string> = {
  "game-over": "게임이 끝났습니다 — 죽은 돌을 클릭해 사석을 표시하세요",
  occupied: "이미 돌이 있는 자리입니다",
  ko: "패(ko) — 한 수 다른 곳을 둔 뒤 되따낼 수 있습니다",
  suicide: "자살수는 둘 수 없습니다",
  superko: "동일한 반상의 반복(초과패)은 금지됩니다",
};

function colorName(color: StoneColor): string {
  return color === BLACK ? "흑" : "백";
}

// -----------------------------------------------------------------------------
// 컴포넌트
// -----------------------------------------------------------------------------

export default function Board({ size }: { size: number }) {
  // 상태 스택 — 무르기 O(1). stack[stack.length - 1]이 현재 국면.
  const [stack, setStack] = useState<GameState[]>(() => [
    createInitialGameState(size),
  ]);
  const current = stack[stack.length - 1];

  const [hoverIndex, setHoverIndex] = useState<number | null>(null); // 마우스
  const [pendingIndex, setPendingIndex] = useState<number | null>(null); // 터치 미리보기
  const [cursorIndex, setCursorIndex] = useState<number | null>(null); // 키보드
  const [deadStones, setDeadStones] = useState<ReadonlySet<number>>(new Set());
  const [message, setMessage] = useState<{ text: string; key: number } | null>(
    null
  );
  const [announcement, setAnnouncement] = useState("");

  const svgRef = useRef<SVGSVGElement>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const boardSpan = (size - 1) * CELL + PAD * 2;

  // ---------------------------------------------------------------------------
  // 저장/복원 (A3) — 서버 렌더와의 불일치를 피하려고 마운트 후 복원
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const saved = loadGame();
    if (saved && saved.size === size && saved.moves.length > 0) {
      // localStorage는 서버 렌더에 없으므로 하이드레이션 후 한 번만 동기화한다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStack(replayMoves(size, saved.moves));
    }
  }, [size]);

  useEffect(() => {
    if (current.moveHistory.length > 0) {
      saveGame({ size, moves: current.moveHistory });
    }
  }, [current, size]);

  // 착수 불가 메시지 자동 소멸
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  // ---------------------------------------------------------------------------
  // 조작
  // ---------------------------------------------------------------------------

  const showError = useCallback((reason: MoveError) => {
    const text = MOVE_ERROR_TEXT[reason];
    setMessage({ text, key: Date.now() });
    setAnnouncement(text);
  }, []);

  const tryPlace = useCallback(
    (index: number) => {
      const result = placeStone(current, index);
      if (!result.ok) {
        showError(result.reason);
        return;
      }
      setStack((prev) => [...prev, result.state]);
      setPendingIndex(null);
      setAnnouncement(
        `${colorName(current.currentPlayer)} ${pointName(index, size)} 착수. ` +
          `${colorName(result.state.currentPlayer)} 차례.`
      );
    },
    [current, showError, size]
  );

  /** 종국 후: 사석 토글. 대국 중: 착수(마우스는 즉시, 터치는 2탭 확정). */
  const handleTap = useCallback(
    (index: number, pointerType: string) => {
      if (current.isGameOver) {
        if (current.grid[index] !== EMPTY) {
          const next = toggleDeadGroup(current.grid, size, deadStones, index);
          setDeadStones(next);
          setAnnouncement(
            next.has(index)
              ? `${pointName(index, size)} 그룹을 사석으로 표시`
              : `${pointName(index, size)} 그룹 사석 해제`
          );
        }
        return;
      }
      if (pointerType === "mouse") {
        tryPlace(index);
        return;
      }
      // Tap-Preview-Confirm: 첫 탭은 미리보기, 같은 자리 재탭이 확정
      if (pendingIndex === index) {
        tryPlace(index);
      } else if (current.grid[index] === EMPTY) {
        setPendingIndex(index);
        setAnnouncement(
          `${pointName(index, size)} 선택됨 — 같은 자리를 다시 탭하면 착수`
        );
      }
    },
    [current, deadStones, pendingIndex, size, tryPlace]
  );

  const handleUndo = useCallback(() => {
    if (stack.length <= 1) return;
    setStack((prev) => prev.slice(0, -1)); // 패스·종국 포함 정확히 한 수 취소
    setDeadStones(new Set());
    setPendingIndex(null);
    setAnnouncement("한 수 무름");
  }, [stack.length]);

  const handlePass = useCallback(() => {
    if (current.isGameOver) return;
    const next = pass(current);
    setStack((prev) => [...prev, next]);
    setPendingIndex(null);
    setAnnouncement(
      next.isGameOver
        ? "두 번 연속 패스 — 종국. 죽은 돌을 클릭해 사석을 표시하세요."
        : `${colorName(current.currentPlayer)} 패스. ${colorName(next.currentPlayer)} 차례.`
    );
  }, [current]);

  const handleReset = useCallback(() => {
    setStack([createInitialGameState(size)]);
    setDeadStones(new Set());
    setPendingIndex(null);
    setMessage(null);
    clearGame();
    setAnnouncement("새 게임 시작. 흑 차례.");
  }, [size]);

  // ---------------------------------------------------------------------------
  // 포인터 — SVG 루트 1곳에서 위임 처리 (교차점별 핸들러 361개 제거)
  // ---------------------------------------------------------------------------

  const eventToIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * boardSpan;
      const y = ((clientY - rect.top) / rect.height) * boardSpan;
      const col = Math.round((x - PAD) / CELL);
      const row = Math.round((y - PAD) / CELL);
      if (row < 0 || row >= size || col < 0 || col >= size) return null;
      return row * size + col;
    },
    [boardSpan, size]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down) return;
      // 드래그(스크롤 시도 등)는 탭으로 취급하지 않음
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
      const index = eventToIndex(e.clientX, e.clientY);
      if (index !== null) handleTap(index, e.pointerType);
    },
    [eventToIndex, handleTap]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      setHoverIndex(eventToIndex(e.clientX, e.clientY));
    },
    [eventToIndex]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverIndex(null);
    pointerDownRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // 키보드 — 방향키 이동 + Enter/Space 착수 (접근성)
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const arrows: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };

      if (e.key in arrows) {
        e.preventDefault();
        const center = coordCenter(size);
        const from =
          cursorIndex !== null ? indexToCoord(cursorIndex, size) : center;
        const [dr, dc] = arrows[e.key];
        const row = Math.min(size - 1, Math.max(0, from.row + dr));
        const col = Math.min(size - 1, Math.max(0, from.col + dc));
        const next = row * size + col;
        setCursorIndex(next);
        const cell = current.grid[next];
        setAnnouncement(
          `${pointName(next, size)}, ${cell === EMPTY ? "빈 자리" : `${colorName(cell as StoneColor)}돌`}`
        );
        return;
      }

      if ((e.key === "Enter" || e.key === " ") && cursorIndex !== null) {
        e.preventDefault();
        // 키보드는 명시적 이동 후 입력이므로 즉시 확정 (마우스와 동일 경로)
        handleTap(cursorIndex, "mouse");
        return;
      }

      if (e.key === "Escape") {
        setPendingIndex(null);
        setCursorIndex(null);
      }
    },
    [current, cursorIndex, handleTap, size]
  );

  // ---------------------------------------------------------------------------
  // 파생 값
  // ---------------------------------------------------------------------------

  const lastMoveIndex = useMemo(() => {
    for (let i = current.moveHistory.length - 1; i >= 0; i--) {
      const move = current.moveHistory[i];
      if (move.type === "move") return move.index;
    }
    return null;
  }, [current.moveHistory]);

  const score = useMemo(
    () => (current.isGameOver ? calculateScore(current, deadStones) : null),
    [current, deadStones]
  );

  const previewIndex =
    !current.isGameOver &&
    hoverIndex !== null &&
    current.grid[hoverIndex] === EMPTY
      ? hoverIndex
      : null;

  // ---------------------------------------------------------------------------
  // 렌더
  // ---------------------------------------------------------------------------

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
      {/* 스크린리더 실황 안내 */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="w-full max-w-[640px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${boardSpan} ${boardSpan}`}
          className="block h-auto w-full touch-none rounded-lg shadow-2xl outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
          style={{ backgroundColor: "var(--board-color)" }}
          role="application"
          aria-label={`${size}×${size} 바둑판. 방향키로 이동, 엔터로 착수. 현재 ${
            current.isGameOver ? "종국 — 사석 표시 중" : `${colorName(current.currentPlayer)} 차례`
          }.`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
        >
          <defs>
            <radialGradient id="stone-black" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#555" />
              <stop offset="100%" stopColor="#000" />
            </radialGradient>
            <radialGradient id="stone-white" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="100%" stopColor="#ccc" />
            </radialGradient>
          </defs>

          {/* 격자 */}
          {Array.from({ length: size }, (_, i) => (
            <g key={`line-${i}`} stroke="var(--board-line)">
              <line
                x1={PAD}
                y1={PAD + i * CELL}
                x2={PAD + (size - 1) * CELL}
                y2={PAD + i * CELL}
                strokeWidth={i === 0 || i === size - 1 ? 2 : 1}
              />
              <line
                x1={PAD + i * CELL}
                y1={PAD}
                x2={PAD + i * CELL}
                y2={PAD + (size - 1) * CELL}
                strokeWidth={i === 0 || i === size - 1 ? 2 : 1}
              />
            </g>
          ))}

          {/* 화점 */}
          {(STAR_POINTS[size] ?? []).map(([row, col]) => (
            <circle
              key={`star-${row}-${col}`}
              cx={PAD + col * CELL}
              cy={PAD + row * CELL}
              r={4}
              fill="var(--board-line)"
            />
          ))}

          {/* 좌표 라벨 — P1 수정: SVG 내부에 렌더 */}
          {Array.from({ length: size }, (_, i) => (
            <g
              key={`label-${i}`}
              fill="#5a4a2a"
              fontSize={13}
              fontWeight="bold"
              textAnchor="middle"
            >
              <text x={PAD + i * CELL} y={boardSpan - PAD / 3}>
                {GTP_LETTERS[i]}
              </text>
              <text x={PAD / 3} y={PAD + i * CELL + 4.5}>
                {size - i}
              </text>
            </g>
          ))}

          {/* 종국 시 집 표시 */}
          {score &&
            score.territory.blackPoints.map((index) => {
              const { row, col } = indexToCoord(index, size);
              return (
                <rect
                  key={`tb-${index}`}
                  x={PAD + col * CELL - 6}
                  y={PAD + row * CELL - 6}
                  width={12}
                  height={12}
                  fill="#000"
                  opacity={0.55}
                />
              );
            })}
          {score &&
            score.territory.whitePoints.map((index) => {
              const { row, col } = indexToCoord(index, size);
              return (
                <rect
                  key={`tw-${index}`}
                  x={PAD + col * CELL - 6}
                  y={PAD + row * CELL - 6}
                  width={12}
                  height={12}
                  fill="#fff"
                  opacity={0.8}
                />
              );
            })}

          {/* 돌 */}
          {Array.from(current.grid).map((cell, index) => {
            if (cell === EMPTY) return null;
            const { row, col } = indexToCoord(index, size);
            const cx = PAD + col * CELL;
            const cy = PAD + row * CELL;
            const isDead = deadStones.has(index);
            return (
              <g key={`stone-${index}`} opacity={isDead ? 0.45 : 1}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={CELL * 0.46}
                  fill={cell === BLACK ? "url(#stone-black)" : "url(#stone-white)"}
                  stroke={cell === WHITE ? "#999" : "none"}
                  strokeWidth={0.5}
                />
                {isDead && (
                  <g stroke="#dc2626" strokeWidth={3} strokeLinecap="round">
                    <line x1={cx - 9} y1={cy - 9} x2={cx + 9} y2={cy + 9} />
                    <line x1={cx - 9} y1={cy + 9} x2={cx + 9} y2={cy - 9} />
                  </g>
                )}
              </g>
            );
          })}

          {/* 마지막 착수 표시 (A1) */}
          {lastMoveIndex !== null &&
            current.grid[lastMoveIndex] !== EMPTY &&
            (() => {
              const { row, col } = indexToCoord(lastMoveIndex, size);
              return (
                <circle
                  cx={PAD + col * CELL}
                  cy={PAD + row * CELL}
                  r={CELL * 0.2}
                  fill="none"
                  stroke={
                    current.grid[lastMoveIndex] === BLACK ? "#fff" : "#000"
                  }
                  strokeWidth={2.5}
                />
              );
            })()}

          {/* 마우스 미리보기 */}
          {previewIndex !== null &&
            previewIndex !== pendingIndex &&
            (() => {
              const { row, col } = indexToCoord(previewIndex, size);
              return (
                <circle
                  cx={PAD + col * CELL}
                  cy={PAD + row * CELL}
                  r={CELL * 0.46}
                  fill={current.currentPlayer === BLACK ? "#000" : "#fff"}
                  opacity={0.4}
                />
              );
            })()}

          {/* 터치 Tap-Preview-Confirm 대기 돌 */}
          {pendingIndex !== null &&
            !current.isGameOver &&
            (() => {
              const { row, col } = indexToCoord(pendingIndex, size);
              const cx = PAD + col * CELL;
              const cy = PAD + row * CELL;
              return (
                <g>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={CELL * 0.46}
                    fill={current.currentPlayer === BLACK ? "#000" : "#fff"}
                    opacity={0.55}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={CELL * 0.62}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                  />
                </g>
              );
            })()}

          {/* 키보드 커서 */}
          {cursorIndex !== null &&
            (() => {
              const { row, col } = indexToCoord(cursorIndex, size);
              return (
                <rect
                  x={PAD + col * CELL - CELL * 0.5}
                  y={PAD + row * CELL - CELL * 0.5}
                  width={CELL}
                  height={CELL}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  rx={6}
                />
              );
            })()}
        </svg>

        {/* 착수 불가 피드백 (A2) */}
        <div className="mt-3 h-6 text-center">
          {message && (
            <span
              key={message.key}
              className="rounded bg-red-900/80 px-3 py-1 text-sm text-red-100"
            >
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* 정보 패널 */}
      <div className="flex min-w-[220px] flex-col gap-4 text-white">
        <h2 className="text-2xl font-bold">
          {size} × {size} 바둑
        </h2>

        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="h-6 w-6 rounded-full"
            style={{
              background:
                current.currentPlayer === BLACK
                  ? "radial-gradient(circle at 35% 35%, #555, #000)"
                  : "radial-gradient(circle at 35% 35%, #fff, #ccc)",
            }}
          />
          <span className="text-lg">
            {current.isGameOver
              ? "종국 — 사석 표시"
              : `${colorName(current.currentPlayer)} 차례`}
          </span>
        </div>

        <div className="space-y-2 rounded-lg bg-gray-800 p-4">
          <div className="flex justify-between">
            <span>흑이 잡은 돌</span>
            <span className="font-bold">{current.captures.black}</span>
          </div>
          <div className="flex justify-between">
            <span>백이 잡은 돌</span>
            <span className="font-bold">{current.captures.white}</span>
          </div>
          <div className="flex justify-between">
            <span>수</span>
            <span className="font-bold">{current.moveHistory.length}</span>
          </div>
        </div>

        {score && (
          <div className="space-y-2 rounded-lg bg-amber-900 p-4">
            <h3 className="text-lg font-bold">계가</h3>
            <p className="text-xs text-amber-200">
              죽은 돌을 클릭하면 사석으로 반영됩니다
            </p>
            <div className="flex justify-between">
              <span>흑 (집 {score.blackTerritory} + 포로)</span>
              <span className="font-bold">{score.black}</span>
            </div>
            <div className="flex justify-between">
              <span>
                백 (집 {score.whiteTerritory} + 포로 + 덤 {score.komi})
              </span>
              <span className="font-bold">{score.white}</span>
            </div>
            <div className="mt-2 text-center text-xl font-bold">
              {score.winner === "draw"
                ? "무승부"
                : `${colorName(score.winner === "black" ? BLACK : WHITE)} ${Math.abs(score.black - score.white)}집 승`}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handlePass}
            disabled={current.isGameOver}
            className="rounded-lg bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600 disabled:opacity-40"
          >
            패스
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={stack.length <= 1}
            className="rounded-lg bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600 disabled:opacity-40"
          >
            무르기
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg bg-red-800 px-4 py-2 transition-colors hover:bg-red-700"
          >
            새 게임
          </button>
        </div>

        <Link
          href="/"
          className="mt-2 text-center text-gray-400 transition-colors hover:text-white"
        >
          보드 크기 변경
        </Link>
      </div>
    </div>
  );
}

function coordCenter(size: number): { row: number; col: number } {
  const mid = Math.floor(size / 2);
  return { row: mid, col: mid };
}
