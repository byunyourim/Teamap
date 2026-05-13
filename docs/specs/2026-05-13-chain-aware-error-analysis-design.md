# 서비스 의존 체인 기반 AI 에러 분석

## 배경

현재 에러 분석(`ai.ts`)은 단일 에러 로그 → GitHub 코드 검색 → AI 원인 추정 구조.
실제 서비스는 `front → backend → bc-adapter → bundler → erc4337` 체인으로 연결되어 있어서,
한 서비스 에러의 근본 원인이 다른 서비스에 있는 경우가 많다.

예: `bc-adapter`의 `KMS health check failed` → 실제 원인은 `bundler` 타임아웃이거나 네트워크 단절.

## 목표

1. **에러 분석 시 의존 체인의 연관 에러를 자동 수집**하여 AI에게 함께 전달
2. **인시던트 상세에서 AI RCA(Root Cause Analysis)** 실행 — 타임라인 + Slack 에러를 종합 분석
3. 서비스 의존 체인을 **설정에서 레포지토리 단위로 관리**

## 1. 데이터 모델

### 서비스 의존 체인 (`store.ts`)

```ts
// 순서가 의존 방향. 앞에서 뒤로 호출한다.
// 예: ["StableCoinTF/frontend", "StableCoinTF/backend", "StableCoinTF/bc-adapter", "StableCoinTF/bundler", "StableCoinTF/erc4337"]
const DEP_CHAIN_KEY = 'teamap_service_dep_chain';

export function getServiceDepChain(): string[]
export function setServiceDepChain(repos: string[]): void
```

- 기존 `assignedRepos`와 별개. 체인은 순서가 의미를 가짐.
- 에러 로그의 `service` 필드(예: `bc-adapter`)와 레포명(예: `StableCoinTF/bc-adapter`)은 레포명 마지막 세그먼트로 매칭.
  - `"StableCoinTF/bc-adapter"` → `"bc-adapter"`

### 인시던트 타임라인 타입 확장 (`store.ts`)

```ts
export interface IncidentTimelineEntry {
  ts: number;
  type: 'note' | 'status' | 'action' | 'error' | 'deploy' | 'analysis'; // 'analysis' 추가
  user: string;
  message: string;
}
```

## 2. 에러 분석 확장 (`ai.ts`)

### 연관 에러 수집

```ts
export async function collectRelatedErrors(
  err: ParsedError,
  allErrors: ParsedError[],
  windowMinutes?: number // 기본 5분
): Promise<ParsedError[]>
```

동작:
1. `err.service`로 의존 체인에서 위치 찾기
2. 체인에서 인접 서비스(상위 1개 + 하위 전체) 목록 추출
   - adapter 에러 → backend(상위), bundler, erc4337(하위) 확인
   - 하위는 전체를 보는 이유: 근본 원인은 보통 하위에 있음
3. `allErrors`에서 해당 서비스 + 시간 윈도우(±5분) 내 에러 필터링
4. 시간순 정렬하여 반환

### 체인 인식 프롬프트

기존 `SYSTEM_PROMPT` 확장:

```
당신은 블록체인 서비스 시니어 백엔드 엔지니어입니다.
서비스 의존 체인 구조를 이해하고, 여러 서비스에 걸친 에러의 **근본 원인(Root Cause)**을 찾는 게 임무입니다.

응답 형식 (마크다운):

## 근본 원인
1-3문장. 에러 체인의 시작점과 전파 경로 설명.

## 에러 지점
- **서비스**: 근본 원인 서비스명
- **파일**: `path/to/file.ts` (라인 N)
- **GitHub**: <코드 검색 결과 URL>

## 전파 경로
서비스A (원인) → 서비스B (영향) → 서비스C (증상)
각 단계에서 어떤 에러가 발생했는지 1줄 설명.

## 빠른 점검
- [ ] 즉시 확인할 항목 (근본 원인 서비스 기준)
- [ ] 2-4개
```

### 새 함수

```ts
export async function analyzeErrorWithChain(
  err: ParsedError,
  relatedErrors: ParsedError[],
  force?: boolean
): Promise<AnalysisResult>
```

- 연관 에러가 없으면 기존 `analyzeError`와 동일하게 동작
- 연관 에러가 있으면 체인 인식 프롬프트 사용
- GitHub 코드 검색: 주 에러 서비스 레포 + 연관 서비스 레포 모두 검색
- 캐시 키: 주 에러 `ts` 기준 (기존과 동일)

### 프롬프트 구성 예시

```
# 서비스 의존 체인
frontend → backend → bc-adapter → bundler → erc4337

# 주 에러 (bc-adapter)
[bc-adapter] KmsHealthCheckerAdapter — KMS health check failed
timestamp: 2026-05-13 19:41:01
error: fetch failed
host: blockchain-adapter1.novalocal

# 연관 에러 (±5분 내, 시간순)
[bundler] UserOpHandler — send userOp timeout
timestamp: 2026-05-13 19:40:45
error: ETIMEDOUT

[erc4337] EntryPoint — handleOps reverted
timestamp: 2026-05-13 19:41:30
error: AA21 didn't pay prefund

# GitHub 코드 검색 결과
(주 에러 + 연관 에러 모두의 검색 결과)
...
```

## 3. Slack 시간 범위 조회 (`slack.ts`)

```ts
export async function fetchErrorsInWindow(
  centerTs: string,
  windowMinutes: number
): Promise<SlackMessage[]>
```

- Slack `conversations.history`의 `oldest`/`latest` 파라미터 활용
- 이미 로드된 에러 목록이 충분하면 메모리에서 필터링 (API 호출 절약)

## 4. 인시던트 AI RCA (`IncidentsPage.tsx`)

인시던트 상세 패널에 **"AI 원인 분석"** 버튼 추가.

동작:
1. 인시던트의 `affectedServices` + `createdAt` 기준으로 Slack 에러 수집
   - 인시던트 생성 시각 전후 10분 윈도우
   - `affectedServices`에 해당하는 서비스 에러만 필터
2. 의존 체인 정보 + 수집된 에러 + 타임라인 기존 엔트리 → AI 전달
3. AI RCA 결과를 타임라인에 `type: 'analysis'` 엔트리로 추가

RCA 프롬프트:

```
# 인시던트 정보
제목: {title}
심각도: {severity}
영향 서비스: {affectedServices}
생성: {createdAt}

# 서비스 의존 체인
{chain}

# 관련 에러 로그 (시간순)
{errors}

# 기존 타임라인
{timeline entries}

위 정보를 종합하여:
1. 근본 원인 (Root Cause)
2. 에러 전파 경로
3. 영향 범위 평가
4. 즉시 조치 사항
```

## 5. 에러 로그 → 온체인 모니터링 연동

에러 로그에 `txHash`가 있을 때, 클릭하면 온체인 모니터링 페이지로 이동하여 즉시 조회.

### 네비게이션 파라미터

현재 `navigate(id: string)` 방식에는 파라미터 전달이 없으므로,
`App.tsx`에 간단한 네비게이션 파라미터 상태 추가:

```ts
// App.tsx
const [navParams, setNavParams] = useState<Record<string, string>>({});

const navigateWith = (id: string, params: Record<string, string>) => {
  setNavParams(params);
  navigate(id);
};
```

### 흐름

1. **ErrorLogPage**: txHash 필드에 클릭 가능한 링크 추가
   - 클릭 시 `navigateWith('onchain', { chain: err.chainId, txHash: err.txHash })`
2. **MainContent**: `navParams`를 `OnchainMonitorPage`에 전달
3. **OnchainMonitorPage**: `initialChain`/`initialHash` props 수신 시
   - `lookup` 탭 자동 선택
   - chain 셀렉트 + hash 인풋 자동 세팅
   - `useEffect`로 자동 `open()` 실행 (Explorer 열기)
   - 조회 히스토리에도 자동 추가

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/App.tsx` | `navParams` 상태, `navigateWith` 함수 추가 |
| `src/components/MainContent.tsx` | `navigateWith` prop 추가, onchain/error-logs에 전달 |
| `src/components/ErrorLogPage.tsx` | txHash 클릭 → `navigateWith('onchain', ...)` |
| `src/components/OnchainMonitorPage.tsx` | `initialChain`/`initialHash` props, 자동 조회 |

## 6. 설정 UI

설정 페이지(또는 서비스 관리 페이지)에 **"서비스 의존 체인"** 섹션:

- 기존 `assignedRepos` 목록에서 선택하여 체인에 추가
- 위/아래 화살표로 순서 변경 (순서 = 의존 방향)
- 체인 시각화: `repo1 → repo2 → repo3` 형태로 표시
- 체인에 없는 서비스의 에러는 기존 단일 분석 방식 유지

## 7. 변경 파일 전체 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/App.tsx` | `navParams` 상태, `navigateWith` 함수 추가 |
| `src/store.ts` | `getServiceDepChain`/`setServiceDepChain` 추가, `IncidentTimelineEntry.type`에 `'analysis'` 추가 |
| `src/ai.ts` | `collectRelatedErrors()`, `analyzeErrorWithChain()`, 체인 인식 프롬프트, 연관 레포 코드 검색 |
| `src/slack.ts` | `fetchErrorsInWindow()` 시간 범위 조회 |
| `src/components/MainContent.tsx` | `navigateWith` prop 추가, onchain/error-logs에 전달 |
| `src/components/ErrorLogPage.tsx` | 연관 에러 표시 UI, `analyzeErrorWithChain` 호출, txHash 클릭 → 온체인 이동 |
| `src/components/OnchainMonitorPage.tsx` | `initialChain`/`initialHash` props, 자동 조회 |
| `src/components/IncidentsPage.tsx` | AI RCA 버튼 + 결과 타임라인 표시 |
| `src/components/SettingsAccountPage.tsx` 또는 `ServiceMgmtPage.tsx` | 의존 체인 편집 UI |

## 8. 기존 동작 호환

- 의존 체인 미설정 시: 기존 `analyzeError()` 그대로 동작
- 체인에 없는 서비스: 단일 에러 분석
- 연관 에러가 시간 윈도우 내에 없으면: 주 에러만으로 분석 (기존과 동일)
- txHash 없는 에러: 온체인 이동 링크 미표시 (기존과 동일)
