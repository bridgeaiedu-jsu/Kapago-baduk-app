"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { exportSGF, importSGF } from "@/lib/sgf";
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

  // 수순 탐색: null = 최신(대국 진행), 숫자 = stack의 해당 국면을 열람 중
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const isViewing = viewIndex !== null && viewIndex < stack.length - 1;
  /** 반상·패널에 실제로 표시되는 국면 */
  const displayed = isViewing ? stack[viewIndex] : current;

  const [hoverIndex, setHoverIndex] = useState<number | null>(null); // 마우스
  const [pendingIndex, setPendingIndex] = useState<number | null>(null); // 터치 미리보기
  const [cursorIndex, setCursorIndex] = useState<number | null>(null); // 키보드
  const [deadStones, setDeadStones] = useState<ReadonlySet<number>>(new Set());
  const [message, setMessage] = useState<{
    text: string;
    key: number;
    tone: "error" | "info";
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const boardSpan = (size - 1) * CELL + PAD * 2;

  // ---------------------------------------------------------------------------
  // 저장/복원 (A3) — 서버 렌더와의 불일치를 피하려고 마운트 후 복원
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const saved = loadGame(size);
    if (saved && saved.moves.length > 0) {
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

  const notify = useCallback((text: string, tone: "error" | "info") => {
    setMessage({ text, key: Date.now(), tone });
    setAnnouncement(text);
  }, []);

  const showError = useCallback(
    (reason: MoveError) => notify(MOVE_ERROR_TEXT[reason], "error"),
    [notify]
  );

  const tryPlace = useCallback(
    (index: number) => {
      const result = placeStone(current, index);
      if (!result.ok) {
        showError(result.reason);
        return;
      }
      setStack((prev) => [...prev, result.state]);
      setPendingIndex(null);
      setViewIndex(null);
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
      if (isViewing) {
        notify(
          "수순 탐색 중입니다 — 최신 수로 이동하거나 '여기서부터 다시 두기'를 누르세요",
          "info"
        );
        return;
      }
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
    [current, deadStones, isViewing, notify, pendingIndex, size, tryPlace]
  );

  const handleUndo = useCallback(() => {
    if (stack.length <= 1 || isViewing) return;
    setStack((prev) => prev.slice(0, -1)); // 패스·종국 포함 정확히 한 수 취소
    setDeadStones(new Set());
    setPendingIndex(null);
    setAnnouncement("한 수 무름");
  }, [isViewing, stack.length]);

  const handlePass = useCallback(() => {
    if (current.isGameOver || isViewing) return;
    const next = pass(current);
    setStack((prev) => [...prev, next]);
    setPendingIndex(null);
    setAnnouncement(
      next.isGameOver
        ? "두 번 연속 패스 — 종국. 죽은 돌을 클릭해 사석을 표시하세요."
        : `${colorName(current.currentPlayer)} 패스. ${colorName(next.currentPlayer)} 차례.`
    );
  }, [current, isViewing]);

  const handleReset = useCallback(() => {
    // S1: 진행 중 대국은 확인 후에만 폐기 — 실수 탭으로 인한 데이터 손실 방지
    if (
      current.moveHistory.length > 0 &&
      !window.confirm(
        `진행 중인 대국(${current.moveHistory.length}수)을 지우고 새 게임을 시작할까요?`
      )
    ) {
      return;
    }
    setStack([createInitialGameState(size)]);
    setDeadStones(new Set());
    setPendingIndex(null);
    setViewIndex(null);
    setMessage(null);
    clearGame(size);
    setAnnouncement("새 게임 시작. 흑 차례.");
  }, [current.moveHistory.length, size]);

  /** 탐색 중인 국면에서 이후 수순을 버리고 대국 재개 */
  const handleBranchHere = useCallback(() => {
    if (!isViewing || viewIndex === null) return;
    const discarded = stack.length - 1 - viewIndex;
    if (
      !window.confirm(
        `이 수 이후의 ${discarded}수를 지우고 여기서부터 다시 둘까요?`
      )
    ) {
      return;
    }
    const truncated = stack.slice(0, viewIndex + 1);
    setStack(truncated);
    setViewIndex(null);
    setDeadStones(new Set());
    setPendingIndex(null);
    if (truncated[truncated.length - 1].moveHistory.length === 0) {
      clearGame(size); // 첫 수 이전으로 돌아갔으면 자동 저장도 비운다
    }
    setAnnouncement(
      `${truncated[truncated.length - 1].moveHistory.length}수 시점부터 대국 재개`
    );
  }, [isViewing, size, stack, viewIndex]);

  // ---------------------------------------------------------------------------
  // SGF 기보 저장/불러오기
  // ---------------------------------------------------------------------------

  const handleExportSgf = useCallback(() => {
    const score = current.isGameOver
      ? calculateScore(current, deadStones)
      : null;
    const sgf = exportSGF(size, current.moveHistory, { score });
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:]/g, "")
      .replace("T", "-");
    const blob = new Blob([sgf], { type: "application/x-go-sgf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kapago-${size}x${size}-${stamp}.sgf`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("기보를 SGF 파일로 저장했습니다", "info");
  }, [current, deadStones, notify, size]);

  const SGF_IMPORT_ERROR: Record<string, string> = useMemo(
    () => ({
      invalid: "SGF 형식을 해석할 수 없습니다",
      "not-go": "바둑(GM[1]) 기보가 아닙니다",
      "bad-size": "지원하지 않는 반상 크기입니다 (9·13·19만 지원)",
      handicap: "치석(핸디캡) 기보는 아직 지원하지 않습니다",
    }),
    []
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = importSGF(text);
      if (!parsed.ok) {
        notify(SGF_IMPORT_ERROR[parsed.reason], "error");
        return;
      }

      // S2: 진행 중 대국을 덮어쓰기 전에 확인
      if (
        current.moveHistory.length > 0 &&
        !window.confirm(
          `진행 중인 대국(${current.moveHistory.length}수)을 불러온 기보로 교체할까요?`
        )
      ) {
        return;
      }

      // S4: 크기와 무관하게 먼저 재생·검증 — 규칙 위반 수는 잘라내고 안내
      const newStack = replayMoves(parsed.size, parsed.moves);
      const replayed = newStack.length - 1;
      const validMoves = newStack[newStack.length - 1].moveHistory;

      if (parsed.size !== size) {
        // 다른 반상 크기 — 검증된 수순만 저장 후 해당 크기 페이지로 이동해 복원
        saveGame({ size: parsed.size, moves: validMoves });
        router.push(`/game?size=${parsed.size}`);
        return;
      }

      setStack(newStack);
      setDeadStones(new Set());
      setPendingIndex(null);
      setViewIndex(null);
      if (replayed < parsed.moves.length) {
        notify(
          `기보에 규칙 위반 수가 있어 ${replayed}수까지만 불러왔습니다`,
          "error"
        );
      } else {
        notify(`기보 ${replayed}수를 불러왔습니다`, "info");
      }
    },
    [SGF_IMPORT_ERROR, current.moveHistory.length, notify, router, size]
  );

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
    for (let i = displayed.moveHistory.length - 1; i >= 0; i--) {
      const move = displayed.moveHistory[i];
      if (move.type === "move") return move.index;
    }
    return null;
  }, [displayed.moveHistory]);

  const score = useMemo(
    () =>
      current.isGameOver && !isViewing
        ? calculateScore(current, deadStones)
        : null,
    [current, deadStones, isViewing]
  );

  const previewIndex =
    !current.isGameOver &&
    !isViewing &&
    hoverIndex !== null &&
    current.grid[hoverIndex] === EMPTY
      ? hoverIndex
      : null;

  // S5: 미리보기 자리의 합법성 — 불법(패·자살수·초과패)이면 클릭 전에 표시
  const previewLegal = useMemo(
    () => (previewIndex !== null ? placeStone(current, previewIndex).ok : true),
    [current, previewIndex]
  );

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
            isViewing
              ? `수순 탐색 중 (${displayed.moveHistory.length}수 시점)`
              : current.isGameOver
                ? "종국 — 사석 표시 중"
                : `${colorName(current.currentPlayer)} 차례`
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
          {Array.from(displayed.grid).map((cell, index) => {
            if (cell === EMPTY) return null;
            const { row, col } = indexToCoord(index, size);
            const cx = PAD + col * CELL;
            const cy = PAD + row * CELL;
            const isDead = !isViewing && deadStones.has(index);
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
            displayed.grid[lastMoveIndex] !== EMPTY &&
            (() => {
              const { row, col } = indexToCoord(lastMoveIndex, size);
              return (
                <circle
                  cx={PAD + col * CELL}
                  cy={PAD + row * CELL}
                  r={CELL * 0.2}
                  fill="none"
                  stroke={
                    displayed.grid[lastMoveIndex] === BLACK ? "#fff" : "#000"
                  }
                  strokeWidth={2.5}
                />
              );
            })()}

          {/* 마우스 미리보기 — 불법 자리는 빨간 X로 경고 */}
          {previewIndex !== null &&
            previewIndex !== pendingIndex &&
            (() => {
              const { row, col } = indexToCoord(previewIndex, size);
              const cx = PAD + col * CELL;
              const cy = PAD + row * CELL;
              if (!previewLegal) {
                return (
                  <g stroke="#dc2626" strokeWidth={4} strokeLinecap="round" opacity={0.8}>
                    <line x1={cx - 10} y1={cy - 10} x2={cx + 10} y2={cy + 10} />
                    <line x1={cx - 10} y1={cy + 10} x2={cx + 10} y2={cy - 10} />
                  </g>
                );
              }
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={CELL * 0.46}
                  fill={current.currentPlayer === BLACK ? "#000" : "#fff"}
                  opacity={0.4}
                />
              );
            })()}

          {/* 터치 Tap-Preview-Confirm 대기 돌 */}
          {pendingIndex !== null &&
            !current.isGameOver &&
            !isViewing &&
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

        {/* 수순 탐색 내비게이션 */}
        {stack.length > 1 && (
          <div className="mt-3 flex items-center gap-2 text-white">
            <button
              type="button"
              onClick={() => setViewIndex(0)}
              disabled={displayed.moveHistory.length === 0}
              aria-label="처음으로"
              className="rounded bg-gray-700 px-2 py-1 text-sm hover:bg-gray-600 disabled:opacity-40"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() =>
                setViewIndex(
                  Math.max(0, (viewIndex ?? stack.length - 1) - 1)
                )
              }
              disabled={displayed.moveHistory.length === 0}
              aria-label="한 수 이전"
              className="rounded bg-gray-700 px-2 py-1 text-sm hover:bg-gray-600 disabled:opacity-40"
            >
              ◀
            </button>
            <input
              type="range"
              min={0}
              max={stack.length - 1}
              value={viewIndex ?? stack.length - 1}
              onChange={(e) => {
                const value = Number(e.target.value);
                setViewIndex(value >= stack.length - 1 ? null : value);
              }}
              aria-label="수순 탐색"
              className="min-w-0 flex-1 accent-amber-500"
            />
            <button
              type="button"
              onClick={() => {
                const next = (viewIndex ?? stack.length - 1) + 1;
                setViewIndex(next >= stack.length - 1 ? null : next);
              }}
              disabled={!isViewing}
              aria-label="한 수 다음"
              className="rounded bg-gray-700 px-2 py-1 text-sm hover:bg-gray-600 disabled:opacity-40"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setViewIndex(null)}
              disabled={!isViewing}
              aria-label="최신 수로"
              className="rounded bg-gray-700 px-2 py-1 text-sm hover:bg-gray-600 disabled:opacity-40"
            >
              ⏭
            </button>
            <span className="w-20 text-right text-sm tabular-nums text-gray-300">
              {displayed.moveHistory.length} / {current.moveHistory.length}수
            </span>
          </div>
        )}
        {isViewing && (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={handleBranchHere}
              className="rounded-lg bg-amber-700 px-4 py-1.5 text-sm text-white transition-colors hover:bg-amber-600"
            >
              여기서부터 다시 두기
            </button>
          </div>
        )}

        {/* 착수 불가·안내 피드백 (A2) */}
        <div className="mt-3 h-6 text-center">
          {message && (
            <span
              key={message.key}
              className={`rounded px-3 py-1 text-sm ${
                message.tone === "error"
                  ? "bg-red-900/80 text-red-100"
                  : "bg-emerald-900/80 text-emerald-100"
              }`}
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
                displayed.currentPlayer === BLACK
                  ? "radial-gradient(circle at 35% 35%, #555, #000)"
                  : "radial-gradient(circle at 35% 35%, #fff, #ccc)",
            }}
          />
          <span className="text-lg">
            {isViewing
              ? `탐색 중 — ${displayed.moveHistory.length}수 시점`
              : current.isGameOver
                ? "종국 — 사석 표시"
                : `${colorName(current.currentPlayer)} 차례`}
          </span>
        </div>

        <div className="space-y-2 rounded-lg bg-gray-800 p-4">
          <div className="flex justify-between">
            <span>흑이 잡은 돌</span>
            <span className="font-bold">{displayed.captures.black}</span>
          </div>
          <div className="flex justify-between">
            <span>백이 잡은 돌</span>
            <span className="font-bold">{displayed.captures.white}</span>
          </div>
          <div className="flex justify-between">
            <span>수</span>
            <span className="font-bold">{displayed.moveHistory.length}</span>
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
            disabled={current.isGameOver || isViewing}
            className="rounded-lg bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600 disabled:opacity-40"
          >
            패스
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={stack.length <= 1 || isViewing}
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

        <div className="flex flex-col gap-2 border-t border-gray-700 pt-4">
          <button
            type="button"
            onClick={handleExportSgf}
            disabled={current.moveHistory.length === 0}
            className="rounded-lg bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600 disabled:opacity-40"
          >
            기보 저장 (SGF)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600"
          >
            기보 불러오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sgf,application/x-go-sgf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = ""; // 같은 파일 재선택 허용
            }}
          />
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
