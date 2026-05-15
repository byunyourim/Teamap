import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, getDocs, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export interface AppNotification {
  id: string;
  to: string;
  from: string;
  type: 'mention' | 'stale-issue' | 'overnight-briefing';
  issueTitle: string;
  repo: string;
  issueNumber: number;
  comment: string;
  read: boolean;
  createdAt: string;
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@(\w[\w-]*)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

export async function createMentionNotifications(
  mentions: string[],
  from: string,
  issueTitle: string,
  repo: string,
  issueNumber: number,
  comment: string,
) {
  const trimmed = comment.length > 100 ? comment.slice(0, 100) + '...' : comment;
  await Promise.all(
    mentions
      .map((to) =>
        addDoc(collection(db, 'notifications'), {
          to,
          from,
          type: 'mention',
          issueTitle,
          repo,
          issueNumber,
          comment: trimmed,
          read: false,
          createdAt: new Date().toISOString(),
        })
      )
  );
}

export function subscribeNotifications(
  ghLogin: string,
  callback: (notifs: AppNotification[]) => void,
) {
  const q = query(
    collection(db, 'notifications'),
    where('to', '==', ghLogin),
  );
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
    data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    callback(data);
  });
}

export async function createStaleIssueNotifications(
  issues: { to: string; from: string; issueTitle: string; repo: string; issueNumber: number; days: number }[],
) {
  await Promise.all(
    issues.map(({ to, from, issueTitle, repo, issueNumber, days }) =>
      addDoc(collection(db, 'notifications'), {
        to,
        from,
        type: 'stale-issue',
        issueTitle,
        repo,
        issueNumber,
        comment: `${days}일째 미처리 상태입니다`,
        read: false,
        createdAt: new Date().toISOString(),
      })
    )
  );
}

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

export async function markAsRead(notifId: string) {
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
}
