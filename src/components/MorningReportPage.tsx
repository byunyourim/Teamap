import { useEffect, useState } from 'react';
import { Loader2, Bug, AlertCircle } from 'lucide-react';
import {
  subscribeMorningReports,
  setLastSeenCreatedAt,
  type MorningBugReport,
  type IncidentSeverity,
} from '../morningReports';

export default function MorningReportPage({
  bell,
  back,
}: {
  bell?: React.ReactNode;
  back?: React.ReactNode;
}) {
  const [reports, setReports] = useState<MorningBugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeMorningReports((data) => {
        setReports(data);
        setLoading(false);
        // 페이지 방문 시 최신 createdAt을 본 것으로 마킹 → 중복 알림 방지
        if (data.length > 0) setLastSeenCreatedAt(data[0].createdAt);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '구독 실패');
      setLoading(false);
    }
    return () => { if (unsub) unsub(); };
  }, []);

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {back}아침 버그 리포트
        </span>
        {bell}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>
              <Loader2 size={20} className="spinner" />
            </div>
          )}

          {error && !loading && (
            <div style={{
              padding: 16, fontSize: 13, color: 'var(--danger)',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {!loading && !error && reports.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Bug size={32} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: 'var(--text)' }}>
                아직 수집된 아침 버그 리포트가 없습니다.
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                매일 아침 8시(KST) n8n 워크플로우가 새 리포트를 생성합니다.
              </p>
            </div>
          )}

          {!loading && !error && reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      </div>
    </main>
  );
}

function ReportCard({ report }: { report: MorningBugReport }) {
  const incidents = report.analysis?.incidents ?? [];
  const summary = report.analysis?.summary ?? '';

  return (
    <article style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <header style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Bug size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {report.reportDate}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
          원본 {report.count}건 · 인시던트 {incidents.length}건
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
          {formatCreatedAt(report.createdAt)}
        </span>
      </header>

      {/* 요약 */}
      {summary && (
        <div style={{
          padding: '12px 16px', borderBottom: incidents.length > 0 ? '1px solid var(--border)' : 'none',
          fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {summary}
        </div>
      )}

      {/* 인시던트 목록 */}
      {incidents.length === 0 ? (
        <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>
          분류된 인시던트가 없습니다.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {incidents.map((inc, i) => (
            <li key={i} style={{
              padding: '12px 16px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <SeverityBadge severity={inc.severity} />
                <span style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 4,
                  background: 'var(--bg-app)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}>
                  {inc.category}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {inc.title}
                </span>
              </div>

              {inc.recommendedAction && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--text-faint)' }}>권고: </span>
                  {inc.recommendedAction}
                </div>
              )}

              {inc.sourceMessageTs?.length > 0 && (
                <div style={{
                  fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace',
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                }}>
                  <span style={{ color: 'var(--text-faint)' }}>출처:</span>
                  {inc.sourceMessageTs.map((ts) => (
                    <span key={ts}>{ts}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const cfg = SEV_CONFIG[severity] ?? SEV_CONFIG.P3;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {severity}
    </span>
  );
}

const SEV_CONFIG: Record<IncidentSeverity, { bg: string; color: string; border: string }> = {
  P1: { bg: 'rgba(239,68,68,0.15)', color: 'var(--danger)',  border: 'rgba(239,68,68,0.4)'  },
  P2: { bg: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: 'rgba(245,158,11,0.4)' },
  P3: { bg: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', border: 'rgba(100,116,139,0.4)' },
};

function formatCreatedAt(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR', { hour12: false });
  } catch {
    return iso;
  }
}
