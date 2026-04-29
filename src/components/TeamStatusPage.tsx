import { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchOrgMembers, fetchAllIssues, fetchMemberEvents, getToken, type OrgMember, type GitHubIssue, type RecentEvent } from '../github';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_OPTIONS = [
  { key: 'working', label: '근무중', color: '#4ade80' },
  { key: 'meeting', label: '회의중', color: '#f59e0b' },
  { key: 'outside', label: '외근', color: '#8b5cf6' },
  { key: 'away', label: '자리비움', color: '#64748b' },
  { key: 'off', label: '연차', color: '#ef4444' },
];

interface MemberStatus {
  status: string;
  updatedAt: string;
}

interface CalEvent {
  id: string;
  date: string;
  title: string;
  author: string;
  color: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return `${Math.floor(diff / 86400000)}일 전`;
}

function eventLabel(type: string, action: string) {
  if (type === 'PushEvent') return '커밋';
  if (type === 'IssuesEvent') return action === 'opened' ? '이슈 생성' : action === 'closed' ? '이슈 닫기' : '이슈';
  if (type === 'PullRequestEvent') return action === 'opened' ? 'PR 생성' : 'PR';
  if (type === 'IssueCommentEvent') return '댓글';
  if (type === 'CreateEvent') return '브랜치 생성';
  return type.replace('Event', '');
}

export default function TeamStatusPage({ bell }: { bell?: React.ReactNode }) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [statuses, setStatuses] = useState<Record<string, MemberStatus>>({});
  const [events, setEvents] = useState<Record<string, RecentEvent[]>>({});
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [myLogin, setMyLogin] = useState('');

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const load = async () => {
    setLoading(true);
    try {
      const [m, iss] = await Promise.all([fetchOrgMembers(), fetchAllIssues()]);
      setMembers(m);
      setIssues(iss);

      const { fetchMyLogin } = await import('../github');
      const login = await fetchMyLogin();
      setMyLogin(login);

      const eventsMap: Record<string, RecentEvent[]> = {};
      await Promise.all(
        m.map(async (member) => {
          try {
            eventsMap[member.login] = await fetchMemberEvents(member.login);
          } catch {
            eventsMap[member.login] = [];
          }
        })
      );
      setEvents(eventsMap);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getToken()) load();
  }, []);

  // Firebase statuses
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'member_status'), (snap) => {
      const data: Record<string, MemberStatus> = {};
      snap.docs.forEach((d) => {
        data[d.id] = d.data() as MemberStatus;
      });
      setStatuses(data);
    });
    return unsub;
  }, []);

  // Today's calendar events
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'events'), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as CalEvent))
        .filter((e) => e.date === todayStr);
      setTodayEvents(data);
    });
    return unsub;
  }, [todayStr]);

  const handleStatusChange = async (login: string, status: string) => {
    await setDoc(doc(db, 'member_status', login), {
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  const getOpenIssues = (login: string) =>
    issues.filter((i) => i.assignee === login && i.state === 'open');

  const getTodaySchedule = (name: string) =>
    todayEvents.filter((e) => e.author === name);

  if (loading) {
    return (
      <main className="main-content">
        <div className="main-header">팀원 현황</div>
        <div className="main-body">
          <Loader2 size={20} className="spinner" />
          <span style={{ marginLeft: 8 }}>로딩 중...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="main-header">
        <span>팀원 현황</span>
        <div className="header-actions">
          <button className="header-icon-btn" onClick={load} title="새로고침">
            <RefreshCw size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div className="team-list">
        {members.map((m) => {
          const st = statuses[m.login];
          const statusOpt = STATUS_OPTIONS.find((s) => s.key === st?.status);
          const openIssues = getOpenIssues(m.login);
          const schedule = getTodaySchedule(m.name);
          const memberEvents = events[m.login] ?? [];
          const repoCounts = new Map<string, number>();
          memberEvents.forEach((ev) => repoCounts.set(ev.repo, (repoCounts.get(ev.repo) ?? 0) + 1));
          const topRepos = [...repoCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([repo]) => repo);
          const isMe = m.login === myLogin;

          return (
            <div key={m.login} className="team-card">
              <div className="team-card-top">
                {isMe ? (
                  <select
                    className="team-status-select"
                    value={st?.status ?? 'working'}
                    onChange={(e) => handleStatusChange(m.login, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="team-status-badge" style={{ background: statusOpt?.color ?? '#4ade80' }}>
                    {statusOpt?.label ?? '근무중'}
                  </span>
                )}
                <div className="team-card-info">
                  <div className="team-card-name">
                    {m.name}
                    <span className="team-card-login">@{m.login}</span>
                  </div>
                  {schedule.length > 0 && (
                    <span className="team-schedule-tag">
                      {schedule.map((s) => s.title).join(', ')}
                    </span>
                  )}
                </div>
                <div className="team-card-issues-count">
                  <span className="team-issues-num">{openIssues.length}</span>
                  <span className="team-issues-label">진행중</span>
                </div>
              </div>

              {openIssues.length > 0 && (
                <div className="team-card-issues">
                  {openIssues.slice(0, 3).map((iss) => (
                    <div key={iss.id} className="team-issue-row">
                      <span className="team-issue-dot" />
                      <span className="team-issue-title">{iss.title}</span>
                      <span className="team-issue-repo">{iss.repo}</span>
                    </div>
                  ))}
                  {openIssues.length > 3 && (
                    <span className="team-issue-more">+{openIssues.length - 3}개 더</span>
                  )}
                </div>
              )}

              {topRepos.length > 0 && (
                <div className="team-card-repos">
                  {topRepos.map((repo) => (
                    <span key={repo} className="team-repo-tag">{repo}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
