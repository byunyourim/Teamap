# Teamap

Electron + Vite + React (TypeScript) 기반 데스크톱 애플리케이션.

## 기술 스택

- **Electron 35** — 데스크톱 셸
- **Vite 6** — 개발 서버 / 번들러
- **React 19** + **TypeScript 5**
- **Tailwind CSS 4**
- **Firebase 12**

## 사전 요구사항

- Node.js 18 이상 (권장: LTS)
- npm

## 설치

```sh
npm install
```

## 실행 방법

### 개발 모드 (Electron + HMR)

Vite 개발 서버와 Electron 앱을 동시에 실행합니다. Vite가 `http://localhost:5173`에서 준비되면 Electron 창이 자동으로 열립니다.

```sh
npm run electron:dev
```

### 웹(Vite)만 실행

브라우저에서 UI만 확인하고 싶을 때 사용합니다.

```sh
npm run dev
```

브라우저에서 http://localhost:5173 접속.

### 프로덕션 빌드 후 Electron 실행

```sh
npm run electron
```

내부적으로 `vite build` 후 `electron .`을 실행합니다.

### 빌드만

```sh
npm run build
```

`tsc -b`로 타입 체크 후 `vite build`로 정적 파일을 생성합니다.

## 기타 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run lint` | ESLint 실행 |
| `npm test` | Vitest 실행 |

## 프로젝트 구조

```
.
├── electron/          # Electron 메인 프로세스
│   └── main.js
├── src/               # React 렌더러
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   ├── lib/
│   ├── firebase.ts
│   ├── github.ts
│   ├── notifications.ts
│   ├── scheduler.ts
│   └── store.ts
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## 트러블슈팅

- **`Electron 창이 열리지 않음`**: Vite가 `5173` 포트를 점유하지 못한 경우입니다. 다른 프로세스가 포트를 사용하고 있는지 확인하세요.
- **`@import must precede all other statements` 경고**: `src/App.css`(또는 글로벌 CSS)의 `@import` 구문이 다른 규칙보다 위에 있어야 합니다.
