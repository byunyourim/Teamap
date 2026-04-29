import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, AlertTriangle, CircleDot, CheckCircle2, GitPullRequest, GitMerge, FolderGit2, ClipboardList, Send, Check, User } from 'lucide-react';
import { fetchAllIssues, fetchAllPRs, fetchOrgMembers, fetchMyLogin, fetchUserNames, getToken, type GitHubIssue, type PullRequest, type OrgMember } from '../github';
import { createStaleIssueNotifications } from '../notifications';
import { cn } from '@/lib/utils';
import MultiSelect from './MultiSelect';

function getWeekRange(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function formatWeek(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

interface MemberStats {
  login: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  prsCreated: number;
  prsMerged: number;
  prsReviewed: number;
}

function DiffBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <Minus size={10} style={{ color: '#64748b' }} />;
  if (diff > 0) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#34d399' }}>
      <TrendingUp size={10} /> +{diff}
    </span>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#f87171' }}>
      <TrendingDown size={10} /> {diff}
    </span>
  );
}

export default function WeeklyReportPage({ bell }: { bell?: React.ReactNode }) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [repoFilter, setRepoFilter] = useState<string[]>([]);
  const [myLogin, setMyLogin] = useState('');
  const [staleSent, setStaleSent] = useState(false);
  const [staleSending, setStaleSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [iss, pr, mem, login] = await Promise.all([fetchAllIssues(), fetchAllPRs(), fetchOrgMembers(), fetchMyLogin()]);
      setMyLogin(login);
      setIssues(iss);
      setPrs(pr);
      setMembers(mem);
      const logins = [...new Set([
        ...iss.flatMap((i) => [i.author, i.assignee].filter(Boolean) as string[]),
        ...pr.map((p) => p.author),
      ])];
      const names = await fetchUserNames(logins);
      setNameMap(new Map(names));
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getToken()) load();
    else setLoading(false);
  }, []);

  const { start, end } = getWeekRange(weekOffset);
  const prevWeek = getWeekRange(weekOffset - 1);

  const inRange = (iso: string, s: Date, e: Date) => {
    const d = new Date(iso);
    return d >= s && d <= e;
  };

  const getName = (login: string) => (nameMap.get(login) ?? login).split('/')[0];
  const repos = [...new Set([...issues.map((i) => i.repo), ...prs.map((p) => p.repo)])].sort();

  const repoIssues = repoFilter.length === 0 ? issues : issues.filter((i) => repoFilter.includes(i.repo));
  const repoPRs = repoFilter.length === 0 ? prs : prs.filter((p) => repoFilter.includes(p.repo));

  // This week
  const weekIssuesCreated = repoIssues.filter((i) => inRange(i.createdAt, start, end));
  const weekIssuesClosed = repoIssues.filter((i) => i.state === 'closed' && inRange(i.createdAt, start, end));
  const weekPRsCreated = repoPRs.filter((p) => inRange(p.createdAt, start, end));
  const weekPRsMerged = repoPRs.filter((p) => p.merged && inRange(p.updatedAt, start, end));

  // Previous week
  const prevIssuesCreated = repoIssues.filter((i) => inRange(i.createdAt, prevWeek.start, prevWeek.end)).length;
  const prevIssuesClosed = repoIssues.filter((i) => i.state === 'closed' && inRange(i.createdAt, prevWeek.start, prevWeek.end)).length;
  const prevPRsCreated = repoPRs.filter((p) => inRange(p.createdAt, prevWeek.start, prevWeek.end)).length;
  const prevPRsMerged = repoPRs.filter((p) => p.merged && inRange(p.updatedAt, prevWeek.start, prevWeek.end)).length;

  // Stale issues (open > 14 days)
  const staleIssues = repoIssues
    .filter((i) => i.state === 'open' && daysSince(i.createdAt) >= 14)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const memberStats: MemberStats[] = members.map((m) => ({
    login: m.login,
    name: m.name,
    issuesCreated: weekIssuesCreated.filter((i) => i.author === m.login).length,
    issuesClosed: weekIssuesClosed.filter((i) => i.assignee === m.login || i.author === m.login).length,
    prsCreated: weekPRsCreated.filter((p) => p.author === m.login).length,
    prsMerged: weekPRsMerged.filter((p) => p.author === m.login).length,
    prsReviewed: weekPRsCreated.filter((p) => p.reviewers.includes(m.login)).length,
  })).filter((s) => s.issuesCreated + s.issuesClosed + s.prsCreated + s.prsMerged + s.prsReviewed > 0)
    .sort((a, b) => (b.prsCreated + b.issuesCreated + b.prsMerged) - (a.prsCreated + a.issuesCreated + a.prsMerged));

  const topRepos = (() => {
    const counts = new Map<string, number>();
    weekIssuesCreated.forEach((i) => counts.set(i.repo, (counts.get(i.repo) ?? 0) + 1));
    weekPRsCreated.forEach((p) => counts.set(p.repo, (counts.get(p.repo) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  // My activity
  const myIssuesCreated = weekIssuesCreated.filter((i) => i.author === myLogin);
  const myIssuesClosed = weekIssuesClosed.filter((i) => i.assignee === myLogin || i.author === myLogin);
  const myPRsCreated = weekPRsCreated.filter((p) => p.author === myLogin);
  const myPRsMerged = weekPRsMerged.filter((p) => p.author === myLogin);
  const myPRsReviewed = weekPRsCreated.filter((p) => p.reviewers.includes(myLogin));
  const myTotal = myIssuesCreated.length + myIssuesClosed.length + myPRsCreated.length + myPRsMerged.length + myPRsReviewed.length;

  const sendStaleNotifications = async () => {
    if (staleSending || staleSent || staleIssues.length === 0) return;
    setStaleSending(true);
    try {
      const targets = staleIssues
        .filter((iss) => iss.assignee || iss.author)
        .map((iss) => ({
          to: iss.assignee ?? iss.author,
          from: myLogin,
          issueTitle: iss.title,
          repo: iss.repo,
          issueNumber: iss.id,
          days: daysSince(iss.createdAt),
        }));
      await createStaleIssueNotifications(targets);
      setStaleSent(true);
      setTimeout(() => setStaleSent(false), 3000);
    } catch {
      //
    } finally {
      setStaleSending(false);
    }
  };

  if (loading) {
    return (
      <main className="main-content">
        <div className="main-header"><span>주간 리포트</span>{bell}</div>
        <div className="main-body"><Loader2 size={20} className="spinner" /></div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="main-header">
        <span>주간 리포트</span>
        <div className="header-actions">
          <button className="header-icon-btn" onClick={load} title="새로고침">
            <RefreshCw size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Week nav */}
        <div className="flex items-center gap-3">
          <button className="header-icon-btn" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="text-[14px] font-semibold text-slate-300">
            {formatWeek(start)} ~ {formatWeek(end)}
            {weekOffset === 0 && <span className="text-[11px] text-slate-500 ml-2">이번주</span>}
          </span>
          <button className="header-icon-btn" onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))} disabled={weekOffset >= 0}>
            <ChevronRight size={16} />
          </button>
          <MultiSelect
            options={repos}
            selected={repoFilter}
            onChange={setRepoFilter}
            placeholder="전체 레포"
          />
        </div>

        {/* Summary with diff */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { n: weekIssuesCreated.length, prev: prevIssuesCreated, l: '이슈 생성', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: '#60a5fa', Icon: CircleDot },
            { n: weekIssuesClosed.length, prev: prevIssuesClosed, l: '이슈 완료', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: '#34d399', Icon: CheckCircle2 },
            { n: weekPRsCreated.length, prev: prevPRsCreated, l: 'PR 생성', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: '#a78bfa', Icon: GitPullRequest },
            { n: weekPRsMerged.length, prev: prevPRsMerged, l: 'PR Merged', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: '#fbbf24', Icon: GitMerge },
          ].map((s) => (
            <div key={s.l} style={{ background: '#1a2236', borderRadius: 10, borderLeft: `3px solid ${s.border}`, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <s.Icon size={16} style={{ color: s.color }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', lineHeight: 1, margin: 0 }}>{s.n}</p>
                    <DiffBadge current={s.n} previous={s.prev} />
                  </div>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 500 }}>{s.l}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── My Activity ── */}
        {myLogin && (
          <div style={{ background: '#1a2236', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', background: '#1e2840' }}>
              <User size={14} style={{ color: '#60a5fa', marginRight: 8 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>나의 활동</span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{getName(myLogin)}</span>
            </div>
            {myTotal === 0 ? (
              <div style={{ padding: '20px' }}>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>{'\uD83C\uDF3F'} 이번주는 기록된 활동이 없어요</p>
              </div>
            ) : (
              <div style={{ padding: '16px 20px' }}>
                <p style={{ fontSize: 13, color: '#cbd5e1', margin: 0 }}>
                  {(() => {
                    const parts: string[] = [];
                    if (myIssuesCreated.length > 0 || myIssuesClosed.length > 0) {
                      const issParts: string[] = [];
                      if (myIssuesCreated.length > 0) issParts.push(`${myIssuesCreated.length}건 생성`);
                      if (myIssuesClosed.length > 0) issParts.push(`${myIssuesClosed.length}건 완료`);
                      parts.push(`이슈 ${issParts.join(', ')}`);
                    }
                    if (myPRsCreated.length > 0) {
                      const prText = myPRsMerged.length > 0
                        ? `PR ${myPRsCreated.length}건 생성 (${myPRsMerged.length}건 머지)`
                        : `PR ${myPRsCreated.length}건 생성`;
                      parts.push(prText);
                    }
                    if (myPRsReviewed.length > 0) parts.push(`리뷰 ${myPRsReviewed.length}건`);
                    return parts.join(' / ');
                  })()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Member activity - disabled for now
        <div className="bg-[#1a2236] rounded-lg overflow-hidden">
          <div className="flex items-center px-5 py-3 bg-[#1e2840]">
            <span className="text-[13px] font-semibold text-slate-300">팀원별 활동</span>
          </div>
          <div>
            <div className="flex items-center px-5 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-[#232f45]">
              <span className="w-[120px]">팀원</span>
              <span className="w-[80px] text-center">이슈 생성</span>
              <span className="w-[80px] text-center">이슈 완료</span>
              <span className="w-[80px] text-center">PR 생성</span>
              <span className="w-[80px] text-center">PR Merged</span>
              <span className="w-[80px] text-center">리뷰</span>
            </div>
            {memberStats.length === 0 ? (
              <p className="text-[13px] text-slate-600 px-5 py-6">이번주 활동이 없습니다.</p>
            ) : (
              memberStats.map((s) => (
                <div key={s.login} className="flex items-center px-5 py-2.5 border-b border-[#232f45] last:border-0 hover:bg-[#1e2840] transition-colors">
                  <span className="w-[120px] text-[13px] text-slate-300">{s.name}</span>
                  <span className="w-[80px] text-center text-[13px] text-blue-400">{s.issuesCreated || '-'}</span>
                  <span className="w-[80px] text-center text-[13px] text-emerald-400">{s.issuesClosed || '-'}</span>
                  <span className="w-[80px] text-center text-[13px] text-violet-400">{s.prsCreated || '-'}</span>
                  <span className="w-[80px] text-center text-[13px] text-amber-400">{s.prsMerged || '-'}</span>
                  <span className="w-[80px] text-center text-[13px] text-slate-400">{s.prsReviewed || '-'}</span>
                </div>
              ))
            )}
          </div>
        </div>
        */}

        {/* Active repos */}
        <div className="bg-[#1a2236] rounded-lg overflow-hidden">
          <div className="flex items-center px-5 py-3 bg-[#1e2840]">
            <FolderGit2 size={14} style={{ color: '#60a5fa', marginRight: 8 }} />
            <span className="text-[13px] font-semibold text-slate-300">레포</span>
          </div>
          <div className="px-5 py-3">
            {topRepos.length === 0 ? (
              <p className="text-[13px] text-slate-500">{'\uD83C\uDF3F'} 이번주는 조용했어요</p>
            ) : (
              <div className="flex flex-col gap-2">
                {topRepos.map(([repo, count]) => (
                  <div key={repo} className="flex items-center gap-3">
                    <span className="text-[13px] text-slate-300 w-[200px]">{repo}</span>
                    <div className="flex-1 h-[6px] bg-[#232f45] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400/60 rounded-full"
                        style={{ width: `${Math.min((count / (topRepos[0]?.[1] ?? 1)) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 w-[30px] text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Merged PRs this week */}
        <div className="bg-[#1a2236] rounded-lg overflow-hidden">
          <div className="flex items-center px-5 py-3 bg-[#1e2840]">
            <GitMerge size={14} style={{ color: '#a78bfa', marginRight: 8 }} />
            <span className="text-[13px] font-semibold text-slate-300">이번주 머지된 PR</span>
            <span className="text-[11px] text-slate-500 ml-2">{weekPRsMerged.length}건</span>
          </div>
          <div style={{ padding: '8px 16px' }}>
            {weekPRsMerged.length === 0 ? (
              <p className="text-[13px] text-slate-500" style={{ padding: '16px 0' }}>{'\u2615'} 머지된 PR이 없어요</p>
            ) : (
              weekPRsMerged.slice(0, 10).map((pr) => (
                <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: '1px solid #232f45' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pr.title}>{pr.title}</span>
                  <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{getName(pr.author)}</span>
                  <span style={{ fontSize: 11, color: '#475569', flexShrink: 0 }}>{pr.repo}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent issues */}
        <div className="bg-[#1a2236] rounded-lg overflow-hidden">
          <div className="flex items-center px-5 py-3 bg-[#1e2840]">
            <ClipboardList size={14} style={{ color: '#34d399', marginRight: 8 }} />
            <span className="text-[13px] font-semibold text-slate-300">이번주 생성된 이슈</span>
            <span className="text-[11px] text-slate-500 ml-2">{weekIssuesCreated.length}건</span>
          </div>
          <div className="px-4 py-2">
            {weekIssuesCreated.slice(0, 10).map((iss) => (
              <div key={iss.id} className="flex items-center gap-2 py-2 px-1 border-b border-[#232f45] last:border-0">
                <span className={cn('h-[5px] w-[5px] rounded-full shrink-0', iss.state === 'open' ? 'bg-blue-400/80' : 'bg-emerald-400/80')} />
                <span className="flex-1 text-[13px] text-slate-300 truncate" title={iss.title}>{iss.title}</span>
                <span className="text-[11px] text-slate-500 shrink-0">{getName(iss.author)}</span>
                <span className="text-[11px] text-slate-600 shrink-0">{iss.repo}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stale issues */}
        <div style={{ background: '#1a2236', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', background: '#1e2840' }}>
            <AlertTriangle size={13} style={{ color: '#fbbf24', marginRight: 8 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>장기 미처리 이슈</span>
            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{staleIssues.length}건 (14일+)</span>
            {staleIssues.length > 0 && (
              <button
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', fontSize: 11, fontWeight: 500, borderRadius: 6,
                  background: staleSent ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.1)',
                  color: staleSent ? '#34d399' : '#fbbf24',
                  border: 'none', cursor: staleSending ? 'wait' : 'pointer',
                }}
                onClick={sendStaleNotifications}
                disabled={staleSending || staleSent}
              >
                {staleSent ? <><Check size={12} /> 전송 완료</> : <><Send size={12} /> 담당자 알림</>}
              </button>
            )}
          </div>
          <div style={{ padding: '8px 16px' }}>
            {staleIssues.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94a3b8', padding: '16px 0' }}>{'\u2728'} 장기 미처리 이슈가 없어요!</p>
            ) : (
              staleIssues.slice(0, 10).map((iss) => {
                const days = daysSince(iss.createdAt);
                return (
                  <div key={iss.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: '1px solid #232f45' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, flexShrink: 0, width: 40, textAlign: 'center',
                      color: days >= 30 ? '#f87171' : '#fbbf24',
                    }}>
                      {days}일
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={iss.title}>{iss.title}</span>
                    <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{iss.assignee ? getName(iss.assignee) : getName(iss.author)}</span>
                    <span style={{ fontSize: 11, color: '#475569', flexShrink: 0 }}>{iss.repo}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        </div>
      </div>
    </main>
  );
}
