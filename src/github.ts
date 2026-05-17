import { github as opsGithub, type CodeSearchHit } from '@stablecoin/ops';

const ORG = 'StableCoinTF';
export type { CodeSearchHit };

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  assignee: string | null;
  author: string;
  repo: string;
  labels: string[];
  url: string;
  createdAt: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  author: string;
  createdAt: string;
}

interface GitHubApiIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string };
  assignee: { login: string } | null;
  labels: { name: string }[];
  html_url: string;
  created_at: string;
  pull_request?: unknown;
}

interface GitHubApiRepo {
  name: string;
  permissions?: {
    admin: boolean;
    maintain?: boolean;
    push: boolean;
    triage?: boolean;
    pull: boolean;
  };
}

export type RepoPermission = 'admin' | 'write' | 'read';

export interface RepoWithPermission {
  name: string;
  permission: RepoPermission;
}

export function getToken(): string | null {
  return localStorage.getItem('github_token');
}

export function setToken(token: string) {
  localStorage.setItem('github_token', token);
}

async function ghFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('GitHub 토큰이 설정되지 않았습니다.');

  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) throw new Error(`GitHub API 오류: ${res.status}`);
  return res.json();
}

export async function fetchMyLogin(): Promise<string> {
  const user = await ghFetch<{ login: string }>('/user');
  return user.login;
}

export async function fetchRepos(): Promise<string[]> {
  const repos = await ghFetch<GitHubApiRepo[]>(`/orgs/${ORG}/repos?per_page=100`);
  return repos.map((r) => r.name);
}

// 코드 검색 / 파일 조회는 @stablecoin/ops로 이전.
// Teamap 호출 시그니처는 유지 (token+org은 자동 주입)
function ghOpts() {
  const token = getToken();
  if (!token) throw new Error('GitHub 토큰이 설정되지 않았습니다.');
  return { token, org: ORG };
}

export async function searchCode(query: string, limit = 10): Promise<CodeSearchHit[]> {
  return opsGithub.searchCode(ghOpts(), query, limit);
}

export async function fetchFileContent(repo: string, path: string): Promise<string> {
  return opsGithub.fetchFileContent(ghOpts(), repo, path);
}

/** 파일 내용에서 키워드 매치 위치 ± N줄 컨텍스트 추출.
 *  AI에게 라인 번호와 함께 코드를 보여주기 위함 — "> 1234: code" 형식.
 *  한 파일당 최대 3개 매치까지 반환 (서로 겹치지 않는 범위).
 */
export async function fetchFileContentWithMatch(
  repo: string,
  path: string,
  keywords: string[],
  contextLines = 15,
): Promise<{ lineNumber: number; snippet: string }[]> {
  return opsGithub.fetchFileContentWithMatch(ghOpts(), repo, path, keywords, contextLines);
}

export async function fetchReposWithPermissions(): Promise<RepoWithPermission[]> {
  const repos = await ghFetch<GitHubApiRepo[]>(`/orgs/${ORG}/repos?per_page=100`);
  return repos.map((r) => ({
    name: r.name,
    permission: r.permissions?.admin
      ? 'admin'
      : r.permissions?.push
        ? 'write'
        : 'read',
  }));
}

const nameCache = new Map<string, string>();

export async function fetchUserNames(logins: string[]): Promise<Map<string, string>> {
  const unknown = logins.filter((l) => !nameCache.has(l));
  await Promise.all(
    unknown.map(async (login) => {
      try {
        const u = await ghFetch<{ name: string | null; login: string }>(`/users/${login}`);
        nameCache.set(login, u.name ?? login);
      } catch {
        nameCache.set(login, login);
      }
    })
  );
  return nameCache;
}

export async function fetchAllIssues(): Promise<GitHubIssue[]> {
  const repos = await fetchRepos();

  const allIssues = await Promise.all(
    repos.map(async (repo) => {
      const issues = await ghFetch<GitHubApiIssue[]>(
        `/repos/${ORG}/${repo}/issues?state=all&per_page=100`
      );
      return issues
        .filter((i) => !i.pull_request)
        .map((i) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          body: i.body ?? '',
          state: i.state,
          assignee: i.assignee?.login ?? null,
          author: i.user.login,
          repo,
          labels: i.labels.map((l) => l.name),
          url: i.html_url,
          createdAt: i.created_at,
        }));
    })
  );

  return allIssues.flat().sort((a, b) => b.id - a.id);
}

export async function updateComment(repo: string, commentId: number, body: string): Promise<void> {
  await ghFetch(`/repos/${ORG}/${repo}/issues/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export async function addComment(repo: string, number: number, body: string): Promise<void> {
  await ghFetch(`/repos/${ORG}/${repo}/issues/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function updateIssueState(repo: string, number: number, state: 'open' | 'closed'): Promise<void> {
  await ghFetch(`/repos/${ORG}/${repo}/issues/${number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  });
}

export interface OrgMember {
  login: string;
  name: string;
  avatar: string;
}

export async function fetchOrgMembers(): Promise<OrgMember[]> {
  const members = await ghFetch<{ login: string; avatar_url: string }[]>(`/orgs/${ORG}/members?per_page=100`);
  const names = await fetchUserNames(members.map((m) => m.login));
  return members.map((m) => ({ login: m.login, name: (names.get(m.login) ?? m.login).split('/')[0], avatar: m.avatar_url }));
}

export interface RecentEvent {
  id: string;
  type: string;
  repo: string;
  action: string;
  createdAt: string;
}

export async function fetchMemberEvents(login: string): Promise<RecentEvent[]> {
  const data = await ghFetch<{ id: string; type: string; repo: { name: string }; payload: { action?: string }; created_at: string }[]>(
    `/users/${login}/events?per_page=10`
  );
  return data.map((e) => ({
    id: e.id,
    type: e.type,
    repo: e.repo.name.replace(`${ORG}/`, ''),
    action: e.payload.action ?? '',
    createdAt: e.created_at,
  }));
}

export async function createIssue(repo: string, title: string, body: string, assignee?: string): Promise<GitHubIssue> {
  const payload: Record<string, unknown> = { title, body };
  if (assignee) payload.assignees = [assignee];
  const i = await ghFetch<GitHubApiIssue>(`/repos/${ORG}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    id: i.id,
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state,
    assignee: i.assignee?.login ?? null,
    author: i.user.login,
    repo,
    labels: i.labels.map((l) => l.name),
    url: i.html_url,
    createdAt: i.created_at,
  };
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  author: string;
  repo: string;
  state: string;
  draft: boolean;
  mergeable: boolean;
  merged: boolean;
  reviewStatus: 'pending' | 'approved' | 'changes_requested';
  reviewers: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAllPRs(): Promise<PullRequest[]> {
  const repos = await fetchRepos();

  const allPRs = await Promise.all(
    repos.map(async (repo) => {
      const prs = await ghFetch<{
        id: number;
        number: number;
        title: string;
        user: { login: string };
        state: string;
        draft: boolean;
        html_url: string;
        created_at: string;
        updated_at: string;
        merged_at: string | null;
        requested_reviewers: { login: string }[];
      }[]>(`/repos/${ORG}/${repo}/pulls?state=all&per_page=50&sort=updated&direction=desc`);

      return prs.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        repo,
        state: pr.state,
        draft: pr.draft,
        mergeable: true,
        merged: pr.merged_at !== null,
        reviewStatus: 'pending' as const,
        reviewers: pr.requested_reviewers.map((r) => r.login),
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }));
    })
  );

  return allPRs.flat().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function fetchPRReviews(repo: string, number: number): Promise<{ user: string; state: string }[]> {
  const data = await ghFetch<{ user: { login: string }; state: string }[]>(
    `/repos/${ORG}/${repo}/pulls/${number}/reviews`
  );
  return data.map((r) => ({ user: r.user.login, state: r.state }));
}

export interface PRDetail {
  id: number;
  number: number;
  title: string;
  body: string;
  author: string;
  repo: string;
  state: string;
  draft: boolean;
  merged: boolean;
  mergedBy: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  head: string;
  base: string;
  reviewStatus: 'pending' | 'approved' | 'changes_requested';
  reviewers: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PRReviewComment {
  id: number;
  body: string;
  author: string;
  path: string;
  line: number | null;
  createdAt: string;
}

export async function fetchPRDetail(repo: string, number: number): Promise<PRDetail> {
  const pr = await ghFetch<{
    id: number;
    number: number;
    title: string;
    body: string | null;
    user: { login: string };
    state: string;
    draft: boolean;
    merged: boolean;
    merged_by: { login: string } | null;
    additions: number;
    deletions: number;
    changed_files: number;
    head: { ref: string };
    base: { ref: string };
    requested_reviewers: { login: string }[];
    html_url: string;
    created_at: string;
    updated_at: string;
    merged_at: string | null;
    closed_at: string | null;
  }>(`/repos/${ORG}/${repo}/pulls/${number}`);

  const reviews = await fetchPRReviews(repo, number);
  const latest = new Map<string, string>();
  reviews.forEach((r) => latest.set(r.user, r.state));
  const states = [...latest.values()];
  let reviewStatus: PRDetail['reviewStatus'] = 'pending';
  if (states.includes('CHANGES_REQUESTED')) reviewStatus = 'changes_requested';
  else if (states.includes('APPROVED')) reviewStatus = 'approved';

  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    author: pr.user.login,
    repo,
    state: pr.state,
    draft: pr.draft,
    merged: pr.merged,
    mergedBy: pr.merged_by?.login ?? null,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    head: pr.head.ref,
    base: pr.base.ref,
    reviewStatus,
    reviewers: [...new Set([...pr.requested_reviewers.map((r) => r.login), ...latest.keys()])],
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
  };
}

export async function fetchPRFiles(repo: string, number: number): Promise<PRFile[]> {
  const data = await ghFetch<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[]>(`/repos/${ORG}/${repo}/pulls/${number}/files?per_page=100`);
  return data.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
}

export async function fetchPRReviewComments(repo: string, number: number): Promise<PRReviewComment[]> {
  const data = await ghFetch<{
    id: number;
    body: string;
    user: { login: string };
    path: string;
    line: number | null;
    created_at: string;
  }[]>(`/repos/${ORG}/${repo}/pulls/${number}/comments?per_page=100`);
  return data.map((c) => ({
    id: c.id,
    body: c.body,
    author: c.user.login,
    path: c.path,
    line: c.line,
    createdAt: c.created_at,
  }));
}

export async function submitPRReview(repo: string, number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body?: string): Promise<void> {
  await ghFetch(`/repos/${ORG}/${repo}/pulls/${number}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ event, body: body ?? '' }),
  });
}

export async function fetchIssueComments(repo: string, number: number): Promise<GitHubComment[]> {
  const data = await ghFetch<{ id: number; body: string; user: { login: string }; created_at: string }[]>(
    `/repos/${ORG}/${repo}/issues/${number}/comments?per_page=100`
  );
  return data.map((c) => ({
    id: c.id,
    body: c.body,
    author: c.user.login,
    createdAt: c.created_at,
  }));
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  actor: { login: string };
  pull_requests: { number: number; title?: string }[];
}

export async function fetchWorkflowRuns(repo: string): Promise<WorkflowRun[]> {
  const data = await ghFetch<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${ORG}/${repo}/actions/runs?per_page=10&branch=release`
  );
  return data.workflow_runs ?? [];
}
