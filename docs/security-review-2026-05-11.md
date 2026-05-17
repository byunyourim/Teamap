# Teamap 보안 검토 — 2026-05-11

## 검토 범위

| 영역 | 파일 |
|---|---|
| Electron 메인 | `electron/main.js` |
| 프리로드 | `electron/preload.cjs` |
| 토큰/키 저장 | `src/store.ts`, `src/ai.ts`, `src/github.ts`, `src/slack.ts` |
| Firebase | `src/firebase.ts` |
| 렌더러 진입점 | `index.html`, `vite.config.ts` |

## 요약

| 심각도 | 이슈 | 결합 효과 |
|---|---|---|
| **P0** | localStorage 평문 토큰 4종 | 디스크 + DevTools + XSS 모두 노출 |
| **P0** | GitHub fetch가 렌더러에서 직접 호출 | 토큰이 렌더러 메모리/네트워크 탭에 |
| **P1** | CSP 메타 태그 없음 | XSS exfiltrate 막을 마지막 방어선 부재 |
| **P1** | IPC가 토큰을 인자로 받음 | 메인 프로세스 로그/덤프에도 토큰 흐름 |
| **P1** | IPC 입력 검증 없음 | API 오용·잘못된 URL 빌딩 가능 |
| **P1** | `will-navigate` 미보호 | preload 노출된 채 외부 페이지 로드 가능 |
| **P2** | Firebase Firestore Rules 확인 필요 | 룰 잠겨있으면 OK |
| **P2** | 에러 메시지 sanitize 없음 | 토큰/내부 정보 echo 가능 |
| **P2** | 마크다운 sanitize 확인 필요 | XSS 표면 |

**총평**: 운영 도구로서 다루는 토큰의 권한 범위(조직 GitHub 전체, Slack 전체, AI 청구)에 비해 보호 수준이 낮음. P0 두 개는 새 기능 추가 전에 먼저 처리하는 것이 합당함.

---

## 🚫 BLOCK — P0

### P0-1. 모든 외부 API 토큰을 `localStorage`에 평문 저장

- **위치**:
  - `src/github.ts:56-62` — `github_token`
  - `src/slack.ts:1-9` — `slack_bot_token`
  - `src/ai.ts:24-37` — `anthropic_api_key`, `gemini_api_key`
- **악용 시나리오**:
  - Electron 렌더러의 localStorage는 디스크에 평문 LevelDB로 저장 — OS 파일 접근만 있어도 추출 가능
  - 렌더러 컨텍스트의 어떤 XSS(마크다운 렌더링/PR body/Slack 메시지 텍스트 등)든 토큰 전체 탈취 가능
  - DevTools 한 번 열면 즉시 노출
- **블래스트 반경**:
  - GitHub 토큰 한 개로 조직(`StableCoinTF`) 전체 코드 검색·이슈 작성·PR 리뷰
  - Slack 토큰으로 모든 채널 히스토리
  - AI 키로 청구 도용
- **권장 수정**:
  ```js
  // electron/main.js (메인 프로세스만)
  import { safeStorage } from 'electron';
  ipcMain.handle('secret:set', (_e, { name, value }) => {
    fs.writeFileSync(secretPath(name), safeStorage.encryptString(value));
  });
  ipcMain.handle('secret:has', (_e, { name }) => fs.existsSync(secretPath(name)));
  // 키 자체를 반환하는 'secret:get'은 만들지 말 것 — 메인이 직접 사용만 함
  ```
  렌더러는 키를 절대 받지 않음. 호출 시 `window.teamap.github.fetch({ path: '/user' })` 식으로 메인이 키체인에서 직접 로드.

### P0-2. GitHub API를 렌더러에서 직접 `fetch`로 호출

- **위치**: `src/github.ts:64-80` (`ghFetch`), `src/github.ts:113-126` (`searchCode`)
- **문제**:
  - `Authorization: Bearer ${token}` 헤더가 렌더러에서 구성됨 → 네트워크 탭/DevTools에 그대로 노출
  - Slack/AI는 메인으로 옮겨놓고 GitHub만 렌더러에 남아있는 비대칭. P0-1과 결합해 가장 큰 노출 표면
- **권장 수정**: GitHub IPC 핸들러 신설
  ```js
  ipcMain.handle('github:request', async (_e, { path, method, body }) => {
    const token = loadSecret('github_token');  // safeStorage에서
    // ... fetch with token, 응답 반환 (에러는 sanitize)
  });
  ```

---

## ⚠️ P1

### P1-3. CSP 메타 태그 없음

- **위치**: `index.html:1-12`
- **문제**: 인라인 스크립트, 외부 스크립트, 외부 connect를 차단할 방어선 0. 렌더러 컨텍스트에서 XSS 페이로드가 임의 origin으로 토큰 exfiltrate 가능
- **권장 수정**: `<head>`에 추가
  ```html
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    connect-src 'self'
      https://api.github.com
      https://api.anthropic.com
      https://generativelanguage.googleapis.com
      https://slack.com
      https://*.googleapis.com
      https://firestore.googleapis.com;
    img-src 'self' data: https://avatars.githubusercontent.com;
    object-src 'none';
    base-uri 'self';
  ">
  ```
  Firebase 호스트는 실제 사용처 확인 후 좁히기.

### P1-4. IPC가 토큰을 매 호출마다 인자로 받음

- **위치**: `electron/main.js:62-84`, `86-155`; `electron/preload.cjs:5-13`
- **문제**: P0-1을 안 고쳐도 이것만 고치면 1차 완화. 현재 매 호출마다 토큰이 IPC payload로 흐름 → 메인 프로세스 로그/크래시 덤프에 잡힐 가능성
- **권장 수정**: P0-1 해결과 함께 IPC 시그니처에서 `token` 제거. 메인이 키체인에서 직접 로드

### P1-5. IPC 입력 검증 없음

- **위치**: `electron/main.js`의 모든 `ipcMain.handle` 콜백
- **문제**:
  - 채널 ID, URL 파라미터, model 이름 등이 검증 없이 외부 API 호출에 사용
  - `model: model || 'claude-sonnet-4-6'` 처럼 사용자 제어 가능 값이 그대로 들어감
- **권장 수정**: 각 핸들러 진입부에 화이트리스트 검증
  ```js
  const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-7', 'gemini-2.5-flash']);
  if (model && !ALLOWED_MODELS.has(model)) throw new Error('invalid model');
  ```

### P1-6. `will-navigate` 핸들러 없음

- **위치**: `electron/main.js:21-26`
- **문제**: `setWindowOpenHandler`는 있지만 `webContents.on('will-navigate', ...)` 없음. 렌더러 내부에서 `window.location` 변조로 임의 origin 페이지로 네비게이트 가능 → preload가 살아 있어 외부 페이지가 IPC 접근
- **권장 수정**:
  ```js
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost:5173')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  ```

---

## 🟡 P2 (백로그)

### P2-7. Firebase web apiKey 하드코딩

- **위치**: `src/firebase.ts:5-11`
- **평가**: Firebase web key 자체는 공개돼도 OK(보안 규칙으로 통제). 다만 **Firestore Security Rules가 실제로 잠겨 있는지 확인 필요** — 잠겨 있지 않으면 P0
- **권장**:
  - (a) Firestore 콘솔에서 룰 확인
  - (b) 파일 상단에 "Firebase web apiKey는 공개 의도, 보안은 Firestore Rules에서" 코멘트 추가

### P2-8. 외부 API 에러 메시지가 그대로 렌더러로 전파

- **위치**: `electron/main.js:50-54`, `99-106`, `135-138`
- **문제**: Slack/Anthropic 응답 본문이 토큰/이메일/내부 ID를 echo하는 경우 사용자에게 그대로 표시될 위험
- **권장 수정**: 에러 메시지를 `message.slice(0, 200)` + 패턴 마스킹 후 반환

### P2-9. GitHub 코드/이슈 본문 렌더링 안전성 확인 필요

- **위치**: 별도 검토 필요 (`PRDetailPage.tsx`, `IssueDetailPage.tsx`, `CodeReviewPage.tsx` 등에서 마크다운 → HTML 변환 사용 여부)
- **권장**: `dangerouslySetInnerHTML` grep 후 사용처에 sanitize-html 또는 DOMPurify 적용 확인

### P2-10. nameCache는 모듈 레벨 전역

- **위치**: `src/github.ts:167`
- **평가**: 보안 이슈는 아니지만 GC 안 되는 캐시. 큰 조직이면 메모리 누수 가능

---

## 후속 액션 체크리스트

### 즉시 (이번 PR 또는 다음 PR)
- [ ] `safeStorage` 기반 시크릿 저장소 모듈 작성 (`electron/secrets.js` 가칭)
- [ ] `secret:set` / `secret:has` / `secret:delete` IPC 핸들러 추가
- [ ] 기존 localStorage 토큰 → safeStorage 마이그레이션 코드 (앱 첫 실행 시 1회)
- [ ] `github.ts`의 fetch를 IPC 호출로 전환 (`github:request`)
- [ ] `slack.ts` / `ai.ts`의 IPC 시그니처에서 `token`/`apiKey` 인자 제거
- [ ] CSP 메타 태그 추가
- [ ] `will-navigate` 핸들러 추가

### 같은 스프린트
- [ ] IPC 입력값 화이트리스트 검증
- [ ] 외부 API 에러 메시지 sanitize 레이어
- [ ] Firestore Security Rules 잠금 확인 + 콘솔 캡처 보관
- [ ] `dangerouslySetInnerHTML` 사용처 감사

### 백로그
- [ ] 토큰 만료/회전 알림
- [ ] `npm audit` 정기 실행 CI
- [ ] electron-updater 도입 시 코드 사이닝 정책 정립
- [ ] `nameCache` LRU 캐시로 전환

---

## 우선순위 처리 권장 순서

권한 블래스트가 큰 토큰부터:

1. **GitHub 토큰** — 조직 전체 코드/이슈/PR 권한
2. **Anthropic / Gemini API 키** — 청구 도용
3. **Slack 토큰** — 채널 히스토리

각 토큰에 대해 다음 사이클을 1주 단위로 반복하면 점진적 마이그레이션 가능:
1. safeStorage 저장으로 옮김
2. 외부 호출을 메인 IPC로 옮김
3. IPC 시그니처에서 토큰 인자 제거

---

## 검토 방법

- 정적 검토 only (실제 익스플로잇 시도 없음)
- 검토 시점 main 브랜치: `1da170d` 이후 워킹 트리
- 자동 도구 미사용 (수동 코드 리딩)

## 노트

- 이 문서는 P0/P1 정보를 포함하므로 **public repo에 그대로 commit하기 전에 신중히 판단**. private fork면 OK, public이면 P0가 패치될 때까지 비공개 처리 권장.
- 다음 검토는 P0 처리 후 재실시 권장.
