# claude-bridge

호스트 맥의 `claude` CLI를 HTTP로 감싸서 Docker n8n에서 호출하기 위한 미니 브릿지.

## 실행

```sh
CLAUDE_BRIDGE_TOKEN=<your-token> node tools/claude-bridge/server.mjs
```

기본 포트 7891. 다른 포트는 `PORT=8080` 추가.

헬스체크:
```sh
curl http://localhost:7891/health
```

## n8n에서 호출

- URL: `http://host.docker.internal:7891/analyze`
- Method: POST
- Header: `Authorization: Bearer <token>`
- Body:
  ```json
  { "prompt": "...", "model": "sonnet", "timeoutMs": 180000 }
  ```
- 응답: `{ "text": "...", "exitCode": 0, "durationMs": 1234 }`

## 보안

- 0.0.0.0 바인드(Docker 접근 필요) + Bearer 토큰 검증으로 외부 노출 위험 차단.
- 토큰은 `openssl rand -hex 24`로 생성 후 환경변수로만 전달.
- 같은 토큰을 n8n에 HTTP Header Auth credential로 등록.
