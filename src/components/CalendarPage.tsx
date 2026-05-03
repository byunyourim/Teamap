import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2 } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase';
import { getUsername } from '../store';

interface CalEvent {
  id: string;
  date: string;
  title: string;
  author: string;
  color: string;
}

interface EventCategory {
  label: string;
  color: string;
}

const CATEGORIES: Record<string, EventCategory> = {
  leave: { label: '연차', color: '#22c55e' },
  outside: { label: '외근', color: '#f59e0b' },
  etc: { label: '기타', color: '#64748b' },
};

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const days: { date: number | null; key: string }[] = [];

  for (let i = 0; i < firstDay; i++) {
    days.push({ date: null, key: `e${i}` });
  }
  for (let i = 1; i <= lastDate; i++) {
    days.push({ date: i, key: `c${i}` });
  }
  return days;
}

function toDateStr(year: number, month: number, date: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

export default function CalendarPage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);

  // 추가 모달
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('leave');

  // 상세/수정 모달
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('meeting');

  const currentUser = getUsername();

  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalEvent));
      setEvents(data);
    });
    return unsub;
  }, []);

  const days = getMonthDays(year, month);
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowAddForm(true);
    setNewTitle('');
    setNewCategory('leave');
  };

  const addEvent = async () => {
    if (!newTitle.trim()) return;
    await addDoc(collection(db, 'events'), {
      date: selectedDate,
      title: newTitle.trim(),
      author: currentUser || '익명',
      color: CATEGORIES[newCategory].color,
      category: newCategory,
    });
    setShowAddForm(false);
  };

  const handleEventClick = (ev: CalEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(ev);
    setEditing(false);
    setEditTitle(ev.title);
    const cat = Object.entries(CATEGORIES).find(([, v]) => v.color === ev.color)?.[0] ?? 'leave';
    setEditCategory(cat);
  };

  const isOwner = selectedEvent?.author === currentUser && currentUser !== '';

  const handleEdit = async () => {
    if (!selectedEvent || !editTitle.trim()) return;
    await updateDoc(doc(db, 'events', selectedEvent.id), {
      title: editTitle.trim(),
      color: CATEGORIES[editCategory].color,
      category: editCategory,
    });
    setSelectedEvent(null);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!selectedEvent) return;
    await deleteDoc(doc(db, 'events', selectedEvent.id));
    setSelectedEvent(null);
  };

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}캘린더</span>
        {bell}
      </div>

      <div className="cal-toolbar">
        <button className="cal-nav-btn" onClick={prevMonth}><ChevronLeft size={18} /></button>
        <span className="cal-month-label">{year}년 {month + 1}월</span>
        <button className="cal-nav-btn" onClick={nextMonth}><ChevronRight size={18} /></button>
      </div>

      <div className="cal-grid">
        {DAYS.map((d) => (
          <div key={d} className="cal-day-header">{d}</div>
        ))}
        {days.map((day) => {
          if (day.date === null) {
            return <div key={day.key} className="cal-cell cal-cell-empty" />;
          }

          const dateStr = toDateStr(year, month, day.date);
          const dayEvents = events.filter((e) => e.date === dateStr);
          const isToday = dateStr === todayStr;

          return (
            <div
              key={day.key}
              className={`cal-cell ${isToday ? 'cal-cell-today' : ''}`}
              onClick={() => handleDayClick(dateStr)}
            >
              <span className={`cal-date ${isToday ? 'cal-date-today' : ''}`}>{day.date}</span>
              <div className="cal-events">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className="cal-event"
                    style={{ borderLeftColor: ev.color }}
                    onClick={(e) => handleEventClick(ev, e)}
                  >
                    <span className="cal-event-title">{ev.title}</span>
                    <span className="cal-event-author">{ev.author}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <span className="cal-more">+{dayEvents.length - 3}개</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 추가 모달 */}
      {showAddForm && (
        <div className="cal-modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-header">
              <span>{selectedDate} 일정 추가</span>
              <button className="cal-modal-close" onClick={() => setShowAddForm(false)}><X size={16} /></button>
            </div>
            <select
              className="cal-modal-select"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            >
              {Object.entries(CATEGORIES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              className="cal-modal-input"
              placeholder="일정 제목"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEvent()}
              autoFocus
            />
            <button className="cal-modal-btn" onClick={addEvent}>
              <Plus size={14} />
              추가
            </button>
          </div>
        </div>
      )}

      {/* 상세/수정 모달 */}
      {selectedEvent && (
        <div className="cal-modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-header">
              <span>{selectedEvent.date}</span>
              <button className="cal-modal-close" onClick={() => setSelectedEvent(null)}><X size={16} /></button>
            </div>

            {editing ? (
              <>
                <select
                  className="cal-modal-select"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  {Object.entries(CATEGORIES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  className="cal-modal-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                  autoFocus
                />
                <div className="cal-modal-actions">
                  <button className="cal-modal-btn" onClick={handleEdit}>저장</button>
                  <button className="cal-modal-btn-secondary" onClick={() => setEditing(false)}>취소</button>
                </div>
              </>
            ) : (
              <>
                <div className="cal-detail-title">
                  <span className="cal-detail-dot" style={{ background: selectedEvent.color }} />
                  {selectedEvent.title}
                </div>
                <div className="cal-detail-author">작성자: {selectedEvent.author}</div>
                {isOwner && (
                  <div className="cal-modal-actions">
                    <button className="cal-modal-btn-icon" onClick={() => setEditing(true)}>
                      <Pencil size={14} /> 수정
                    </button>
                    <button className="cal-modal-btn-danger" onClick={handleDelete}>
                      <Trash2 size={14} /> 삭제
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
