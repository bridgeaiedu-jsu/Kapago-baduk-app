// =============================================================================
// 기보 보관함 — IndexedDB
// 여러 대국을 저장·목록·불러오기. localStorage 자동 저장(진행 중 1국)과 별개로
// 완결된 기보를 영구 보관하는 용도.
// =============================================================================

import type { Move } from "./game-logic";

const DB_NAME = "kapago";
const DB_VERSION = 1;
const STORE = "games";

export interface LibraryGame {
  readonly id: string;
  readonly title: string;
  readonly size: number;
  readonly moves: readonly Move[];
  readonly savedAt: number; // epoch ms
  readonly moveCount: number;
  /** 계가까지 끝났다면 결과 문구 (예: "흑 3.5집 승") */
  readonly result: string | null;
}

export type LibrarySummary = Omit<LibraryGame, "moves">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToLibrary(input: {
  title: string;
  size: number;
  moves: readonly Move[];
  result?: string | null;
}): Promise<string> {
  const db = await openDb();
  try {
    const record: LibraryGame = {
      id: crypto.randomUUID(),
      title: input.title,
      size: input.size,
      moves: input.moves,
      savedAt: Date.now(),
      moveCount: input.moves.length,
      result: input.result ?? null,
    };
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).add(record));
    return record.id;
  } finally {
    db.close();
  }
}

/** 최신 저장 순으로 목록 (기보 본문 제외) */
export async function listLibrary(): Promise<LibrarySummary[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const all = await requestToPromise(
      tx.objectStore(STORE).getAll() as IDBRequest<LibraryGame[]>
    );
    return all
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((game) => ({
        id: game.id,
        title: game.title,
        size: game.size,
        savedAt: game.savedAt,
        moveCount: game.moveCount,
        result: game.result,
      }));
  } finally {
    db.close();
  }
}

export async function loadFromLibrary(
  id: string
): Promise<LibraryGame | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const record = await requestToPromise(
      tx.objectStore(STORE).get(id) as IDBRequest<LibraryGame | undefined>
    );
    return record ?? null;
  } finally {
    db.close();
  }
}

export async function deleteFromLibrary(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await requestToPromise(tx.objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}
