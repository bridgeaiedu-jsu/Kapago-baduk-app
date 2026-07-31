# Kapago — 바둑 웹앱

브라우저에서 바로 두는 2인(핫시트) 바둑. 설치 없이 링크만으로 대국할 수 있는 것을 목표로 한다.

**스택**: Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS 4 · Vitest

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

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

```bash
pnpm test       # 규칙 엔진 테스트 (29개)
pnpm lint       # ESLint
pnpm build      # 프로덕션 빌드
```

## 구조

```
app/
├── page.tsx            반상 크기 선택
└── game/page.tsx       대국 화면
components/
└── Board.tsx           SVG 반상 + 입력 처리 + 정보 패널
lib/
├── game-logic.ts       규칙 엔진 (순수 함수, UI 비의존)
├── game-logic.test.ts  엔진 테스트
└── storage.ts          localStorage 저장/복원
```

### 규칙 엔진 설계

- 반상은 `Uint8Array` 1차원 그리드 (0=빈칸, 1=흑, 2=백), 좌표는 정수 인덱스
- 반상 크기별 **인접 테이블 캐시** — 이웃 계산 시 반복 할당 없음
- 초과패는 반상 직렬화 해시 집합(`positionHashes`)으로 O(1) 검사
- `placeStone`은 실패 사유(`occupied | ko | suicide | superko | game-over`)를 반환 — UI가 이유를 구분해 안내
- 모든 상태는 불변(immutable) — 무르기는 상태 스택 pop

## 로드맵

- [ ] **SGF 기보 입출력** — 저장·공유, 타 프로그램 호환
- [ ] **AI 대국** — KataGo WASM (브라우저 완결, 서버 불필요)
- [ ] 온라인 대국 (실시간 2인)
- [ ] 수순 되돌려보기 (기보 탐색 모드)

## 라이선스

MIT
