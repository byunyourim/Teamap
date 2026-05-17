import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// n8n Firestore 노드가 ISO 문자열·날짜 문자열을 자동으로 Timestamp로 변환해서 저장하므로
// renderer에서 안전하게 문자열로 되돌린다.
function tsToIso(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'object' && v !== null && 'seconds' in v) {
    const sec = Number((v as { seconds: number }).seconds);
    return new Date(sec * 1000).toISOString();
  }
  return String(v);
}

function tsToDateStr(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const iso = tsToIso(v);
  return iso ? iso.slice(0, 10) : '';
}

function normalizeIncident(raw: Record<string, unknown>): MorningReportIncident {
  const tsArr = Array.isArray(raw.sourceMessageTs)
    ? (raw.sourceMessageTs as unknown[]).map(tsToIso).filter(Boolean)
    : [];
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    severity: (raw.severity as IncidentSeverity) ?? 'P3',
    category: (raw.category as IncidentCategory) ?? '기타',
    rootCauseHypothesis: typeof raw.rootCauseHypothesis === 'string' ? raw.rootCauseHypothesis : '',
    affectedAreas: Array.isArray(raw.affectedAreas) ? (raw.affectedAreas as string[]) : [],
    sourceMessageTs: tsArr,
    recommendedAction: typeof raw.recommendedAction === 'string' ? raw.recommendedAction : '',
  };
}

function normalizeReport(id: string, raw: Record<string, unknown>): MorningBugReport {
  const rawAnalysis = (raw.analysis as Record<string, unknown> | undefined) ?? {};
  const incidents = Array.isArray(rawAnalysis.incidents)
    ? (rawAnalysis.incidents as Record<string, unknown>[]).map(normalizeIncident)
    : [];
  return {
    id,
    reportDate: tsToDateStr(raw.reportDate),
    count: typeof raw.count === 'number' ? raw.count : 0,
    analysis: {
      summary: typeof rawAnalysis.summary === 'string' ? rawAnalysis.summary : '',
      incidents,
      noise: Array.isArray(rawAnalysis.noise) ? (rawAnalysis.noise as string[]) : [],
    },
    rawMessages: (raw.rawMessages as MorningReportRawMessage[]) ?? [],
    createdAt: tsToIso(raw.createdAt),
  };
}

export type IncidentSeverity = 'P1' | 'P2' | 'P3';
export type IncidentCategory =
  | 'frontend' | 'backend' | 'infra' | 'onchain' | 'slack-bot' | '기타';

export interface MorningReportIncident {
  title: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  rootCauseHypothesis: string;
  affectedAreas: string[];
  sourceMessageTs: string[];
  recommendedAction: string;
}

export interface MorningReportAnalysis {
  summary: string;
  incidents: MorningReportIncident[];
  noise: string[];
}

export interface MorningReportRawMessage {
  ts: string;
  user: string;
  text: string;
}

export interface MorningBugReport {
  id: string;
  reportDate: string;        // "YYYY-MM-DD"
  count: number;
  analysis: MorningReportAnalysis;
  rawMessages: MorningReportRawMessage[];
  createdAt: string;         // ISO timestamp
}

export const MORNING_REPORTS_COLLECTION = 'morningBugReports';
export const LAST_SEEN_KEY = 'morning-report:last-seen-createdAt';

export function getLastSeenCreatedAt(): string {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setLastSeenCreatedAt(createdAt: string): void {
  try {
    if (createdAt) localStorage.setItem(LAST_SEEN_KEY, createdAt);
  } catch {
    // ignore
  }
}

/**
 * 신규 리포트 판정.
 * - 최초 구독 시점(isInitial=true): 알림 표시하지 않음
 * - 이미 본 createdAt 이하: 알림 표시하지 않음
 */
export function isNewReport(
  report: MorningBugReport,
  lastSeen: string,
  isInitial: boolean,
): boolean {
  if (isInitial) return false;
  if (!report.createdAt) return false;
  if (!lastSeen) return true;
  return report.createdAt > lastSeen;
}

export function formatNotificationBody(report: MorningBugReport): string {
  const summary = report.analysis?.summary ?? '';
  const head = summary.length > 100 ? summary.slice(0, 100) + '…' : summary;
  const count = report.analysis?.incidents?.length ?? 0;
  return `${head} · 인시던트 ${count}건`;
}

export function formatNotificationTitle(report: MorningBugReport): string {
  return `🐛 아침 버그 리포트 (${report.reportDate})`;
}

/**
 * morningBugReports 컬렉션을 createdAt desc 30건 구독.
 * 최초 스냅샷은 onNewReport 호출하지 않음.
 */
export function subscribeMorningReports(
  onChange: (reports: MorningBugReport[]) => void,
  onNewReport?: (report: MorningBugReport) => void,
): () => void {
  const q = query(
    collection(db, MORNING_REPORTS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(30),
  );

  let isInitial = true;

  return onSnapshot(q, (snap) => {
    const reports: MorningBugReport[] = snap.docs.map((d) =>
      normalizeReport(d.id, d.data() as Record<string, unknown>),
    );
    onChange(reports);

    if (onNewReport) {
      const lastSeen = getLastSeenCreatedAt();
      const added = snap
        .docChanges()
        .filter((c) => c.type === 'added')
        .map((c) => normalizeReport(c.doc.id, c.doc.data() as Record<string, unknown>))
        .filter((r) => isNewReport(r, lastSeen, isInitial));

      for (const r of added) onNewReport(r);
    }

    isInitial = false;
  });
}
