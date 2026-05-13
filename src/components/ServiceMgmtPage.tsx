import { useEffect, useMemo, useState } from 'react';
import {
  Play, Square, Settings as SettingsIcon, Plus, Trash2, AlertTriangle, Clock,
  ChevronUp, ChevronDown, Link,
} from 'lucide-react';
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
import { parseCron, formatTimeUntil } from '../cron';

interface ExecutionRun {
  startedAt: number;
  durationMs: number;
  status: 'success' | 'fail';
}

interface RuntimeState {
  status: 'idle' | 'running' | 'stopped';
  history: ExecutionRun[];
  health: 'up' | 'down' | 'unknown';
}

function seedHistory(): ExecutionRun[] {
  const now = Date.now();
  const out: ExecutionRun[] = [];
  for (let i = 9; i >= 0; i--) {
    out.push({
      startedAt: now - i * 600_000 - Math.random() * 60_000,
      durationMs: 800 + Math.random() * 4200,
      status: Math.random() < 0.85 ? 'success' : 'fail',
    });
  }
  return out;
}

function deriveHealth(history: ExecutionRun[]): 'up' | 'down' | 'unknown' {
  if (history.length === 0) return 'unknown';
  const recent = history.slice(-5);
  const failed = recent.filter((r) => r.status === 'fail').length;
  if (failed >= 3) return 'down';
  if (failed === 0) return 'up';
  return 'unknown';
}

export default function ServiceMgmtPage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const [services, setServices] = useState<string[]>(getAssignedServices());
  const [configs, setConfigs] = useState(getServiceConfigs());
  const [input, setInput] = useState('');
  const [cronInput, setCronInput] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editCron, setEditCron] = useState('');
  const [runtime, setRuntime] = useState<Record<string, RuntimeState>>(() => {
    const init: Record<string, RuntimeState> = {};
    for (const s of getAssignedServices()) {
      const h = seedHistory();
      init[s] = { status: 'idle', history: h, health: deriveHealth(h) };
    }
    return init;
  });
  const [confirmState, setConfirmState] = useState<{ svc: string; action: 'run' | 'stop' } | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>(getAuditLog());
  const [, setTick] = useState(0);

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

  // 1초마다 다시 렌더링 (다음 실행 시각 카운트다운)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const persistConfig = (next: typeof configs) => {
    setConfigs(next);
    setServiceConfigs(next);
  };

  const persistServices = (next: string[]) => {
    setServices(next);
    setAssignedServices(next);
  };

  const log = (action: string, target: string, detail?: string) => {
    const entry = appendAudit({ user: getUsername() || 'unknown', action, target, detail });
    setAudit((prev) => [entry, ...prev]);
  };

  const addService = () => {
    const v = input.trim();
    if (!v || services.includes(v)) {
      setInput('');
      return;
    }
    persistServices([...services, v]);
    if (cronInput.trim()) persistConfig({ ...configs, [v]: { cron: cronInput.trim() } });
    const h = seedHistory();
    setRuntime((prev) => ({ ...prev, [v]: { status: 'idle', history: h, health: deriveHealth(h) } }));
    log('service.add', v, cronInput.trim() ? `cron=${cronInput.trim()}` : undefined);
    setInput('');
    setCronInput('');
  };

  const removeService = (svc: string) => {
    if (!window.confirm(`'${svc}' 서비스를 삭제할까요?`)) return;
    persistServices(services.filter((s) => s !== svc));
    const next = { ...configs };
    delete next[svc];
    persistConfig(next);
    setRuntime((prev) => {
      const r = { ...prev };
      delete r[svc];
      return r;
    });
    log('service.delete', svc);
  };

  const requestAction = (svc: string, action: 'run' | 'stop') => {
    setConfirmState({ svc, action });
  };

  const performAction = () => {
    if (!confirmState) return;
    const { svc, action } = confirmState;
    setConfirmState(null);

    setRuntime((prev) => {
      const cur = prev[svc] ?? { status: 'idle' as const, history: [], health: 'unknown' as const };
      if (action === 'run') {
        // 시뮬레이션: 1.5초 후 완료
        setTimeout(() => {
          setRuntime((p2) => {
            const c2 = p2[svc];
            if (!c2) return p2;
            const ok = Math.random() < 0.85;
            const run: ExecutionRun = {
              startedAt: Date.now() - 1500,
              durationMs: 1500,
              status: ok ? 'success' : 'fail',
            };
            const history = [...c2.history, run].slice(-10);
            return {
              ...p2,
              [svc]: { status: 'idle', history, health: deriveHealth(history) },
            };
          });
        }, 1500);
        return { ...prev, [svc]: { ...cur, status: 'running' } };
      } else {
        return { ...prev, [svc]: { ...cur, status: 'stopped' } };
      }
    });

    log(action === 'run' ? 'service.run' : 'service.stop', svc);
  };

  const startEditCron = (svc: string) => {
    setEditing(svc);
    setEditCron(configs[svc]?.cron ?? '');
  };

  const saveEditCron = () => {
    if (!editing) return;
    const trimmed = editCron.trim();
    const prev = configs[editing]?.cron;
    const next = { ...configs };
    if (trimmed) next[editing] = { ...(next[editing] ?? {}), cron: trimmed };
    else if (next[editing]) delete next[editing].cron;
    persistConfig(next);
    log('service.config', editing, `cron: ${prev ?? '없음'} → ${trimmed || '없음'}`);
    setEditing(null);
    setEditCron('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditCron('');
  };

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}서비스 관리</span>
        {bell}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
        {/* 서비스 추가 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, maxWidth: 720 }}>
          <input
            style={inputStyle}
            placeholder="서비스 이름"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addService(); }}
          />
          <input
            style={{ ...inputStyle, fontFamily: 'monospace', maxWidth: 200 }}
            placeholder="cron (선택, 예: 0 */5 * * *)"
            value={cronInput}
            onChange={(e) => setCronInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addService(); }}
          />
          <button onClick={addService} style={addBtnStyle}>
            <Plus size={14} /> 추가
          </button>
        </div>

        {services.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {services.map((svc) => (
              <ServiceCard
                key={svc}
                svc={svc}
                config={configs[svc]}
                rt={runtime[svc] ?? { status: 'idle', history: [], health: 'unknown' }}
                editing={editing === svc}
                editCron={editCron}
                setEditCron={setEditCron}
                onRun={() => requestAction(svc, 'run')}
                onStop={() => requestAction(svc, 'stop')}
                onEdit={() => startEditCron(svc)}
                onSave={saveEditCron}
                onCancel={cancelEdit}
                onDelete={() => removeService(svc)}
              />
            ))}
          </div>
        )}

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

        {/* 감사 로그 */}
        {audit.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h3 style={sectionTitleStyle}>감사 로그</h3>
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, maxHeight: 260, overflowY: 'auto',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>시각</th>
                    <th style={thStyle}>사용자</th>
                    <th style={thStyle}>동작</th>
                    <th style={thStyle}>대상</th>
                    <th style={thStyle}>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.slice(0, 30).map((a) => (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{new Date(a.ts).toLocaleString('ko-KR', { hour12: false })}</td>
                      <td style={tdStyle}>{a.user}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{a.action}</td>
                      <td style={tdStyle}>{a.target}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-faint)' }}>{a.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 24 }}>
          ※ 실행/중단/이력은 클라이언트 시뮬레이션입니다. 실제 배치 서버 연동은 향후 작업.
        </p>
      </div>

      {/* 확인 다이얼로그 */}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.action === 'run' ? '실행 확인' : '중단 확인'}
          message={`'${confirmState.svc}' 서비스를 ${confirmState.action === 'run' ? '실행' : '중단'}하시겠습니까?`}
          danger={confirmState.action === 'stop'}
          onConfirm={performAction}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </main>
  );
}

function ServiceCard({
  svc, config, rt, editing, editCron, setEditCron,
  onRun, onStop, onEdit, onSave, onCancel, onDelete,
}: {
  svc: string;
  config?: ServiceConfig;
  rt: RuntimeState;
  editing: boolean;
  editCron: string;
  setEditCron: (v: string) => void;
  onRun: () => void;
  onStop: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const cronInfo = useMemo(() => config?.cron ? parseCron(config.cron) : null, [config?.cron]);

  const success = rt.history.filter((r) => r.status === 'success').length;
  const fail = rt.history.filter((r) => r.status === 'fail').length;
  const avgMs = rt.history.length > 0
    ? Math.round(rt.history.reduce((a, b) => a + b.durationMs, 0) / rt.history.length)
    : 0;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 16,
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HealthLED health={rt.health} status={rt.status} />
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
            {svc}
          </span>
          {rt.status === 'running' && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: 'rgba(59,130,246,0.15)', color: 'var(--accent)',
            }}>
              실행 중
            </span>
          )}
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <ActionBtn icon={<Play size={12} />} label="실행" onClick={onRun} variant="primary" disabled={rt.status === 'running'} />
          <ActionBtn icon={<Square size={12} />} label="중단" onClick={onStop} variant="danger" disabled={rt.status !== 'running'} />
          <ActionBtn icon={<SettingsIcon size={12} />} label="설정" onClick={onEdit} variant="ghost" />
          <ActionBtn icon={<Trash2 size={12} />} label="삭제" onClick={onDelete} variant="ghost" />
        </div>
      </div>

      {/* 메타 정보 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}>
        <Meta label="Cron">
          {editing ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, padding: '4px 8px' }}
                placeholder="0 */5 * * *"
                value={editCron}
                onChange={(e) => setEditCron(e.target.value)}
              />
              <button onClick={onSave} style={miniBtn('primary')}>저장</button>
              <button onClick={onCancel} style={miniBtn('ghost')}>취소</button>
            </div>
          ) : (
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text)' }}>
              {config?.cron || <span style={{ color: 'var(--text-dim)' }}>설정 없음</span>}
            </span>
          )}
        </Meta>
        <Meta label="다음 실행">
          {cronInfo?.ok && cronInfo.next ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text)' }}>
              <Clock size={11} style={{ color: 'var(--text-faint)' }} />
              <span>{formatTimeUntil(cronInfo.next)}</span>
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                ({cronInfo.next.toLocaleString('ko-KR', { hour12: false })})
              </span>
            </div>
          ) : cronInfo?.error ? (
            <span style={{ fontSize: 11, color: 'var(--danger)' }}>{cronInfo.error}</span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</span>
          )}
        </Meta>
        <Meta label="성공/실패 (최근 10)">
          <span style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--success)' }}>{success}</span>
            <span style={{ color: 'var(--text-faint)' }}> / </span>
            <span style={{ color: 'var(--danger)' }}>{fail}</span>
          </span>
        </Meta>
        <Meta label="평균 소요">
          <span style={{ fontSize: 12, color: 'var(--text)' }}>
            {avgMs > 0 ? `${avgMs} ms` : '—'}
          </span>
        </Meta>
      </div>

      {/* 차트 */}
      {rt.history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            실행 이력 (소요 시간)
          </div>
          <ExecutionChart runs={rt.history} />
        </div>
      )}
    </div>
  );
}

function ExecutionChart({ runs }: { runs: ExecutionRun[] }) {
  const max = Math.max(...runs.map((r) => r.durationMs), 1);
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 4, height: 50,
    }}>
      {runs.map((r, i) => {
        const h = Math.max(4, (r.durationMs / max) * 46);
        const color = r.status === 'success' ? 'var(--success)' : 'var(--danger)';
        return (
          <div
            key={i}
            title={`${new Date(r.startedAt).toLocaleString('ko-KR', { hour12: false })}\n${r.status} · ${Math.round(r.durationMs)}ms`}
            style={{
              flex: 1, height: h, background: color,
              borderRadius: '3px 3px 0 0', opacity: 0.85,
              cursor: 'help',
            }}
          />
        );
      })}
    </div>
  );
}

function HealthLED({ health, status }: { health: 'up' | 'down' | 'unknown'; status: 'idle' | 'running' | 'stopped' }) {
  const color =
    status === 'running' ? 'var(--accent)' :
    health === 'up' ? 'var(--success)' :
    health === 'down' ? 'var(--danger)' :
    'var(--text-faint)';
  const label =
    status === 'running' ? '실행 중' :
    health === 'up' ? '정상' :
    health === 'down' ? '비정상' : '확인 필요';
  return (
    <span title={label} style={{
      width: 10, height: 10, borderRadius: '50%',
      background: color,
      boxShadow: `0 0 8px ${color}`,
      flexShrink: 0,
    }} />
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--text-faint)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
      }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ActionBtn({
  icon, label, onClick, variant, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant: 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
}) {
  const palette = {
    primary: { bg: 'rgba(59,130,246,0.12)', color: 'var(--accent)', border: 'rgba(59,130,246,0.25)' },
    danger:  { bg: 'rgba(239,68,68,0.10)',  color: '#f87171', border: 'rgba(239,68,68,0.25)' },
    ghost:   { bg: 'transparent', color: 'var(--text-muted)', border: 'var(--border)' },
  }[variant];
  return (
    <button onClick={onClick} title={label} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', fontSize: 11, borderRadius: 4,
      background: palette.bg, color: palette.color,
      border: `1px solid ${palette.border}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
    }}>
      {icon}
      {label}
    </button>
  );
}

function ConfirmDialog({
  title, message, danger, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 22, width: 400, maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={18} style={{ color: danger ? 'var(--danger)' : 'var(--warning)' }} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', fontSize: 12, borderRadius: 6,
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border-strong)', cursor: 'pointer',
          }}>
            취소
          </button>
          <button onClick={onConfirm} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
            background: danger ? 'var(--danger)' : 'var(--accent)', color: '#fff',
            border: 'none', cursor: 'pointer',
          }}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 20px',
      background: 'var(--bg-sidebar)', border: '1px dashed var(--border)', borderRadius: 8,
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        등록된 서비스가 없습니다.
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        위 입력창에 서비스 이름과 cron 표현식을 입력해 추가하세요.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
  borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)',
  outline: 'none', fontFamily: 'inherit',
};

const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '0 16px', fontSize: 13, fontWeight: 500, borderRadius: 6,
  background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--text)',
  marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--text-faint)',
  padding: '8px 12px', textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: 12, color: 'var(--text)',
};

function miniBtn(variant: 'primary' | 'ghost'): React.CSSProperties {
  if (variant === 'primary') return {
    padding: '4px 10px', fontSize: 11, borderRadius: 4,
    background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
  };
  return {
    padding: '4px 10px', fontSize: 11, borderRadius: 4,
    background: 'transparent', color: 'var(--text-muted)',
    border: '1px solid var(--border)', cursor: 'pointer',
  };
}
