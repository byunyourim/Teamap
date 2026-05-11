# n8n + Claude Code MCP 셋업 가이드

로컬에 n8n을 띄우고, Claude Code에서 자연어로 워크플로우를 만들 수 있도록 MCP 서버를 연결하는 절차입니다.

---

## 0. 개요

### n8n
- 오픈소스 워크플로우 자동화 도구 (Zapier/Make의 자체 호스팅 버전)
- 시각적 노드 에디터 + 400+ 통합 (Slack, GitHub, HTTP, DB, AI 등)
- 트리거: cron / 웹훅 / 이벤트

**활용 예시**
- ⏰ 매일 9시 운영 지갑 잔고 RPC 조회 → 임계값 미만이면 슬랙 알림
- 🪝 Slack 에러 메시지 → GitHub 이슈 자동 생성
- 📊 매주 월요일 → 지난 주 인시던트 집계 → 슬랙 회고 메시지

### MCP (Model Context Protocol)
- AI 클라이언트(Claude Code 등)가 외부 도구를 호출하게 해주는 프로토콜
- `n8n-mcp`(커뮤니티 서버)를 등록하면 Claude가 n8n 노드 정보를 알아서 조회 → 워크플로우 JSON을 생성·수정해줌
- 사용자는 자연어로 명령 → Claude가 노드 찾고 연결까지 끝냄

---

## 1. 사전 요구사항

- Docker Desktop (또는 Docker Engine + Compose)
- Claude Code CLI 설치
- 브라우저 (Owner 계정 생성 + API 키 발급용)

```sh
docker --version
docker compose version
claude --version
```

---

## 2. n8n 설치

### 2-1. 작업 디렉터리 만들기

```sh
mkdir -p ~/n8n/files
cd ~/n8n
```

### 2-2. `docker-compose.yml` 생성

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=Asia/Seoul
      - TZ=Asia/Seoul
      - N8N_RUNNERS_ENABLED=true
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
      - N8N_SECURE_COOKIE=false   # 로컬 개발 전용. 운영에선 HTTPS + true 권장
    volumes:
      - n8n_data:/home/node/.n8n
      - ./files:/files

volumes:
  n8n_data:
    name: n8n_data
```

### 2-3. 컨테이너 기동

```sh
cd ~/n8n
docker compose up -d
```

### 2-4. 동작 확인

```sh
docker compose ps        # n8n Up (healthy)
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:5678/   # HTTP 200
```

---

## 3. n8n 초기 설정

### 3-1. Owner 계정 만들기

브라우저로 **<http://localhost:5678>** 접속 → 안내 따라 이메일/비밀번호 등록.

> **주의**: `127.0.0.1`이 아닌 정확히 **localhost**로 접속. (Safari/일부 브라우저는 secure cookie 정책으로 막을 수 있음)

### 3-2. API 키 발급

1. 좌측 하단 본인 이름 클릭 → **Settings**
2. 좌측 메뉴 **n8n API**
3. **Create an API key**
4. 라벨: `claude-code` (자기가 알아볼 이름)
5. 만료 기간 선택 (또는 No expiration)
6. 생성된 키(JWT, `eyJ...` 형식) **즉시 복사** — 다시 안 보임

> 키는 외부에 노출하지 마세요. 노출 시 즉시 폐기 후 재발급.

---

## 4. Claude Code에 MCP 서버 등록

`<API_KEY>`를 본인이 발급받은 키로 교체.

```sh
claude mcp add --scope user n8n-mcp \
  -e N8N_API_URL=http://localhost:5678/api/v1 \
  -e N8N_API_KEY=<API_KEY> \
  -- npx -y n8n-mcp
```

스코프 옵션:
- `--scope user` — 모든 프로젝트에서 사용 (권장)
- `--scope project` — 프로젝트 `.mcp.json`에 기록 (팀 공유)
- 생략 시 — 현재 프로젝트 로컬

### 등록 확인

```sh
claude mcp list
```

```
n8n-mcp: npx -y n8n-mcp - ✓ Connected
```

> 첫 실행 시 npx 패키지 다운로드 때문에 일시적으로 `Failed to connect`가 보일 수 있습니다. 잠시 후 한 번 더 `claude mcp list` 실행하면 ✓로 바뀝니다.

---

## 5. 사용 예시

새 Claude Code 세션에서 자연어로 요청:

```
"n8n에서 매일 9시에 KCP RPC로 잔고 조회해서 0.1 미만이면
 슬랙 #ops 채널로 알리는 워크플로우 만들어줘"
```

Claude는 다음을 자동으로 처리:
1. MCP를 통해 n8n 노드 카탈로그 조회
2. Schedule Trigger / HTTP Request / IF / Slack 노드 구성
3. 워크플로우 JSON 생성
4. **import 방법** 안내 (n8n UI에서 "Import from JSON")

---

## 6. 운영 명령어

```sh
# 위치
cd ~/n8n

# 상태 확인
docker compose ps

# 로그 (실시간)
docker compose logs -f

# 중지 / 재기동
docker compose stop
docker compose start

# 완전 정지 (데이터는 유지)
docker compose down

# 데이터까지 초기화 ⚠️ 워크플로우 전부 삭제됨
docker compose down -v

# 최신 버전으로 업데이트
docker compose pull && docker compose up -d
```

---

## 7. 트러블슈팅

### 접속 시 "secure cookie" 경고
- 정확히 `http://localhost:5678` 로 접속 (`127.0.0.1` 아님)
- 그래도 안 되면 `docker-compose.yml`에 `N8N_SECURE_COOKIE=false` 추가 후 `docker compose up -d`

### `claude mcp list`에서 `✗ Failed to connect`
- 첫 등록 직후엔 npm 패키지 다운로드 중 → 잠시 후 재확인
- 그래도 안 되면:
  ```sh
  npx -y n8n-mcp        # 직접 실행해 에러 확인 (Ctrl+C로 종료)
  ```

### API 키 인증 실패
- n8n Settings → n8n API에서 키가 활성화 상태인지 확인
- 만료됐으면 재발급 → 등록 재실행

### 키 교체 / 제거

```sh
claude mcp remove n8n-mcp -s user
claude mcp add --scope user n8n-mcp \
  -e N8N_API_URL=http://localhost:5678/api/v1 \
  -e N8N_API_KEY=<NEW_KEY> \
  -- npx -y n8n-mcp
```

### Docker 컨테이너가 자꾸 죽음
```sh
docker compose logs n8n | tail -50
```
대부분 메모리 부족 또는 포트 충돌(`5678` 다른 프로세스가 점유).

---

## 8. 참고

- n8n 공식: <https://docs.n8n.io/>
- n8n-mcp: <https://github.com/czlonkowski/n8n-mcp>
- Claude Code MCP: <https://docs.claude.com/claude-code/mcp>
