import { fetchAllIssues, fetchMyLogin, getToken } from './github';
import { createStaleIssueNotifications } from './notifications';

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
