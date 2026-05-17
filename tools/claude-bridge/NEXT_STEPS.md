# Morning Bug Report — 내일 이어서 할 작업

오늘 멈춘 지점부터 정리.

## 현재 상태 (2026-05-17)

- ✅ n8n 워크플로우 생성·검증·수동 실행 success (ID `45utiQ7D22rj2vRs`)
- ✅ Slack OAuth, claude-bridge HTTP, Firestore Service Account 모두 연결됨
- ✅ Firestore `morningBugReports` 컬렉션에 첫 문서 저장 확인
- ✅ Teamap 앱 측 MorningReportPage + 알림 구현 완료
- ⏸ claude-bridge가 수동 실행 중 (터미널 창 닫으면 멈춤)
- ⏸ n8n 워크플로우 Activate(cron) 미적용
- ⏸ Teamap 앱에서 카드/알림 실제 동작 확인 미완료

## 내일 할 일 (우선순위 순)

### 1. claude-bridge launchd 자동 시작 등록
- 목적: 맥 부팅 시 자동 실행 + 죽으면 재시작. 매일 08:00 워크플로우가 실패 없이 호출하려면 필수.
- 작업:
  - `~/Library/LaunchAgents/com.teamap.claude-bridge.plist` 생성
  - `ProgramArguments`: `/opt/homebrew/bin/node /Users/byunyourim/IdeaProjects/kcp_project/Teamap/tools/claude-bridge/server.mjs`
  - `EnvironmentVariables`: `CLAUDE_BRIDGE_TOKEN=aedcea63e8b6d9c25a3513b1d99f2e14b4dba9c387b8c2c9`
  - `KeepAlive: true`, `RunAtLoad: true`
  - StandardOutPath/StandardErrorPath → `~/Library/Logs/claude-bridge.{out,err}.log`
  - `chmod 600` (토큰 보호)
  - `launchctl bootstrap gui/$(id -u) ...plist`로 로드
- 검증: 터미널 다 닫고 `curl http://localhost:7891/health` → `{"ok":true}`

### 2. n8n에 CLAUDE_BRIDGE_TOKEN 환경변수 영구화
- 현재 노드에 토큰 하드코딩됨. 보안·관리 측면에서 Docker env로 옮기는 게 좋음.
- 작업: n8n 컨테이너 재실행 시 `-e CLAUDE_BRIDGE_TOKEN=...` 추가 (또는 docker-compose.yml에 추가)
- 워크플로우의 `Claude Bridge (HTTP)` 노드 Authorization 헤더를 `Bearer {{ $env.CLAUDE_BRIDGE_TOKEN }}`으로 되돌림
- 같은 작업: `SLACK_BUG_CHANNEL_ID`, `FIREBASE_PROJECT_ID`도 env로 옮기면 워크플로우 export 시 secret 노출 없음

### 3. 워크플로우 Activate 토글 ON
- n8n UI 우상단 Activate 스위치 → 매일 08:00 KST 자동 실행
- 켜기 전 1·2번 먼저 완료해야 안전

### 4. Teamap 앱 실제 동작 검증
- `npm run electron:dev`로 앱 실행
- 사이드바 '운영 → Morning Bug Report' 진입 → 어제 저장된 카드 보이는지
- 새 리포트 생기면 OS 알림 뜨는지 (테스트하려면 Firestore에 새 문서 하나 더 넣거나, n8n 수동 실행)
- 알림 클릭 시 페이지 이동 동작 확인

### 5. (선택) 보안·운영 정리
- `~/firebase-key.json` 삭제 확인 (`ls ~/firebase-key.json` → No such file)
- n8n 워크플로우 export(JSON) 받아서 백업
- claude-bridge에 rate limit 추가 검토 (현재 인증만 있고 요청 빈도 제한 없음)

## 참고 정보

- 워크플로우 ID: `45utiQ7D22rj2vRs`
- Firebase Project: `teamap-103a7`
- Firestore Collection: `morningBugReports`
- Bridge token: 첫 실행 시 발급된 hex 24바이트 (저장 위치 확인 필요)
- Bridge URL (Docker 내부에서): `http://host.docker.internal:7891/analyze`
- AI 1회 실행 비용·시간: 약 56초, 메시지 49건 분석
