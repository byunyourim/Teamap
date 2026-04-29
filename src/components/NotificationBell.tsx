import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { type AppNotification, markAsRead } from '../notifications';

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

interface Props {
  notifications: AppNotification[];
}

export default function NotificationBell({ notifications }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="notif-bell-wrap">
      <button className="notif-bell-btn" onClick={() => setOpen(!open)}>
        <Bell size={18} />
        {unread.length > 0 && (
          <span className="notif-bell-badge">{unread.length > 9 ? '9+' : unread.length}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span>알림</span>
            <span className="notif-dropdown-count">{unread.length}건</span>
          </div>
          <div className="notif-dropdown-list">
            {notifications.length === 0 ? (
              <p className="notif-dropdown-empty">알림이 없습니다.</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <div
                  key={n.id}
                  className={`notif-dropdown-item ${n.read ? '' : 'notif-unread'}`}
                  onClick={() => { if (!n.read) markAsRead(n.id); }}
                >
                  <div className="notif-item-top">
                    <span className="notif-item-from">@{n.from}</span>
                    <span className="notif-item-date">{formatDate(n.createdAt)}</span>
                  </div>
                  <div className="notif-item-issue">{n.issueTitle} #{n.issueNumber}</div>
                  <div className="notif-item-comment">{n.comment}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
