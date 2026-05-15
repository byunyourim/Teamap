import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Toast from './components/Toast';
import { subscribeNotifications, type AppNotification } from './notifications';
import { startStaleIssueScheduler, startOvernightBriefingScheduler } from './scheduler';
import { getToken, fetchMyLogin } from './github';
import './App.css';

function App() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [history, setHistory] = useState<string[]>([]);
  const [navParams, setNavParams] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [ghLogin, setGhLogin] = useState('');

  const navigate = (id: string) => {
    setHistory((prev) => [...prev, activeItem]);
    setActiveItem(id);
  };

  const navigateWith = (id: string, params: Record<string, string>) => {
    setNavParams(params);
    navigate(id);
  };

  const select = (id: string) => {
    setHistory([]);
    setNavParams({});
    setActiveItem(id);
  };

  const goBack = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setActiveItem(last);
      return prev.slice(0, -1);
    });
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    (async () => {
      try {
        const login = await fetchMyLogin();
        setGhLogin(login);
      } catch {
        // token invalid
      }
    })();
  }, []);

  useEffect(() => {
    if (!ghLogin) return;
    const unsub = subscribeNotifications(ghLogin, setNotifications);
    const stopOvernight = startOvernightBriefingScheduler(ghLogin);
    return () => {
      unsub();
      stopOvernight();
    };
  }, [ghLogin]);

  useEffect(() => {
    const timer = startStaleIssueScheduler();
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app">
      <Sidebar activeItem={activeItem} onSelect={select} />
      <MainContent
        activeItem={activeItem}
        onNavigate={navigate}
        onNavigateWith={navigateWith}
        navParams={navParams}
        onBack={history.length > 0 ? goBack : undefined}
        notifications={notifications}
      />
      <Toast notifications={notifications} />
    </div>
  );
}

export default App;
