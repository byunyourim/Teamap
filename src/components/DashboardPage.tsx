import { useState, useEffect } from 'react';
import { Loader2, Check, Plus, X, ListChecks, Trophy, Users, Bell, Calendar, MessageSquare } from 'lucide-react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchAllIssues, fetchMyLogin, fetchUserNames, getToken, type GitHubIssue } from '../github';
import { markAsRead, type AppNotification } from '../notifications';
import { getUsername, getAssignedRepos } from '../store';
import MultiSelect from './MultiSelect';

function getWeekRange(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function getWeekKey() {
  const { start } = getWeekRange(0);
  return `todo_${start.toISOString().slice(0, 10)}`;
}

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  issueId?: number;
}

function loadTodos(): TodoItem[] {
  try {
    const raw = localStorage.getItem(getWeekKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTodos(items: TodoItem[]) {
  localStorage.setItem(getWeekKey(), JSON.stringify(items));
}

interface CalEvent {
  id: string;
  date: string;
  title: string;
  author: string;
  color: string;
}

interface Props {
  onNavigate: (id: string) => void;
  bell: React.ReactNode;
  notifications: AppNotification[];
}

export default function DashboardPage({ onNavigate, bell, notifications }: Props) {
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [ghLogin, setGhLogin] = useState('');
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);
  const [newTodo, setNewTodo] = useState('');
  const [synced, setSynced] = useState(false);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [repoFilter, setRepoFilter] = useState<string[]>(getAssignedRepos());

  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsub = onSnapshot(q, (snap) => {
      setCalEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalEvent)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    (async () => {
      try {
        const [data, login] = await Promise.all([fetchAllIssues(), fetchMyLogin()]);
        setIssues(data);
        setGhLogin(login);
        const logins = [...new Set(data.flatMap((i) => [i.author, i.assignee].filter(Boolean) as string[]))];
        const names = await fetchUserNames(logins);
        setNameMap(new Map(names));
      } catch {
        //
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (synced || !ghLogin || issues.length === 0) return;
    setSynced(true);
    const myOpen = issues.filter((i) => i.state === 'open' && (i.assignee === ghLogin || i.author === ghLogin));
    setTodos((prev) => {
      const existing = new Set(prev.filter((t) => t.issueId).map((t) => t.issueId));
      const newItems = myOpen
        .filter((i) => !existing.has(i.id))
        .map((i) => ({ id: `iss-${i.id}`, text: i.title, done: false, issueId: i.id }));
      if (newItems.length === 0) return prev;
      const merged = [...prev, ...newItems];
      saveTodos(merged);
      return merged;
    });
  }, [ghLogin, issues, synced]);

  const updateTodos = (next: TodoItem[]) => { setTodos(next); saveTodos(next); };
  const toggleTodo = (id: string) => updateTodos(todos.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const removeTodo = (id: string) => updateTodos(todos.filter((t) => t.id !== id));
  const addTodo = () => {
    if (!newTodo.trim()) return;
    updateTodos([...todos, { id: `custom-${Date.now()}`, text: newTodo.trim(), done: false }]);
    setNewTodo('');
  };

  const thisWeek = getWeekRange(0);
  const lastWeek = getWeekRange(-1);
  const inRange = (iso: string, s: Date, e: Date) => { const d = new Date(iso); return d >= s && d <= e; };

  const scopedIssues = repoFilter.length > 0
    ? issues.filter((i) => repoFilter.includes(i.repo))
    : issues;
  const repoOptions = [...new Set(issues.map((i) => i.repo))].sort();

  const teamOpen = scopedIssues.filter((i) => i.state === 'open');
  const lastWeekMyClosed = scopedIssues.filter((i) =>
    i.state === 'closed' && (i.assignee === ghLogin || i.author === ghLogin) && inRange(i.createdAt, lastWeek.start, lastWeek.end)
  );

  const getName = (login: string) => (nameMap.get(login) ?? login).split('/')[0];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEvents = calEvents.filter((e) => e.date === todayStr);
  const unreadNotifs = notifications.filter((n) => !n.read);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '수고했어요';
  const greetEmoji = hour < 12 ? '\u2600\uFE0F' : hour < 18 ? '\uD83D\uDCAA' : '\uD83C\uDF19';
  const userName = getUsername();
  const undone = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const pct = todos.length > 0 ? Math.round((done.length / todos.length) * 100) : 0;

  if (loading) {
    return (
      <main className="main-content">
        <div className="main-header"><span>홈</span>{bell}</div>
        <div className="main-body"><Loader2 size={20} className="spinner" /></div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="main-header">
        <span>홈</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MultiSelect
            options={repoOptions}
            selected={repoFilter}
            onChange={setRepoFilter}
            placeholder="전체 레포"
          />
          {bell}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Greeting ── */}
        <div style={{ marginBottom: 4 }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {greetEmoji} {greeting}{userName ? `, ${userName}님` : ''}!
          </p>
          {pct === 100 && todos.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>{'\u2728'} 이번주 할 일을 모두 완료했어요!</p>
          )}
        </div>

        {/* ── Notifications + Schedule row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Notifications */}
          <div
            style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '16px 20px', cursor: 'pointer', transition: 'background 0.15s' }}
            onClick={() => onNavigate('settings-notifications')}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bell size={14} style={{ color: '#f472b6' }} />
                알림
                {unreadNotifs.length > 0 && (
                  <span style={{ fontSize: 10, background: '#f472b6', color: '#fff', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>{unreadNotifs.length}</span>
                )}
              </span>
            </div>
            {unreadNotifs.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>{'\uD83D\uDD14'} 새로운 알림이 없어요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unreadNotifs.slice(0, 3).map((n) => (
                  <div
                    key={n.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 6 }}
                  >
                    <MessageSquare size={13} style={{ color: '#f472b6', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#f472b6', fontWeight: 600 }}>{n.from}</span> 님이 멘션했어요
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.issueTitle}</p>
                    </div>
                  </div>
                ))}
                {unreadNotifs.length > 3 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 10px' }}>+{unreadNotifs.length - 3}개 더</span>
                )}
              </div>
            )}
          </div>

          {/* Today's schedule */}
          <div
            style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '16px 20px', cursor: 'pointer', transition: 'background 0.15s' }}
            onClick={() => onNavigate('calendar')}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} style={{ color: '#38bdf8' }} />
                오늘 일정
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{todayStr.slice(5).replace('-', '/')}</span>
            </div>
            {todayEvents.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>{'\uD83C\uDF3F'} 오늘은 일정이 없어요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {todayEvents.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-sidebar)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => onNavigate('calendar')}
                  >
                    <span style={{ width: 4, height: 20, borderRadius: 2, background: ev.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{ev.author}</span>
                  </div>
                ))}
                {todayEvents.length > 4 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 10px' }}>+{todayEvents.length - 4}개 더</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── My Week ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ListChecks size={14} style={{ color: 'var(--accent)' }} />
              이번주 할 일
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{done.length} / {todos.length}</span>
          </div>
            {/* Progress */}
            <div style={{ height: 3, background: 'var(--bg-card)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 2, width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {undone.map((t) => (
                <div
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <button
                    style={{ background: 'none', border: '1.5px solid var(--border-strong)', borderRadius: 4, width: 16, height: 16, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.15s' }}
                    onClick={() => toggleTodo(t.id)}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.text}>{t.text}</span>
                  {!t.issueId && (
                    <X size={12} style={{ color: 'var(--text-dim)', flexShrink: 0, cursor: 'pointer' }} onClick={() => removeTodo(t.id)} />
                  )}
                </div>
              ))}
              {done.map((t) => (
                <div
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6, opacity: 0.5, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div
                    style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                    onClick={() => toggleTodo(t.id)}
                  >
                    <Check size={10} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }} title={t.text}>{t.text}</span>
                  <X size={12} style={{ color: 'var(--text-dim)', flexShrink: 0, cursor: 'pointer' }} onClick={() => removeTodo(t.id)} />
                </div>
              ))}
              {/* Add */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                <Plus size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <input
                  style={{ flex: 1, background: 'transparent', color: 'var(--text-muted)', fontSize: 13, border: 'none', outline: 'none', fontFamily: 'inherit', padding: 0 }}
                  placeholder="할 일 추가..."
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                />
              </div>
            </div>
          </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'var(--bg-card)' }} />

        {/* ── Bottom row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Last week */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trophy size={14} style={{ color: '#f59e0b' }} />
                지난주 완료
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lastWeekMyClosed.length}건</span>
            </div>
            {lastWeekMyClosed.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{'\uD83C\uDF31'} 지난주 완료한 업무가 없어요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {lastWeekMyClosed.map((iss) => (
                  <div key={iss.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(52,211,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={10} style={{ color: 'var(--success)' }} />
                    </div>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={iss.title}>{iss.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{iss.repo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} style={{ color: '#a78bfa' }} />
                팀 이슈
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => onNavigate('tasks')}>{teamOpen.length}건</span>
            </div>
            {teamOpen.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{'\u2615'} 조용한 하루네요</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {teamOpen.slice(0, 7).map((iss) => (
                  <div key={iss.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', opacity: 0.5, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={iss.title}>{iss.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{getName(iss.assignee ?? iss.author)}</span>
                  </div>
                ))}
                {teamOpen.length > 7 && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 12px' }}>+{teamOpen.length - 7}개</span>
                )}
              </div>
            )}
          </div>
        </div>

        </div>
        </div>
    </main>
  );
}
