import { useMemo, useState } from 'react';
import { Plus, X, RotateCcw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import {
  getDeployments, upsertDeployment, newDeploymentId,
  getAssignedServices, getUsername, getIncidents,
  type Deployment, type DeploymentStatus,
} from '../store';

const ENVS: Deployment['environment'][] = ['dev', 'stage', 'prod'];
const STATUSES: { value: DeploymentStatus; label: string }[] = [
  { value: 'pending',     label: '대기' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'success',     label: '성공' },
  { value: 'failed',      label: '실패' },
  { value: 'rolled_back', label: '롤백' },
];

export default function DeploymentsPage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const [deployments, setDeployments] = useState<Deployment[]>(getDeployments());
  const [showNew, setShowNew] = useState(false);
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  const refresh = () => setDeployments(getDeployments());

  const services = useMemo(() => [...new Set([
    ...getAssignedServices(),
    ...deployments.map((d) => d.service),
  ])], [deployments]);

  const filtered = deployments.filter((d) => {
    if (envFilter !== 'all' && d.environment !== envFilter) return false;
    if (serviceFilter !== 'all' && d.service !== serviceFilter) return false;
    return true;
  });

  const create = (d: Omit<Deployment, 'id' | 'startedAt' | 'deployer'>) => {
    upsertDeployment({
      ...d,
      id: newDeploymentId(),
      startedAt: Date.now(),
      deployer: getUsername() || 'unknown',
    });
    refresh();
    setShowNew(false);
  };

  const updateStatus = (d: Deployment, status: DeploymentStatus) => {
    upsertDeployment({
      ...d,
      status,
      finishedAt: ['success', 'failed', 'rolled_back'].includes(status) ? Date.now() : d.finishedAt,
    });
    refresh();
  };

  const rollback = (d: Deployment) => {
    if (!window.confirm(`'${d.service}' 배포를 롤백 처리할까요?`)) return;
    updateStatus(d, 'rolled_back');
  };

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}배포 트래킹</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="header-icon-btn" onClick={() => setShowNew(true)} title="새 배포 기록">
            <Plus size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div className="tasks-toolbar">
        <div className="tasks-toolbar-right" style={{ display: 'flex', gap: 8 }}>
          <select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)} className="tasks-repo-select">
            <option value="all">전체 환경</option>
            {ENVS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="tasks-repo-select">
            <option value="all">전체 서비스</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: 'var(--bg-sidebar)', border: '1px dashed var(--border)', borderRadius: 8,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              기록된 배포가 없습니다.
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              우측 상단 + 버튼으로 배포를 기록하세요. (CI/CD 웹훅 자동 연동은 향후 작업)
            </p>
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>시각</th>
                <th style={thStyle}>서비스</th>
                <th style={thStyle}>환경</th>
                <th style={thStyle}>버전</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>소요</th>
                <th style={thStyle}>배포자</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <DeployRow key={d.id} d={d} onStatus={(s) => updateStatus(d, s)} onRollback={() => rollback(d)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewDeploymentDialog onCreate={create} onCancel={() => setShowNew(false)} />}
    </main>
  );
}

function DeployRow({
  d, onStatus, onRollback,
}: {
  d: Deployment;
  onStatus: (s: DeploymentStatus) => void;
  onRollback: () => void;
}) {
  // 배포 후 1시간 내 인시던트 매칭
  const relatedIncidents = getIncidents().filter((inc) =>
    inc.createdAt >= d.startedAt
    && inc.createdAt < d.startedAt + 60 * 60 * 1000
  );

  const duration = d.finishedAt ? d.finishedAt - d.startedAt : null;

  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
        {new Date(d.startedAt).toLocaleString('ko-KR', { hour12: false, year: '2-digit' })}
      </td>
      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{d.service}</td>
      <td style={tdStyle}>
        <EnvBadge env={d.environment} />
      </td>
      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
        {d.version}
        {d.prNumber && <span style={{ color: 'var(--text-faint)' }}> · #{d.prNumber}</span>}
      </td>
      <td style={tdStyle}>
        <StatusBadge status={d.status} />
        {relatedIncidents.length > 0 && (
          <span title={`이 배포 후 1시간 내 인시던트 ${relatedIncidents.length}건`} style={{
            marginLeft: 6, fontSize: 10, fontWeight: 600,
            padding: '1px 5px', borderRadius: 3,
            background: 'rgba(239,68,68,0.12)', color: 'var(--danger)',
          }}>
            ⚠ {relatedIncidents.length}
          </span>
        )}
      </td>
      <td style={{ ...tdStyle, fontSize: 12 }}>
        {duration ? formatDuration(duration) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
      </td>
      <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-muted)' }}>{d.deployer}</td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {d.status === 'pending' && (
            <SmallBtn onClick={() => onStatus('in_progress')} variant="primary">시작</SmallBtn>
          )}
          {d.status === 'in_progress' && (
            <>
              <SmallBtn onClick={() => onStatus('success')} variant="success">완료</SmallBtn>
              <SmallBtn onClick={() => onStatus('failed')} variant="danger">실패</SmallBtn>
            </>
          )}
          {d.status === 'success' && (
            <SmallBtn onClick={onRollback} variant="ghost"><RotateCcw size={11} /> 롤백</SmallBtn>
          )}
        </div>
      </td>
    </tr>
  );
}

function NewDeploymentDialog({ onCreate, onCancel }: {
  onCreate: (d: Omit<Deployment, 'id' | 'startedAt' | 'deployer'>) => void;
  onCancel: () => void;
}) {
  const services = getAssignedServices();
  const [service, setService] = useState(services[0] ?? '');
  const [version, setVersion] = useState('');
  const [environment, setEnvironment] = useState<Deployment['environment']>('prod');
  const [status, setStatus] = useState<DeploymentStatus>('in_progress');
  const [prNumber, setPrNumber] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 22, width: 520, maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>새 배포 기록</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Field label="서비스">
            {services.length > 0 ? (
              <select value={service} onChange={(e) => setService(e.target.value)} style={inputStyle}>
                {services.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input value={service} onChange={(e) => setService(e.target.value)}
                placeholder="서비스 이름" style={inputStyle} />
            )}
          </Field>
          <Field label="환경">
            <select value={environment} onChange={(e) => setEnvironment(e.target.value as Deployment['environment'])} style={inputStyle}>
              {ENVS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </Field>
          <Field label="버전 / 커밋 SHA">
            <input value={version} onChange={(e) => setVersion(e.target.value)}
              placeholder="v1.2.3 또는 abc1234" style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </Field>
          <Field label="PR 번호 (선택)">
            <input value={prNumber} onChange={(e) => setPrNumber(e.target.value)}
              placeholder="123" style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </Field>
          <Field label="상태">
            <select value={status} onChange={(e) => setStatus(e.target.value as DeploymentStatus)} style={inputStyle}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="메모 (선택)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="비고" style={inputStyle} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{
            padding: '8px 14px', fontSize: 12, borderRadius: 6,
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border-strong)', cursor: 'pointer',
          }}>
            취소
          </button>
          <button
            onClick={() => service.trim() && version.trim() && onCreate({
              service: service.trim(),
              version: version.trim(),
              environment,
              status,
              prNumber: prNumber ? Number(prNumber) : undefined,
              notes: notes.trim() || undefined,
            })}
            disabled={!service.trim() || !version.trim()}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6,
              background: 'var(--accent)', color: '#fff', border: 'none',
              cursor: service.trim() && version.trim() ? 'pointer' : 'not-allowed',
              opacity: service.trim() && version.trim() ? 1 : 0.5,
            }}
          >
            기록
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const cfg = {
    pending:     { icon: <Clock size={11} />, label: '대기',     color: 'var(--text-muted)' },
    in_progress: { icon: <Loader2 size={11} className="spinner" />, label: '진행 중', color: 'var(--accent)' },
    success:     { icon: <CheckCircle2 size={11} />, label: '성공',  color: 'var(--success)' },
    failed:      { icon: <XCircle size={11} />, label: '실패',   color: 'var(--danger)' },
    rolled_back: { icon: <RotateCcw size={11} />, label: '롤백',   color: 'var(--warning)' },
  }[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 3,
      background: 'var(--bg-card)',
      color: cfg.color,
      border: `1px solid ${cfg.color}40`,
    }}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function EnvBadge({ env }: { env: Deployment['environment'] }) {
  const cfg = {
    dev:   { bg: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', border: 'rgba(100,116,139,0.3)' },
    stage: { bg: 'rgba(245,158,11,0.15)',  color: 'var(--warning)',   border: 'rgba(245,158,11,0.3)' },
    prod:  { bg: 'rgba(239,68,68,0.15)',   color: 'var(--danger)',    border: 'rgba(239,68,68,0.3)' },
  }[env];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      textTransform: 'uppercase',
    }}>
      {env}
    </span>
  );
}

function SmallBtn({ onClick, variant, children }: {
  onClick: () => void;
  variant: 'primary' | 'success' | 'danger' | 'ghost';
  children: React.ReactNode;
}) {
  const palette = {
    primary: { bg: 'rgba(59,130,246,0.12)', color: 'var(--accent)',     border: 'rgba(59,130,246,0.25)' },
    success: { bg: 'rgba(52,211,153,0.12)', color: 'var(--success)',    border: 'rgba(52,211,153,0.25)' },
    danger:  { bg: 'rgba(239,68,68,0.10)',  color: 'var(--danger)',     border: 'rgba(239,68,68,0.25)' },
    ghost:   { bg: 'transparent', color: 'var(--text-muted)', border: 'var(--border)' },
  }[variant];
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '3px 9px', fontSize: 10, fontWeight: 500, borderRadius: 4,
      background: palette.bg, color: palette.color,
      border: `1px solid ${palette.border}`,
      cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--text-faint)',
  padding: '10px 12px', textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: 'var(--text)',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 12,
  border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
