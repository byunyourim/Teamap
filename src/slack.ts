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
    claudeReview: (params: {
      prompt: string;
      model?: string;
    }) => Promise<{ ok: true; text: string }>;
  };
  rpc: {
    getTx: (params: { rpcUrl: string; txHash: string }) => Promise<{ tx: RpcTransaction | null; receipt: RpcReceipt | null }>;
  };
  notifications: {
    show: (params: { title: string; body: string; navigateTo?: string }) => Promise<{ ok: boolean; error?: string }>;
  };
  onNavigate: (callback: (target: string) => void) => () => void;
}

// RPC 타입은 @stablecoin/ops로 이전
import type { RpcTransaction, RpcReceipt } from '@stablecoin/ops/client/rpc';
export type { RpcTransaction, RpcReceipt };

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
  subtype?: string;
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

// 파서/타입은 @stablecoin/ops로 이전. Teamap은 그대로 import해서 사용.
export type { ParsedError } from '@stablecoin/ops/types';
export { parseSlackError as parseError, stripSlackMarkdown } from '@stablecoin/ops/parsers';

// chain 유틸은 @stablecoin/ops로 이전. Teamap은 기존 호출 시그니처를 유지하도록 어댑터로 위임.
import { explorerTxUrl as opsTxUrl, explorerAddressUrl as opsAddrUrl } from '@stablecoin/ops';
export { chainName } from '@stablecoin/ops';

export function explorerUrl(chainId: string | undefined, txHash: string | undefined): string | null {
  if (!chainId || !txHash) return null;
  return opsTxUrl(chainId, txHash);
}

export function explorerAddressUrl(chainId: string | undefined, address: string | undefined): string | null {
  if (!chainId || !address) return null;
  return opsAddrUrl(chainId, address);
}

export async function postSlackMessage(text: string): Promise<void> {
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token || !channel || !window.teamap) return;
  await window.teamap.slack.postMessage({ token, channel, text });
}

export async function postSlackDM(userId: string, text: string): Promise<void> {
  const token = getSlackToken();
  if (!token || !userId || !window.teamap) return;
  await window.teamap.slack.postMessage({ token, channel: userId, text });
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
