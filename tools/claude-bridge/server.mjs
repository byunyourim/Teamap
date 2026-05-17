#!/usr/bin/env node
// 호스트의 claude CLI를 HTTP로 감싸 n8n(Docker)에서 호출하기 위한 브릿지.
// 사용: CLAUDE_BRIDGE_TOKEN=xxx node server.mjs
// 호출: POST http://host.docker.internal:7891/analyze
//        Header: Authorization: Bearer <token>
//        Body:   { "prompt": "...", "model": "sonnet" (선택), "timeoutMs": 120000 (선택) }
//        Resp:   { "text": "...", "exitCode": 0, "durationMs": 1234 }

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 7891);
const TOKEN = process.env.CLAUDE_BRIDGE_TOKEN;
const DEFAULT_TIMEOUT = 180_000;
const MAX_BODY = 1_000_000; // 1MB

if (!TOKEN) {
  console.error('CLAUDE_BRIDGE_TOKEN env required');
  process.exit(1);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function runClaude(prompt, { model, timeoutMs }) {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'text'];
    if (model) args.push('--model', model);
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    const killTimer = setTimeout(() => child.kill('SIGTERM'), timeoutMs ?? DEFAULT_TIMEOUT);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ text: stdout.trim(), stderr: stderr.trim(), exitCode: code, durationMs: Date.now() - started });
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({ text: '', stderr: String(err), exitCode: -1, durationMs: Date.now() - started });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, { ok: true });
  }

  if (req.method !== 'POST' || req.url !== '/analyze') {
    return send(404, { error: 'not found' });
  }

  const auth = req.headers['authorization'] ?? '';
  if (auth !== `Bearer ${TOKEN}`) {
    return send(401, { error: 'unauthorized' });
  }

  let body;
  try { body = await readJson(req); }
  catch (e) { return send(400, { error: 'invalid json', detail: String(e) }); }

  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  if (!prompt) return send(400, { error: 'prompt required' });

  const result = await runClaude(prompt, { model: body.model, timeoutMs: body.timeoutMs });
  if (result.exitCode !== 0) {
    return send(502, { error: 'claude failed', ...result });
  }
  send(200, result);
});

// 0.0.0.0 바인드: Docker 컨테이너에서 host.docker.internal로 접근하려면 필요.
// 토큰 검증으로 외부 노출 위험 차단.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`claude-bridge listening on 0.0.0.0:${PORT}`);
});
