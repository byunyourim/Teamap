import type { ParsedError } from './slack';
import type { CodeSearchHit } from './github';
import { searchCode, fetchFileContentWithMatch } from './github';
import { getServiceDepChain, repoToService, getRelatedServices } from './store';

const ANTHROPIC_KEY = 'anthropic_api_key';
const GEMINI_KEY = 'gemini_api_key';
const PROVIDER_KEY = 'teamap_ai_provider';
const ANALYSIS_CACHE = 'teamap_ai_analysis_cache';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const GEMINI_MODEL = 'gemini-2.5-flash';

export type Provider = 'anthropic' | 'gemini';

export function getProvider(): Provider {
  const v = localStorage.getItem(PROVIDER_KEY);
  return v === 'anthropic' || v === 'gemini' ? v : 'gemini';
}

export function setProvider(p: Provider) {
  localStorage.setItem(PROVIDER_KEY, p);
}

export function getAnthropicKey(): string {
  return localStorage.getItem(ANTHROPIC_KEY) ?? '';
}

export function setAnthropicKey(v: string) {
  localStorage.setItem(ANTHROPIC_KEY, v);
}

export function getGeminiKey(): string {
  return localStorage.getItem(GEMINI_KEY) ?? '';
}

export function setGeminiKey(v: string) {
  localStorage.setItem(GEMINI_KEY, v);
}

const SYSTEM_PROMPT = `당신은 블록체인 서비스 시니어 백엔드 엔지니어입니다.
주어진 에러 로그와 GitHub 코드 컨텍스트(매치 위치 ± 15줄)를 분석해
**에러가 던져진 정확한 위치**를 찾는 게 임무입니다.

각 후보 파일에는 "> 1234: code" 형식의 라인 번호가 매겨진 코드가 포함됩니다.
"> " 표시가 키워드가 직접 매치된 라인입니다. 그 주변 코드를 함께 보고 함수명/조건문을 추출하세요.

응답 형식 (마크다운):

## 에러 지점
- **파일**: \`path/to/file.ts\` (라인 N)
- **GitHub**: <전달받은 코드 검색 결과의 url>
- **함수**: \`functionName()\`

## 추정 원인
1-3문장. 매치된 코드 라인을 인용하며 어떤 조건에서 이 에러가 던져지는지 설명.

## 빠른 점검
- [ ] 즉시 확인할 항목 1
- [ ] 즉시 확인할 항목 2
- [ ] (필요 시) 3-4

규칙:
- "> " 표시된 매치 라인을 우선 평가
- 가장 가능성 높은 한 곳을 라인 번호와 함께 찍을 것 (확신 없으면 "후보:" 형태로 2개)
- 코드 컨텍스트에 일치하는 게 없으면 "코드에서 정확한 위치 미발견" 명시
- 한국어, 5-10줄 이내, 간결하게`;

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

export interface AnalysisResult {
  text: string;
  cachedAt: number;
  model: string;
  provider: Provider;
  hits: CodeSearchHit[];
}

function getCache(): Record<string, AnalysisResult> {
  try {
    const v = JSON.parse(localStorage.getItem(ANALYSIS_CACHE) ?? '{}');
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}

function setCache(cache: Record<string, AnalysisResult>) {
  const entries = Object.entries(cache);
  if (entries.length > 100) {
    entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
    cache = Object.fromEntries(entries.slice(0, 100));
  }
  localStorage.setItem(ANALYSIS_CACHE, JSON.stringify(cache));
}

export function getCachedAnalysis(ts: string): AnalysisResult | undefined {
  return getCache()[ts];
}

export function clearCachedAnalysis(ts: string) {
  const c = getCache();
  delete c[ts];
  setCache(c);
}

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

/** 너무 일반적이라 검색 신호로 안 쓰는 단어들 */
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'into',
  'error', 'failed', 'fail', 'failure', 'exception', 'occurred',
  'and', 'or', 'not', 'no', 'yes', 'true', 'false', 'null', 'undefined',
  'this', 'that', 'these', 'those', 'it', 'its',
]);

/** 텍스트에서 핵심 영문 키워드 추출 (4자 이상, 흔한 단어 제외) */
function extractKeywords(text: string): string[] {
  return text
    .replace(/[^a-zA-Z0-9가-힣 _-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !COMMON_WORDS.has(w.toLowerCase()));
}

/** 에러에서 검색용 키워드 후보를 추출
 *  - 정확한 구문 검색은 매칭률이 낮아 짧은 키워드 조합으로 검색
 *  - 1차: summary 핵심 키워드 5개
 *  - 2차 폴백: 3개로 줄임
 *  - 3차: err 필드, 컴포넌트명
 */
function buildSearchQueries(err: ParsedError): string[] {
  const out: string[] = [];

  if (err.summary && err.summary.length >= 6) {
    const keywords = extractKeywords(err.summary);
    if (keywords.length >= 2) {
      out.push(keywords.slice(0, 5).join(' '));
      if (keywords.length > 3) out.push(keywords.slice(0, 3).join(' '));
    }
  }

  if (err.fields.err && err.fields.err.length >= 6) {
    const keywords = extractKeywords(err.fields.err);
    if (keywords.length >= 2) out.push(keywords.slice(0, 5).join(' '));
  }

  // 컴포넌트명도 키워드로 — 특정 모듈에 한정해 검색
  if (err.component && err.component.length >= 4) {
    out.push(err.component);
  }

  return out.filter((q, i, a) => q && a.indexOf(q) === i);
}

export async function searchErrorLocation(err: ParsedError): Promise<CodeSearchHit[]> {
  const queries = buildSearchQueries(err);
  const seen = new Set<string>();
  const all: CodeSearchHit[] = [];

  for (const q of queries) {
    try {
      const hits = await searchCode(q, 10);
      for (const h of hits) {
        const key = `${h.repo}/${h.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(h);
        }
      }
    } catch {
      // 한 쿼리 실패해도 다음 쿼리 시도
    }
  }

  // 상위 3개 후보의 파일 내용에서 매치 위치 ± 컨텍스트 추출 (AI에게 라인 번호 정확히 전달)
  const topHits = all.slice(0, 3);
  const keywords = Array.from(new Set(queries.flatMap((q) => q.split(/\s+/)).filter(Boolean)));
  await Promise.all(
    topHits.map(async (h) => {
      try {
        const matched = await fetchFileContentWithMatch(h.repo, h.path, keywords, 15);
        if (matched.length > 0) h.matchedLines = matched;
      } catch {
        // 파일 가져오기 실패 시 fragments 그대로 사용
      }
    }),
  );

  return all.slice(0, 10);
}

export async function analyzeError(err: ParsedError, force = false): Promise<AnalysisResult> {
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

  // 1. GitHub 코드 검색
  const hits = await searchErrorLocation(err);

  // 2. 프롬프트 구성
  const userMessage = formatPrompt(err, hits);

  // 3. AI 호출
  const r = provider === 'anthropic'
    ? await window.teamap.ai.analyze({
        apiKey,
        model: ANTHROPIC_MODEL,
        system: SYSTEM_PROMPT,
        user: userMessage,
      })
    : await window.teamap.ai.gemini({
        apiKey,
        model: GEMINI_MODEL,
        system: SYSTEM_PROMPT,
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

function formatHit(h: CodeSearchHit, index: number): string {
  const lines: string[] = [];
  lines.push(`### 후보 ${index + 1}`);
  lines.push(`파일: ${h.repo}/${h.path}`);
  lines.push(`URL: ${h.url}`);

  if (h.matchedLines && h.matchedLines.length > 0) {
    lines.push('');
    lines.push('매치된 코드 (> 표시가 매치 라인):');
    for (const m of h.matchedLines) {
      lines.push('```');
      lines.push(m.snippet);
      lines.push('```');
    }
  } else if (h.fragments.length > 0) {
    lines.push('');
    lines.push('검색 fragment:');
    for (const f of h.fragments) {
      lines.push('```');
      lines.push(f);
      lines.push('```');
    }
  }
  return lines.join('\n');
}

function formatPrompt(err: ParsedError, hits: CodeSearchHit[]): string {
  const fieldsText = Object.entries(err.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const hitsText = hits.length === 0
    ? '(검색 결과 없음)'
    : hits.map((h, i) => formatHit(h, i)).join('\n\n');

  return `# 에러 로그
서비스: ${err.service || '(알 수 없음)'}
컴포넌트: ${err.component || '(알 수 없음)'}
요약: ${err.summary}
${err.level ? `심각도: ${err.level}` : ''}

상세 필드:
${fieldsText}

원본 메시지:
\`\`\`
${err.raw}
\`\`\`

# GitHub 코드 검색 결과 (상위 후보는 매치 라인 ±15줄 컨텍스트 포함)
${hitsText}

위 코드 컨텍스트에서 어디서 이 에러가 던져졌는지 찾아주세요. 매치된 라인 번호와 함수명을 정확히 인용해주세요.`;
}

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
    : hits.map((h, i) => formatHit(h, i)).join('\n\n');

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

export async function testApiKey(provider: Provider = getProvider()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!window.teamap) return { ok: false, error: '데스크톱 앱에서만 동작합니다.' };
  const apiKey = provider === 'anthropic' ? getAnthropicKey() : getGeminiKey();
  if (!apiKey) return { ok: false, error: 'API 키가 비어있습니다.' };

  try {
    if (provider === 'anthropic') {
      await window.teamap.ai.analyze({
        apiKey,
        model: ANTHROPIC_MODEL,
        system: '간결하게 답하세요.',
        user: '"OK"라고만 한 단어로 답하세요.',
      });
    } else {
      await window.teamap.ai.gemini({
        apiKey,
        model: GEMINI_MODEL,
        system: '간결하게 답하세요.',
        user: '"OK"라고만 한 단어로 답하세요.',
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '연결 실패' };
  }
}

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
