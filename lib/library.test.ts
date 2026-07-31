import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { BLACK, WHITE, type Move } from "./game-logic";
import {
  deleteFromLibrary,
  listLibrary,
  loadFromLibrary,
  saveToLibrary,
} from "./library";

const MOVES: Move[] = [
  { type: "move", index: 40, color: BLACK },
  { type: "move", index: 22, color: WHITE },
  { type: "pass", color: BLACK },
];

beforeEach(() => {
  // 테스트마다 깨끗한 IndexedDB
  globalThis.indexedDB = new IDBFactory();
});

describe("기보 보관함", () => {
  it("저장 → 불러오기 라운드트립", async () => {
    const id = await saveToLibrary({
      title: "테스트 대국",
      size: 9,
      moves: MOVES,
      result: "흑 3.5집 승",
    });
    const loaded = await loadFromLibrary(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe("테스트 대국");
    expect(loaded!.size).toBe(9);
    expect(loaded!.moves).toEqual(MOVES);
    expect(loaded!.moveCount).toBe(3);
    expect(loaded!.result).toBe("흑 3.5집 승");
  });

  it("목록은 최신 저장 순이고 기보 본문을 포함하지 않는다", async () => {
    await saveToLibrary({ title: "첫 대국", size: 9, moves: MOVES });
    await new Promise((r) => setTimeout(r, 5)); // savedAt 차이 보장
    await saveToLibrary({ title: "둘째 대국", size: 19, moves: MOVES });

    const list = await listLibrary();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe("둘째 대국");
    expect(list[1].title).toBe("첫 대국");
    expect("moves" in list[0]).toBe(false);
  });

  it("삭제하면 목록과 조회에서 사라진다", async () => {
    const id = await saveToLibrary({ title: "지울 대국", size: 13, moves: MOVES });
    await deleteFromLibrary(id);
    expect(await loadFromLibrary(id)).toBeNull();
    expect(await listLibrary()).toHaveLength(0);
  });

  it("없는 id는 null", async () => {
    expect(await loadFromLibrary("no-such-id")).toBeNull();
  });
});
