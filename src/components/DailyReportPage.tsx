import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Sparkles, AlertCircle, RotateCw, Moon, Sun } from 'lucide-react';
import {
  fetchHistory, parseError,
  getSlackToken, getSlackChannel,
  type ParsedError,
} from '../slack';
import {
  getAnthropicKey, getGeminiKey, getProvider,
} from '../ai';
import { getIncidents } from '../store';

const WORK_END_HOUR = 18;
const WORK_START_HOUR = 9;

function getTodayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now, label: '오늘 전체' };
}

function getOvernightRange() {
  const now = new Date();
  const end = new Date(now);

  let start: Date;
  if (now.getHours() < WORK_START_HOUR) {
    // 출근 전 → 어젯밤 18시부터 지금까지
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(WORK_END_HOUR, 0, 0, 0);
  } else {
    // 출근 후 → 어젯밤 18시부터 오늘 9시까지
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(WORK_END_HOUR, 0, 0, 0);
    end.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  return { start, end, label: '오버나이트 (퇴근 후)' };
}

type RangeMode = 'overnight' | 'today';

interface ErrorGroup {
  service: string;
  errors: ParsedError[];
  levelCounts: Record<string, number>;
}

function groupByService(errors: ParsedError[]): ErrorGroup[] {
  const map = new Map<string, ParsedError[]>();
  for (const e of errors) {
    const key = e.service || '(unknown)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()].map(([service, errs]) => {
    const levelCounts: Record<string, number> = {};
    for (const e of errs) {
      const l = (e.level ?? 'UNKNOWN').toUpperCase();
      levelCounts[l] = (levelCounts[l] ?? 0) + 1;
    }
    return { service, errors: errs, levelCounts };
  }).sort((a, b) => b.errors.length - a.errors.length);
}

async function generateDailySummary(errors: ParsedError[], rangeLabel: string): Promise<string> {
  if (!window.teamap) throw new Error('데스크톱 앱에서만 동작합니다.');
  const provider = getProvider();
  const apiKey = provider === 'anthropic' ? getAnthropicKey() : getGeminiKey();
  if (!apiKey) throw new Error('API 키를 설정 → 계정에서 등록하세요.');

  const errorSummaries = errors.slice(0, 50).map((e) =>
    `[${e.level ?? '?'}] ${e.service ? `[${e.service}]` : ''} ${e.component || ''} — ${e.summary}${e.fields.results ? ` | ${e.fields.results}` : ''}`
  ).join('\n');

  const system = `당신은 서비스 운영 엔지니어입니다. 에러 로그를 분석해 간결한 일일 리포트를 작성합니다.
리포트는 한국어로 작성하며, 다음 구조를 따릅니다:
1. 전체 요약 (2-3줄)
2. 서비스별 주요 이슈
3. 반복/패턴 에러 (있다면)
4. 권고 조치`;

  const user = `[${rangeLabel}] 에러 로그 ${errors.length}건을 분석해 일일 리포트를 작성해주세요.\n\n${errorSummaries}`;

  const r = provider === 'anthropic'
    ? await window.teamap.ai.analyze({ apiKey, system, user })
    : await window.teamap.ai.gemini({ apiKey, system, user });

  return r.text;
}

export default function DailyReportPage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const [mode, setMode] = useState<RangeMode>('overnight');
  const [errors, setErrors] = useState<ParsedError[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const configured = !!getSlackToken() && !!getSlackChannel();
  const hasAiKey = getProvider() === 'anthropic' ? !!getAnthropicKey() : !!getGeminiKey();

  const range = mode === 'overnight' ? getOvernightRange() : getTodayRange();

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setFetchError(null);
    setSummary(null);
    setSummaryError(null);
    try {
      const oldest = String(range.start.getTime() / 1000);
      const messages = await fetchHistory(oldest, 200);
      const endTs = range.end.getTime() / 1000;
      const parsed = messages
        .map((m) => parseError(m))
        .filter((p): p is ParsedError => p !== null)
        .filter((p) => parseFloat(p.ts) <= endTs);
      setErrors(parsed);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  const runSummary = async () => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const text = await generateDailySummary(errors, range.label);
      setSummary(text);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : '분석 실패');
    } finally {
      setSummarizing(false);
    }
  };

  const groups = groupByService(errors);
  const totalErrors = errors.length;
  const levelTotals: Record<string, number> = {};
  for (const e of errors) {
    const l = (e.level ?? 'UNKNOWN').toUpperCase();
    levelTotals[l] = (levelTotals[l] ?? 0) + 1;
  }

  const todayIncidents = getIncidents().filter((inc) => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return inc.createdAt >= start.getTime();
  });

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}일간 리포트</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="header-icon-btn" onClick={load} title="새로고침">
            <RefreshCw size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

          {/* 모드 탭 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { id: 'overnight', label: '오버나이트 브리핑', icon: Moon },
              { id: 'today', label: '오늘 전체 현황', icon: Sun },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
                  background: mode === id ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                  color: mode === id ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${mode === id ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* 기간 표시 */}
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {range.start.toLocaleString('ko-KR', { hour12: false })} ~{' '}
            {range.end.toLocaleString('ko-KR', { hour12: false })}
          </div>

          {!configured ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <AlertCircle size={28} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: 'var(--text)' }}>Slack 연동이 필요합니다</p>
            </div>
          ) : loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
              <Loader2 size={20} className="spinner" />
            </div>
          ) : fetchError ? (
            <p style={{ fontSize: 13, color: 'var(--danger)' }}>{fetchError}</p>
          ) : (
            <>
              {/* 요약 통계 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                <StatCard label="전체 에러" value={totalErrors} color="var(--danger)" />
                {Object.entries(levelTotals).map(([level, count]) => (
                  <StatCard key={level} label={level} value={count}
                    color={level === 'ERROR' ? 'var(--danger)' : level === 'WARN' || level === 'WARNING' ? 'var(--warning)' : 'var(--text-muted)'}
                  />
                ))}
                <StatCard label="서비스 수" value={groups.length} color="var(--accent)" />
              </div>

              {totalErrors === 0 && (
                <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
                  ✨ 해당 시간대에 에러가 없습니다
                </div>
              )}

              {totalErrors > 0 && (
                <>
                  {/* AI 요약 */}
                  <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: summary ? 14 : 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        <Sparkles size={14} style={{ color: 'var(--accent)' }} /> AI 일간 요약
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {summary && !summarizing && (
                          <button
                            onClick={runSummary}
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
                        {!summary && !summarizing && (
                          <button
                            onClick={runSummary}
                            disabled={!hasAiKey}
                            title={hasAiKey ? '에러 패턴 AI 분석' : 'API 키를 먼저 등록하세요'}
                            style={{
                              padding: '6px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                              background: hasAiKey ? 'var(--accent)' : 'transparent',
                              color: hasAiKey ? '#fff' : 'var(--text-faint)',
                              border: hasAiKey ? 'none' : '1px solid var(--border)',
                              cursor: hasAiKey ? 'pointer' : 'not-allowed',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <Sparkles size={11} /> 요약 생성
                          </button>
                        )}
                      </div>
                    </div>
                    {summarizing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                        <Loader2 size={12} className="spinner" /> AI 분석 중...
                      </div>
                    )}
                    {summaryError && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{summaryError}</p>}
                    {summary && (
                      <div style={{
                        fontSize: 13, color: 'var(--text)', lineHeight: 1.7,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {summary}
                      </div>
                    )}
                  </div>

                  {/* 서비스별 에러 현황 */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      서비스별 에러 현황
                    </div>
                    {groups.map((g) => (
                      <ServiceRow key={g.service} group={g} total={totalErrors} />
                    ))}
                  </div>

                  {/* 에러 목록 */}
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      에러 목록 ({errors.length}건)
                    </div>
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {errors.map((e) => (
                        <div key={e.ts} style={{
                          padding: '10px 16px', borderBottom: '1px solid var(--border)',
                          display: 'flex', flexDirection: 'column', gap: 3,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            {e.level && <LevelChip level={e.level} />}
                            {e.service && <span style={{ color: 'var(--text-faint)', fontFamily: 'monospace' }}>[{e.service}]</span>}
                            {e.component && <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.component}</span>}
                            <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{e.timestamp}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.summary}
                          </div>
                          {(e.fields.results || e.fields.result) && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.fields.results || e.fields.result}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 오늘 인시던트 현황 */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  오늘 인시던트 ({todayIncidents.length}건)
                </div>
                {todayIncidents.length === 0 ? (
                  <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-faint)' }}>오늘 생성된 인시던트가 없습니다.</div>
                ) : (
                  todayIncidents.map((inc) => (
                    <div key={inc.id} style={{
                      padding: '10px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                    }}>
                      <StatusDot status={inc.status} />
                      <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</span>
                      <SevChip severity={inc.severity} />
                      <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {new Date(inc.createdAt).toLocaleTimeString('ko-KR', { hour12: false })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function ServiceRow({ group, total }: { group: ErrorGroup; total: number }) {
  const pct = Math.round((group.errors.length / total) * 100);
  return (
    <div style={{
      padding: '10px 16px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ width: 140, fontSize: 12, fontFamily: 'monospace', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {group.service}
      </span>
      <div style={{ flex: 1, height: 6, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(239,68,68,0.6)', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', width: 32, textAlign: 'right', flexShrink: 0 }}>{group.errors.length}</span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {Object.entries(group.levelCounts).map(([l, n]) => (
          <span key={l} style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: l === 'ERROR' ? 'rgba(239,68,68,0.12)' : l === 'WARN' || l === 'WARNING' ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.12)',
            color: l === 'ERROR' ? 'var(--danger)' : l === 'WARN' || l === 'WARNING' ? 'var(--warning)' : 'var(--text-muted)',
          }}>{l} {n}</span>
        ))}
      </div>
    </div>
  );
}

function LevelChip({ level }: { level: string }) {
  const l = level.toUpperCase();
  const color = l === 'ERROR' ? 'var(--danger)' : l === 'WARN' || l === 'WARNING' ? 'var(--warning)' : 'var(--text-muted)';
  const bg = l === 'ERROR' ? 'rgba(239,68,68,0.12)' : l === 'WARN' || l === 'WARNING' ? 'rgba(245,158,11,0.12)' : 'rgba(100,116,139,0.12)';
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: bg, color }}>{l}</span>
  );
}

function SevChip({ severity }: { severity: string }) {
  const color = severity === 'sev1' ? 'var(--danger)' : severity === 'sev2' ? 'var(--warning)' : 'var(--text-muted)';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color }}>{severity.toUpperCase()}</span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'resolved' ? 'var(--success)' : status === 'monitoring' ? 'var(--accent)' : status === 'identified' ? 'var(--warning)' : 'var(--danger)';
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}
