// =============================================================================
// 착수음 — Web Audio 합성 (오디오 파일·외부 자원 불필요)
// 짧은 클릭(노이즈 버스트) + 낮은 울림(사인 감쇠)으로 돌 놓는 소리를 만든다.
// =============================================================================

const MUTE_KEY = "baduk-muted";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  // 사용자 제스처 이전에 생성됐다면 재개
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // 무시
  }
}

/** 단일 "딱" 소리 — 시작 시각을 조절해 잘그락 효과에 재사용 */
function click(context: AudioContext, at: number, gainScale: number): void {
  const now = at;

  // 고역 클릭: 화이트노이즈 20ms + 하이패스
  const noiseLength = Math.floor(context.sampleRate * 0.02);
  const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 1800;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.5 * gainScale, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  noise.connect(highpass).connect(noiseGain).connect(context.destination);
  noise.start(now);

  // 저역 울림: 나무판 공명 느낌
  const tone = context.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(220, now);
  tone.frequency.exponentialRampToValueAtTime(140, now + 0.08);
  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(0.25 * gainScale, now);
  toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  tone.connect(toneGain).connect(context.destination);
  tone.start(now);
  tone.stop(now + 0.12);
}

/** 착수음 */
export function playStone(): void {
  if (isMuted()) return;
  const context = getContext();
  if (!context) return;
  click(context, context.currentTime, 1);
}

/** 따냄음 — 돌 수에 비례해 잘그락(최대 3회) */
export function playCapture(count: number): void {
  if (isMuted()) return;
  const context = getContext();
  if (!context) return;
  const clicks = Math.min(Math.max(count, 1), 3);
  for (let i = 0; i < clicks; i++) {
    click(context, context.currentTime + 0.02 + i * 0.07, 0.7);
  }
}
