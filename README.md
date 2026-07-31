# Kapago — 바둑 웹앱

브라우저에서 바로 두는 2인(핫시트) 바둑. 설치 없이 링크만으로 대국한다.

**▶ 바로 두기: https://bridgeaiedu-jsu.github.io/Kapago-baduk-app/**

**스택**: Next.js 16 (static export) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Vitest · GitHub Actions → GitHub Pages

## 기능

### 대국

- **9×9 · 13×13 · 19×19** 반상 (SVG, `viewBox` 기반 반응형 — 모바일 대응)
- 착수 · 활로 판정 · 따냄 (단독 돌·그룹)
- **패(ko)** — 단수패 즉시 되따냄 금지
- **초과패(positional superko)** — 동일 반상 위치의 재현 금지 (삼패·순환패로 인한 무한 반복 차단)
- 자살수 금지 (따내면서 두는 수는 허용)
- 마지막 착수 표시 · 착수 불가 사유 안내 (패/자살수/초과패 구분)
- 무르기 — 상태 스택 기반 O(1), 패스·종국 포함 정확히 한 수 취소
- 패스 2연속 종국

### 계가

- **사석(死石) 마킹** — 종국 후 죽은 돌 그룹을 탭해서 토글, 점수 실시간 반영
- 집 시각화 (흑집·백집 표시)
- 집 + 잡은 돌 + 사석 (일본/한국식), 덤은 반상별 (19로 6.5 / 9·13로 5.5)

### 입력·접근성

- 마우스: hover 미리보기 + 클릭 착수
- 터치: **Tap-Preview-Confirm** — 첫 탭 미리보기, 재탭 확정 (오착 방지)
- 키보드: 방향키 이동 + Enter/Space 착수, `aria-live` 실황 안내
- 대국 자동 저장 (localStorage) — 새로고침해도 이어서 대국

### AI 대국

- **내장 MCTS AI** — 순수 TypeScript UCT 탐색, 외부 모델·서버 불필요 (9×9·13×13 권장)
- 난이도 3단계 (하 300 / 중 1,200 / 상 4,000 플레이아웃), AI가 흑·백 선택 가능
- Web Worker에서 탐색 — 생각 중에도 UI 멈춤 없음 (워커 불가 환경은 메인 스레드 폴백)
- 상대가 패스하고 이기고 있으면 패스로 종국, AI 대국 무르기는 AI 수까지 2수 취소

### 기보

- **SGF 저장** — 수순·덤·결과(RE) 포함, 타 바둑 프로그램과 호환
- **SGF 불러오기** — 외부 기보 파일 로드 (주석·escape·분기 처리, 메인라인 재생), 반상 크기가 다르면 자동 이동
- **기보 보관함** — IndexedDB에 여러 대국 저장·목록·열기·SGF 다운로드 (`/library`)
- **수순 되돌려보기** — 슬라이더·버튼으로 국면 탐색, "여기서부터 다시 두기" 분기

### 대국 시계·소리

- 시계 프리셋: 10분 절대 / 5분+초읽기 30초×3 — 초읽기·시간패 지원
- Web Audio 합성 착수음·따냄음 (오디오 파일 없음), 음소거 토글

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

```bash
pnpm test       # 규칙 엔진·SGF 테스트 (38개)
pnpm lint       # ESLint
pnpm build      # 정적 빌드 (out/)
```

## 배포

`main` 푸시마다 GitHub Actions가 lint → test → build 후 GitHub Pages로 자동 배포한다
(`.github/workflows/ci.yml`). Pages는 저장소 하위 경로에 서빙되므로 CI에서
`NEXT_PUBLIC_BASE_PATH=/Kapago-baduk-app`를 주입한다.

## 구조

```
app/
├── page.tsx            반상 크기 선택
├── game/page.tsx       대국 화면
└── library/page.tsx    기보 보관함
components/
└── Board.tsx           SVG 반상 + 입력 처리 + 정보 패널
lib/
├── game-logic.ts       규칙 엔진 (순수 함수, UI 비의존)
├── engine/mcts.ts      MCTS AI (UCT + 경량 시뮬레이터)
├── engine/ai-worker.ts AI Web Worker (esbuild 사전 번들)
├── sgf.ts              SGF 기보 입출력 (FF[4])
├── clock.ts            대국 시계 (절대시간·초읽기)
├── sound.ts            Web Audio 착수음 합성
├── library.ts          IndexedDB 기보 보관함
└── storage.ts          localStorage 자동 저장
```

테스트 56개: 규칙 엔진 29 · SGF 9 · 시계 9 · 보관함 4 · AI 5

### 규칙 엔진 설계

- 반상은 `Uint8Array` 1차원 그리드 (0=빈칸, 1=흑, 2=백), 좌표는 정수 인덱스
- 반상 크기별 **인접 테이블 캐시** — 이웃 계산 시 반복 할당 없음
- 초과패는 반상 직렬화 해시 집합(`positionHashes`)으로 O(1) 검사
- `placeStone`은 실패 사유(`occupied | ko | suicide | superko | game-over`)를 반환 — UI가 이유를 구분해 안내
- 모든 상태는 불변(immutable) — 무르기는 상태 스택 pop

## 로드맵

- [x] SGF 기보 입출력 — 저장·공유, 타 프로그램 호환
- [x] 수순 되돌려보기 (기보 탐색 모드)
- [x] 기보 보관함 (IndexedDB)
- [x] 대국 시계 (초읽기) + 착수음
- [x] AI 대국 — 내장 MCTS (입문용)
- [ ] AI 강화 — KataGo 계열 신경망(TF.js/WebGPU) 백엔드 교체 (`chooseMove` 인터페이스 유지)
- [ ] 온라인 대국 (실시간 2인)
- [ ] 치석(핸디캡) 대국 — SGF `AB`/`AW` 불러오기 포함
- [ ] `Board.tsx` 분할 (BoardSvg / GamePanel / useGame 훅)

## 라이선스

MIT
