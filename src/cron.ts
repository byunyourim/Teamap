import { CronExpressionParser } from 'cron-parser';

export interface CronInfo {
  ok: boolean;
  next?: Date;
  upcoming?: Date[];
  description?: string;
  error?: string;
}

export function parseCron(expr: string): CronInfo {
  if (!expr.trim()) return { ok: false };
  try {
    const it = CronExpressionParser.parse(expr, { tz: 'Asia/Seoul' });
    const next = it.next().toDate();
    const upcoming = [next];
    for (let i = 0; i < 4; i++) upcoming.push(it.next().toDate());
    return { ok: true, next, upcoming, description: humanize(expr) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid cron' };
  }
}

function humanize(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [m, h] = parts;
  if (m === '*' && h === '*') return '매분';
  if (m === '0' && h === '*') return '매시 정각';
  if (m === '0' && /^\d+$/.test(h)) return `매일 ${h}시 정각`;
  if (m.startsWith('*/')) return `${m.slice(2)}분 간격`;
  if (h.startsWith('*/')) return `${h.slice(2)}시간 간격`;
  return expr;
}

export function formatTimeUntil(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms < 0) return '예정 시각 지남';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}일 ${hr % 24}시간 후`;
  if (hr > 0) return `${hr}시간 ${min % 60}분 후`;
  if (min > 0) return `${min}분 ${sec % 60}초 후`;
  return `${sec}초 후`;
}
