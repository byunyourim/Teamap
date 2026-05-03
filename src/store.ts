const USER_KEY = 'teamap_username';
const REPOS_KEY = 'teamap_assigned_repos';
const SERVICES_KEY = 'teamap_assigned_services';
const SERVICE_CONFIGS_KEY = 'teamap_service_configs';
const SERVICE_AUDIT_KEY = 'teamap_service_audit';
const CONTRACTS_KEY = 'teamap_assigned_contracts';
const WALLETS_KEY = 'teamap_assigned_wallets';
const WALLET_GAS_THRESHOLD_KEY = 'teamap_wallet_gas_threshold';

export interface ChainAddress {
  chain: string;
  address: string;
  label?: string;
}

export function getUsername(): string {
  return localStorage.getItem(USER_KEY) ?? '';
}

export function setUsername(name: string) {
  localStorage.setItem(USER_KEY, name);
}

export function getAssignedRepos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(REPOS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function setAssignedRepos(repos: string[]) {
  localStorage.setItem(REPOS_KEY, JSON.stringify(repos));
}

export function getAssignedServices(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SERVICES_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function setAssignedServices(services: string[]) {
  localStorage.setItem(SERVICES_KEY, JSON.stringify(services));
}

function readChainAddresses(key: string): ChainAddress[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is ChainAddress =>
        x && typeof x.chain === 'string' && typeof x.address === 'string'
      )
      .map((x) => ({ chain: x.chain, address: x.address, label: x.label }));
  } catch {
    return [];
  }
}

export function getAssignedContracts(): ChainAddress[] {
  return readChainAddresses(CONTRACTS_KEY);
}

export function setAssignedContracts(items: ChainAddress[]) {
  localStorage.setItem(CONTRACTS_KEY, JSON.stringify(items));
}

export function getAssignedWallets(): ChainAddress[] {
  return readChainAddresses(WALLETS_KEY);
}

export function setAssignedWallets(items: ChainAddress[]) {
  localStorage.setItem(WALLETS_KEY, JSON.stringify(items));
}

/* ─── 서비스 관리 (배치) 설정 ─── */

export interface ServiceConfig {
  cron?: string;       // 예: "0 */5 * * *"
  description?: string;
}

export type ServiceConfigs = Record<string, ServiceConfig>;

export function getServiceConfigs(): ServiceConfigs {
  try {
    const v = JSON.parse(localStorage.getItem(SERVICE_CONFIGS_KEY) ?? '{}');
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}

export function setServiceConfigs(configs: ServiceConfigs) {
  localStorage.setItem(SERVICE_CONFIGS_KEY, JSON.stringify(configs));
}

/* ─── 감사 로그 ─── */

export interface AuditEntry {
  id: string;
  ts: number;
  user: string;
  action: string;
  target: string;
  detail?: string;
}

export function getAuditLog(): AuditEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(SERVICE_AUDIT_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'ts'>): AuditEntry {
  const full: AuditEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
  };
  const log = getAuditLog();
  log.unshift(full);
  if (log.length > 200) log.length = 200;
  localStorage.setItem(SERVICE_AUDIT_KEY, JSON.stringify(log));
  return full;
}

/* ─── 가스비 임계값 ─── */

export function getWalletGasThreshold(): number {
  const v = Number(localStorage.getItem(WALLET_GAS_THRESHOLD_KEY));
  return isFinite(v) && v > 0 ? v : 0.1;
}

export function setWalletGasThreshold(v: number) {
  localStorage.setItem(WALLET_GAS_THRESHOLD_KEY, String(v));
}

/* ─── 인시던트 관리 ─── */

const INCIDENTS_KEY = 'teamap_incidents';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'sev1' | 'sev2' | 'sev3';

export interface IncidentTimelineEntry {
  ts: number;
  type: 'note' | 'status' | 'action' | 'error' | 'deploy';
  user: string;
  message: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: number;
  resolvedAt?: number;
  affectedServices: string[];
  affectedWallets: string[];
  affectedContracts: string[];
  timeline: IncidentTimelineEntry[];
  postmortem?: string;
  sourceErrorTs?: string;  // Slack 에러 메시지 ts (있으면)
}

export function getIncidents(): Incident[] {
  try {
    const v = JSON.parse(localStorage.getItem(INCIDENTS_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function setIncidents(items: Incident[]) {
  localStorage.setItem(INCIDENTS_KEY, JSON.stringify(items));
}

export function upsertIncident(incident: Incident): Incident[] {
  const list = getIncidents();
  const idx = list.findIndex((i) => i.id === incident.id);
  if (idx >= 0) list[idx] = incident;
  else list.unshift(incident);
  setIncidents(list);
  return list;
}

export function newIncidentId(): string {
  return `INC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── 배포 트래킹 ─── */

const DEPLOYMENTS_KEY = 'teamap_deployments';

export type DeploymentStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back';

export interface Deployment {
  id: string;
  service: string;
  version: string;          // 태그 / 커밋 SHA / PR 번호
  prNumber?: number;
  prTitle?: string;
  repo?: string;
  environment: 'dev' | 'stage' | 'prod';
  status: DeploymentStatus;
  startedAt: number;
  finishedAt?: number;
  deployer: string;
  notes?: string;
}

export function getDeployments(): Deployment[] {
  try {
    const v = JSON.parse(localStorage.getItem(DEPLOYMENTS_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function setDeployments(items: Deployment[]) {
  localStorage.setItem(DEPLOYMENTS_KEY, JSON.stringify(items));
}

export function upsertDeployment(d: Deployment): Deployment[] {
  const list = getDeployments();
  const idx = list.findIndex((x) => x.id === d.id);
  if (idx >= 0) list[idx] = d;
  else list.unshift(d);
  // 최신 200개만 유지
  list.sort((a, b) => b.startedAt - a.startedAt);
  if (list.length > 200) list.length = 200;
  setDeployments(list);
  return list;
}

export function newDeploymentId(): string {
  return `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
