# GitHub Actions 배포 자동 폴링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** assigned_repos의 GitHub Actions workflow runs 중 "release" 워크플로우를 폴링하여 Deployment 레코드를 자동 생성/업데이트한다.

**Architecture:** `github.ts`에 workflow runs API 호출 함수를 추가하고, `deployPoller.ts`에서 1분 간격으로 폴링하여 `store.ts`의 `upsertDeployment`로 저장한다. 기존 `scheduler.ts` 패턴을 따른다.

**Tech Stack:** React, TypeScript, GitHub REST API v3, localStorage

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/github.ts` | Modify | `fetchWorkflowRuns()` 함수 추가 |
| `src/deployPoller.ts` | Create | 폴링 루프 + GitHub run → Deployment 매핑 |
| `src/App.tsx` | Modify | 폴링 스케줄러 시작 |
| `src/components/DeploymentsPage.tsx` | Modify | 빈 상태 안내 문구 수정, 자동/수동 구분 뱃지 |

---

### Task 1: github.ts에 fetchWorkflowRuns 추가

**Files:**
- Modify: `src/github.ts`

- [ ] **Step 1: fetchWorkflowRuns 함수 추가**

`src/github.ts` 파일 끝에 추가:

```typescript
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
    `/repos/${ORG}/${repo}/actions/runs?per_page=10&status=completed&status=in_progress&status=queued`
  );
  return (data.workflow_runs ?? []).filter((r) =>
    r.name.toLowerCase().includes('release')
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd C:/Users/yrbyun/IdeaProjects/Teamap && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/github.ts
git commit -m "feat: fetchWorkflowRuns 함수 추가"
```

---

### Task 2: deployPoller.ts 생성

**Files:**
- Create: `src/deployPoller.ts`

- [ ] **Step 1: deployPoller.ts 작성**

```typescript
import { getToken } from './github';
import { fetchWorkflowRuns, type WorkflowRun } from './github';
import { getAssignedRepos, getDeployments, upsertDeployment, type Deployment, type DeploymentStatus } from './store';

const POLL_INTERVAL = 60_000;
const LAST_POLL_KEY = 'deploy_poller_last_ts';

function runIdToDeployId(runId: number): string {
  return `GHA-${runId}`;
}

function mapStatus(run: WorkflowRun): DeploymentStatus {
  if (run.status === 'queued') return 'pending';
  if (run.status === 'in_progress') return 'in_progress';
  if (run.conclusion === 'success') return 'success';
  return 'failed';
}

function mapEnvironment(branch: string): Deployment['environment'] {
  if (branch === 'main' || branch === 'master') return 'prod';
  if (branch.startsWith('release') || branch.startsWith('staging')) return 'stage';
  return 'dev';
}

function runToDeployment(run: WorkflowRun, repo: string): Deployment {
  const status = mapStatus(run);
  const finished = run.status === 'completed';
  return {
    id: runIdToDeployId(run.id),
    service: repo,
    version: run.head_sha.slice(0, 7),
    prNumber: run.pull_requests[0]?.number,
    repo,
    environment: mapEnvironment(run.head_branch),
    status,
    startedAt: new Date(run.created_at).getTime(),
    finishedAt: finished ? new Date(run.updated_at).getTime() : undefined,
    deployer: run.actor.login,
    notes: `${run.name} — ${run.head_branch}`,
  };
}

async function poll() {
  if (!getToken()) return;
  const repos = getAssignedRepos();
  if (repos.length === 0) return;

  for (const repo of repos) {
    try {
      const runs = await fetchWorkflowRuns(repo);
      for (const run of runs) {
        upsertDeployment(runToDeployment(run, repo));
      }
    } catch {
      // API 실패 시 다음 폴링에서 재시도
    }
  }
}

export function startDeployPoller(): ReturnType<typeof setInterval> {
  // 시작 시 즉시 1회 실행
  poll();
  return setInterval(poll, POLL_INTERVAL);
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/deployPoller.ts
git commit -m "feat: GitHub Actions 배포 폴링 모듈 추가"
```

---

### Task 3: App.tsx에 폴링 스케줄러 연결

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: import 추가 및 useEffect 연결**

`src/App.tsx`에서:

1. import 추가:
```typescript
import { startDeployPoller } from './deployPoller';
```

2. 기존 staleIssueScheduler useEffect 바로 아래에 추가:
```typescript
useEffect(() => {
  const timer = startDeployPoller();
  return () => clearInterval(timer);
}, []);
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: 앱 시작 시 배포 폴링 스케줄러 가동"
```

---

### Task 4: DeploymentsPage UI 업데이트

**Files:**
- Modify: `src/components/DeploymentsPage.tsx`

- [ ] **Step 1: 빈 상태 안내 문구 수정**

`DeploymentsPage.tsx:95-99`의 빈 상태 메시지를 변경:

```typescript
<p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
  기록된 배포가 없습니다.
</p>
<p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
  설정 → 계정에서 레포를 등록하면 "release" 워크플로우가 자동으로 수집됩니다.
  수동으로 기록하려면 + 버튼을 누르세요.
</p>
```

- [ ] **Step 2: 자동/수동 구분 뱃지 추가**

`DeployRow` 컴포넌트의 서비스명 셀(`td`)에 자동 수집 여부 뱃지 표시:

배포자(deployer) 셀 옆, 시각 셀 뒤 등 적절한 위치에 — ID가 `GHA-`로 시작하면 자동, 아니면 수동:

```typescript
{d.id.startsWith('GHA-') ? (
  <span style={{
    fontSize: 9, padding: '1px 5px', borderRadius: 3, marginLeft: 6,
    background: 'rgba(59,130,246,0.12)', color: 'var(--accent)',
    border: '1px solid rgba(59,130,246,0.25)',
  }}>AUTO</span>
) : (
  <span style={{
    fontSize: 9, padding: '1px 5px', borderRadius: 3, marginLeft: 6,
    background: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)',
    border: '1px solid rgba(100,116,139,0.25)',
  }}>MANUAL</span>
)}
```

이 뱃지를 `DeployRow`의 서비스명 `<td>` 안, `{d.service}` 뒤에 추가.

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/components/DeploymentsPage.tsx
git commit -m "feat: 배포 페이지 자동/수동 뱃지 및 안내 문구 개선"
```

---

### Task 5: 통합 확인

- [ ] **Step 1: Electron 모드에서 동작 확인**

Run: `npm run electron:dev`

확인사항:
1. 설정 → 계정에서 GitHub 토큰과 레포가 등록되어 있는지 확인
2. 배포 트래킹 페이지로 이동
3. 1분 이내에 "release" 워크플로우 실행 이력이 자동으로 표시되는지 확인
4. AUTO 뱃지가 표시되는지 확인
5. + 버튼으로 수동 생성 시 MANUAL 뱃지가 표시되는지 확인

- [ ] **Step 2: 최종 Commit**

```bash
git add -A
git commit -m "feat: GitHub Actions 배포 자동 폴링 통합 완료"
```
