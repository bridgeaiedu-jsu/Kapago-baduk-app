"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  deleteFromLibrary,
  listLibrary,
  loadFromLibrary,
  type LibrarySummary,
} from "@/lib/library";
import { exportSGF } from "@/lib/sgf";

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LibraryPage() {
  const router = useRouter();
  const [games, setGames] = useState<LibrarySummary[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listLibrary(); // IndexedDB는 비동기 — setState는 await 이후
      setGames(list);
    } catch {
      setGames([]);
    }
  }, []);

  useEffect(() => {
    // IndexedDB(외부 시스템) 구독 — setState는 비동기 콜백에서만 일어난다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (game: LibrarySummary) => {
      if (!window.confirm(`"${game.title}" 기보를 삭제할까요?`)) return;
      await deleteFromLibrary(game.id);
      refresh();
    },
    [refresh]
  );

  const handleDownload = useCallback(async (game: LibrarySummary) => {
    const full = await loadFromLibrary(game.id);
    if (!full) return;
    const sgf = exportSGF(full.size, full.moves);
    const blob = new Blob([sgf], { type: "application/x-go-sgf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${game.title.replace(/[/\\:*?"<>|]/g, "_")}.sgf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-6 text-white">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">기보 보관함</h1>
        <Link href="/" className="text-gray-400 hover:text-white">
          ← 홈
        </Link>
      </div>

      {games === null ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : games.length === 0 ? (
        <div className="rounded-lg bg-gray-800 p-8 text-center text-gray-400">
          <p>저장된 기보가 없습니다.</p>
          <p className="mt-2 text-sm">
            대국 화면의 <strong>보관함에 저장</strong> 버튼으로 기보를 보관할 수
            있습니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {games.map((game) => (
            <li
              key={game.id}
              className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-bold">{game.title}</div>
                <div className="mt-1 text-sm text-gray-400">
                  {game.size}×{game.size} · {game.moveCount}수 ·{" "}
                  {formatDate(game.savedAt)}
                  {game.result && (
                    <span className="ml-2 text-amber-400">{game.result}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/game?size=${game.size}&load=${game.id}`)
                  }
                  className="rounded bg-amber-700 px-3 py-1.5 text-sm hover:bg-amber-600"
                >
                  열기
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(game)}
                  className="rounded bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600"
                >
                  SGF
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(game)}
                  className="rounded bg-red-900 px-3 py-1.5 text-sm hover:bg-red-800"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
