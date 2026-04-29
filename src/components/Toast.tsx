import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { type AppNotification, markAsRead } from '../notifications';

interface ToastItem {
  notif: AppNotification;
  visible: boolean;
}

interface Props {
  notifications: AppNotification[];
  onNavigate?: (repo: string, issueNumber: number) => void;
}

export default function Toast({ notifications, onNavigate }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [seen] = useState(new Set<string>());

  useEffect(() => {
    const newOnes = notifications.filter((n) => !seen.has(n.id));
    if (newOnes.length === 0) return;

    newOnes.forEach((n) => {
      seen.add(n.id);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`@${n.from} 님이 멘션했습니다`, {
          body: `${n.issueTitle} #${n.issueNumber}\n${n.comment}`,
        });
      }
    });

    setToasts((prev) => [
      ...prev,
      ...newOnes.map((n) => ({ notif: n, visible: true })),
    ]);
  }, [notifications]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        updated[0] = { ...updated[0], visible: false };
        return updated;
      });
      setTimeout(() => {
        setToasts((prev) => prev.slice(1));
      }, 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toasts.length]);

  const handleDismiss = (idx: number) => {
    markAsRead(toasts[idx].notif.id);
    setToasts((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], visible: false };
      return updated;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((_, i) => i !== idx));
    }, 300);
  };

  const handleClick = (idx: number) => {
    const t = toasts[idx];
    markAsRead(t.notif.id);
    onNavigate?.(t.notif.repo, t.notif.issueNumber);
    handleDismiss(idx);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.slice(0, 3).map((t, idx) => (
        <div
          key={t.notif.id}
          className={`toast-item ${t.visible ? 'toast-enter' : 'toast-exit'}`}
        >
          <div className="toast-body" onClick={() => handleClick(idx)}>
            <div className="toast-title">@{t.notif.from} 님이 멘션했습니다</div>
            <div className="toast-issue">{t.notif.issueTitle} #{t.notif.issueNumber}</div>
            <div className="toast-comment">{t.notif.comment}</div>
          </div>
          <button className="toast-close" onClick={() => handleDismiss(idx)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
