# CLAUDE.md

## 명령어

agent(developer, tester 등)가 빌드·테스트 통과를 검증할 때 이 섹션의 명령을 사용한다.

```sh
# 개발
npm run dev              # Vite 개발 서버 (브라우저)
npm run electron         # Electron 빌드 후 실행
npm run electron:dev     # Vite + Electron 동시 실행 (concurrently)

# 빌드
npm run build            # TypeScript + Vite production 빌드 (dist/)

# 테스트·린트
npm test                 # vitest
npm run lint             # eslint
```

**agent가 사용하는 표준 명령:**
- build: `npm run build`
- test: `npm test`
- lint: `npm run lint`

---

## 기술 스택

agent가 코드 작성·디버깅·리뷰 시 어떤 언어·버전·관용구를 써야 할지 판단 기준.

| 분류 | 사용 기술 |
|---|---|
| 언어 | TypeScript |
| 런타임 (브라우저) | Vite dev server / Electron renderer (Chromium) |
| 런타임 (메인) | Electron Node (`electron/main.js`, `preload.cjs`) |
| 프레임워크 | React 18, Electron |
| 빌드 도구 | Vite + @vitejs/plugin-react, tsc |
| 스타일링 | Tailwind CSS (`@tailwindcss/vite`), clsx, tailwind-merge, class-variance-authority |
| DB / 백엔드 | Firebase (Firestore) |
| 테스트 | vitest |
| 패키지 매니저 | npm |
| 주요 라이브러리 | `@stablecoin/ops` (내부 SDK), `cron-parser`, `firebase`, `lucide-react` |
| 모듈 | ESM (`"type": "module"`) |
| import alias | `@/...` → `src/...` (vite.config.ts) |

### `@stablecoin/ops` 사용 (가장 중요)

이 프로젝트는 `file:../StableCoin_OPS` 의존성으로 SDK를 내재화한다.
관련 작업이 필요할 때 직접 구현하지 말고 SDK 함수를 먼저 확인한다:

```ts
import { explorerTxUrl, chainName } from '@stablecoin/ops';
import { parseSlackError } from '@stablecoin/ops/parsers';
import * as rpc from '@stablecoin/ops/client/rpc';
import { ai } from '@stablecoin/ops';
```

SDK에 없는 기능이 필요하면 Teamap에 추가하기 전에 StableCoin_OPS에 추가하는 게 적절한지 먼저 검토.

---

## 아키텍처 개요

```
Teamap (Electron 데스크톱 앱)
├── electron/                  Electron 메인 프로세스 (Node)
│   ├── main.js                창 생성, IPC, @stablecoin/ops 사용
│   ├── preload.cjs            renderer ↔ main 브릿지
│   └── http-client.env.json
│
└── src/                       React renderer (Chromium)
    ├── App.tsx, main.tsx      React 진입점
    ├── components/            UI 컴포넌트
    ├── lib/                   유틸
    ├── firebase.ts            Firestore 클라이언트
    ├── ai.ts                  AI 호출 (Teamap 측 wrapper)
    ├── cron.ts                cron 표현식 처리 (cron-parser)
    ├── scheduler.ts           작업 스케줄링
    ├── slack.ts               Slack 연동
    ├── github.ts              GitHub 연동
    ├── notifications.ts       알림
    ├── store.ts               상태 관리
    └── theme.ts
```

---

## 환경변수

현재 `.env` 사용하지 않음. Firebase 설정은 `src/firebase.ts`에 하드코딩 (Firebase client config는 공개 정보이므로 OK, 보안은 Firestore Security Rules로 처리).

`electron/http-client.env.json`이 HTTP 클라이언트 설정을 담는다.

새로 환경변수 도입 시 `.env.example`을 만들고 본 섹션 + "환경변수 전파 체인"을 갱신한다.

---

## 아키텍처 Invariant (협상 불가 원칙)

planner가 계획 수립 시, security-reviewer가 검토 시 함께 확인한다.

1. **Electron 보안 격리** — renderer는 항상 `contextIsolation: true`, `nodeIntegration: false`.
   Node API는 `preload.cjs`의 `contextBridge`로 명시적으로 노출된 것만 사용.
2. **메인 ↔ renderer 격리** — Node 의존(`fs`, `child_process`, `@stablecoin/ops/client/rpc` 등)은 `electron/` 안에서만 사용. `src/`에서 직접 import 금지.
3. **`@stablecoin/ops` SDK 우선** — RPC·체인 유틸·Slack 파싱 등 SDK가 제공하는 기능은 직접 구현 금지. SDK 변경이 필요하면 StableCoin_OPS에서 진행.
4. **외부 링크는 시스템 브라우저로** — `setWindowOpenHandler`에서 http(s) URL은 `shell.openExternal`로 라우팅. 신규 외부 URL 처리도 같은 패턴.
5. **Firebase 직접 접근 위치** — Firestore는 `src/firebase.ts`를 통한 단일 진입점으로만 사용. 다른 곳에서 `initializeApp` 재호출 금지.

---

## 테스트 규칙

tester 에이전트와 generate-tests 스킬이 이 규칙을 따른다.

- 테스트 프레임워크: **vitest**. 새 프레임워크 도입 금지.
- 테스트 파일 위치: 대상 파일 옆 `*.test.ts` (예: `src/overnight.test.ts`)
- import alias: `@/...` (`vite.config.ts` 기준)
- mock 정책: Firebase, Electron API, 외부 HTTP 호출만 mock. 순수 로직은 실제 함수 사용.

---

## 보안 관심사

security-reviewer가 일반 체크리스트에 더해 우선 확인한다.

- **Electron 격리 위반** — `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false` 등으로 변경 금지.
- **preload 노출 함수** — `preload.cjs`의 `contextBridge.exposeInMainWorld`로 노출하는 API는 최소 권한만. 임의 코드 실행 가능한 함수(`eval`, 동적 모듈 로드) 노출 금지.
- **외부 URL 처리** — `shell.openExternal`에 전달되는 URL은 반드시 `http://` 또는 `https://`로 검증.
- **Firestore Security Rules** — 클라이언트에서 직접 Firestore 쿼리하는 만큼 Security Rules가 진짜 보안 경계. Rules 변경 시 user-scoped 검증 누락 점검.
- **Firebase config 키** — `src/firebase.ts`의 client config는 공개 정보지만, 진짜 secret(서비스 계정 키, admin SDK 토큰 등)은 코드·커밋에 절대 포함 금지.
- **`@stablecoin/ops` 호출 위치** — RPC 호출 같은 Node API 의존 기능은 메인 프로세스(`electron/`)에서만 호출하고 결과를 IPC로 renderer에 전달.

---

## 환경변수 전파 체인

config-propagation-checker가 환경변수 변경 시 이 체인을 따라 점검한다.

현재 `.env` 미사용. 신규 도입 시:

```
.env.example  (문서화 + 기본값)
     │
     ▼
import.meta.env.VITE_*   (Vite renderer에서 노출되는 변수, VITE_ prefix 필수)
process.env.*            (electron/ 메인 프로세스에서 사용)
electron/http-client.env.json  (HTTP 클라이언트 설정)
```

**Vite 규칙:** renderer에서 사용할 환경변수는 반드시 `VITE_` prefix. 그 외 변수는 빌드 시 노출되지 않음.

---

## git 커밋 컨벤션

Claude가 커밋을 만들 때 따라야 할 형식.

### 형식

```
<type>: <한 줄 요약 - 무엇을 왜 바꿨는지>

- <상세 변경 1>
- <상세 변경 2>

Co-Authored-By: Claude <모델명> <noreply@anthropic.com>
```

### 타입

| 타입 | 용도 |
|---|---|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `docs` | 문서만 수정 |
| `chore` | 빌드·설정·의존성 변경 |
| `test` | 테스트 추가/수정만 |
| `style` | 포맷·세미콜론 등 |

### 규칙

- 제목 첫 줄: 한국어, 50자 내외
- 본문: 무엇/왜 위주
- 한 커밋은 하나의 논리적 변경
- 민감 파일(`.env`, credentials, 서비스 계정 키) 커밋 금지

---

## 절대 규칙

- 한국어로 답한다.
- 요청한 기능 외 코드 수정 금지.
- 관련 없는 리팩토링 금지.
- 기존 패턴 우선. 새 패턴 도입 전 기존 코드에서 유사 구현을 먼저 찾는다.
- `@stablecoin/ops` SDK에 있는 기능은 직접 구현 금지. SDK 함수 먼저 확인.
- 모호한 권한·데이터·보안 요구사항은 구현 전 질문한다.
- 요청이 모호하면 구현 전 아래 중 빠진 정보를 1~2개 질문한다: 대상 파일/함수, 기대 동작, 입출력, 영향 범위.
- 범위 밖 문제 발견 시 수정하지 않고 보고한다.
