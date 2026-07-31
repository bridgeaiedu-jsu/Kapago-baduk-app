// =============================================================================
// 대국 시계 — 순수 로직 (UI 비의존, 테스트 가능)
// 절대 시간 + 초읽기(byo-yomi). 시간이 다한 쪽이 시간패.
// =============================================================================

import { BLACK, type StoneColor } from "./game-logic";

export type ClockPreset = "none" | "abs10" | "byo5x30";

export const CLOCK_PRESETS: Record<
  Exclude<ClockPreset, "none">,
  { label: string; mainMs: number; periods: number; periodMs: number }
> = {
  abs10: { label: "10분", mainMs: 10 * 60_000, periods: 0, periodMs: 0 },
  byo5x30: {
    label: "5분 + 초읽기 30초×3",
    mainMs: 5 * 60_000,
    periods: 3,
    periodMs: 30_000,
  },
};

export interface SideClock {
  readonly mainMs: number;
  /** 남은 초읽기 횟수 (초읽기 없으면 0) */
  readonly periods: number;
  /** 현재 초읽기의 남은 시간 */
  readonly periodMs: number;
  /** 초읽기 구간 진입 여부 */
  readonly inByoyomi: boolean;
}

export interface GameClock {
  readonly preset: Exclude<ClockPreset, "none">;
  readonly black: SideClock;
  readonly white: SideClock;
  /** 시간패 당한 색 (없으면 null) */
  readonly loser: StoneColor | null;
}

function initSide(preset: Exclude<ClockPreset, "none">): SideClock {
  const config = CLOCK_PRESETS[preset];
  return {
    mainMs: config.mainMs,
    periods: config.periods,
    periodMs: config.periodMs,
    inByoyomi: false,
  };
}

export function createClock(preset: Exclude<ClockPreset, "none">): GameClock {
  return {
    preset,
    black: initSide(preset),
    white: initSide(preset),
    loser: null,
  };
}

function tickSide(
  side: SideClock,
  preset: Exclude<ClockPreset, "none">,
  deltaMs: number
): { side: SideClock; expired: boolean } {
  let remaining = deltaMs;
  let { mainMs, periods, periodMs, inByoyomi } = side;

  // 1) 본시간 소진
  if (!inByoyomi) {
    if (mainMs > remaining) {
      return {
        side: { mainMs: mainMs - remaining, periods, periodMs, inByoyomi },
        expired: false,
      };
    }
    remaining -= mainMs;
    mainMs = 0;
    if (periods === 0) {
      // 초읽기 없는 절대 시간 → 시간패
      return {
        side: { mainMs: 0, periods, periodMs, inByoyomi: false },
        expired: true,
      };
    }
    inByoyomi = true;
    periodMs = CLOCK_PRESETS[preset].periodMs;
  }

  // 2) 초읽기 소진 — 기간을 넘길 때마다 횟수 차감
  while (remaining > 0) {
    if (periodMs > remaining) {
      periodMs -= remaining;
      remaining = 0;
      break;
    }
    remaining -= periodMs;
    periods -= 1;
    if (periods <= 0) {
      return {
        side: { mainMs: 0, periods: 0, periodMs: 0, inByoyomi: true },
        expired: true,
      };
    }
    periodMs = CLOCK_PRESETS[preset].periodMs;
  }

  return {
    side: { mainMs, periods, periodMs, inByoyomi },
    expired: false,
  };
}

/** active 색의 시간을 deltaMs만큼 소비 */
export function tickClock(
  clock: GameClock,
  active: StoneColor,
  deltaMs: number
): GameClock {
  if (clock.loser !== null) return clock;
  const key = active === BLACK ? "black" : "white";
  const { side, expired } = tickSide(clock[key], clock.preset, deltaMs);
  return {
    ...clock,
    [key]: side,
    loser: expired ? active : null,
  };
}

/** 착수·패스 완료 — 초읽기 중이면 현재 기간을 처음으로 되돌린다 */
export function onMoveComplete(
  clock: GameClock,
  mover: StoneColor
): GameClock {
  if (clock.loser !== null) return clock;
  const key = mover === BLACK ? "black" : "white";
  const side = clock[key];
  if (!side.inByoyomi) return clock;
  return {
    ...clock,
    [key]: { ...side, periodMs: CLOCK_PRESETS[clock.preset].periodMs },
  };
}

/** mm:ss 표기 (올림 — 0.2초 남아도 0:01로 표시) */
export function formatMs(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
