import { app, BrowserWindow, ipcMain, net, shell, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import * as opsRpc from '@stablecoin/ops/client/rpc';
import { ai as opsAi } from '@stablecoin/ops';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Teamap',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  // 새 창 열기 요청을 시스템 브라우저로 리다이렉트
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    const port = process.env.VITE_PORT || '5173';
    win.loadURL(`http://localhost:${port}`);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

/* ─── OS 알림 ─── */
ipcMain.handle('notifications:show', async (_e, { title, body, navigateTo }) => {
  if (!Notification.isSupported()) return { ok: false, error: 'unsupported' };
  const n = new Notification({
    title: String(title ?? ''),
    body: String(body ?? ''),
    silent: false,
  });
  n.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (navigateTo) mainWindow.webContents.send('app:navigate', String(navigateTo));
    }
  });
  n.show();
  return { ok: true };
});

function slackFetch(token, path, query = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(query).toString();
    const url = `https://slack.com/api/${path}${qs ? `?${qs}` : ''}`;
    const request = net.request({ method: 'GET', url });
    request.setHeader('Authorization', `Bearer ${token}`);
    request.setHeader('Accept', 'application/json');

    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString('utf8'); });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed.ok) reject(new Error(parsed.error || 'Slack API error'));
          else resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

ipcMain.handle('slack:history', async (_e, { token, channel, oldest, limit }) => {
  return slackFetch(token, 'conversations.history', {
    channel,
    ...(oldest ? { oldest } : {}),
    limit: String(limit ?? 100),
  });
});

ipcMain.handle('slack:replies', async (_e, { token, channel, ts }) => {
  return slackFetch(token, 'conversations.replies', { channel, ts });
});

ipcMain.handle('slack:listChannels', async (_e, { token }) => {
  return slackFetch(token, 'conversations.list', {
    types: 'public_channel,private_channel',
    limit: '200',
    exclude_archived: 'true',
  });
});

ipcMain.handle('slack:channelInfo', async (_e, { token, channel }) => {
  return slackFetch(token, 'conversations.info', { channel });
});

ipcMain.handle('slack:postMessage', async (_e, { token, channel, text }) => {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'POST', url: 'https://slack.com/api/chat.postMessage' });
    request.setHeader('Authorization', `Bearer ${token}`);
    request.setHeader('Content-Type', 'application/json; charset=utf-8');

    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString('utf8'); });
      request.on('error', reject);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed.ok) reject(new Error(parsed.error || 'Slack API error'));
          else resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on('error', reject);
    request.write(JSON.stringify({ channel, text }));
    request.end();
  });
});

// @stablecoin/ops의 AI 클라이언트 위임
ipcMain.handle('ai:gemini', async (_e, params) => {
  const r = await opsAi.callGemini(params);
  return { ok: true, ...r };
});

ipcMain.handle('ai:analyze', async (_e, params) => {
  const r = await opsAi.callAnthropic(params);
  return { ok: true, ...r };
});

ipcMain.handle('ai:claudeReview', async (_e, { prompt, model }) => {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--model', model || 'claude-opus-4-7', prompt];
    const proc = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: (process.env.PATH || '') + ':/usr/local/bin:/opt/homebrew/bin',
      },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, text: stdout.trim() });
      else reject(new Error(stderr.trim() || `Claude 종료 코드: ${code}`));
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Claude Code CLI가 설치되지 않았습니다. npm install -g @anthropic-ai/claude-code 후 claude login 하세요.'));
      } else {
        reject(new Error(err.message));
      }
    });
  });
});

/* ─── RPC (온체인 조회) ─── */

// @stablecoin/ops의 RPC 클라이언트 위임 (메인 프로세스에서 fetch 직접 사용)
ipcMain.handle('rpc:getTx', async (_e, { rpcUrl, txHash }) => {
  return opsRpc.getTx(rpcUrl, txHash);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
