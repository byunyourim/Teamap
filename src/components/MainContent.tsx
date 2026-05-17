import TasksPage from './TasksPage';
import CalendarPage from './CalendarPage';
import TeamStatusPage from './TeamStatusPage';
import DashboardPage from './DashboardPage';
import CodeReviewPage from './CodeReviewPage';
import WeeklyReportPage from './WeeklyReportPage';
import DailyReportPage from './DailyReportPage';
import MorningReportPage from './MorningReportPage';
import SettingsAccountPage from './SettingsAccountPage';
import SettingsAppearancePage from './SettingsAppearancePage';
import ServiceMgmtPage from './ServiceMgmtPage';
import ErrorLogPage from './ErrorLogPage';
import OnchainMonitorPage from './OnchainMonitorPage';
import IncidentsPage from './IncidentsPage';
import DeploymentsPage from './DeploymentsPage';
import NotificationBell from './NotificationBell';
import BackButton from './BackButton';
import { type AppNotification } from '../notifications';

const placeholders: Record<string, { title: string; description: string }> = {
  'settings-notifications': { title: '알림', description: '알림 설정을 관리합니다.' },
};

interface Props {
  activeItem: string;
  onNavigate: (id: string) => void;
  onNavigateWith: (id: string, params: Record<string, string>) => void;
  navParams: Record<string, string>;
  onBack?: () => void;
  notifications: AppNotification[];
}

export default function MainContent({ activeItem, onNavigate, onNavigateWith, navParams, onBack, notifications }: Props) {
  const bell = <NotificationBell notifications={notifications} />;
  const back = onBack ? <BackButton onClick={onBack} /> : null;

  if (activeItem === 'dashboard') {
    return <DashboardPage onNavigate={onNavigate} bell={bell} notifications={notifications} />;
  }
  if (activeItem === 'calendar') {
    return <CalendarPage bell={bell} back={back} />;
  }
  if (activeItem === 'settings-account') {
    return <SettingsAccountPage bell={bell} back={back} />;
  }
  if (activeItem === 'tasks') {
    return <TasksPage bell={bell} back={back} />;
  }
  if (activeItem === 'team-status') {
    return <TeamStatusPage bell={bell} />;
  }
  if (activeItem === 'code-review') {
    return <CodeReviewPage bell={bell} back={back} />;
  }
  if (activeItem === 'weekly-report') {
    return <WeeklyReportPage bell={bell} back={back} />;
  }
  if (activeItem === 'service-mgmt') {
    return <ServiceMgmtPage bell={bell} back={back} />;
  }
  if (activeItem === 'daily-report') {
    return <DailyReportPage bell={bell} back={back} />;
  }
  if (activeItem === 'morning-report') {
    return <MorningReportPage bell={bell} back={back} />;
  }
  if (activeItem === 'error-logs') {
    return <ErrorLogPage bell={bell} back={back} onNavigateWith={onNavigateWith} />;
  }
  if (activeItem === 'onchain') {
    return <OnchainMonitorPage bell={bell} back={back} initialChain={navParams.chain} initialHash={navParams.txHash} />;
  }
  if (activeItem === 'incidents') {
    return <IncidentsPage bell={bell} back={back} />;
  }
  if (activeItem === 'deployments') {
    return <DeploymentsPage bell={bell} back={back} />;
  }
  if (activeItem === 'settings-appearance') {
    return <SettingsAppearancePage bell={bell} back={back} />;
  }

  const page = placeholders[activeItem];
  if (!page) return null;

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {back}
          {page.title}
        </span>
        {bell}
      </div>
      <div className="main-body">{page.description}</div>
    </main>
  );
}
