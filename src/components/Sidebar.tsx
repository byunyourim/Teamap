import { useState, type LucideIcon } from 'react';
import {
  ChevronRight,
  Calendar,
  User,
  Settings,
  ClipboardList,
  Users,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Bell,
  Palette,
  UserCircle,
  LayoutDashboard,
  GitPullRequest,
  BarChart3,
  Wallet,
  Siren,
  Rocket,
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  items: MenuItem[];
}

const sections: Section[] = [
  {
    id: 'schedule',
    title: '일정',
    icon: Calendar,
    items: [
      { id: 'calendar', label: '캘린더', icon: Calendar },
    ],
  },
  {
    id: 'work',
    title: '업무',
    icon: ClipboardList,
    items: [
      { id: 'tasks', label: '이슈', icon: ClipboardList },
      { id: 'code-review', label: 'PR', icon: GitPullRequest },
      { id: 'weekly-report', label: '주간 리포트', icon: BarChart3 },
    ],
  },
  {
    id: 'ops',
    title: '운영',
    icon: Settings,
    items: [
      { id: 'error-logs', label: '에러 로그', icon: AlertCircle },
      { id: 'incidents', label: '인시던트', icon: Siren },
      { id: 'deployments', label: '배포 트래킹', icon: Rocket },
      { id: 'onchain', label: '온체인 모니터링', icon: Wallet },
      { id: 'service-mgmt', label: '서비스 관리', icon: RefreshCw },
    ],
  },
  {
    id: 'settings',
    title: '설정',
    icon: Settings,
    items: [
      { id: 'settings-account', label: '계정', icon: UserCircle },
      { id: 'settings-notifications', label: '알림', icon: Bell },
      { id: 'settings-appearance', label: '테마', icon: Palette },
    ],
  },
];

interface Props {
  activeItem: string;
  onSelect: (id: string) => void;
}

export default function Sidebar({ activeItem, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    schedule: true,
    work: true,
    ops: true,
    settings: true,
  });

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">T</div>
        <span className="sidebar-title">Teamap</span>
      </div>
      <nav className="sidebar-nav">
      <ul className="sidebar-list">
        <li
          className={`sidebar-item ${activeItem === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelect('dashboard')}
        >
          <LayoutDashboard size={16} className="sidebar-item-icon" />
          홈
        </li>
      </ul>
      {sections.map((section) => (
        <div key={section.id} className="sidebar-section">
          <button className="sidebar-section-header" onClick={() => toggle(section.id)}>
            <ChevronRight
              size={14}
              className={`sidebar-chevron ${expanded[section.id] ? 'open' : ''}`}
            />
            <section.icon size={14} />
            {section.title}
          </button>
          {expanded[section.id] && (
            <ul className="sidebar-list">
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className={`sidebar-item ${activeItem === item.id ? 'active' : ''}`}
                  onClick={() => onSelect(item.id)}
                >
                  <item.icon size={16} className="sidebar-item-icon" />
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      </nav>
    </aside>
  );
}
