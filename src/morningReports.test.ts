import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  isNewReport,
  getLastSeenCreatedAt,
  setLastSeenCreatedAt,
  formatNotificationTitle,
  formatNotificationBody,
  LAST_SEEN_KEY,
  type MorningBugReport,
} from './morningReports';

function makeReport(overrides: Partial<MorningBugReport> = {}): MorningBugReport {
  return {
    id: 'r1',
    reportDate: '2026-05-17',
    count: 10,
    analysis: {
      summary: '결제 배치 실패 다수 발생',
      incidents: [
        {
          title: '결제 배치 max retries',
          severity: 'P1',
          category: 'backend',
          rootCauseHypothesis: 'DB lock',
          affectedAreas: ['payment'],
          sourceMessageTs: ['1715900000.000100'],
          recommendedAction: '재시도 큐 분리',
        },
      ],
      noise: [],
    },
    rawMessages: [],
    createdAt: '2026-05-17T08:00:00.000Z',
    ...overrides,
  };
}

describe('isNewReport', () => {
  it('최초 구독 시점이면 항상 false', () => {
    expect(isNewReport(makeReport(), '', true)).toBe(false);
    expect(isNewReport(makeReport(), '2020-01-01', true)).toBe(false);
  });

  it('lastSeen 없으면 신규로 판정', () => {
    expect(isNewReport(makeReport(), '', false)).toBe(true);
  });

  it('lastSeen 이하 createdAt이면 false', () => {
    const r = makeReport({ createdAt: '2026-05-17T08:00:00.000Z' });
    expect(isNewReport(r, '2026-05-17T08:00:00.000Z', false)).toBe(false);
    expect(isNewReport(r, '2026-05-18T00:00:00.000Z', false)).toBe(false);
  });

  it('lastSeen 보다 큰 createdAt이면 true', () => {
    const r = makeReport({ createdAt: '2026-05-17T08:00:00.000Z' });
    expect(isNewReport(r, '2026-05-16T08:00:00.000Z', false)).toBe(true);
  });

  it('createdAt 빈 문자열이면 false (불완전 문서 방어)', () => {
    expect(isNewReport(makeReport({ createdAt: '' }), '', false)).toBe(false);
  });
});

// node 환경에서는 localStorage가 없으므로 최소 shim
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    } satisfies Storage;
  }
});

describe('localStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('초기에는 빈 문자열', () => {
    expect(getLastSeenCreatedAt()).toBe('');
  });

  it('set 후 get으로 동일 값 반환', () => {
    setLastSeenCreatedAt('2026-05-17T08:00:00.000Z');
    expect(getLastSeenCreatedAt()).toBe('2026-05-17T08:00:00.000Z');
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('2026-05-17T08:00:00.000Z');
  });

  it('빈 값은 저장하지 않음', () => {
    setLastSeenCreatedAt('2026-05-17T08:00:00.000Z');
    setLastSeenCreatedAt('');
    expect(getLastSeenCreatedAt()).toBe('2026-05-17T08:00:00.000Z');
  });
});

describe('알림 포맷팅', () => {
  it('제목에 reportDate 포함', () => {
    expect(formatNotificationTitle(makeReport({ reportDate: '2026-05-17' })))
      .toBe('🐛 아침 버그 리포트 (2026-05-17)');
  });

  it('본문은 summary 100자 + 인시던트 건수', () => {
    const r = makeReport();
    const body = formatNotificationBody(r);
    expect(body).toContain('결제 배치 실패 다수 발생');
    expect(body).toContain('인시던트 1건');
  });

  it('summary가 100자 초과면 자르고 말줄임표 추가', () => {
    const long = 'a'.repeat(150);
    const r = makeReport({ analysis: { summary: long, incidents: [], noise: [] } });
    const body = formatNotificationBody(r);
    expect(body.startsWith('a'.repeat(100) + '…')).toBe(true);
    expect(body).toContain('인시던트 0건');
  });
});
