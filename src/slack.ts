const TOKEN_KEY = 'slack_bot_token';
const CHANNEL_KEY = 'slack_error_channel';

export function getSlackToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setSlackToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getSlackChannel(): string {
  return localStorage.getItem(CHANNEL_KEY) ?? '';
}

export function setSlackChannel(id: string) {
  localStorage.setItem(CHANNEL_KEY, id);
}

interface ElectronBridge {
  slack: {
    fetchHistory: (params: { token: string; channel: string; oldest?: string; limit?: number }) => Promise<SlackHistoryResponse>;
    fetchReplies: (params: { token: string; channel: string; ts: string }) => Promise<SlackHistoryResponse>;
    listChannels: (params: { token: string }) => Promise<SlackChannelsResponse>;
    channelInfo: (params: { token: string; channel: string }) => Promise<SlackChannelInfoResponse>;
    postMessage: (params: { token: string; channel: string; text: string }) => Promise<{ ok: boolean }>;
  };
  ai: {
    analyze: (params: {
      apiKey: string;
      model?: string;
      system: string;
      user: string;
    }) => Promise<{ ok: true; text: string; usage?: { input_tokens: number; output_tokens: number } }>;
    gemini: (params: {
      apiKey: string;
      model?: string;
      system?: string;
      user: string;
    }) => Promise<{ ok: true; text: string; usage?: unknown }>;
  };
  rpc: {
    getTx: (params: { rpcUrl: string; txHash: string }) => Promise<{ tx: RpcTransaction | null; receipt: RpcReceipt | null }>;
  };
}

export interface RpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  nonce: string;
  blockNumber: string | null;
  blockHash: string | null;
  input: string;
}

export interface RpcReceipt {
  status: string;
  gasUsed: string;
  effectiveGasPrice: string;
  blockNumber: string;
  contractAddress: string | null;
  logs: { address: string; topics: string[]; data: string }[];
}

declare global {
  interface Window {
    teamap?: ElectronBridge;
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.teamap;
}

export interface SlackMessage {
  ts: string;
  user?: string;
  username?: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  bot_id?: string;
  attachments?: { text?: string; title?: string }[];
  blocks?: unknown;
}

export interface SlackHistoryResponse {
  ok: boolean;
  messages: SlackMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

export interface SlackChannelsResponse {
  ok: boolean;
  channels: SlackChannel[];
}

export interface SlackChannelInfoResponse {
  ok: boolean;
  channel: SlackChannel & { name?: string };
}

export async function fetchHistory(oldest?: string, limit = 100): Promise<SlackMessage[]> {
  if (!window.teamap) throw new Error('데스크톱 앱에서만 동작합니다.');
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token || !channel) throw new Error('Slack 토큰 / 채널을 먼저 설정하세요.');
  const r = await window.teamap.slack.fetchHistory({ token, channel, oldest, limit });
  return r.messages ?? [];
}

export async function fetchReplies(ts: string): Promise<SlackMessage[]> {
  if (!window.teamap) throw new Error('데스크톱 앱에서만 동작합니다.');
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token || !channel) throw new Error('Slack 토큰 / 채널을 먼저 설정하세요.');
  const r = await window.teamap.slack.fetchReplies({ token, channel, ts });
  return r.messages ?? [];
}

export async function testConnection(): Promise<{ ok: true; channelName: string } | { ok: false; error: string }> {
  if (!window.teamap) return { ok: false, error: '데스크톱 앱에서만 동작합니다.' };
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token) return { ok: false, error: '토큰이 비어있습니다.' };
  if (!channel) return { ok: false, error: '채널 ID가 비어있습니다.' };
  try {
    const r = await window.teamap.slack.channelInfo({ token, channel });
    const name = r.channel?.name ?? channel;
    return { ok: true, channelName: name };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '연결 실패';
    if (msg === 'missing_scope') {
      return { ok: false, error: '권한 부족 — Bot Token Scopes에 channels:read (비공개면 groups:read)를 추가하고 Reinstall 하세요.' };
    }
    if (msg === 'not_in_channel') {
      return { ok: false, error: '봇이 채널에 초대되지 않았습니다. 슬랙 채널에서 /invite @봇이름 실행' };
    }
    if (msg === 'channel_not_found') {
      return { ok: false, error: `채널 ID ${channel}을 찾을 수 없습니다.` };
    }
    return { ok: false, error: msg };
  }
}

/** 에러 메시지 파서
 *
 * 예상 포맷:
 *   [bc-adapter] ws-publisher — send failed, max retries exceeded
 *   level: ERROR
 *   chainId   : ETH
 *   txHash    : 0xabc...
 *   retryCount: 3
 *   timestamp : 2026-03-29 23:26:30
 */
export interface ParsedError {
  service: string;
  component: string;
  summary: string;
  level?: string;
  chainId?: string;
  txHash?: string;
  retryCount?: string;
  timestamp?: string;
  fields: Record<string, string>;
  raw: string;
  ts: string;
  threadTs?: string;
  replyCount?: number;
}

/** Slack mrkdwn 정리 — *bold*, _italic_, ```code```, `inline` 등을 일반 텍스트로 */
function stripSlackMarkdown(text: string): string {
  return text
    // ```...``` 코드 블록 → 내용만 남김
    .replace(/```([\s\S]*?)```/g, (_, inner) => inner)
    // *text* 굵게
    .replace(/\*([^*\n]+)\*/g, '$1')
    // _text_ 기울임
    .replace(/(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, '$1')
    // `text` 인라인 코드
    .replace(/`([^`\n]+)`/g, '$1')
    // <http://...|label> → label
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    // <http://...> → URL
    .replace(/<([^>]+)>/g, '$1');
}

export function parseError(msg: SlackMessage): ParsedError | null {
  const rawText = (msg.text ?? '') || (msg.attachments?.map((a) => `${a.title ?? ''}\n${a.text ?? ''}`).join('\n') ?? '');
  if (!rawText) return null;

  const text = stripSlackMarkdown(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // 다양한 헤더 포맷 지원:
  //   [bc-adapter] ws-publisher — send failed
  //   [ERROR] PaymentService - Payment transfer failed
  //   [ERROR] PaymentService ? Payment transfer failed   (이모지가 ?로 깨진 경우)
  // 구분자: — – - · ▸ ▶ → > | ? ❓ 🔴 ❌ ⚠️ 등
  const SEP_CLASS = '[—–\\-·▸▶→>|?❓🔴❌⚠️]';
  const headerRe = new RegExp(`^\\[([^\\]]+)\\]\\s*(.+?)\\s+${SEP_CLASS}+\\s+(.+)$`);
  const headerMatch = lines[0].match(headerRe);

  let service = '';
  let component = '';
  let summary = lines[0];
  let levelFromHeader: string | undefined;

  if (headerMatch) {
    const bracket = headerMatch[1].trim();
    const after = headerMatch[2].trim();
    summary = headerMatch[3].trim();

    // [ERROR] / [WARN] / [INFO] 같은 레벨이 brackets에 들어있으면 그건 level, 그 다음이 service
    if (/^(error|warn|warning|info|debug|fatal)$/i.test(bracket)) {
      levelFromHeader = bracket.toUpperCase();
      service = after;
      component = '';
    } else {
      service = bracket;
      component = after;
    }
  }

  const fields: Record<string, string> = {};
  for (let i = headerMatch ? 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    // key (영문/숫자/_) : value
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+)$/);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim();
  }

  return {
    service,
    component,
    summary,
    level: fields.level ?? levelFromHeader,
    chainId: fields.chainid,
    txHash: fields.txhash,
    retryCount: fields.retrycount,
    timestamp: fields.timestamp,
    fields,
    raw: rawText,
    ts: msg.ts,
    threadTs: msg.thread_ts,
    replyCount: msg.reply_count,
  };
}

function explorerBase(chainId: string): string | undefined {
  const byName: Record<string, string> = {
    SEPOLIA: 'https://sepolia.etherscan.io',
    FUJI: 'https://testnet.snowtrace.io',
    KCP: 'https://explorer-test.avax.network/monthlygol',
  };
  const byNumber: Record<string, string> = {
    '11155111': 'https://sepolia.etherscan.io',
    '43113':    'https://testnet.snowtrace.io',
    '56357':    'https://explorer-test.avax.network/monthlygol',
  };
  return byNumber[chainId] ?? byName[chainId.toUpperCase()];
}

export function explorerUrl(chainId: string | undefined, txHash: string | undefined): string | null {
  if (!chainId || !txHash) return null;
  const base = explorerBase(chainId);
  return base ? `${base}/tx/${txHash}` : null;
}

export function explorerAddressUrl(chainId: string | undefined, address: string | undefined): string | null {
  if (!chainId || !address) return null;
  const base = explorerBase(chainId);
  return base ? `${base}/address/${address}` : null;
}

export async function postSlackMessage(text: string): Promise<void> {
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token || !channel || !window.teamap) return;
  await window.teamap.slack.postMessage({ token, channel, text });
}

/** chainId가 숫자면 사람이 읽기 쉬운 이름으로 변환 */
export function chainName(chainId: string | undefined): string | undefined {
  if (!chainId) return undefined;
  const map: Record<string, string> = {
    '11155111': 'Sepolia',
    '43113':    'Fuji',
    '56357':    'KCP',
  };
  return map[chainId] ?? chainId;
}

const WORK_END_HOUR = 18;
const WORK_START_HOUR = 9;

export interface OvernightRange {
  start: Date;
  end: Date;
  label: string;
}

export function getOvernightRange(): OvernightRange {
  const now = new Date();
  const end = new Date(now);

  // start is always yesterday 18:00 regardless of branch
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(WORK_END_HOUR, 0, 0, 0);

  // Before work start: end = now (still overnight)
  // After work start: end = today 09:00
  if (now.getHours() >= WORK_START_HOUR) {
    end.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  return { start, end, label: '오버나이트 (퇴근 후)' };
}
