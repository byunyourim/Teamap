# 오버나이트 브리핑 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매일 08:00에 오버나이트 에러 건수를 자동 집계해 홈 화면 배너 + 알림 벨에 표시한다.

**Architecture:** 기존 `scheduler.ts`의 setInterval 패턴을 재사용해 08:00 체크 → Slack fetchHistory → Firestore에 `overnight-briefing` 알림 저장 → DashboardPage 배너 + NotificationBell 표시. `getOvernightRange`는 `slack.ts`로 이동해 scheduler와 DailyReportPage가 공유한다.

**Tech Stack:** React + TypeScript, Firebase Firestore, Electron IPC (Slack), Vitest

---

## 파일 맵

| 파일 | 변경 내용 |
|------|-----------|
| `src/slack.ts` | `getOvernightRange` 함수 추출 및 export |
| `src/notifications.ts` | `overnight-briefing` 타입 추가 + `createOvernightBriefingNotification` 함수 추가 |
| `src/scheduler.ts` | `startOvernightBriefingScheduler` 함수 추가 |
| `src/components/DailyReportPage.tsx` | `getOvernightRange` import 교체 (slack.ts에서) |
| `src/components/DashboardPage.tsx` | 오버나이트 배너 추가 |
| `src/components/NotificationBell.tsx` | `overnight-briefing` 타입 표시 처리 |
| `src/App.tsx` | `startOvernightBriefingScheduler` 호출 추가 |
| `src/overnight.test.ts` | 순수 함수 테스트 |

---

### Task 1: `getOvernightRange`를 `slack.ts`로 추출

**Files:**
- Modify: `src/slack.ts`
- Modify: `src/components/DailyReportPage.tsx`
- Create: `src/overnight.test.ts`

- [ ] **Step 1: 테스트 파일 생성 (failing)**

`src/overnight.test.ts` 파일 생성:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOvernightRange } from './slack';

describe('getOvernightRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('출근 전(08:00)에는 어젯밤 18시 ~ 지금까지', () => {
    // 오전 8시로 설정
    vi.setSystemTime(new Date('2026-05-15T08:00:00'));
    const { start, end } = getOvernightRange();
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4); // 0-based (5월)
    expect(start.getDate()).toBe(14); // 전날
    expect(start.getHours()).toBe(18);
    expect(end.getHours()).toBe(8); // 지금 (출근 전이므로)
  });

  it('출근 후(10:00)에는 어젯밤 18시 ~ 오늘 9시까지', () => {
    vi.setSystemTime(new Date('2026-05-15T10:00:00'));
    const { start, end } = getOvernightRange();
    expect(start.getDate()).toBe(14); // 전날
    expect(start.getHours()).toBe(18);
    expect(end.getHours()).toBe(9); // 오늘 9시
    expect(end.getDate()).toBe(15);
  });

  it('label 필드를 반환한다', () => {
    vi.setSystemTime(new Date('2026-05-15T10:00:00'));
    const { label } = getOvernightRange();
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

```bash
npx vitest run src/overnight.test.ts
```

Expected: `getOvernightRange` not exported from `./slack` 에러로 FAIL

- [ ] **Step 3: `slack.ts`에 `getOvernightRange` 추가 (export)**

`src/slack.ts` 맨 아래에 추가 (파일 끝에 append):

```ts
const WORK_END_HOUR = 18;
const WORK_START_HOUR = 9;

export interface OvernightRange {
  start: Date;
  end: Date;
  label: string;
}

export function getOvernightRange(): OvernightRange {
  const now = new Date();
  const end = new Date(now);

  let start: Date;
  if (now.getHours() < WORK_START_HOUR) {
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(WORK_END_HOUR, 0, 0, 0);
  } else {
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(WORK_END_HOUR, 0, 0, 0);
    end.setHours(WORK_START_HOUR, 0, 0, 0);
    end.setSeconds(0, 0);
  }

  return { start, end, label: '오버나이트 (퇴근 후)' };
}
```

- [ ] **Step 4: 테스트 실행 — PASS 확인**

```bash
npx vitest run src/overnight.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: `DailyReportPage.tsx`에서 로컬 정의 제거, slack.ts에서 import**

`src/components/DailyReportPage.tsx` 상단 import에 추가:

```ts
import {
  fetchHistory, parseError,
  getSlackToken, getSlackChannel,
  getOvernightRange,
  type ParsedError,
} from '../slack';
```

같은 파일에서 아래 코드 삭제 (이제 slack.ts에 있으므로):

```ts
const WORK_END_HOUR = 18;
const WORK_START_HOUR = 9;

function getTodayRange() { ... }  // 이건 DailyReportPage 전용이므로 유지

function getOvernightRange() { ... }  // 이것만 삭제
```

> 주의: `getTodayRange`는 DailyReportPage 전용이므로 그대로 둔다. `getOvernightRange`만 삭제하고 import로 교체.

- [ ] **Step 6: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src/slack.ts src/components/DailyReportPage.tsx src/overnight.test.ts
git commit -m "refactor: getOvernightRange를 slack.ts로 추출"
```

---

### Task 2: `notifications.ts`에 `overnight-briefing` 타입 + 생성 함수 추가

**Files:**
- Modify: `src/notifications.ts`
- Modify: `src/overnight.test.ts`

- [ ] **Step 1: `overnight-briefing` 테스트 추가 (failing)**

`src/overnight.test.ts`에 아래 블록 추가:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOvernightRange } from './slack';

// 기존 getOvernightRange 테스트 아래에 추가:

describe('createOvernightBriefingNotification', () => {
  it('AppNotification 타입이 overnight-briefing을 허용한다', () => {
    // 타입 레벨 테스트 — 컴파일 통과 여부로 확인
    const notif: import('./notifications').AppNotification = {
      id: 'test-id',
      to: 'user1',
      from: 'user1',
      type: 'overnight-briefing',
      issueTitle: '오버나이트 브리핑',
      repo: '',
      issueNumber: 0,
      comment: 'overnight:42',
      read: false,
      createdAt: new Date().toISOString(),
    };
    expect(notif.type).toBe('overnight-briefing');
    expect(notif.comment).toBe('overnight:42');
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

```bash
npx vitest run src/overnight.test.ts
```

Expected: 타입 에러 — `'overnight-briefing'` is not assignable to `'mention' | 'stale-issue'`

- [ ] **Step 3: `AppNotification` 타입 확장**

`src/notifications.ts` 8번째 줄:

```ts
// 변경 전
type: 'mention' | 'stale-issue';

// 변경 후
type: 'mention' | 'stale-issue' | 'overnight-briefing';
```

- [ ] **Step 4: `createOvernightBriefingNotification` 함수 추가**

`src/notifications.ts`의 `markAsRead` 함수 바로 위에 추가:

```ts
export async function createOvernightBriefingNotification(
  to: string,
  errorCount: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // 오늘 이미 생성된 overnight-briefing 알림이 있는지 확인
  const q = query(
    collection(db, 'notifications'),
    where('type', '==', 'overnight-briefing'),
    where('to', '==', to),
  );
  const snap = await new Promise<import('firebase/firestore').QuerySnapshot>((resolve, reject) => {
    const unsub = onSnapshot(q, (s) => { unsub(); resolve(s); }, reject);
  });

  const alreadyExists = snap.docs.some((d) =>
    (d.data().createdAt as string).startsWith(today)
  );
  if (alreadyExists) return;

  await addDoc(collection(db, 'notifications'), {
    to,
    from: to,
    type: 'overnight-briefing',
    issueTitle: '오버나이트 브리핑',
    repo: '',
    issueNumber: 0,
    comment: `overnight:${errorCount}`,
    read: false,
    createdAt: new Date().toISOString(),
  });
}
```

> `onSnapshot`을 Promise로 감싸는 이유: Firestore `getDocs`를 쓰면 더 깔끔하지만, 현재 `notifications.ts`에는 `getDocs`가 import되어 있지 않다. `onSnapshot`은 이미 있으므로 즉시 취소(unsub)하는 방식으로 one-shot read 구현.

- [ ] **Step 5: import에 `getDocs` 추가 (더 깔끔한 방식으로 변경)**

사실 `getDocs`를 쓰는 게 더 명확하다. `src/notifications.ts` 1번째 줄 import 교체:

```ts
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, getDocs, orderBy } from 'firebase/firestore';
```

그리고 `createOvernightBriefingNotification` 함수를 아래로 교체:

```ts
export async function createOvernightBriefingNotification(
  to: string,
  errorCount: number,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const q = query(
    collection(db, 'notifications'),
    where('type', '==', 'overnight-briefing'),
    where('to', '==', to),
  );
  const snap = await getDocs(q);
  const alreadyExists = snap.docs.some((d) =>
    (d.data().createdAt as string).startsWith(today)
  );
  if (alreadyExists) return;

  await addDoc(collection(db, 'notifications'), {
    to,
    from: to,
    type: 'overnight-briefing',
    issueTitle: '오버나이트 브리핑',
    repo: '',
    issueNumber: 0,
    comment: `overnight:${errorCount}`,
    read: false,
    createdAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 6: 테스트 실행 — PASS 확인**

```bash
npx vitest run src/overnight.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 7: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/notifications.ts src/overnight.test.ts
git commit -m "feat: overnight-briefing 알림 타입 및 생성 함수 추가"
```

---

### Task 3: `scheduler.ts`에 오버나이트 브리핑 스케줄러 추가

**Files:**
- Modify: `src/scheduler.ts`

- [ ] **Step 1: `startOvernightBriefingScheduler` 함수 추가**

`src/scheduler.ts` 기존 import 아래에 추가할 import:

```ts
import { fetchHistory, parseError, getOvernightRange, getSlackToken, getSlackChannel } from './slack';
import { createOvernightBriefingNotification } from './notifications';
```

파일 맨 아래에 함수 추가:

```ts
const OVERNIGHT_KEY = 'overnight_notif_last_run';

async function runOvernightCheck(ghLogin: string): Promise<void> {
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token || !channel) return;

  try {
    const { start, end } = getOvernightRange();
    const oldest = String(start.getTime() / 1000);
    const messages = await fetchHistory(oldest, 200);
    const endTs = end.getTime() / 1000;
    const errors = messages
      .map((m) => parseError(m))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .filter((p) => parseFloat(p.ts) <= endTs);

    await createOvernightBriefingNotification(ghLogin, errors.length);
    localStorage.setItem(OVERNIGHT_KEY, todayStr());
  } catch {
    // Slack 미설정 또는 네트워크 오류 — 조용히 실패
  }
}

export function startOvernightBriefingScheduler(ghLogin: string): () => void {
  const TRIGGER_HOUR = 8;

  const check = () => {
    const now = new Date();
    if (now.getHours() === TRIGGER_HOUR && now.getMinutes() < 1) {
      const last = localStorage.getItem(OVERNIGHT_KEY);
      if (last !== todayStr()) {
        runOvernightCheck(ghLogin);
      }
    }
  };

  // 앱 시작 시 즉시 1회: 8시 이후이고 오늘 아직 안 실행했으면
  const now = new Date();
  if (now.getHours() >= TRIGGER_HOUR) {
    const last = localStorage.getItem(OVERNIGHT_KEY);
    if (last !== todayStr()) {
      runOvernightCheck(ghLogin);
    }
  }

  const timer = setInterval(check, 60_000);
  return () => clearInterval(timer);
}
```

> `todayStr()`은 이미 `scheduler.ts`에 정의되어 있다. 새로 추가하지 말 것.

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/scheduler.ts
git commit -m "feat: 오버나이트 브리핑 스케줄러 추가 (매일 08:00 자동 실행)"
```

---

### Task 4: `App.tsx`에 스케줄러 시작 연결

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: import 추가**

`src/App.tsx` 기존 import:
```ts
import { startStaleIssueScheduler } from './scheduler';
```
를 아래로 교체:
```ts
import { startStaleIssueScheduler, startOvernightBriefingScheduler } from './scheduler';
```

- [ ] **Step 2: `ghLogin` useEffect에 스케줄러 연결**

`src/App.tsx`에서 아래 useEffect를 찾아:

```ts
useEffect(() => {
  if (!ghLogin) return;
  const unsub = subscribeNotifications(ghLogin, setNotifications);
  return unsub;
}, [ghLogin]);
```

아래로 교체:

```ts
useEffect(() => {
  if (!ghLogin) return;
  const unsub = subscribeNotifications(ghLogin, setNotifications);
  const stopOvernight = startOvernightBriefingScheduler(ghLogin);
  return () => {
    unsub();
    stopOvernight();
  };
}, [ghLogin]);
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: App에 오버나이트 브리핑 스케줄러 연결"
```

---

### Task 5: `DashboardPage.tsx`에 오버나이트 배너 추가

**Files:**
- Modify: `src/components/DashboardPage.tsx`

- [ ] **Step 1: import 추가**

`src/components/DashboardPage.tsx` 기존 import 목록 중 `markAsRead` import 확인:

```ts
import { markAsRead, type AppNotification } from '../notifications';
```

없으면 추가. `markAsRead`가 아직 import 안 된 경우를 위해.

- [ ] **Step 2: `onNavigate` prop 타입 확인**

`DashboardPage`의 Props 인터페이스:

```ts
interface Props {
  onNavigate: (id: string) => void;
  bell: React.ReactNode;
  notifications: AppNotification[];
}
```

이미 이 구조라면 변경 없음.

- [ ] **Step 3: overnight 알림 필터링 로직 추가**

`DashboardPage` 컴포넌트 함수 내부 state 선언부 바로 아래에 추가:

```ts
const overnightNotif = notifications.find(
  (n) => n.type === 'overnight-briefing' && !n.read,
);
const overnightCount = overnightNotif
  ? parseInt(overnightNotif.comment.replace('overnight:', ''), 10)
  : 0;
```

- [ ] **Step 4: 배너 JSX 추가**

DashboardPage의 `return` 내부, `<main className="main-content">` 바로 안쪽 `<div className="main-header">` 아래에 배너 추가:

```tsx
{overnightNotif && (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 20px',
    background: 'rgba(59,130,246,0.08)',
    borderBottom: '1px solid rgba(59,130,246,0.2)',
    fontSize: 13,
  }}>
    <span style={{ fontSize: 15 }}>🌙</span>
    <span style={{ color: 'var(--text)', fontWeight: 500 }}>
      오버나이트 브리핑 —{' '}
      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
        {overnightCount}건
      </span>{' '}
      에러 발생
    </span>
    <button
      onClick={() => {
        markAsRead(overnightNotif.id);
        onNavigate('daily-report');
      }}
      style={{
        marginLeft: 4,
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 600,
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      확인하기 →
    </button>
    <button
      onClick={() => markAsRead(overnightNotif.id)}
      style={{
        marginLeft: 'auto',
        background: 'transparent',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 16,
        lineHeight: 1,
        padding: '2px 4px',
      }}
      title="닫기"
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 5: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/components/DashboardPage.tsx
git commit -m "feat: 홈 화면에 오버나이트 브리핑 배너 추가"
```

---

### Task 6: `NotificationBell.tsx`에 overnight-briefing 표시 처리

**Files:**
- Modify: `src/components/NotificationBell.tsx`

- [ ] **Step 1: 알림 아이템 렌더링에 overnight 분기 추가**

`src/components/NotificationBell.tsx`에서 알림 아이템 렌더 부분을 찾는다:

```tsx
notifications.slice(0, 15).map((n) => (
  <div
    key={n.id}
    className={`notif-dropdown-item ${n.read ? '' : 'notif-unread'}`}
    onClick={() => { if (!n.read) markAsRead(n.id); }}
  >
    <div className="notif-item-top">
      <span className="notif-item-from">@{n.from}</span>
      <span className="notif-item-date">{formatDate(n.createdAt)}</span>
    </div>
    <div className="notif-item-issue">{n.issueTitle} #{n.issueNumber}</div>
    <div className="notif-item-comment">{n.comment}</div>
  </div>
))
```

아래로 교체:

```tsx
notifications.slice(0, 15).map((n) => {
  const isOvernight = n.type === 'overnight-briefing';
  const overnightCount = isOvernight
    ? parseInt(n.comment.replace('overnight:', ''), 10)
    : 0;
  return (
    <div
      key={n.id}
      className={`notif-dropdown-item ${n.read ? '' : 'notif-unread'}`}
      onClick={() => { if (!n.read) markAsRead(n.id); }}
    >
      <div className="notif-item-top">
        <span className="notif-item-from">
          {isOvernight ? '🌙 오버나이트 브리핑' : `@${n.from}`}
        </span>
        <span className="notif-item-date">{formatDate(n.createdAt)}</span>
      </div>
      {isOvernight ? (
        <div className="notif-item-issue" style={{ color: 'var(--danger)' }}>
          {overnightCount}건 에러 발생
        </div>
      ) : (
        <>
          <div className="notif-item-issue">{n.issueTitle} #{n.issueNumber}</div>
          <div className="notif-item-comment">{n.comment}</div>
        </>
      )}
    </div>
  );
})
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/NotificationBell.tsx
git commit -m "feat: 알림 벨에 overnight-briefing 표시 처리"
```

---

### Task 7: 수동 검증

- [ ] **Step 1: 앱 실행**

```bash
npm run dev
```

- [ ] **Step 2: localStorage 강제 트리거 테스트**

브라우저 개발자 도구 콘솔에서:

```js
// 오늘 실행 기록 초기화 (재실행 유도)
localStorage.removeItem('overnight_notif_last_run');
```

이후 `runOvernightCheck`가 직접 호출되는지 확인하려면 App.tsx의 `startOvernightBriefingScheduler` 내부 즉시 실행 조건이 맞아야 한다. 테스트를 위해 현재 시각이 08:00 이후라면 앱 재시작 시 바로 실행됨.

- [ ] **Step 3: 홈 화면 배너 확인**

Firestore에 overnight-briefing 알림이 생성되면:
- 홈 화면(DashboardPage) 상단에 배너 표시 확인
- "확인하기 →" 클릭 시 일간 리포트로 이동 확인
- "✕" 클릭 시 배너 사라짐 확인

- [ ] **Step 4: 알림 벨 확인**

우측 상단 벨 아이콘 클릭 → "🌙 오버나이트 브리핑 / N건 에러 발생" 항목 확인

- [ ] **Step 5: 중복 방지 확인**

앱 재시작 후 Firestore 콘솔에서 오늘 날짜 overnight-briefing 알림이 1건만 존재하는지 확인

- [ ] **Step 6: 최종 타입 체크 및 빌드**

```bash
npx tsc --noEmit && npm run build
```

Expected: 에러 없음, 빌드 성공
