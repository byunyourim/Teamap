# 서비스 의존 체인 기반 AI 에러 분석 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에러 분석 시 서비스 의존 체인의 연관 에러를 자동 수집하여 AI에게 함께 전달하고, 인시던트에서 AI RCA를 실행할 수 있게 하며, 에러 로그의 txHash 클릭 시 온체인 모니터링으로 이동하는 기능 구현

**Architecture:** store.ts에 의존 체인 저장, ai.ts에서 시간 윈도우 기반 연관 에러 수집 + 체인 인식 프롬프트, App.tsx에 navParams 추가하여 페이지 간 파라미터 전달

**Tech Stack:** React 19, TypeScript, Electron IPC, Anthropic/Gemini API, Slack API, Vitest

**Spec:** `docs/specs/2026-05-13-chain-aware-error-analysis-design.md`

---

### Task 1: store.ts — 서비스 의존 체인 저장

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1: store.ts에 의존 체인 get/set 추가**

`src/store.ts` 파일 상단 상수 영역(`WALLET_GAS_THRESHOLD_KEY` 아래)에 추가:

```ts
const DEP_CHAIN_KEY = 'teamap_service_dep_chain';
```

`setWalletGasThreshold` 함수 아래에 추가:

```ts
/* ─── 서비스 의존 체인 ─── */

export function getServiceDepChain(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DEP_CHAIN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function setServiceDepChain(chain: string[]) {
  localStorage.setItem(DEP_CHAIN_KEY, JSON.stringify(chain));
}

/** 레포명(예: "StableCoinTF/bc-adapter")에서 서비스명(예: "bc-adapter") 추출 */
export function repoToService(repo: string): string {
  return repo.split('/').pop() ?? repo;
}

/** 서비스명으로 체인에서 위치 찾기. 연관 서비스(상위 1개 + 하위 전체) 반환 */
export function getRelatedServices(service: string): string[] {
  const chain = getServiceDepChain();
  const names = chain.map(repoToService);
  const idx = names.findIndex((n) => n === service);
  if (idx === -1) return [];

  const related: string[] = [];
  if (idx > 0) related.push(names[idx - 1]);       // 상위 1개
  for (let i = idx + 1; i < names.length; i++) {    // 하위 전체
    related.push(names[i]);
  }
  return related;
}
```

- [ ] **Step 2: IncidentTimelineEntry 타입에 'analysis' 추가**

`src/store.ts`의 `IncidentTimelineEntry` 인터페이스를 수정:

```ts
export interface IncidentTimelineEntry {
  ts: number;
  type: 'note' | 'status' | 'action' | 'error' | 'deploy' | 'analysis';
  user: string;
  message: string;
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없이 통과

- [ ] **Step 4: 커밋**

```bash
git add src/store.ts
git commit -m "feat: 서비스 의존 체인 저장 및 연관 서비스 조회 함수 추가"
```

---

### Task 2: ai.ts — 연관 에러 수집 + 체인 인식 프롬프트

**Files:**
- Modify: `src/ai.ts`

- [ ] **Step 1: import 추가 및 체인 인식 시스템 프롬프트 상수 추가**

`src/ai.ts` 상단 import 수정:

```ts
import type { ParsedError } from './slack';
import type { CodeSearchHit } from './github';
import { searchCode } from './github';
import { getServiceDepChain, repoToService, getRelatedServices } from './store';
```

기존 `SYSTEM_PROMPT` 아래에 추가:

```ts
const CHAIN_SYSTEM_PROMPT = `당신은 블록체인 서비스 시니어 백엔드 엔지니어입니다.
여러 마이크로서비스에 걸친 에러 로그를 분석하여 **근본 원인(Root Cause)**을 찾는 게 임무입니다.
서비스 의존 체인 구조를 이해하고, 에러의 인과 관계와 전파 경로를 추적하세요.

응답 형식 (마크다운):

## 근본 원인
1-3문장. 에러 체인의 시작점과 전파 경로 설명.

## 에러 지점
- **서비스**: 근본 원인이 있는 서비스명
- **파일**: \`path/to/file.ts\` (라인 N)
- **GitHub**: <전달받은 코드 검색 결과의 url>
- **함수**: \`functionName()\` (있으면)

## 전파 경로
서비스A (원인) → 서비스B (영향) → 서비스C (증상)
각 단계에서 어떤 에러가 발생했는지 1줄 설명.

## 빠른 점검
- [ ] 즉시 확인할 항목 (근본 원인 서비스 기준)
- [ ] 2-4개

규칙:
- 코드 검색 결과 중 가장 가능성 높은 한 곳만 찍어줄 것 (확신 없으면 "후보:" 형태로 2개)
- 검색 결과에 일치하는 게 없으면 "코드에서 정확한 위치 미발견"이라고 명시
- 시간 순서와 의존 방향을 고려해 인과 관계 판단
- 한국어, 간결하게`;
```

- [ ] **Step 2: 연관 에러 수집 함수 추가**

`clearCachedAnalysis` 함수 아래에 추가:

```ts
/** 시간 윈도우 내 연관 서비스 에러 수집 */
export function collectRelatedErrors(
  err: ParsedError,
  allErrors: ParsedError[],
  windowMinutes = 5,
): ParsedError[] {
  if (!err.service) return [];
  const related = getRelatedServices(err.service);
  if (related.length === 0) return [];

  const errTime = err.timestamp ? new Date(err.timestamp.replace(' ', 'T')).getTime() : 0;
  if (!errTime) return [];

  const windowMs = windowMinutes * 60 * 1000;

  return allErrors.filter((e) => {
    if (e.ts === err.ts) return false;
    if (!related.includes(e.service)) return false;
    const t = e.timestamp ? new Date(e.timestamp.replace(' ', 'T')).getTime() : 0;
    return t && Math.abs(t - errTime) <= windowMs;
  }).sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp.replace(' ', 'T')).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp.replace(' ', 'T')).getTime() : 0;
    return ta - tb;
  });
}
```

- [ ] **Step 3: 체인 인식 프롬프트 포매터 추가**

`formatPrompt` 함수 아래에 추가:

```ts
function formatChainPrompt(
  err: ParsedError,
  relatedErrors: ParsedError[],
  hits: CodeSearchHit[],
): string {
  const chain = getServiceDepChain();
  const chainText = chain.length > 0
    ? chain.map(repoToService).join(' → ')
    : '(미설정)';

  const mainFields = Object.entries(err.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const relatedText = relatedErrors.length === 0
    ? '(연관 에러 없음)'
    : relatedErrors.map((e) => {
        const fields = Object.entries(e.fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
        return `[${e.service}] ${e.component} — ${e.summary}\n${fields}`;
      }).join('\n\n');

  const hitsText = hits.length === 0
    ? '(검색 결과 없음)'
    : hits.map((h, i) => (
        `### 후보 ${i + 1}\n` +
        `파일: ${h.repo}/${h.path}\n` +
        `URL: ${h.url}\n` +
        `매치 컨텍스트:\n${h.fragments.map((f) => '```\n' + f + '\n```').join('\n')}`
      )).join('\n\n');

  return `# 서비스 의존 체인
${chainText}

# 주 에러 (${err.service || '알 수 없음'})
[${err.service}] ${err.component} — ${err.summary}
${err.level ? `심각도: ${err.level}` : ''}

상세 필드:
${mainFields}

원본 메시지:
\`\`\`
${err.raw}
\`\`\`

# 연관 에러 (±5분 내, 시간순)
${relatedText}

# GitHub 코드 검색 결과
${hitsText}

위 에러들의 인과 관계를 파악하고 근본 원인(Root Cause)을 분석하세요.`;
}
```

- [ ] **Step 4: analyzeErrorWithChain 함수 추가**

`analyzeError` 함수 아래에 추가:

```ts
export async function analyzeErrorWithChain(
  err: ParsedError,
  allErrors: ParsedError[],
  force = false,
): Promise<AnalysisResult> {
  const relatedErrors = collectRelatedErrors(err, allErrors);

  // 연관 에러가 없으면 기존 단일 분석
  if (relatedErrors.length === 0) {
    return analyzeError(err, force);
  }

  if (!force) {
    const cached = getCachedAnalysis(err.ts);
    if (cached) return cached;
  }

  if (!window.teamap) throw new Error('데스크톱 앱에서만 동작합니다.');

  const provider = getProvider();
  const apiKey = provider === 'anthropic' ? getAnthropicKey() : getGeminiKey();
  if (!apiKey) {
    throw new Error(`${provider === 'anthropic' ? 'Anthropic' : 'Gemini'} API 키를 설정 → 계정에서 등록하세요.`);
  }

  // 1. GitHub 코드 검색 — 주 에러 + 연관 에러 모두
  const mainHits = await searchErrorLocation(err);
  const relatedHitsArr = await Promise.all(
    relatedErrors.slice(0, 3).map((e) => searchErrorLocation(e)),
  );
  const seen = new Set(mainHits.map((h) => `${h.repo}/${h.path}`));
  const allHits = [...mainHits];
  for (const rh of relatedHitsArr) {
    for (const h of rh) {
      const key = `${h.repo}/${h.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        allHits.push(h);
      }
    }
  }
  const hits = allHits.slice(0, 15);

  // 2. 체인 인식 프롬프트
  const userMessage = formatChainPrompt(err, relatedErrors, hits);

  // 3. AI 호출
  const r = provider === 'anthropic'
    ? await window.teamap.ai.analyze({
        apiKey,
        model: ANTHROPIC_MODEL,
        system: CHAIN_SYSTEM_PROMPT,
        user: userMessage,
      })
    : await window.teamap.ai.gemini({
        apiKey,
        model: GEMINI_MODEL,
        system: CHAIN_SYSTEM_PROMPT,
        user: userMessage,
      });

  const result: AnalysisResult = {
    text: r.text,
    cachedAt: Date.now(),
    model: provider === 'anthropic' ? ANTHROPIC_MODEL : GEMINI_MODEL,
    provider,
    hits,
  };

  const cache = getCache();
  cache[err.ts] = result;
  setCache(cache);

  return result;
}
```

- [ ] **Step 5: 인시던트 RCA용 함수 추가**

파일 맨 아래에 추가:

```ts
const RCA_SYSTEM_PROMPT = `당신은 블록체인 서비스 인시던트 대응 전문가입니다.
인시던트 정보, 서비스 의존 체인, 관련 에러 로그, 기존 타임라인을 종합하여 근본 원인 분석(RCA)을 수행하세요.

응답 형식 (마크다운):

## 근본 원인 (Root Cause)
1-3문장. 인시던트의 시작점과 원인.

## 에러 전파 경로
서비스A → 서비스B → 서비스C 형태로 각 단계 1줄 설명.

## 영향 범위
어떤 서비스/기능이 영향을 받았는지 정리.

## 즉시 조치 사항
- [ ] 조치 1
- [ ] 조치 2
- [ ] 조치 3

## 재발 방지
장기적으로 개선할 포인트 1-2개.

규칙:
- 시간 순서와 의존 방향을 근거로 인과 관계 판단
- 추측과 사실을 구분하여 명시
- 한국어, 간결하게`;

export interface RcaInput {
  title: string;
  severity: string;
  affectedServices: string[];
  createdAt: number;
  timeline: { ts: number; type: string; user: string; message: string }[];
  errors: ParsedError[];
}

export async function analyzeIncidentRca(input: RcaInput): Promise<string> {
  if (!window.teamap) throw new Error('데스크톱 앱에서만 동작합니다.');

  const provider = getProvider();
  const apiKey = provider === 'anthropic' ? getAnthropicKey() : getGeminiKey();
  if (!apiKey) {
    throw new Error(`${provider === 'anthropic' ? 'Anthropic' : 'Gemini'} API 키를 설정하세요.`);
  }

  const chain = getServiceDepChain();
  const chainText = chain.length > 0
    ? chain.map(repoToService).join(' → ')
    : '(미설정)';

  const errorsText = input.errors.length === 0
    ? '(관련 에러 없음)'
    : input.errors.map((e) => {
        const fields = Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`).join('\n');
        return `[${e.service}] ${e.component} — ${e.summary}\n${fields}`;
      }).join('\n\n');

  const timelineText = input.timeline
    .map((t) => `${new Date(t.ts).toLocaleTimeString('ko-KR', { hour12: false })} [${t.type}] ${t.message} (${t.user})`)
    .join('\n');

  const userMessage = `# 인시던트 정보
제목: ${input.title}
심각도: ${input.severity}
영향 서비스: ${input.affectedServices.join(', ') || '(미지정)'}
생성: ${new Date(input.createdAt).toLocaleString('ko-KR', { hour12: false })}

# 서비스 의존 체인
${chainText}

# 관련 에러 로그 (시간순)
${errorsText}

# 기존 타임라인
${timelineText}

위 정보를 종합하여 근본 원인 분석(RCA)을 수행하세요.`;

  const r = provider === 'anthropic'
    ? await window.teamap.ai.analyze({
        apiKey,
        model: ANTHROPIC_MODEL,
        system: RCA_SYSTEM_PROMPT,
        user: userMessage,
      })
    : await window.teamap.ai.gemini({
        apiKey,
        model: GEMINI_MODEL,
        system: RCA_SYSTEM_PROMPT,
        user: userMessage,
      });

  return r.text;
}
```

- [ ] **Step 6: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없이 통과

- [ ] **Step 7: 커밋**

```bash
git add src/ai.ts
git commit -m "feat: 서비스 의존 체인 기반 연관 에러 수집 및 AI RCA 분석 추가"
```

---

### Task 3: App.tsx + MainContent.tsx — 네비게이션 파라미터 전달

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/MainContent.tsx`

- [ ] **Step 1: App.tsx에 navParams 상태 및 navigateWith 함수 추가**

`src/App.tsx`의 state 선언부에 추가:

```ts
const [navParams, setNavParams] = useState<Record<string, string>>({});
```

`navigate` 함수 아래에 추가:

```ts
const navigateWith = (id: string, params: Record<string, string>) => {
  setNavParams(params);
  navigate(id);
};
```

`select` 함수 내부에 params 초기화 추가:

```ts
const select = (id: string) => {
  setHistory([]);
  setNavParams({});
  setActiveItem(id);
};
```

MainContent에 새 props 전달 — 기존 JSX를 수정:

```tsx
<MainContent
  activeItem={activeItem}
  onNavigate={navigate}
  onNavigateWith={navigateWith}
  navParams={navParams}
  onBack={history.length > 0 ? goBack : undefined}
  notifications={notifications}
/>
```

- [ ] **Step 2: MainContent.tsx에 새 props 반영**

`src/components/MainContent.tsx`의 Props 인터페이스 수정:

```ts
interface Props {
  activeItem: string;
  onNavigate: (id: string) => void;
  onNavigateWith: (id: string, params: Record<string, string>) => void;
  navParams: Record<string, string>;
  onBack?: () => void;
  notifications: AppNotification[];
}
```

함수 시그니처 수정:

```ts
export default function MainContent({ activeItem, onNavigate, onNavigateWith, navParams, onBack, notifications }: Props) {
```

`error-logs` 분기 수정:

```ts
if (activeItem === 'error-logs') {
  return <ErrorLogPage bell={bell} back={back} onNavigateWith={onNavigateWith} />;
}
```

`onchain` 분기 수정:

```ts
if (activeItem === 'onchain') {
  return <OnchainMonitorPage bell={bell} back={back} initialChain={navParams.chain} initialHash={navParams.txHash} />;
}
```

- [ ] **Step 3: 빌드 확인 (타입 에러 예상 — ErrorLogPage, OnchainMonitorPage 아직 미수정)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: ErrorLogPage, OnchainMonitorPage에서 prop 관련 타입 에러 (Task 4, 5에서 수정)

- [ ] **Step 4: 커밋**

```bash
git add src/App.tsx src/components/MainContent.tsx
git commit -m "feat: 페이지 간 네비게이션 파라미터 전달 구조 추가"
```

---

### Task 4: ErrorLogPage.tsx — 체인 인식 분석 + txHash 클릭 이동

**Files:**
- Modify: `src/components/ErrorLogPage.tsx`

- [ ] **Step 1: import 및 props 변경**

import 수정 — `analyzeError` → `analyzeErrorWithChain` 추가:

```ts
import {
  analyzeError, analyzeErrorWithChain, getCachedAnalysis, clearCachedAnalysis,
  getAnthropicKey, getGeminiKey, getProvider,
  type AnalysisResult,
} from '../ai';
```

`ErrorLogPage` 함수 시그니처에 `onNavigateWith` 추가:

```ts
export default function ErrorLogPage({ bell, back, onNavigateWith }: {
  bell?: React.ReactNode;
  back?: React.ReactNode;
  onNavigateWith?: (id: string, params: Record<string, string>) => void;
}) {
```

- [ ] **Step 2: ErrorDetail에 allErrors와 onNavigateWith 전달**

`ErrorLogPage` 컴포넌트의 `<ErrorDetail>` 렌더링 부분 수정:

```tsx
<ErrorDetail
  err={selected}
  raw={raw.find((m) => m.ts === selected.ts)}
  thread={thread}
  threadLoading={threadLoading}
  allErrors={errors}
  onNavigateWith={onNavigateWith}
/>
```

- [ ] **Step 3: ErrorDetail 컴포넌트에 체인 인식 분석 적용**

`ErrorDetail` 함수 시그니처 수정:

```ts
function ErrorDetail({
  err, raw, thread, threadLoading, allErrors, onNavigateWith,
}: {
  err: ParsedError;
  raw?: SlackMessage;
  thread: SlackMessage[];
  threadLoading: boolean;
  allErrors: ParsedError[];
  onNavigateWith?: (id: string, params: Record<string, string>) => void;
}) {
```

`runAnalyze` 함수를 `analyzeErrorWithChain`으로 변경:

```ts
const runAnalyze = async (force = false) => {
  setAnalyzing(true);
  setAnalyzeError(null);
  try {
    const r = await analyzeErrorWithChain(err, allErrors, force);
    setAnalysis(r);
  } catch (e) {
    setAnalyzeError(e instanceof Error ? e.message : '분석 실패');
  } finally {
    setAnalyzing(false);
  }
};
```

- [ ] **Step 4: txHash 필드에 온체인 모니터링 이동 버튼 추가**

`ErrorDetail` 내 Tx Hash 테이블 행 (기존 `{txUrl && (...)}` 부분) 수정:

기존:
```tsx
{err.txHash && (
  <tr>
    <td style={cellLabel}>Tx Hash</td>
    <td style={cellValue}>
      <span style={{ fontFamily: 'monospace' }}>{err.txHash}</span>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            marginLeft: 8, color: 'var(--accent)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, textDecoration: 'none',
          }}
        >
          <ExternalLink size={11} /> Explorer
        </a>
      )}
    </td>
  </tr>
)}
```

변경:
```tsx
{err.txHash && (
  <tr>
    <td style={cellLabel}>Tx Hash</td>
    <td style={cellValue}>
      <span style={{ fontFamily: 'monospace' }}>{err.txHash}</span>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            marginLeft: 8, color: 'var(--accent)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, textDecoration: 'none',
          }}
        >
          <ExternalLink size={11} /> Explorer
        </a>
      )}
      {onNavigateWith && err.chainId && (
        <button
          onClick={() => onNavigateWith('onchain', { chain: err.chainId!, txHash: err.txHash! })}
          style={{
            marginLeft: 8, padding: '2px 8px', fontSize: 11, fontWeight: 500,
            borderRadius: 4, cursor: 'pointer',
            background: 'rgba(59,130,246,0.1)', color: 'var(--accent)',
            border: '1px solid rgba(59,130,246,0.3)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <ChevronRight size={10} /> 온체인 조회
        </button>
      )}
    </td>
  </tr>
)}
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: OnchainMonitorPage prop 에러만 남음 (Task 5에서 수정)

- [ ] **Step 6: 커밋**

```bash
git add src/components/ErrorLogPage.tsx
git commit -m "feat: 에러 분석에 의존 체인 연관 에러 수집 적용 + txHash 온체인 이동"
```

---

### Task 5: OnchainMonitorPage.tsx — 초기 파라미터 자동 조회

**Files:**
- Modify: `src/components/OnchainMonitorPage.tsx`

- [ ] **Step 1: props에 initialChain/initialHash 추가**

`OnchainMonitorPage` 함수 시그니처 수정:

```ts
export default function OnchainMonitorPage({ bell, back, initialChain, initialHash }: {
  bell?: React.ReactNode;
  back?: React.ReactNode;
  initialChain?: string;
  initialHash?: string;
}) {
```

초기 탭을 파라미터에 따라 설정:

```ts
const [tab, setTab] = useState<Tab>(initialHash ? 'lookup' : 'lookup');
```

- [ ] **Step 2: LookupTab에 initialChain/initialHash 전달**

JSX에서 `<LookupTab />` 수정:

```tsx
{tab === 'lookup' && <LookupTab initialChain={initialChain} initialHash={initialHash} />}
```

- [ ] **Step 3: LookupTab에서 초기값 수신 및 자동 조회**

`LookupTab` 함수 시그니처 수정:

```ts
function LookupTab({ initialChain, initialHash }: { initialChain?: string; initialHash?: string }) {
```

`chain`과 `hash` 초기값 변경:

```ts
const [chain, setChain] = useState(initialChain || CHAINS[CHAINS.length - 1]);
const [hash, setHash] = useState(initialHash || '');
```

자동 조회를 위한 `useEffect` 추가 (기존 state 선언 뒤에):

```ts
const [autoOpened, setAutoOpened] = useState(false);

useEffect(() => {
  if (initialHash && !autoOpened) {
    setAutoOpened(true);
    const c = initialChain || chain;
    open(c, initialHash.startsWith('0x') ? initialHash : `0x${initialHash}`);
  }
}, [initialHash]);
```

- [ ] **Step 4: chainId→chainName 매핑 (Slack에서 오는 chainId는 숫자일 수 있음)**

`LookupTab` 내 `chain` 초기값 로직을 개선. `initialChain` prop 수정:

```ts
function resolveChainName(chainId?: string): string {
  if (!chainId) return CHAINS[CHAINS.length - 1];
  const map: Record<string, string> = {
    '11155111': 'Sepolia',
    '43113': 'Fuji',
    '56357': 'KCP',
  };
  const name = map[chainId] ?? chainId;
  return CHAINS.includes(name) ? name : CHAINS[CHAINS.length - 1];
}
```

초기값 변경:

```ts
const [chain, setChain] = useState(resolveChainName(initialChain));
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없이 통과

- [ ] **Step 6: 커밋**

```bash
git add src/components/OnchainMonitorPage.tsx
git commit -m "feat: 에러 로그에서 온체인 모니터링으로 txHash 파라미터 전달 및 자동 조회"
```

---

### Task 6: IncidentsPage.tsx — AI RCA 분석 버튼

**Files:**
- Modify: `src/components/IncidentsPage.tsx`

- [ ] **Step 1: import 추가**

기존 import에 추가:

```ts
import {
  analyzeIncidentRca,
  getAnthropicKey, getGeminiKey, getProvider,
  type RcaInput,
} from '../ai';
import {
  fetchHistory, parseError, isElectron,
  getSlackToken, getSlackChannel,
  type ParsedError,
} from '../slack';
import { Sparkles, RotateCw } from 'lucide-react';
```

기존 lucide-react import에서 `Sparkles`와 `RotateCw`가 없다면 추가. 기존 import 행:

```ts
import { Plus, AlertCircle, Clock, CheckCircle2, X, Send, Rocket, Loader2 } from 'lucide-react';
```

를 다음으로 수정:

```ts
import { Plus, AlertCircle, Clock, CheckCircle2, X, Send, Rocket, Loader2, Sparkles, RotateCw } from 'lucide-react';
```

그리고 별도 ai/slack import 추가:

```ts
import {
  analyzeIncidentRca,
  getAnthropicKey, getGeminiKey, getProvider,
} from '../ai';
import {
  fetchHistory, parseError,
  getSlackToken, getSlackChannel,
  type ParsedError,
} from '../slack';
```

- [ ] **Step 2: IncidentDetail에 AI RCA 섹션 추가**

`IncidentDetail` 컴포넌트 내부에 state 추가 (기존 `deploysLoading` state 근처):

```ts
const [rcaText, setRcaText] = useState<string | null>(null);
const [rcaLoading, setRcaLoading] = useState(false);
const [rcaError, setRcaError] = useState<string | null>(null);
const slackConfigured = !!getSlackToken() && !!getSlackChannel();
const provider = getProvider();
const hasAiKey = provider === 'anthropic' ? !!getAnthropicKey() : !!getGeminiKey();
```

RCA 실행 함수 추가 (기존 `savePostmortem` 함수 근처):

```ts
const runRca = async () => {
  setRcaLoading(true);
  setRcaError(null);
  try {
    // Slack에서 인시던트 시간대 에러 수집
    let errors: ParsedError[] = [];
    if (slackConfigured && typeof window !== 'undefined' && window.teamap) {
      const oldest = String((incident.createdAt - 10 * 60 * 1000) / 1000);
      const messages = await fetchHistory(oldest, 200);
      errors = messages
        .map((m) => parseError(m))
        .filter((p): p is ParsedError => p !== null)
        .filter((e) => {
          if (incident.affectedServices.length === 0) return true;
          return incident.affectedServices.some((s) =>
            e.service.toLowerCase().includes(s.toLowerCase())
          );
        });
    }

    const text = await analyzeIncidentRca({
      title: incident.title,
      severity: incident.severity,
      affectedServices: incident.affectedServices,
      createdAt: incident.createdAt,
      timeline: incident.timeline,
      errors,
    });

    setRcaText(text);

    // 타임라인에 분석 결과 추가
    onChange({
      ...incident,
      timeline: [...incident.timeline, {
        ts: Date.now(),
        type: 'analysis' as const,
        user: 'AI',
        message: text,
      }],
    });
  } catch (e) {
    setRcaError(e instanceof Error ? e.message : 'RCA 분석 실패');
  } finally {
    setRcaLoading(false);
  }
};
```

- [ ] **Step 3: RCA UI 렌더링 — 타임라인 섹션 위에 추가**

`IncidentDetail`의 JSX에서 `{/* 타임라인 */}` 주석 바로 위에 AI RCA 섹션 추가:

```tsx
{/* AI 원인 분석 */}
<section>
  <h3 style={sectionTitle}>
    <Sparkles size={13} style={{ marginRight: 6, verticalAlign: -1, color: 'var(--accent)' }} />
    AI 원인 분석 (RCA)
  </h3>
  {!rcaText && !rcaLoading && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={runRca}
        disabled={!hasAiKey}
        title={hasAiKey ? 'Slack 에러 + 타임라인을 AI가 종합 분석' : 'API 키를 먼저 등록하세요'}
        style={{
          padding: '8px 16px', fontSize: 12, fontWeight: 500, borderRadius: 6,
          background: hasAiKey ? 'var(--accent)' : 'transparent',
          color: hasAiKey ? '#fff' : 'var(--text-faint)',
          border: hasAiKey ? 'none' : '1px solid var(--border)',
          cursor: hasAiKey ? 'pointer' : 'not-allowed',
          opacity: hasAiKey ? 1 : 0.6,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Sparkles size={12} /> RCA 분석 실행
      </button>
      {!slackConfigured && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Slack 미연동 — 타임라인 기반으로만 분석됩니다
        </span>
      )}
    </div>
  )}
  {rcaLoading && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
      <Loader2 size={12} className="spinner" /> AI 분석 중...
    </div>
  )}
  {rcaError && (
    <p style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 0' }}>{rcaError}</p>
  )}
  {rcaText && !rcaLoading && (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {provider} · {new Date().toLocaleString('ko-KR', { hour12: false })}
        </span>
        <button
          onClick={() => { setRcaText(null); runRca(); }}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-faint)', cursor: 'pointer',
            padding: '4px 8px', borderRadius: 4, fontSize: 11,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <RotateCw size={10} /> 다시 분석
        </button>
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {rcaText}
      </div>
    </div>
  )}
</section>
```

- [ ] **Step 4: TimelineIcon에 'analysis' 타입 처리 추가**

`TimelineIcon` 함수 수정:

```ts
function TimelineIcon({ type }: { type: IncidentTimelineEntry['type'] }) {
  if (type === 'error') return <AlertCircle size={12} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />;
  if (type === 'deploy') return <Rocket size={12} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />;
  if (type === 'status') return <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />;
  if (type === 'analysis') return <Sparkles size={12} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />;
  return <span style={{
    width: 8, height: 8, borderRadius: '50%', background: 'var(--text-faint)',
    flexShrink: 0, marginTop: 4,
  }} />;
}
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없이 통과

- [ ] **Step 6: 커밋**

```bash
git add src/components/IncidentsPage.tsx
git commit -m "feat: 인시던트 상세에 AI RCA 분석 기능 추가"
```

---

### Task 7: ServiceMgmtPage.tsx — 의존 체인 편집 UI

**Files:**
- Modify: `src/components/ServiceMgmtPage.tsx`

- [ ] **Step 1: import 추가**

기존 store import에 추가:

```ts
import {
  getAssignedServices, setAssignedServices,
  getServiceConfigs, setServiceConfigs,
  getServiceDepChain, setServiceDepChain,
  getAssignedRepos,
  appendAudit, getAuditLog,
  getUsername,
  type ServiceConfig,
  type AuditEntry,
} from '../store';
```

lucide-react import에 `ChevronUp`, `ChevronDown`, `Link` 추가:

```ts
import {
  Play, Square, Settings as SettingsIcon, Plus, Trash2, AlertTriangle, Clock,
  ChevronUp, ChevronDown, Link,
} from 'lucide-react';
```

- [ ] **Step 2: ServiceMgmtPage에 의존 체인 state 추가**

`ServiceMgmtPage` 함수 내부에 기존 state 선언 아래 추가:

```ts
const [depChain, setDepChainLocal] = useState<string[]>(getServiceDepChain());
const repos = getAssignedRepos();

const persistDepChain = (next: string[]) => {
  setDepChainLocal(next);
  setServiceDepChain(next);
};

const addToChain = (repo: string) => {
  if (!depChain.includes(repo)) {
    persistDepChain([...depChain, repo]);
  }
};

const removeFromChain = (idx: number) => {
  persistDepChain(depChain.filter((_, i) => i !== idx));
};

const moveInChain = (idx: number, dir: -1 | 1) => {
  const next = [...depChain];
  const target = idx + dir;
  if (target < 0 || target >= next.length) return;
  [next[idx], next[target]] = [next[target], next[idx]];
  persistDepChain(next);
};
```

- [ ] **Step 3: 의존 체인 편집 UI 렌더링**

`ServiceMgmtPage`의 return JSX 내부, 메인 컨텐츠 영역의 맨 아래 (기존 감사 로그 섹션 위)에 추가.

기존 코드에서 적절한 위치를 찾아 다음 섹션을 추가:

```tsx
{/* 서비스 의존 체인 */}
<div style={{
  marginTop: 28, padding: 16,
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
}}>
  <h3 style={{
    fontSize: 13, fontWeight: 600, color: 'var(--text)',
    marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 6,
  }}>
    <Link size={13} /> 서비스 의존 체인
  </h3>
  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>
    에러 분석 시 연관 서비스 에러를 자동 수집합니다. 순서 = 호출 방향 (위에서 아래로).
  </p>

  {/* 체인 시각화 */}
  {depChain.length > 0 && (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 12px', marginBottom: 12,
      background: 'var(--bg-input)', borderRadius: 6,
      fontSize: 12, fontFamily: 'monospace', color: 'var(--text)',
      flexWrap: 'wrap',
    }}>
      {depChain.map((repo, i) => (
        <span key={repo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{repo.split('/').pop()}</span>
          {i < depChain.length - 1 && <span style={{ color: 'var(--text-faint)' }}>→</span>}
        </span>
      ))}
    </div>
  )}

  {/* 체인 목록 (편집) */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
    {depChain.map((repo, i) => (
      <div key={repo} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px',
        background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-faint)',
          minWidth: 18, textAlign: 'center',
        }}>
          {i + 1}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>
          {repo}
        </span>
        <button
          onClick={() => moveInChain(i, -1)}
          disabled={i === 0}
          style={{
            background: 'transparent', border: 'none', cursor: i === 0 ? 'default' : 'pointer',
            color: i === 0 ? 'var(--border)' : 'var(--text-faint)', padding: 2,
          }}
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={() => moveInChain(i, 1)}
          disabled={i === depChain.length - 1}
          style={{
            background: 'transparent', border: 'none',
            cursor: i === depChain.length - 1 ? 'default' : 'pointer',
            color: i === depChain.length - 1 ? 'var(--border)' : 'var(--text-faint)', padding: 2,
          }}
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={() => removeFromChain(i)}
          style={{
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'var(--text-faint)', padding: 2,
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    ))}
  </div>

  {/* 레포 추가 */}
  {repos.filter((r) => !depChain.includes(r)).length > 0 && (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {repos.filter((r) => !depChain.includes(r)).map((repo) => (
        <button
          key={repo}
          onClick={() => addToChain(repo)}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 12,
            background: 'var(--bg-card)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={10} /> {repo}
        </button>
      ))}
    </div>
  )}

  {repos.length === 0 && (
    <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>
      설정 → 계정 → GitHub에서 레포지토리를 먼저 등록하세요.
    </p>
  )}
</div>
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없이 통과

- [ ] **Step 5: 커밋**

```bash
git add src/components/ServiceMgmtPage.tsx
git commit -m "feat: 서비스 관리 페이지에 의존 체인 편집 UI 추가"
```

---

### Task 8: 통합 빌드 및 수동 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 빌드**

Run: `npx tsc --noEmit && npx vite build`
Expected: 에러 없이 빌드 성공

- [ ] **Step 2: 수동 검증 체크리스트**

앱 실행 후 확인:

1. **서비스 관리** → 의존 체인 섹션에서 레포 추가/삭제/순서 변경
2. **에러 로그** → 에러 선택 → AI 분석 실행 → 연관 에러가 있으면 체인 인식 프롬프트 확인
3. **에러 로그** → txHash 있는 에러 → "온체인 조회" 버튼 클릭 → 온체인 모니터링 페이지로 이동 + 자동 조회
4. **인시던트** → 인시던트 선택 → "RCA 분석 실행" 클릭 → 분석 결과 표시 + 타임라인에 추가
5. 의존 체인 미설정 시 기존 단일 분석이 정상 동작하는지 확인

- [ ] **Step 3: 최종 커밋 (필요 시)**

빌드 문제가 있었다면 수정 후:

```bash
git add -A
git commit -m "fix: 통합 빌드 수정"
```
