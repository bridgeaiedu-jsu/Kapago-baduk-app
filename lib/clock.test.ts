import { describe, expect, it } from "vitest";
import { BLACK, WHITE } from "./game-logic";
import {
  createClock,
  formatMs,
  onMoveComplete,
  tickClock,
} from "./clock";

describe("절대 시간 (abs10)", () => {
  it("본시간이 줄어든다", () => {
    const clock = tickClock(createClock("abs10"), BLACK, 60_000);
    expect(clock.black.mainMs).toBe(9 * 60_000);
    expect(clock.white.mainMs).toBe(10 * 60_000); // 상대는 그대로
    expect(clock.loser).toBeNull();
  });

  it("본시간 소진 시 시간패", () => {
    const clock = tickClock(createClock("abs10"), WHITE, 10 * 60_000 + 1);
    expect(clock.loser).toBe(WHITE);
  });
});

describe("초읽기 (byo5x30)", () => {
  it("본시간 소진 후 초읽기로 진입한다", () => {
    const clock = tickClock(createClock("byo5x30"), BLACK, 5 * 60_000 + 10_000);
    expect(clock.black.mainMs).toBe(0);
    expect(clock.black.inByoyomi).toBe(true);
    expect(clock.black.periods).toBe(3);
    expect(clock.black.periodMs).toBe(20_000); // 30초 중 10초 사용
    expect(clock.loser).toBeNull();
  });

  it("초읽기 기간을 넘기면 횟수가 줄고 기간이 재시작된다", () => {
    let clock = tickClock(createClock("byo5x30"), BLACK, 5 * 60_000); // 본시간 정확히 소진
    clock = tickClock(clock, BLACK, 35_000); // 초읽기 1개 소진 + 5초
    expect(clock.black.periods).toBe(2);
    expect(clock.black.periodMs).toBe(25_000);
    expect(clock.loser).toBeNull();
  });

  it("착수하면 현재 초읽기 기간이 리셋된다", () => {
    let clock = tickClock(createClock("byo5x30"), BLACK, 5 * 60_000 + 25_000);
    expect(clock.black.periodMs).toBe(5_000); // 5초 남음
    clock = onMoveComplete(clock, BLACK);
    expect(clock.black.periodMs).toBe(30_000); // 리셋
    expect(clock.black.periods).toBe(3); // 횟수는 유지
  });

  it("본시간 중 착수는 시간을 돌려주지 않는다", () => {
    let clock = tickClock(createClock("byo5x30"), BLACK, 60_000);
    clock = onMoveComplete(clock, BLACK);
    expect(clock.black.mainMs).toBe(4 * 60_000);
  });

  it("마지막 초읽기까지 소진하면 시간패", () => {
    // 본시간 5분 + 초읽기 3×30초 = 총 6분 30초
    const clock = tickClock(
      createClock("byo5x30"),
      WHITE,
      5 * 60_000 + 3 * 30_000 + 1
    );
    expect(clock.loser).toBe(WHITE);
  });

  it("한 번의 큰 지연도 여러 초읽기를 정확히 소진한다", () => {
    let clock = tickClock(createClock("byo5x30"), BLACK, 5 * 60_000);
    clock = tickClock(clock, BLACK, 65_000); // 30+30+5 → 2개 소진, 마지막 25초
    expect(clock.black.periods).toBe(1);
    expect(clock.black.periodMs).toBe(25_000);
  });
});

describe("formatMs", () => {
  it("mm:ss 표기, 잔여 시간은 올림", () => {
    expect(formatMs(10 * 60_000)).toBe("10:00");
    expect(formatMs(61_000)).toBe("1:01");
    expect(formatMs(200)).toBe("0:01"); // 0.2초 → 0:01
    expect(formatMs(0)).toBe("0:00");
  });
});
