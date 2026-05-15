import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOvernightRange } from './slack';

describe('getOvernightRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('출근 전(08:30)에는 start=어젯밤 18시, end=지금', () => {
    // Use local time constructor to avoid timezone issues
    vi.setSystemTime(new Date(2026, 4, 15, 8, 30, 0)); // May 15, 08:30 local
    const { start, end } = getOvernightRange();
    expect(start.getDate()).toBe(14); // 전날 (May 14)
    expect(start.getHours()).toBe(18);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    // end = now (08:30)
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(8);
    expect(end.getMinutes()).toBe(30);
  });

  it('출근 후(10:00)에는 start=어젯밤 18시, end=오늘 09:00', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 10, 0, 0)); // May 15, 10:00 local
    const { start, end } = getOvernightRange();
    expect(start.getDate()).toBe(14); // 전날
    expect(start.getHours()).toBe(18);
    expect(start.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(15);
    expect(end.getHours()).toBe(9);
    expect(end.getMinutes()).toBe(0);
    expect(end.getSeconds()).toBe(0);
  });

  it('label은 오버나이트 (퇴근 후)를 반환한다', () => {
    vi.setSystemTime(new Date(2026, 4, 15, 10, 0, 0));
    const { label } = getOvernightRange();
    expect(label).toBe('오버나이트 (퇴근 후)');
  });
});
