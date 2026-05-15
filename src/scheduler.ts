import { fetchAllIssues, fetchMyLogin, getToken } from './github';
import { createStaleIssueNotifications, createOvernightBriefingNotification } from './notifications';
import { fetchHistory, parseError, getOvernightRange, getSlackToken, getSlackChannel } from './slack';

const STALE_DAYS = 14;
const STORAGE_KEY = 'stale_notif_last_run';

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function runStaleCheck() {
  if (!getToken()) return;

  const lastRun = localStorage.getItem(STORAGE_KEY);
  if (lastRun === todayStr()) return;

  try {
    const [issues, myLogin] = await Promise.all([fetchAllIssues(), fetchMyLogin()]);
    const stale = issues.filter((i) => i.state === 'open' && daysSince(i.createdAt) >= STALE_DAYS);
    if (stale.length === 0) return;

    const targets = stale
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
    localStorage.setItem(STORAGE_KEY, todayStr());
  } catch {
    //
  }
}

export function startStaleIssueScheduler() {
  const check = () => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() < 1) {
      runStaleCheck();
    }
  };

  // check on startup too (in case app was closed at 8 AM)
  const lastRun = localStorage.getItem(STORAGE_KEY);
  if (lastRun !== todayStr() && new Date().getHours() >= 8) {
    runStaleCheck();
  }

  return setInterval(check, 60_000);
}

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
