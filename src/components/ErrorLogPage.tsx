import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ExternalLink, AlertCircle, ChevronRight, Search, Sparkles, RotateCw, Siren } from 'lucide-react';
import { upsertIncident, newIncidentId, getUsername, type IncidentSeverity } from '../store';
import {
  fetchHistory, fetchReplies, parseError, explorerUrl, chainName, isElectron,
  getSlackToken, getSlackChannel,
  type ParsedError, type SlackMessage,
} from '../slack';
import {
  analyzeError, analyzeErrorWithChain, getCachedAnalysis, clearCachedAnalysis,
  getAnthropicKey, getGeminiKey, getProvider,
  type AnalysisResult,
} from '../ai';

const POLL_MS = 30_000;

export default function ErrorLogPage({ bell, back, onNavigateWith }: {
  bell?: React.ReactNode;
  back?: React.ReactNode;
  onNavigateWith?: (id: string, params: Record<string, string>) => void;
}) {
  const [errors, setErrors] = useState<ParsedError[]>([]);
  const [raw, setRaw] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ParsedError | null>(null);
  const [thread, setThread] = useState<SlackMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const configured = !!getSlackToken() && !!getSlackChannel();

  const load = async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const messages = await fetchHistory(undefined, 100);
      setRaw(messages);
      const parsed = messages
        .map((m) => parseError(m))
        .filter((p): p is ParsedError => p !== null);
      setErrors(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (!configured) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selected || !selected.threadTs || !selected.replyCount) {
      setThread([]);
      return;
    }
    setThreadLoading(true);
    fetchReplies(selected.threadTs)
      .then((r) => setThread(r.slice(1)))
      .catch(() => setThread([]))
      .finally(() => setThreadLoading(false));
  }, [selected]);

  const filtered = useMemo(() => {
    if (!search.trim()) return errors;
    const q = search.toLowerCase();
    return errors.filter((e) =>
      e.summary.toLowerCase().includes(q)
      || e.service.toLowerCase().includes(q)
      || e.component.toLowerCase().includes(q)
      || e.txHash?.toLowerCase().includes(q)
      || e.chainId?.toLowerCase().includes(q)
    );
  }, [errors, search]);

  if (!isElectron()) {
    return (
      <main className="main-content">
        <div className="main-header"><span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}에러 로그</span>{bell}</div>
        <div style={emptyStyle}>
          <AlertCircle size={32} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
            데스크톱 앱에서만 동작합니다
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Slack API는 브라우저 CORS 제한으로 데스크톱 모드에서만 호출됩니다.
          </p>
        </div>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="main-content">
        <div className="main-header"><span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}에러 로그</span>{bell}</div>
        <div style={emptyStyle}>
          <AlertCircle size={32} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
            Slack 연동 설정이 필요합니다
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <strong>설정 → 계정 → Slack 연동</strong>에서 Bot Token과 Channel ID를 등록하세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}에러 로그</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="header-icon-btn" onClick={load} title="새로고침">
            <RefreshCw size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 좌측 리스트 */}
        <div style={{
          width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Search size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색 (서비스 / 컴포넌트 / Tx)"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && errors.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
                <Loader2 size={18} className="spinner" />
              </div>
            )}
            {error && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--danger)' }}>{error}</div>
            )}
            {!loading && filtered.length === 0 && !error && (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
                {search ? '검색 결과가 없습니다.' : '에러 메시지가 없습니다.'}
              </div>
            )}
            {filtered.map((e) => (
              <button
                key={e.ts}
                onClick={() => setSelected(e)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  width: '100%', textAlign: 'left',
                  padding: '12px 16px', cursor: 'pointer',
                  background: selected?.ts === e.ts ? 'var(--bg-hover)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  fontFamily: 'inherit', overflow: 'hidden', minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, overflow: 'hidden', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {e.level && <LevelBadge level={e.level} />}
                  {e.service && (
                    <span style={{ color: 'var(--text-faint)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      [{e.service}]
                    </span>
                  )}
                  {e.component && (
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.component}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {e.summary}
                </div>
                {(e.fields.results || e.fields.result) && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {(() => {
                      const text = e.fields.results || e.fields.result || '';
                      return text.length > 50 ? text.slice(0, 50) + '...' : text;
                    })()}
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11, color: 'var(--text-dim)',
                }}>
                  {e.timestamp && <span>{e.timestamp}</span>}
                  {e.chainId && <span>· {chainName(e.chainId)}</span>}
                  {e.replyCount && e.replyCount > 0 && (
                    <span>· 답글 {e.replyCount}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div style={{
            padding: '8px 16px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-dim)',
          }}>
            {filtered.length}건 / 30초마다 자동 갱신
          </div>
        </div>

        {/* 우측 상세 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              왼쪽에서 에러를 선택하세요.
            </div>
          ) : (
            <ErrorDetail
              err={selected}
              raw={raw.find((m) => m.ts === selected.ts)}
              thread={thread}
              threadLoading={threadLoading}
              allErrors={errors}
              onNavigateWith={onNavigateWith}
            />
          )}
        </div>
      </div>
    </main>
  );
}

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
  const txUrl = explorerUrl(err.chainId, err.txHash);
  const [analysis, setAnalysis] = useState<AnalysisResult | undefined>(() => getCachedAnalysis(err.ts));
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError_, setAnalyzeError] = useState<string | null>(null);
  const provider = getProvider();
  const hasKey = provider === 'anthropic' ? !!getAnthropicKey() : !!getGeminiKey();

  // 다른 에러 선택 시 캐시 다시 읽기
  useEffect(() => {
    setAnalysis(getCachedAnalysis(err.ts));
    setAnalyzeError(null);
  }, [err.ts]);

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

  const reAnalyze = () => {
    clearCachedAnalysis(err.ts);
    runAnalyze(true);
  };

  const [incidentCreated, setIncidentCreated] = useState(false);

  const createIncident = () => {
    const severity: IncidentSeverity =
      err.level?.toUpperCase() === 'ERROR' ? 'sev2' :
      err.level?.toUpperCase() === 'FATAL' ? 'sev1' : 'sev3';
    const inc = {
      id: newIncidentId(),
      title: err.summary,
      severity,
      status: 'investigating' as const,
      createdAt: Date.now(),
      affectedServices: err.service ? [err.service] : [],
      affectedWallets: [],
      affectedContracts: [],
      sourceErrorTs: err.ts,
      timeline: [{
        ts: Date.now(),
        type: 'error' as const,
        user: getUsername() || 'unknown',
        message: `에러 로그에서 생성\n${err.service ? `[${err.service}] ` : ''}${err.component || ''}\n${err.summary}`,
      }],
    };
    upsertIncident(inc);
    setIncidentCreated(true);
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 헤더 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {err.level && <LevelBadge level={err.level} />}
          {err.service && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
              [{err.service}]
            </span>
          )}
          {err.component && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {err.component}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}>
            {err.summary}
          </h2>
          <button
            onClick={createIncident}
            disabled={incidentCreated}
            title="이 에러로 인시던트 생성"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6,
              flexShrink: 0,
              background: incidentCreated ? 'transparent' : 'rgba(239,68,68,0.12)',
              color: incidentCreated ? 'var(--text-faint)' : 'var(--danger)',
              border: `1px solid ${incidentCreated ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
              cursor: incidentCreated ? 'default' : 'pointer',
            }}
          >
            <Siren size={12} />
            {incidentCreated ? '인시던트 생성됨' : '인시던트 생성'}
          </button>
        </div>
      </div>

      {/* AI 분석 */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 14,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: analysis || analyzeError_ ? 10 : 0,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            <Sparkles size={14} style={{ color: 'var(--accent)' }} />
            AI 원인 분석
          </span>
          {!analysis && !analyzing && (
            <button
              onClick={() => runAnalyze()}
              disabled={!hasKey}
              title={hasKey ? `${provider === 'anthropic' ? 'Claude' : 'Gemini'}로 코드 검색 + 원인 분석` : '설정 → 계정 → AI 원인 분석에서 API 키 등록'}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                background: hasKey ? 'var(--accent)' : 'transparent',
                color: hasKey ? '#fff' : 'var(--text-faint)',
                border: hasKey ? 'none' : '1px solid var(--border)',
                cursor: hasKey ? 'pointer' : 'not-allowed',
                opacity: hasKey ? 1 : 0.6,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <Sparkles size={11} /> 분석 실행
            </button>
          )}
          {analyzing && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <Loader2 size={12} className="spinner" /> 분석 중...
            </span>
          )}
          {analysis && !analyzing && (
            <button
              onClick={reAnalyze}
              title="다시 분석"
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-faint)', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 4, fontSize: 11,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <RotateCw size={10} /> 다시 분석
            </button>
          )}
        </div>

        {!hasKey && !analysis && (
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
            <strong>설정 → 계정 → AI 원인 분석</strong>에서 API 키를 등록하면 활성화됩니다.
          </p>
        )}

        {analyzeError_ && (
          <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
            {analyzeError_}
          </p>
        )}

        {analysis && (
          <>
            <div style={{
              fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              <SimpleMarkdown text={analysis.text} />
            </div>
            {analysis.hits.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  검색된 코드 위치 ({analysis.hits.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {analysis.hits.slice(0, 5).map((h, i) => (
                    <a
                      key={i}
                      href={h.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 4,
                        background: 'var(--bg-input)', border: '1px solid var(--border)',
                        textDecoration: 'none', fontSize: 11,
                      }}
                    >
                      <span style={{
                        color: 'var(--text-faint)', fontFamily: 'monospace',
                        background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 3,
                        flexShrink: 0,
                      }}>
                        {h.repo}
                      </span>
                      <span style={{ color: 'var(--text)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {h.path}
                      </span>
                      <ExternalLink size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 10 }}>
              {analysis.provider} · {analysis.model} · {new Date(analysis.cachedAt).toLocaleString('ko-KR', { hour12: false })}
            </p>
          </>
        )}
      </div>

      {/* 필드 */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 16,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {err.timestamp && <Row label="시각" value={err.timestamp} mono />}
            {err.chainId && <Row label="Chain" value={`${chainName(err.chainId)} (${err.chainId})`} />}
            {err.txHash && (
              <tr>
                <td style={cellLabel}>Tx Hash</td>
                <td style={cellValue}>
                  {onNavigateWith && err.chainId ? (
                    <button
                      onClick={() => onNavigateWith('onchain', { chain: err.chainId!, txHash: err.txHash! })}
                      style={{
                        fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)',
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                      title="온체인 모니터링에서 조회"
                    >
                      {err.txHash}
                    </button>
                  ) : (
                    <span style={{ fontFamily: 'monospace' }}>{err.txHash}</span>
                  )}
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
            {err.retryCount && <Row label="재시도" value={err.retryCount} mono />}
            {Object.entries(err.fields)
              .filter(([k]) => !['level', 'chainid', 'txhash', 'retrycount', 'timestamp'].includes(k))
              .map(([k, v]) => <Row key={k} label={k} value={v} mono />)}
          </tbody>
        </table>
      </div>

      {/* 스레드 */}
      {(err.replyCount ?? 0) > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
            스레드 답글 ({err.replyCount})
          </h3>
          {threadLoading ? (
            <Loader2 size={14} className="spinner" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {thread.map((m, i) => (
                <div key={i} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: 10, fontSize: 12, color: 'var(--text)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
                    {m.username || m.user || 'bot'}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td style={cellLabel}>{label}</td>
      <td style={{ ...cellValue, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</td>
    </tr>
  );
}

/** 아주 간단한 마크다운 렌더러 — **bold**, `code`, 헤더, 리스트 항목만 처리 */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (/^#+\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = line.replace(/^#+\s+/, '');
      out.push(
        <div key={i} style={{
          fontSize: level === 1 ? 14 : 13, fontWeight: 700,
          color: 'var(--text-strong)', marginTop: i === 0 ? 0 : 10, marginBottom: 4,
        }}>
          {inline(content)}
        </div>
      );
    } else if (/^\s*[-*]\s/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, '');
      out.push(
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
          <span>{inline(content)}</span>
        </div>
      );
    } else if (/^\s*\d+\.\s/.test(line)) {
      const num = line.match(/^\s*(\d+)/)![1];
      const content = line.replace(/^\s*\d+\.\s+/, '');
      out.push(
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: 600, minWidth: 16 }}>{num}.</span>
          <span>{inline(content)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      out.push(<div key={i} style={{ height: 6 }} />);
    } else {
      out.push(<div key={i} style={{ marginBottom: 3 }}>{inline(line)}</div>);
    }
  });

  return <>{out}</>;
}

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // **bold** + `code` 처리
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      out.push(<strong key={i} style={{ color: 'var(--text-strong)' }}>{p.slice(2, -2)}</strong>);
    } else if (p.startsWith('`') && p.endsWith('`')) {
      out.push(
        <code key={i} style={{
          background: 'var(--bg-input)', padding: '1px 5px',
          borderRadius: 3, fontSize: 11, fontFamily: 'monospace', color: 'var(--accent)',
        }}>
          {p.slice(1, -1)}
        </code>
      );
    } else {
      out.push(p);
    }
  });
  return out;
}

function LevelBadge({ level }: { level: string }) {
  const colors = level.toUpperCase() === 'ERROR'
    ? { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: 'rgba(239,68,68,0.3)' }
    : level.toUpperCase() === 'WARN' || level.toUpperCase() === 'WARNING'
    ? { bg: 'rgba(245,158,11,0.12)', color: 'var(--warning)', border: 'rgba(245,158,11,0.3)' }
    : { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)', border: 'rgba(100,116,139,0.3)' };

  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
      background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {level.toUpperCase()}
    </span>
  );
}

const emptyStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: 40, textAlign: 'center',
};

const cellLabel: React.CSSProperties = {
  padding: '6px 12px 6px 0', color: 'var(--text-faint)',
  fontSize: 11, textTransform: 'capitalize',
  verticalAlign: 'top', whiteSpace: 'nowrap', width: 100,
};

const cellValue: React.CSSProperties = {
  padding: '6px 0', color: 'var(--text)', wordBreak: 'break-all',
};
