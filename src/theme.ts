export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const KEY = 'teamap_theme';
const listeners = new Set<(t: ResolvedTheme) => void>();

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY);
  return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  applyTheme();
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme = getTheme()): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export function applyTheme() {
  const resolved = resolveTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  listeners.forEach((cb) => cb(resolved));
}

export function subscribeTheme(cb: (t: ResolvedTheme) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function initTheme() {
  applyTheme();
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getTheme() === 'system') applyTheme();
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else mq.addListener(handler);
}
