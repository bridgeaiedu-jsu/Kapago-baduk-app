"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Board from "@/components/Board";

function GameContent() {
  const searchParams = useSearchParams();
  const sizeParam = searchParams.get("size");
  const size = sizeParam ? parseInt(sizeParam) : 19;
  const validSize = [9, 13, 19].includes(size) ? size : 19;
  const loadId = searchParams.get("load"); // 보관함 기보 열기

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
      {/* key: 반상 크기가 바뀌면 상태 스택을 새로 초기화 */}
      <Board key={validSize} size={validSize} loadId={loadId} />
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-white">
          로딩 중...
        </main>
      }
    >
      <GameContent />
    </Suspense>
  );
}
