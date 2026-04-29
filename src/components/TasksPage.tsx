import { useState, useEffect } from 'react';
import { Search, Settings, Loader2, RefreshCw, Plus, X } from 'lucide-react';
import { createIssue, fetchAllIssues, fetchMyLogin, fetchOrgMembers, fetchUserNames, getToken, setToken, type GitHubIssue } from '../github';
import IssueDetailPage from './IssueDetailPage';

type StateFilter = 'all' | 'open' | 'closed';

interface TasksPageProps {
  bell?: React.ReactNode;
}

export default function TasksPage({ bell }: TasksPageProps) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [myOnly, setMyOnly] = useState(false);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(!getToken());
  const [tokenDraft, setTokenDraft] = useState('');
  const [repoFilter, setRepoFilter] = useState('all');
  const [ghLogin, setGhLogin] = useState('');
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [members, setMembers] = useState<{ login: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const loadIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, login] = await Promise.all([fetchAllIssues(), fetchMyLogin()]);
      setIssues(data);
      setGhLogin(login);
      const logins = [...new Set(data.flatMap((i) => [i.author, i.assignee].filter(Boolean) as string[]))];
      const names = await fetchUserNames(logins);
      setNameMap(new Map(names));
      fetchOrgMembers().then(setMembers).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getToken()) loadIssues();
  }, []);

  const handleTokenSubmit = () => {
    if (!tokenDraft.trim()) return;
    setToken(tokenDraft.trim());
    setShowTokenInput(false);
    loadIssues();
  };

  const repos = [...new Set(issues.map((i) => i.repo))].sort();

  const filtered = issues.filter((issue) => {
    if (myOnly && ghLogin && issue.assignee !== ghLogin) return false;
    if (stateFilter !== 'all' && issue.state !== stateFilter) return false;
    if (repoFilter !== 'all' && issue.repo !== repoFilter) return false;
    if (search && !issue.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: issues.length,
    open: issues.filter((i) => i.state === 'open').length,
    closed: issues.filter((i) => i.state === 'closed').length,
  };

  const handleCreateIssue = async () => {
    if (!newTitle.trim() || !newRepo || creating) return;
    setCreating(true);
    try {
      const created = await createIssue(newRepo, newTitle.trim(), newBody.trim(), newAssignee || undefined);
      setIssues((prev) => [created, ...prev]);
      setShowNewIssue(false);
      setNewTitle('');
      setNewBody('');
      setNewAssignee('');
    } finally {
      setCreating(false);
    }
  };

  const handleIssueUpdate = (updated: GitHubIssue) => {
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    setSelectedIssue(updated);
  };

  if (selectedIssue) {
    return <IssueDetailPage issue={selectedIssue} nameMap={nameMap} ghLogin={ghLogin} onBack={() => setSelectedIssue(null)} onIssueUpdate={handleIssueUpdate} />;
  }

  if (showTokenInput) {
    return (
      <main className="main-content">
        <div className="main-header">업무</div>
        <div className="token-setup">
          <div className="token-card">
            <h3>GitHub 연동</h3>
            <p>StableCoinTF 이슈를 가져오려면 Personal Access Token이 필요합니다.</p>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTokenSubmit()}
              className="token-input"
            />
            <button className="token-btn" onClick={handleTokenSubmit}>연동하기</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="main-header">
        <span>업무</span>
        <div className="header-actions">
          <button className="header-icon-btn" onClick={() => { setShowNewIssue(true); if (repos.length > 0 && !newRepo) setNewRepo(repos[0]); }} title="새 이슈">
            <Plus size={14} />
          </button>
          <button className="header-icon-btn" onClick={loadIssues} title="새로고침">
            <RefreshCw size={14} />
          </button>
          <button className="header-icon-btn" onClick={() => setShowTokenInput(true)} title="토큰 설정">
            <Settings size={14} />
          </button>
          {bell}
        </div>
      </div>

      <div className="tasks-toolbar">
        <div className="tasks-toolbar-right">
          <select
            className="tasks-repo-select"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          >
            <option value="all">전체 ({counts.all})</option>
            <option value="open">열림 ({counts.open})</option>
            <option value="closed">닫힘 ({counts.closed})</option>
          </select>
          <select
            className="tasks-repo-select"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
          >
            <option value="all">전체 레포</option>
            {repos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="tasks-search">
            <Search size={14} className="tasks-search-icon" />
            <input
              type="text"
              placeholder="검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="tasks-search-input"
            />
          </div>
          <button
            className={`tasks-my-btn ${myOnly ? 'active' : ''}`}
            onClick={() => setMyOnly(!myOnly)}
          >
            내 작업
          </button>
        </div>
      </div>

      {loading && (
        <div className="main-body">
          <Loader2 size={20} className="spinner" />
          <span style={{ marginLeft: 8 }}>이슈 로딩 중...</span>
        </div>
      )}

      {error && (
        <div className="main-body" style={{ color: '#ef4444' }}>{error}</div>
      )}

      {!loading && !error && (
        <div className="tasks-list">
          {filtered.map((issue) => (
            <div key={issue.id} className="tasks-row" onClick={() => setSelectedIssue(issue)}>
              <span className={`tasks-dot ${issue.state}`} />
              <span className="tasks-col-title">
                {issue.title}
                <span className="tasks-issue-number">#{issue.number}</span>
              </span>
              <span className="tasks-col-assignee">{(nameMap.get(issue.assignee ?? issue.author) ?? issue.assignee ?? issue.author).split('/')[0]}</span>
              <span className="tasks-col-date">{issue.createdAt.slice(0, 10)}</span>
              <span className="tasks-col-part">{issue.repo}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="tasks-empty">이슈가 없습니다.</div>
          )}
        </div>
      )}
      {showNewIssue && (
        <div className="cal-modal-overlay" onClick={() => setShowNewIssue(false)}>
          <div className="new-issue-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-header">
              <span>새 이슈</span>
              <button className="cal-modal-close" onClick={() => setShowNewIssue(false)}><X size={16} /></button>
            </div>
            <select
              className="cal-modal-select"
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
            >
              <option value="" disabled>레포 선택</option>
              {repos.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              className="cal-modal-input"
              placeholder="이슈 제목"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
            <textarea
              className="new-issue-body"
              placeholder="내용 (선택)"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={4}
            />
            <select
              className="cal-modal-select"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
            >
              <option value="">담당자 없음</option>
              {members.map((m) => (
                <option key={m.login} value={m.login}>{m.name} (@{m.login})</option>
              ))}
            </select>
            <button
              className="cal-modal-btn"
              onClick={handleCreateIssue}
              disabled={creating || !newTitle.trim() || !newRepo}
            >
              {creating ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
              이슈 생성
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
