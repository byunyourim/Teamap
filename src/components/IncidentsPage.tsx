import { useEffect, useMemo, useState } from 'react';
import { Plus, AlertCircle, Clock, CheckCircle2, X, Send, Rocket, Loader2, Sparkles, RotateCw } from 'lucide-react';
import {
  getIncidents, upsertIncident, newIncidentId,
  getAssignedServices, getAssignedWallets, getAssignedContracts,
  getUsername, getAssignedRepos,
  type Incident, type IncidentStatus, type IncidentSeverity,
  type IncidentTimelineEntry,
} from '../store';
import { getToken, fetchWorkflowRuns, type WorkflowRun } from '../github';
import {
  analyzeIncidentRca,
  getAnthropicKey, getGeminiKey, getProvider,
} from '../ai';
import {
  fetchHistory, parseError,
  getSlackToken, getSlackChannel,
  type ParsedError,
} from '../slack';

const STATUSES: { value: IncidentStatus; label: string; color: string }[] = [
  { value: 'investigating', label: '조사 중', color: 'var(--danger)' },
  { value: 'identified',    label: '원인 파악', color: 'var(--warning)' },
  { value: 'monitoring',    label: '모니터링',  color: 'var(--accent)' },
  { value: 'resolved',      label: '해결 완료', color: 'var(--success)' },
];

const SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: 'sev1', label: 'SEV1 — 심각' },
  { value: 'sev2', label: 'SEV2 — 중간' },
  { value: 'sev3', label: 'SEV3 — 낮음' },
];

export default function IncidentsPage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const [incidents, setIncidents] = useState<Incident[]>(getIncidents());
  const [selected, setSelected] = useState<Incident | null>(null);
  const [showNew, setShowNew] = useState(false);

  const refresh = () => setIncidents(getIncidents());

  const create = (data: Pick<Incident, 'title' | 'severity'>) => {
    const inc: Incident = {
      id: newIncidentId(),
      title: data.title,
      severity: data.severity,
      status: 'investigating',
      createdAt: Date.now(),
      affectedServices: [],
      affectedWallets: [],
      affectedContracts: [],
      timeline: [{
        ts: Date.now(),
        type: 'status',
        user: getUsername() || 'unknown',
        message: '인시던트 생성',
      }],
    };
    upsertIncident(inc);
    setIncidents(getIncidents());
    setSelected(inc);
    setShowNew(false);
  };

  const updateIncident = (next: Incident) => {
    upsertIncident(next);
    refresh();
    setSelected(next);
  };

  const counts = useMemo(() => ({
    open: incidents.filter((i) => i.status !== 'resolved').length,
    sev1: incidents.filter((i) => i.severity === 'sev1' && i.status !== 'resolved').length,
    resolved: incidents.filter((i) => i.status === 'resolved').length,
  }), [incidents]);

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}인시던트</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="header-icon-btn" onClick={() => setShowNew(true)} title="새 인시던트">
            <Plus size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 좌측 리스트 */}
        <div style={{
          width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: 12, fontSize: 12,
          }}>
            <Pill label="진행 중" value={counts.open} color="var(--danger)" />
            <Pill label="SEV1" value={counts.sev1} color="var(--warning)" />
            <Pill label="해결" value={counts.resolved} color="var(--success)" />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {incidents.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
                등록된 인시던트가 없습니다.
              </div>
            ) : (
              incidents.map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => setSelected(inc)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 4,
                    width: '100%', textAlign: 'left',
                    padding: '12px 16px', cursor: 'pointer',
                    background: selected?.id === inc.id ? 'var(--bg-hover)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <SeverityBadge severity={inc.severity} />
                    <StatusBadge status={inc.status} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                    {inc.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {new Date(inc.createdAt).toLocaleString('ko-KR', { hour12: false })}
                    {inc.status === 'resolved' && inc.resolvedAt && (
                      <span> · 소요 {formatDuration(inc.resolvedAt - inc.createdAt)}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 우측 상세 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              왼쪽에서 인시던트를 선택하거나 + 버튼으로 새로 만드세요.
            </div>
          ) : (
            <IncidentDetail incident={selected} onChange={updateIncident} />
          )}
        </div>
      </div>

      {showNew && <NewIncidentDialog onCreate={create} onCancel={() => setShowNew(false)} />}
    </main>
  );
}

interface RecentDeploy {
  repo: string;
  branch: string;
  sha: string;
  workflow: string;
  actor: string;
  conclusion: string | null;
  time: number;
  url: string;
}

function IncidentDetail({ incident, onChange }: { incident: Incident; onChange: (i: Incident) => void }) {
  const [note, setNote] = useState('');
  const [postmortem, setPostmortem] = useState(incident.postmortem ?? '');
  const [deploys, setDeploys] = useState<RecentDeploy[]>([]);
  const [deploysLoading, setDeploysLoading] = useState(false);
  const [rcaText, setRcaText] = useState<string | null>(null);
  const [rcaLoading, setRcaLoading] = useState(false);
  const [rcaError, setRcaError] = useState<string | null>(null);
  const slackConfigured = !!getSlackToken() && !!getSlackChannel();
  const provider = getProvider();
  const hasAiKey = provider === 'anthropic' ? !!getAnthropicKey() : !!getGeminiKey();
  const services = getAssignedServices();
  const wallets = getAssignedWallets();
  const contracts = getAssignedContracts();

  useEffect(() => {
    if (!getToken()) return;
    const repos = getAssignedRepos();
    if (repos.length === 0) return;

    setDeploysLoading(true);
    Promise.all(repos.map((repo) => fetchWorkflowRuns(repo).then((runs) =>
      runs.map((r) => ({ repo, branch: r.head_branch, sha: r.head_sha.slice(0, 7), workflow: r.name, actor: r.actor.login, conclusion: r.conclusion, time: new Date(r.created_at).getTime(), url: r.html_url }))
    ).catch(() => [] as RecentDeploy[]))).then((results) => {
      const all = results.flat().filter((d) =>
        Math.abs(d.time - incident.createdAt) < 24 * 60 * 60 * 1000
      ).sort((a, b) => b.time - a.time);
      setDeploys(all);
      setDeploysLoading(false);
    });
  }, [incident.id]);

  const setStatus = (status: IncidentStatus) => {
    const statusLabel = STATUSES.find((s) => s.value === status)?.label ?? status;
    const next: Incident = {
      ...incident,
      status,
      resolvedAt: status === 'resolved' ? Date.now() : incident.resolvedAt,
      timeline: [...incident.timeline, {
        ts: Date.now(),
        type: 'status',
        user: getUsername() || 'unknown',
        message: `상태 변경 → ${statusLabel}`,
      }],
    };
    onChange(next);
  };

  const setSeverity = (severity: IncidentSeverity) => {
    onChange({
      ...incident,
      severity,
      timeline: [...incident.timeline, {
        ts: Date.now(),
        type: 'note',
        user: getUsername() || 'unknown',
        message: `심각도 변경 → ${severity.toUpperCase()}`,
      }],
    });
  };

  const addNote = () => {
    if (!note.trim()) return;
    onChange({
      ...incident,
      timeline: [...incident.timeline, {
        ts: Date.now(),
        type: 'note',
        user: getUsername() || 'unknown',
        message: note.trim(),
      }],
    });
    setNote('');
  };

  const toggleAffected = (kind: 'service' | 'wallet' | 'contract', value: string) => {
    const key = kind === 'service' ? 'affectedServices' : kind === 'wallet' ? 'affectedWallets' : 'affectedContracts';
    const cur = incident[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...incident, [key]: next });
  };

  const savePostmortem = () => {
    onChange({ ...incident, postmortem });
  };

  const runRca = async () => {
    setRcaLoading(true);
    setRcaError(null);
    try {
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

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 헤더 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
            {incident.id}
          </span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
          {incident.title}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
          생성 {new Date(incident.createdAt).toLocaleString('ko-KR', { hour12: false })}
          {incident.resolvedAt && (
            <> · 해결 {new Date(incident.resolvedAt).toLocaleString('ko-KR', { hour12: false })}</>
          )}
        </div>
      </div>

      {/* 액션 바 */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>상태</span>
          <select value={incident.status} onChange={(e) => setStatus(e.target.value as IncidentStatus)} style={selectStyle}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>심각도</span>
          <select value={incident.severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)} style={selectStyle}>
            {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* 영향 태깅 */}
      <section>
        <h3 style={sectionTitle}>영향 범위</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ChipGroup
            label="서비스"
            options={services}
            selected={incident.affectedServices}
            onToggle={(v) => toggleAffected('service', v)}
          />
          <ChipGroup
            label="지갑"
            options={wallets.map((w) => w.label || w.address.slice(0, 10))}
            values={wallets.map((w) => w.address)}
            selected={incident.affectedWallets}
            onToggle={(v) => toggleAffected('wallet', v)}
          />
          <ChipGroup
            label="컨트랙트"
            options={contracts.map((c) => c.label || c.address.slice(0, 10))}
            values={contracts.map((c) => c.address)}
            selected={incident.affectedContracts}
            onToggle={(v) => toggleAffected('contract', v)}
          />
        </div>
      </section>

      {/* 관련 배포 (GitHub Actions) */}
      <section>
        <h3 style={sectionTitle}>
          <Rocket size={13} style={{ marginRight: 6, verticalAlign: -1 }} />
          관련 배포 (±24시간)
        </h3>
        {deploysLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
            <Loader2 size={12} className="spinner" /> GitHub Actions 조회 중...
          </div>
        ) : deploys.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>
            {getToken() ? '해당 시간대에 배포 이력이 없습니다.' : 'GitHub 토큰을 설정하면 배포 이력을 자동으로 표시합니다.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deploys.map((d) => (
              <a
                key={`${d.repo}-${d.sha}-${d.time}`}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', fontSize: 12, textDecoration: 'none',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: d.conclusion === 'success' ? 'var(--success)' : d.conclusion === 'failure' ? 'var(--danger)' : 'var(--warning)',
                }} />
                <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{d.repo}</span>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 11 }}>{d.sha}</span>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{d.branch}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {new Date(d.time).toLocaleString('ko-KR', { hour12: false })}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

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

      {/* 타임라인 */}
      <section>
        <h3 style={sectionTitle}>타임라인</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incident.timeline.map((entry, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10,
              padding: '10px 12px', fontSize: 12,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 60 }}>
                {new Date(entry.ts).toLocaleTimeString('ko-KR', { hour12: false })}
              </span>
              <TimelineIcon type={entry.type} />
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {entry.message}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                  {entry.user}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* 노트 추가 */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
            placeholder="노트 추가 (Enter)"
            style={{
              flex: 1, background: 'var(--bg-input)', color: 'var(--text)', fontSize: 12,
              border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button onClick={addNote} style={{
            padding: '0 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
            background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Send size={11} /> 추가
          </button>
        </div>
      </section>

      {/* 회고 */}
      <section>
        <h3 style={sectionTitle}>회고 (Postmortem)</h3>
        <textarea
          value={postmortem}
          onChange={(e) => setPostmortem(e.target.value)}
          onBlur={savePostmortem}
          placeholder="원인, 영향, 대응, 재발 방지 대책..."
          style={{
            width: '100%', minHeight: 140,
            background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 6, padding: 12,
            outline: 'none', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
          포커스를 벗어나면 자동 저장됩니다.
        </p>
      </section>
    </div>
  );
}

function NewIncidentDialog({ onCreate, onCancel }: {
  onCreate: (data: { title: string; severity: IncidentSeverity }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('sev2');

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 22, width: 480, maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>새 인시던트</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="인시던트 제목 (예: 결제 배치 실패 - max retries)"
          style={{
            width: '100%', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px',
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            marginBottom: 12,
          }}
        />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)} style={{ ...selectStyle, width: '100%', marginBottom: 16 }}>
          {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', fontSize: 12, borderRadius: 6,
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border-strong)', cursor: 'pointer',
          }}>
            취소
          </button>
          <button
            onClick={() => title.trim() && onCreate({ title: title.trim(), severity })}
            disabled={!title.trim()}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
              background: 'var(--accent)', color: '#fff', border: 'none',
              cursor: title.trim() ? 'pointer' : 'not-allowed',
              opacity: title.trim() ? 1 : 0.5,
            }}
          >
            생성
          </button>
        </div>
      </div>
    </div>
  );
}

function ChipGroup({
  label, options, values, selected, onToggle,
}: {
  label: string;
  options: string[];
  values?: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt, i) => {
          const value = values?.[i] ?? opt;
          const isOn = selected.includes(value);
          return (
            <button
              key={value}
              onClick={() => onToggle(value)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 12,
                background: isOn ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                color: isOn ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${isOn ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const cfg = {
    sev1: { label: 'SEV1', bg: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: 'rgba(239,68,68,0.4)' },
    sev2: { label: 'SEV2', bg: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: 'rgba(245,158,11,0.4)' },
    sev3: { label: 'SEV3', bg: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', border: 'rgba(100,116,139,0.4)' },
  }[severity];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const s = STATUSES.find((x) => x.value === status)!;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3,
      background: 'var(--bg-card)',
      color: s.color,
      border: `1px solid ${s.color}40`,
    }}>
      {s.label}
    </span>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

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

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}일 ${hr % 24}시간`;
  if (hr > 0) return `${hr}시간 ${min % 60}분`;
  if (min > 0) return `${min}분`;
  return `${sec}초`;
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text)',
  marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-input)', color: 'var(--text)', fontSize: 12,
  border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px',
  outline: 'none', fontFamily: 'inherit',
};
