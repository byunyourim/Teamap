# 오버나이트 브리핑 알림 설계

**날짜:** 2026-05-15
**상태:** 승인

## 개요

매일 오전 8시에 전날 밤 에러 현황(오버나이트 브리핑)을 자동으로 수집해,
홈 화면 배너와 알림 벨에 동시에 노출한다. 팀원이 출근해서 앱을 열면 바로 확인할 수 있다.

## 요구사항

- 매일 08:00에 자동 실행
- Slack에서 오버나이트 시간대(전날 18시 ~ 당일 09시) 에러 건수 집계
- 홈 화면(DashboardPage) 상단 배너로 표시: "🌙 오버나이트 브리핑 — N건 에러 발생 [확인하기 →] [✕]"
- 알림 벨에도 동일 내용 표시
- "확인하기" 클릭 → 일간 리포트(overnight 모드)로 이동 + 알림 read 처리
- "✕" 클릭 → 배너만 닫힘(알림 read 처리)
- 하루 한 번만 생성 (중복 방지)
- 개인별 출근 시간 설정 없음 — 08:00 고정

## 아키텍처

### 1. 데이터 모델 (`src/notifications.ts`)

`AppNotification.type`에 `'overnight-briefing'` 추가:

```ts
type: 'mention' | 'stale-issue' | 'overnight-briefing'
```

overnight-briefing 알림 필드 규칙:
- `comment`: `"overnight:N"` (N = 에러 건수, 파싱해서 표시)
- `issueTitle`: `"오버나이트 브리핑"` (벨 드롭다운 표시용)
- `issueNumber`: `0`
- `repo`: `""`
- `from`: ghLogin (실행한 본인)
- `to`: ghLogin (본인에게)

새 함수 추가:
```ts
createOvernightBriefingNotification(to: string, errorCount: number): Promise<void>
```
- Firestore에서 오늘 날짜(`createdAt` 기준) + `type === 'overnight-briefing'` + `to === ghLogin` 조회
- 이미 있으면 skip (중복 방지)
- 없으면 addDoc

### 2. 스케줄러 (`src/scheduler.ts`)

새 함수 추가:
```ts
startOvernightBriefingScheduler(ghLogin: string): () => void
```

로직:
```
매분 체크 (setInterval 60s):
  현재 시각이 08:00 이상 08:01 미만?
    AND localStorage['overnight_notif_last_run'] !== today?
      → runOvernightCheck(ghLogin)

앱 시작 시 즉시 1회:
  현재 시각 >= 08:00
  AND localStorage['overnight_notif_last_run'] !== today?
    → runOvernightCheck(ghLogin)
```

`runOvernightCheck`:
1. Slack fetchHistory (overnight range: 전날 18시 ~ 당일 09시)
2. 에러 건수 집계
3. `createOvernightBriefingNotification(ghLogin, count)` 호출
4. localStorage `overnight_notif_last_run` = today

### 3. 홈 배너 (`src/components/DashboardPage.tsx`)

`notifications` prop에서 overnight 알림 필터:
```ts
const overnightNotif = notifications.find(
  n => n.type === 'overnight-briefing' && !n.read
);
```

있으면 main-header 아래에 배너 렌더:
```
🌙 오버나이트 브리핑 — N건 에러 발생   [확인하기 →]  [✕]
```

에러 건수 파싱: `parseInt(n.comment.replace('overnight:', ''))`.

이벤트:
- "확인하기" → `onNavigate('daily-report')` + `markAsRead(n.id)`
- "✕" → `markAsRead(n.id)`

### 4. 알림 벨 (`src/components/NotificationBell.tsx`)

기존 드롭다운 아이템에서 `overnight-briefing` 타입 처리:
- `issueTitle`/`issueNumber` 대신 `"🌙 오버나이트 브리핑"` 표시
- `comment`에서 건수 파싱해 "N건 에러 발생" 표시
- 클릭 시 read 처리 (네비게이션은 배너에서 담당)

### 5. 스케줄러 시작 (`src/App.tsx`)

`ghLogin` useEffect에 추가:
```ts
useEffect(() => {
  if (!ghLogin) return;
  const unsub = subscribeNotifications(ghLogin, setNotifications);
  const stopOvernightScheduler = startOvernightBriefingScheduler(ghLogin);
  return () => {
    unsub();
    stopOvernightScheduler();
  };
}, [ghLogin]);
```

## 파일 변경 목록

| 파일 | 변경 |
|------|------|
| `src/slack.ts` | `getOvernightRange` 함수 추출 및 export (DailyReportPage에서 이동) |
| `src/notifications.ts` | `overnight-briefing` 타입 추가, `createOvernightBriefingNotification` 함수 추가 |
| `src/scheduler.ts` | `startOvernightBriefingScheduler` 함수 추가 |
| `src/components/DailyReportPage.tsx` | `getOvernightRange`를 `slack.ts`에서 import로 교체 |
| `src/components/DashboardPage.tsx` | 오버나이트 배너 렌더링 추가 |
| `src/components/NotificationBell.tsx` | `overnight-briefing` 타입 표시 처리 |
| `src/App.tsx` | `startOvernightBriefingScheduler` 호출 추가 |

## 중복 방지 전략

- localStorage: 당일 실행 여부 (스케줄러 레벨) — `overnight_notif_last_run` = `YYYY-MM-DD`
- Firestore: `createdAt` 필드가 오늘 날짜 prefix(`YYYY-MM-DD`)로 시작하는 overnight-briefing 알림 존재 여부로 체크
  - 복합 인덱스 없이 `where('type','==','overnight-briefing') + where('to','==',ghLogin)` 후 JS단에서 날짜 필터로 단순화
- 두 레이어로 중복 알림 생성 방지

## 엣지 케이스

- Slack 미설정 시: `fetchHistory` 에러 → `runOvernightCheck`에서 catch하고 skip
- ghLogin 없을 시: 스케줄러 시작 안 됨 (`if (!ghLogin) return`)
- 에러 0건: "0건 에러 발생" 알림 생성 (정상 — 오히려 좋은 소식)
