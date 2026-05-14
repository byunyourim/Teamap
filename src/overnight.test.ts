import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOvernightRange } from './slack';

describe('getOvernightRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('출근 전(08:00)에는 어젯밤 18시 ~ 지금까지', () => {
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
