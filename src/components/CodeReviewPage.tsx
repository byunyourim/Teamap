import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, GitPullRequest, CheckCircle2, XCircle, Clock, FileEdit, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAllPRs, fetchPRReviews, fetchMyLogin, fetchUserNames, getToken, type PullRequest } from '../github';
import { cn } from '@/lib/utils';
import MultiSelect from './MultiSelect';
import PRDetailPage from './PRDetailPage';

type ViewTab = 'my-pr' | 'my-review';
type StateFilter = 'all' | 'open' | 'merged' | 'closed';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export default function CodeReviewPage({ bell }: { bell?: React.ReactNode }) {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [ghLogin, setGhLogin] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>('my-pr');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [repoFilter, setRepoFilter] = useState<string[]>([]);
  const [period, setPeriod] = useState('14');
  const [page, setPage] = useState(0);
  const [selectedPR, setSelectedPR] = useState<{ repo: string; number: number } | null>(null);
  const PAGE_SIZE = 10;

  const load = async () => {
    setLoading(true);
    try {
      const login = await fetchMyLogin();
      setGhLogin(login);
      const data = await fetchAllPRs();

      const openPRs = data.filter((pr) => pr.state === 'open');
      const reviewResults = await Promise.all(
        openPRs.slice(0, 30).map(async (pr) => {
          try {
            const reviews = await fetchPRReviews(pr.repo, pr.number);
            const latest = new Map<string, string>();
            reviews.forEach((r) => latest.set(r.user, r.state));
            const states = [...latest.values()];
            let status: PullRequest['reviewStatus'] = 'pending';
            if (states.includes('CHANGES_REQUESTED')) status = 'changes_requested';
            else if (states.includes('APPROVED')) status = 'approved';
            return { id: pr.id, status, reviewers: [...latest.keys()] };
          } catch {
            return { id: pr.id, status: 'pending' as const, reviewers: [] };
          }
        })
      );

      const reviewMap = new Map(reviewResults.map((r) => [r.id, r]));
      const enriched = data.map((pr) => {
        const review = reviewMap.get(pr.id);
        if (review) return { ...pr, reviewStatus: review.status, reviewers: review.reviewers };
        return pr;
      });

      setPrs(enriched);

      const logins = [...new Set(data.flatMap((pr) => [pr.author, ...pr.reviewers]))];
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

  const getName = (login: string) => (nameMap.get(login) ?? login).split('/')[0];

  const periodMs = Number(period) * 86400000;
  const cutoff = new Date(Date.now() - periodMs);
  const periodPRs = prs.filter((pr) => new Date(pr.updatedAt) >= cutoff);

  const myPRs = periodPRs.filter((pr) => pr.author === ghLogin);
  const myReviewPRs = periodPRs.filter((pr) => pr.reviewers.includes(ghLogin));

  const baseList = viewTab === 'my-pr' ? myPRs : myReviewPRs;

  const filtered = baseList.filter((pr) => {
    if (stateFilter === 'open' && pr.state !== 'open') return false;
    if (stateFilter === 'merged' && !pr.merged) return false;
    if (stateFilter === 'closed' && (pr.state !== 'closed' || pr.merged)) return false;
    if (repoFilter.length > 0 && !repoFilter.includes(pr.repo)) return false;
    return true;
  });

  const repos = [...new Set(prs.map((pr) => pr.repo))].sort();
  const openCount = baseList.filter((p) => p.state === 'open').length;
  const mergedCount = baseList.filter((p) => p.merged).length;
  const closedCount = baseList.filter((p) => p.state === 'closed' && !p.merged).length;

  const getStatusIcon = (pr: PullRequest) => {
    if (pr.draft) return <FileEdit size={14} className="text-slate-500" />;
    if (pr.merged) return <GitPullRequest size={14} className="text-violet-400" />;
    if (pr.state === 'closed') return <XCircle size={14} className="text-red-400" />;
    if (pr.reviewStatus === 'approved') return <CheckCircle2 size={14} className="text-emerald-400" />;
    if (pr.reviewStatus === 'changes_requested') return <XCircle size={14} className="text-amber-400" />;
    return <Clock size={14} className="text-blue-400" />;
  };

  const getStatusLabel = (pr: PullRequest) => {
    if (pr.draft) return 'Draft';
    if (pr.merged) return 'Merged';
    if (pr.state === 'closed') return 'Closed';
    if (pr.reviewStatus === 'approved') return 'Approved';
    if (pr.reviewStatus === 'changes_requested') return 'Changes';
    return 'Pending';
  };

  if (selectedPR) {
    return (
      <PRDetailPage
        repo={selectedPR.repo}
        prNumber={selectedPR.number}
        onBack={() => setSelectedPR(null)}
        bell={bell}
      />
    );
  }

  if (loading) {
    return (
      <main className="main-content">
        <div className="main-header"><span>PR</span>{bell}</div>
        <div className="main-body"><Loader2 size={20} className="spinner" /></div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="main-header">
        <span>PR</span>
        <div className="header-actions">
          <button className="header-icon-btn" onClick={load} title="새로고침">
            <RefreshCw size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5 flex flex-col gap-4 max-w-[1200px]">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <select
            className="tasks-repo-select"
            value={viewTab}
            onChange={(e) => { setViewTab(e.target.value as ViewTab); setPage(0); }}
          >
            <option value="my-pr">내 PR ({myPRs.length})</option>
            <option value="my-review">내 리뷰 ({myReviewPRs.length})</option>
          </select>
          <select
            className="tasks-repo-select"
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value as StateFilter); setPage(0); }}
          >
            <option value="all">전체 ({baseList.length})</option>
            <option value="open">Pending ({openCount})</option>
            <option value="merged">Merged ({mergedCount})</option>
            <option value="closed">Closed ({closedCount})</option>
          </select>
          <MultiSelect
            options={repos}
            selected={repoFilter}
            onChange={(v) => { setRepoFilter(v); setPage(0); }}
            placeholder="전체 레포"
          />
          <select
            className="tasks-repo-select"
            value={period}
            onChange={(e) => { setPeriod(e.target.value); setPage(0); }}
          >
            <option value="7">1주</option>
            <option value="14">2주</option>
            <option value="30">1개월</option>
            <option value="90">3개월</option>
          </select>
        </div>

        {/* PR List */}
        <div className="bg-[#1a2236] rounded-lg overflow-hidden">
          <div className="flex items-center px-5 py-2.5 bg-[#1e2840] text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            <span className="w-[28px]" />
            <span className="flex-1">제목</span>
            <span className="w-[80px] text-center">상태</span>
            <span className="w-[80px]">작성자</span>
            <span className="w-[100px]">리뷰어</span>
            <span className="w-[100px]">레포</span>
            <span className="w-[70px] text-right">업데이트</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-[13px] text-slate-600 px-5 py-6">PR이 없습니다.</p>
          ) : (
            filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((pr) => (
              <div
                key={pr.id}
                className="flex items-center px-5 py-2.5 border-b border-[#232f45] last:border-0 hover:bg-[#1e2840] transition-colors cursor-pointer"
                onClick={() => setSelectedPR({ repo: pr.repo, number: pr.number })}
              >
                <span className="w-[28px] shrink-0">{getStatusIcon(pr)}</span>
                <span className="flex-1 text-[13px] text-slate-300 truncate pr-3" title={pr.title}>{pr.title}</span>
                <span className={cn(
                  'w-[80px] text-center text-[11px] font-medium',
                  pr.merged ? 'text-violet-400' :
                  pr.reviewStatus === 'approved' ? 'text-emerald-400' :
                  pr.reviewStatus === 'changes_requested' ? 'text-amber-400' :
                  'text-slate-500'
                )}>
                  {getStatusLabel(pr)}
                </span>
                <span className="w-[80px] text-[11px] text-slate-500 truncate">{getName(pr.author)}</span>
                <span className="w-[100px] text-[11px] text-slate-600 truncate">
                  {pr.reviewers.length > 0 ? pr.reviewers.map(getName).join(', ') : '-'}
                </span>
                <span className="w-[100px] text-[11px] text-slate-600 truncate">{pr.repo}</span>
                <span className="w-[70px] text-[11px] text-slate-600 text-right">{timeAgo(pr.updatedAt)}</span>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-slate-500">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}건
            </span>
            <div className="flex items-center gap-1">
              <button
                className="header-icon-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="header-icon-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= filtered.length}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
