# 핸드오프 형식

에이전트 간 결과 전달 형식. 모든 에이전트는 이 형식으로 결과를 반환한다.
형식이 없으면 orchestrator가 다음 에이전트를 호출하지 않는다.

---

## [PLANNER] 결과

```
[PLANNER] 결과

요청: <원래 요청 한 줄 요약>
분류: <quick-fix | feature | refactor | security-sensitive>

수정 파일:
- <파일 경로>: <변경 내용>
- <파일 경로>: <변경 내용>

작업 순서:
1. <파일> — <구체적 작업>
2. <파일> — <구체적 작업>

건드리면 안 되는 것:
- <이유와 함께>

차단 사항:
- <없으면 "없음">
```

---

## [DEVELOPER] 결과

```
[DEVELOPER] 결과

변경 파일:
- <파일 경로>: <변경 내용 요약>

빌드: PASS | FAIL (<실패 시 오류 메시지>)
테스트: PASS | FAIL (<실패 시 실패한 테스트명>)

계획 대비 변경 사항:
- <없으면 "없음", 있으면 이유와 함께>

차단 사항:
- <없으면 "없음">
  예) "planner 계획 재검토 필요: 도메인 타입 변경으로 어댑터 N곳 추가 수정 필요"
```

---

## [REVIEWER] 결과

```
[REVIEWER] 결과

Verdict: APPROVED | NEEDS_FIX | BLOCKED

발견 사항:
- [Critical] <파일:라인> <문제> — <수정 방향>
- [High]     <파일:라인> <문제> — <수정 방향>
- [Low]      <파일:라인> <문제> (범위 밖, 참고용)

보안 의심:
- <있으면 security-reviewer에게 위임할 항목, 없으면 "없음">

차단 사항:
- <Critical/High가 있으면 항목 나열, 없으면 "없음">
```

---

## [TESTER] 결과

```
[TESTER] 결과

추가한 테스트:
- <테스트 파일:함수명> — <검증 내용>

커버리지: <이전>% → <이후>% (감소 시 이유 기록)
전체 테스트: PASS | FAIL (<실패 시 실패한 테스트명>)

차단 사항:
- <없으면 "없음">
```

---

## [SECURITY-REVIEWER] 결과

```
[SECURITY-REVIEWER] 결과

Verdict: APPROVED | NEEDS_FIX | BLOCKED

발견 사항:
- [Critical] <파일:라인> <exploit path> — <수정 방향>
- [High]     <파일:라인> <문제> — <수정 방향>
- [Low]      <파일:라인> <이론적 위험> (exploit path 없음)

차단 사항:
- <Critical/High가 있으면 항목 나열, 없으면 "없음">
```
