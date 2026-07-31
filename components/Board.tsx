"use client";

import { useState, useCallback } from "react";
import {
  GameState,
  createInitialGameState,
  placeStone,
  pass,
  calculateScore,
} from "@/lib/game-logic";

const STAR_POINTS: Record<number, number[][]> = {
  9: [
    [2, 2],
    [2, 6],
    [4, 4],
    [6, 2],
    [6, 6],
  ],
  13: [
    [3, 3],
    [3, 9],
    [6, 6],
    [9, 3],
    [9, 9],
  ],
  19: [
    [3, 3],
    [3, 9],
    [3, 15],
    [9, 3],
    [9, 9],
    [9, 15],
    [15, 3],
    [15, 9],
    [15, 15],
  ],
};

export default function Board({ size }: { size: number }) {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState(size)
  );
  const [hoverPos, setHoverPos] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [scoreResult, setScoreResult] = useState<{
    black: number;
    white: number;
    winner: string;
  } | null>(null);

  const cellSize = size === 19 ? 28 : size === 13 ? 36 : 48;
  const padding = cellSize;
  const boardPixelSize = (size - 1) * cellSize + padding * 2;

  const handleClick = useCallback(
    (row: number, col: number) => {
      if (gameState.isGameOver) return;
      const newState = placeStone(gameState, row, col);
      if (newState) {
        setGameState(newState);
        setScoreResult(null);
      }
    },
    [gameState]
  );

  const handlePass = useCallback(() => {
    if (gameState.isGameOver) return;
    const newState = pass(gameState);
    setGameState(newState);
    if (newState.isGameOver) {
      setScoreResult(calculateScore(newState));
    }
  }, [gameState]);

  const handleUndo = useCallback(() => {
    if (gameState.moveHistory.length === 0) return;
    const newState = createInitialGameState(size);
    let current = newState;
    for (let i = 0; i < gameState.moveHistory.length - 1; i++) {
      const move = gameState.moveHistory[i];
      const next = placeStone(current, move.row, move.col);
      if (next) current = next;
    }
    setGameState(current);
    setScoreResult(null);
  }, [gameState, size]);

  const handleReset = useCallback(() => {
    setGameState(createInitialGameState(size));
    setScoreResult(null);
  }, [size]);

  const starPoints = STAR_POINTS[size] || [];

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
      <div
        className="relative rounded-lg shadow-2xl"
        style={{
          width: boardPixelSize,
          height: boardPixelSize,
          backgroundColor: "#dcb35c",
        }}
      >
        <svg
          width={boardPixelSize}
          height={boardPixelSize}
          className="absolute top-0 left-0"
        >
          {/* Grid lines */}
          {Array.from({ length: size }).map((_, i) => (
            <g key={`line-${i}`}>
              <line
                x1={padding}
                y1={padding + i * cellSize}
                x2={padding + (size - 1) * cellSize}
                y2={padding + i * cellSize}
                stroke="#2c2c2c"
                strokeWidth={i === 0 || i === size - 1 ? 1.5 : 0.8}
              />
              <line
                x1={padding + i * cellSize}
                y1={padding}
                x2={padding + i * cellSize}
                y2={padding + (size - 1) * cellSize}
                stroke="#2c2c2c"
                strokeWidth={i === 0 || i === size - 1 ? 1.5 : 0.8}
              />
            </g>
          ))}

          {/* Star points */}
          {starPoints.map(([r, c]) => (
            <circle
              key={`star-${r}-${c}`}
              cx={padding + c * cellSize}
              cy={padding + r * cellSize}
              r={3}
              fill="#2c2c2c"
            />
          ))}
        </svg>

        {/* Stones and click targets */}
        {Array.from({ length: size }).map((_, row) =>
          Array.from({ length: size }).map((_, col) => {
            const stone = gameState.board[row][col];
            const isHover =
              hoverPos?.row === row &&
              hoverPos?.col === col &&
              stone === null &&
              !gameState.isGameOver;
            const stoneRadius = cellSize * 0.44;

            return (
              <div
                key={`${row}-${col}`}
                className="absolute cursor-pointer"
                style={{
                  left: padding + col * cellSize - cellSize / 2,
                  top: padding + row * cellSize - cellSize / 2,
                  width: cellSize,
                  height: cellSize,
                }}
                onClick={() => handleClick(row, col)}
                onMouseEnter={() => setHoverPos({ row, col })}
                onMouseLeave={() => setHoverPos(null)}
              >
                {stone && (
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: stoneRadius * 2,
                      height: stoneRadius * 2,
                      left: (cellSize - stoneRadius * 2) / 2,
                      top: (cellSize - stoneRadius * 2) / 2,
                      background:
                        stone === "black"
                          ? "radial-gradient(circle at 35% 35%, #555, #000)"
                          : "radial-gradient(circle at 35% 35%, #fff, #ccc)",
                      boxShadow:
                        stone === "black"
                          ? "2px 2px 4px rgba(0,0,0,0.5)"
                          : "2px 2px 4px rgba(0,0,0,0.3)",
                    }}
                  />
                )}
                {isHover && (
                  <div
                    className="absolute rounded-full opacity-40"
                    style={{
                      width: stoneRadius * 2,
                      height: stoneRadius * 2,
                      left: (cellSize - stoneRadius * 2) / 2,
                      top: (cellSize - stoneRadius * 2) / 2,
                      background:
                        gameState.currentPlayer === "black" ? "#000" : "#fff",
                    }}
                  />
                )}
              </div>
            );
          })
        )}

        {/* Coordinate labels */}
        {Array.from({ length: size }).map((_, i) => {
          const letters = "ABCDEFGHJKLMNOPQRST";
          return (
            <g key={`label-${i}`}>
              <text
                x={padding + i * cellSize}
                y={boardPixelSize - padding / 3}
                textAnchor="middle"
                fontSize={10}
                fill="#5a4a2a"
                fontWeight="bold"
              >
                {letters[i]}
              </text>
              <text
                x={padding / 3}
                y={padding + i * cellSize + 4}
                textAnchor="middle"
                fontSize={10}
                fill="#5a4a2a"
                fontWeight="bold"
              >
                {size - i}
              </text>
            </g>
          );
        })}
      </div>

      {/* Game Info Panel */}
      <div className="flex flex-col gap-4 text-white min-w-[200px]">
        <h2 className="text-2xl font-bold">
          {size} x {size} 바둑
        </h2>

        <div className="flex items-center gap-3">
          <div
            className="w-6 h-6 rounded-full"
            style={{
              background:
                gameState.currentPlayer === "black"
                  ? "radial-gradient(circle at 35% 35%, #555, #000)"
                  : "radial-gradient(circle at 35% 35%, #fff, #ccc)",
            }}
          />
          <span className="text-lg">
            {gameState.isGameOver
              ? "게임 종료"
              : gameState.currentPlayer === "black"
                ? "흑 차례"
                : "백 차례"}
          </span>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between">
            <span>흑 잡은 돌:</span>
            <span className="font-bold">{gameState.captures.black}</span>
          </div>
          <div className="flex justify-between">
            <span>백 잡은 돌:</span>
            <span className="font-bold">{gameState.captures.white}</span>
          </div>
          <div className="flex justify-between">
            <span>수:</span>
            <span className="font-bold">{gameState.moveHistory.length}</span>
          </div>
        </div>

        {scoreResult && (
          <div className="bg-amber-900 rounded-lg p-4 space-y-2">
            <h3 className="font-bold text-lg">최종 결과</h3>
            <div className="flex justify-between">
              <span>흑:</span>
              <span>{scoreResult.black}점</span>
            </div>
            <div className="flex justify-between">
              <span>백 (덤 6.5):</span>
              <span>{scoreResult.white}점</span>
            </div>
            <div className="text-center text-xl font-bold mt-2">
              {scoreResult.winner}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handlePass}
            disabled={gameState.isGameOver}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors"
          >
            패스
          </button>
          <button
            onClick={handleUndo}
            disabled={gameState.moveHistory.length === 0}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors"
          >
            무르기
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg transition-colors"
          >
            새 게임
          </button>
        </div>

        <a
          href="/"
          className="text-center text-gray-400 hover:text-white transition-colors mt-4"
        >
          보드 크기 변경
        </a>
      </div>
    </div>
  );
}
