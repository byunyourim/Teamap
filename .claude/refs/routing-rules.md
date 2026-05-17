# 라우팅 규칙

orchestrator가 요청을 분류하는 기준.

## 작업 유형 판단 기준

### quick-fix
단일 파일, 영향 범위가 명확하고 작은 변경.

해당하는 경우:
- 오타·변수명·주석 수정
- 단순 버그 (로직 오류, off-by-one, null 체크 누락)
- 기존 함수의 파라미터/반환값 소폭 수정
- AI 시스템 프롬프트 텍스트 변경
- 상수값 변경 (CHAIN_IDS, URL 등)

체인: `developer → reviewer`

---

### feature
새 기능 추가 또는 기존 기능의 의미 있는 변경.

해당하는 경우:
- 새 MCP 도구 추가 (`tools` 배열 + `switch` 블록)
- 새 HTTP 라우트 추가
- 새 체인 지원 추가 (SupportedChain, CHAIN_IDS, CHAIN_RPC, CHAIN_EXPLORER)
- 새 클라이언트 메서드 추가 (n8n, rpc, github)
- 새 파서 포맷 지원 추가
- src/types 도메인 타입 변경 (영향 범위 넓음)
- 환경변수 추가·제거 (config-propagation-checker 후속 호출)

체인: `planner → developer → reviewer + tester (병렬)`

---

### refactor
동작 변경 없이 코드 구조 개선.

해당하는 경우:
- 파일 분리·이동
- 중복 코드 제거
- 함수 분해 (긴 함수 → 여러 함수)
- 책임 분리 (모듈 경계 정리)
- 명명 일관성 정리

체인: `planner → developer → reviewer + tester (병렬)`

주의: 동작 변경과 리팩토링을 동시에 요청하면 분리해서 처리.

---

### security-sensitive
보안·인증·외부 입력 처리와 관련된 변경.

해당하는 경우:
- API 키, 환경변수 노출 경로 변경
- x-api-key 인증 로직 변경
- 외부 입력 (Slack 메시지, RPC 응답, GitHub API 응답) 검증 로직 변경
- GitHub 토큰 스코프 변경
- HTTP 응답에 민감 정보 포함 여부가 달라지는 변경

체인: `planner → developer → reviewer + tester (병렬) → security-reviewer`

---

### delete
코드·파일·함수·타입·라우트·MCP 도구를 제거하는 작업.

해당하는 경우:
- "삭제해줘", "제거해줘", "없애줘"
- MCP 도구 제거, HTTP 라우트 제거, 클라이언트 메서드 제거
- 파일 삭제, 타입 삭제, 상수 삭제

**필수 처리:** 삭제 전 반드시 영향도 분석 → 사용자 확인 → 진행.
절차는 `orchestrator.md` "삭제 요청 필수 처리" 섹션을 따른다.

체인: `영향도 분석(planner) → 사용자 확인 → developer → reviewer`

---

### 스킬 직접 사용 (에이전트 체인 없음)
코드를 변경하지 않는 조회·분석·검증 요청. orchestrator를 거치지 않는다.

| 요청 패턴 | 사용 스킬 |
|----------|---------|
| "설명해줘", "어떻게 동작해", "이게 뭐야", "어디 수정해야 해" | `code-explainer` |
| "에러 왜 나", "버그 원인이 뭐야", "왜 실패해" | `debug-root-cause` |
| "검증해줘", "이 코드 맞아?", "리뷰해줘", "문제 없어?" | `review-pr` |
| "보안 문제 없어?", "권한 체크 맞아?" | `security-check` |
| "Slack 에러 분석해줘", "트랜잭션 조회해줘" | `stablecoin-ops` |

설명 + 수정이 함께 필요하면: 스킬로 분석 먼저 → 에이전트 체인으로 전환.
예) "왜 실패하는지 파악하고 고쳐줘" → debug-root-cause → quick-fix 체인

---

## Teamap 특화 판단표

| 요청 예시 | 분류 |
|----------|------|
| "React 컴포넌트 추가해줘" / "새 페이지 만들어줘" | feature (react-component-builder 자동 호출) |
| "Firestore 컬렉션 추가/스키마 변경" | feature (incident-firebase-domain 자동 호출) |
| "Etherscan/RPC 조회 추가" / "체인 모니터링 추가" | feature (onchain-integrator 자동 호출) |
| "Electron IPC 핸들러 추가" | security-sensitive (electron-security-reviewer 자동 호출) |
| "preload에 API 노출" | security-sensitive |
| "API 키/토큰 저장 로직 변경" | security-sensitive |
| "BrowserWindow 옵션 변경" | security-sensitive |
| "UI 스타일 한 줄 변경" | quick-fix |
| "cron 표현식 파싱 버그" | quick-fix |
| "Firestore 쿼리 최적화" | refactor |
| "컴포넌트 분리" / "lib 함수 추출" | refactor |
| "IPC 핸들러 삭제" / "Firestore 컬렉션 제거" | delete (영향도 분석 필수) |
| "이 컴포넌트 어떻게 동작해?" | 스킬 직접 사용 (code-explainer) |
| "이 코드 검증해줘" | 스킬 직접 사용 (review-pr) |

---

## 우선순위 규칙

1. security-sensitive 징후가 있으면 다른 분류보다 우선
2. delete 요청은 영향도 분석 + 사용자 확인 없이 절대 진행 불가
3. 환경변수 변경이 포함되면 feature로 분류 + 완료 후 config-propagation-checker 호출
4. 아키텍처 원칙 검증은 planner가 계획 수립 과정에서 함께 수행
