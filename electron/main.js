import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

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

ipcMain.handle('ai:gemini', async (_e, { apiKey, model, system, user }) => {
  return new Promise((resolve, reject) => {
    const m = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const request = net.request({ method: 'POST', url });
    request.setHeader('content-type', 'application/json');

    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString('utf8'); });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'Gemini API error'));
            return;
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          resolve({ ok: true, text, usage: parsed.usageMetadata });
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on('error', reject);
    request.write(JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: user }] }],
    }));
    request.end();
  });
});

ipcMain.handle('ai:analyze', async (_e, { apiKey, model, system, user }) => {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
    });
    request.setHeader('x-api-key', apiKey);
    request.setHeader('anthropic-version', '2023-06-01');
    request.setHeader('content-type', 'application/json');

    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString('utf8'); });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.type === 'error') {
            reject(new Error(parsed.error?.message || 'Anthropic API error'));
            return;
          }
          const text = parsed.content?.[0]?.text ?? '';
          resolve({ ok: true, text, usage: parsed.usage });
        } catch (e) {
          reject(e);
        }
      });
    });
    request.on('error', reject);
    request.write(JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }));
    request.end();
  });
});

/* ─── RPC (온체인 조회) ─── */

function rpcFetch(rpcUrl, method, params) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'POST', url: rpcUrl });
    request.setHeader('content-type', 'application/json');

    let body = '';
    request.on('response', (response) => {
      const status = response.statusCode;
      response.on('data', (chunk) => { body += chunk.toString('utf8'); });
      response.on('end', () => {
        if (status && status >= 400) {
          reject(new Error(`RPC 요청 실패 (HTTP ${status}). URL을 확인하세요.`));
          return;
        }
        try {
          if (!body.trim()) {
            reject(new Error(`RPC 빈 응답 (HTTP ${status})`));
            return;
          }
          if (body.trimStart().startsWith('<')) {
            reject(new Error(`RPC가 JSON이 아닌 응답을 반환했습니다 (HTTP ${status}). URL을 확인하세요.`));
            return;
          }
          const parsed = JSON.parse(body);
          if (parsed.error) reject(new Error(parsed.error.message || 'RPC error'));
          else resolve(parsed.result);
        } catch (e) {
          reject(new Error(`RPC 응답 파싱 실패: ${e.message}`));
        }
      });
    });
    request.on('error', reject);
    request.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }));
    request.end();
  });
}

ipcMain.handle('rpc:getTx', async (_e, { rpcUrl, txHash }) => {
  const [tx, receipt] = await Promise.all([
    rpcFetch(rpcUrl, 'eth_getTransactionByHash', [txHash]),
    rpcFetch(rpcUrl, 'eth_getTransactionReceipt', [txHash]),
  ]);
  return { tx, receipt };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
