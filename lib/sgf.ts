// =============================================================================
// SGF (Smart Game Format) 입출력 — FF[4], GM[1](바둑)
// -----------------------------------------------------------------------------
// 좌표: SGF는 [열][행] 순서의 소문자('a'=0, 좌상단 기준). 'tt' 또는 빈 값은 패스.
// 내보내기: 메인라인 수순만 기록. 불러오기: 첫 분기(메인라인)만 따라간다.
// =============================================================================

import {
  BLACK,
  WHITE,
  defaultKomi,
  type Move,
  type ScoreResult,
  type StoneColor,
} from "./game-logic";

const CHARS = "abcdefghijklmnopqrs";

// -----------------------------------------------------------------------------
// 내보내기
// -----------------------------------------------------------------------------

export interface ExportOptions {
  /** 종국·계가가 끝났다면 결과(RE) 기록용 */
  readonly score?: ScoreResult | null;
  readonly komi?: number;
}

function indexToSgf(index: number, size: number): string {
  const row = Math.floor(index / size);
  const col = index % size;
  return `${CHARS[col]}${CHARS[row]}`;
}

export function exportSGF(
  size: number,
  moves: readonly Move[],
  options: ExportOptions = {}
): string {
  const komi = options.komi ?? defaultKomi(size);
  const header = `;FF[4]GM[1]CA[UTF-8]AP[Kapago:0.1]SZ[${size}]KM[${komi}]`;

  let result = "";
  const score = options.score;
  if (score) {
    result =
      score.winner === "draw"
        ? "RE[0]"
        : `RE[${score.winner === "black" ? "B" : "W"}+${Math.abs(score.black - score.white)}]`;
  }

  const body = moves
    .map((move) => {
      const color = move.color === BLACK ? "B" : "W";
      const value = move.type === "pass" ? "" : indexToSgf(move.index, size);
      return `;${color}[${value}]`;
    })
    .join("");

  return `(${header}${result}${body})`;
}

// -----------------------------------------------------------------------------
// 불러오기
// -----------------------------------------------------------------------------

export type SgfParseResult =
  | { ok: true; size: number; moves: Move[] }
  | { ok: false; reason: "invalid" | "not-go" | "bad-size" | "handicap" };

interface SgfNode {
  /** 프로퍼티 식별자 → 값 목록 */
  readonly props: ReadonlyMap<string, readonly string[]>;
}

/**
 * SGF 텍스트를 메인라인 노드 열로 파싱한다.
 * 분기 '('를 만나면 첫 분기만 따라가고 나머지는 건너뛴다.
 */
function parseNodes(text: string): SgfNode[] | null {
  const start = text.indexOf("(");
  if (start === -1) return null;

  const nodes: SgfNode[] = [];
  let i = start + 1;
  let depth = 1;
  /** 이미 한 분기를 따라간 깊이에서 만나는 형제 분기는 통째로 건너뛴다 */
  let skipUntilDepth: number | null = null;
  let branchTakenAtDepth = new Set<number>();

  while (i < text.length && depth > 0) {
    const ch = text[i];

    if (skipUntilDepth !== null) {
      // 건너뛰는 중 — 괄호 짝만 맞춘다 (값 내부 escape 고려)
      if (ch === "[") {
        i++;
        while (i < text.length && text[i] !== "]") {
          if (text[i] === "\\") i++;
          i++;
        }
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth < skipUntilDepth) skipUntilDepth = null;
      }
      i++;
      continue;
    }

    if (ch === "(") {
      if (branchTakenAtDepth.has(depth)) {
        // 두 번째 이후 형제 분기 → 건너뜀
        depth++;
        skipUntilDepth = depth;
      } else {
        branchTakenAtDepth.add(depth);
        depth++;
      }
      i++;
      continue;
    }

    if (ch === ")") {
      branchTakenAtDepth = new Set(
        [...branchTakenAtDepth].filter((d) => d < depth)
      );
      depth--;
      i++;
      continue;
    }

    if (ch === ";") {
      // 노드 시작 — 프로퍼티들 파싱
      i++;
      const props = new Map<string, string[]>();
      while (i < text.length) {
        // 공백 스킵
        while (i < text.length && /\s/.test(text[i])) i++;
        // 프로퍼티 식별자 (대문자 연속)
        const identStart = i;
        while (i < text.length && /[A-Z]/.test(text[i])) i++;
        if (i === identStart) break; // 식별자 없음 → 노드 종료
        const ident = text.slice(identStart, i);
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text[i] !== "[") break;
        // 값 목록: [v1][v2]...
        const values: string[] = [];
        while (text[i] === "[") {
          i++;
          let value = "";
          while (i < text.length && text[i] !== "]") {
            if (text[i] === "\\") i++;
            value += text[i];
            i++;
          }
          i++; // ']'
          values.push(value);
          while (i < text.length && /\s/.test(text[i])) i++;
        }
        const existing = props.get(ident);
        if (existing) existing.push(...values);
        else props.set(ident, values);
      }
      nodes.push({ props });
      continue;
    }

    i++; // 공백 등
  }

  return nodes.length > 0 ? nodes : null;
}

function sgfToIndex(value: string, size: number): number | null {
  if (value.length !== 2) return null;
  const col = CHARS.indexOf(value[0]);
  const row = CHARS.indexOf(value[1]);
  if (col < 0 || col >= size || row < 0 || row >= size) return null;
  return row * size + col;
}

export function importSGF(text: string): SgfParseResult {
  const nodes = parseNodes(text);
  if (!nodes) return { ok: false, reason: "invalid" };

  const root = nodes[0].props;

  // GM: 생략되면 바둑으로 간주, 명시됐다면 1(바둑)이어야 한다
  const gm = root.get("GM")?.[0];
  if (gm !== undefined && gm !== "1") return { ok: false, reason: "not-go" };

  const sizeValue = root.get("SZ")?.[0];
  const size = sizeValue === undefined ? 19 : Number(sizeValue);
  if (![9, 13, 19].includes(size)) return { ok: false, reason: "bad-size" };

  // 치석(핸디캡 배치)은 수순 재생으로 재현할 수 없어 지원하지 않는다
  for (const node of nodes) {
    if (node.props.has("AB") || node.props.has("AW")) {
      return { ok: false, reason: "handicap" };
    }
  }

  const moves: Move[] = [];
  for (const node of nodes) {
    for (const [ident, color] of [
      ["B", BLACK],
      ["W", WHITE],
    ] as const) {
      const value = node.props.get(ident)?.[0];
      if (value === undefined) continue;
      if (value === "" || value === "tt") {
        moves.push({ type: "pass", color: color as StoneColor });
      } else {
        const index = sgfToIndex(value, size);
        if (index === null) return { ok: false, reason: "invalid" };
        moves.push({ type: "move", index, color: color as StoneColor });
      }
    }
  }

  return { ok: true, size, moves };
}
