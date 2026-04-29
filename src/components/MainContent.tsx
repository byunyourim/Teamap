import TasksPage from './TasksPage';
import CalendarPage from './CalendarPage';
import TeamStatusPage from './TeamStatusPage';
import DashboardPage from './DashboardPage';
import CodeReviewPage from './CodeReviewPage';
import WeeklyReportPage from './WeeklyReportPage';
import SettingsAccountPage from './SettingsAccountPage';
import NotificationBell from './NotificationBell';
import { type AppNotification } from '../notifications';

const placeholders: Record<string, { title: string; description: string }> = {
  'error-logs': { title: '에러 로그', description: '에러 로그를 분석하고 조회합니다.' },
  'service-mgmt': { title: '서비스 관리', description: '서비스 재기동 등 운영 작업을 수행합니다.' },
  'bug-tracking': { title: '버그 트래킹', description: '버그 지점을 파악하고 추적합니다.' },
  'settings-notifications': { title: '알림', description: '알림 설정을 관리합니다.' },
  'settings-appearance': { title: '테마', description: '테마 및 외관을 설정합니다.' },
};

interface Props {
  activeItem: string;
  onNavigate: (id: string) => void;
  notifications: AppNotification[];
}

export default function MainContent({ activeItem, onNavigate, notifications }: Props) {
  const bell = <NotificationBell notifications={notifications} />;

  if (activeItem === 'dashboard') {
    return <DashboardPage onNavigate={onNavigate} bell={bell} notifications={notifications} />;
  }
  if (activeItem === 'calendar') {
    return <CalendarPage bell={bell} />;
  }
  if (activeItem === 'settings-account') {
    return <SettingsAccountPage bell={bell} />;
  }
  if (activeItem === 'tasks') {
    return <TasksPage bell={bell} />;
  }
  if (activeItem === 'team-status') {
    return <TeamStatusPage bell={bell} />;
  }
  if (activeItem === 'code-review') {
    return <CodeReviewPage bell={bell} />;
  }
  if (activeItem === 'weekly-report') {
    return <WeeklyReportPage bell={bell} />;
  }

  const page = placeholders[activeItem];
  if (!page) return null;

  return (
    <main className="main-content">
      <div className="main-header">
        <span>{page.title}</span>
        {bell}
      </div>
      <div className="main-body">{page.description}</div>
    </main>
  );
}
