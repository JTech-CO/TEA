# PROGRESS.md — 상태 인계 (매 세션 갱신)

> 이 팩에서 **매 세션 바뀌는 유일한 파일**. 세션이 끊겨도 이 파일만 읽으면 이어서 작업 가능해야 한다.

## 현재 상태
- **현재 phase**: M1 — description 확정 (**진행 중**. DoR 2/2 충족, 평가 인프라 완료)
- **상태**: 실측정 대기 — Claude Code CLI(2.1.233, npm 전역 신규 설치) OAuth 만료. 사용자 로그인 1회 필요
- **재개 절차**: 로그인 후 `node scripts/trigger-eval.js --smoke` → PASS 시 `--set all --gate`
- **마지막 갱신**: 2026-08-14

## 직전에 끝낸 것 (M0, 2026-08-14)
- **하네스 팩 결손 보완** — 팩이 참조하나 부재였던 `phases/`(_TEMPLATE, M0~M8)·`decisions/`(ADR-0001~0009)·docs 보조 문서를 백서 기반으로 재구성. DOD_GUIDE는 `gates/`로 이동. (기존 "인스턴스화 완료" 기록과 실제 파일의 불일치를 해소)
- git 초기화(main), .gitignore(INV-2), .gitattributes(LF 고정 — 토큰 측정 일관성), pre-commit 시크릿 스캔(INV-1, **실전 차단 검증 완료**)
- docs/ENVIRONMENT·FILE_TREE·README 작성. 토크나이저 고정: gpt-tokenizer 3.4.0, cl100k_base (ADR-0009)
- rules/catalog.json — 규칙 원장 (L1~4 + R·W·T 12규칙 측정 핸들 12종 + X1~4 + P1)
- 검증 스크립트 4종(token-budget·forbidden-terms·rule-audit·secret-scan) + 자기시험 10/10

## 다음 할 일 (M1)
1. 발화 판정 프로토콜 정의 (M1 DoR 2) — 스킬 로드 여부를 확인·기록하는 방법을 docs/ENVIRONMENT에 고정
2. description v1 (DESIGN §3.2 초안 기반) + tea/evals/trigger.json 20문항 (§5.1 구성: 양성 12/음성 8)
3. 60/40 학습·검증 분할, 문항당 3회 실행 → recall/precision 집계
4. 게이트: 검증셋 recall ≥ 5/6, precision ≥ 7/8, 골프 음성 발화 0건

## 미결 질문 / 사용자 결정 대기
- **Schema-Hub 14섹션 목록** — `references/spec.md` 배치표 확정용. M3 DoD 5만 차단 (M3 나머지·M4 진입은 가능)
- **검증 모델 2종 확정** — INV-7 게이트용. **M5 진입을 차단**한다
- ~~토크나이저 선택~~ — 해소: ADR-0009 (gpt-tokenizer 3.4.0, cl100k_base)

## 증거 로그 (최근 게이트 실행)
| phase | 게이트 | 명령 | 결과/수치 | 일시 |
|---|---|---|---|---|
| M0 | DoD 1 자기시험 | `npm run selftest` | 전항 통과 10/10 | 2026-08-14 |
| M0 | DoD 2 시크릿 차단(실전) | AKIA 픽스처 staged 후 commit | secret-scan 차단, exit 1 | 2026-08-14 |
| M0 | DoD 3 훅 활성 | `git config core.hooksPath` | `.githooks` | 2026-08-14 |
| M0 | DoD 6 원장 정합 | `npm run check:rules` | 규칙 21/측정 12/핸들 12, PASS | 2026-08-14 |

## 막힘 기록 (STOP 발동 시)
- 없음

## 결정 로그
최근 결정은 `decisions/`. 요약:
- 0001 — 티컵 예산 v1 제외, 규율 축 우선
- 0002 — 2층 패키징. M0~M6 스킬, M7 플러그인
- 0003 — SAY 축 제거, 3축 확정
- 0004 — LOC 배제, 총 토큰·턴 수 채택
- 0005 — 규칙 문구에 "토큰" 금지
- 0006 — 선행 벤치마크 하네스 재사용, 지표만 교체
- 0007 — DESIGN 슬롯을 스킬 명세로 용도 변경
- 0008 — "계층" 표기 충돌 해소 (로딩 단계는 메타/본문/번들)
- 0009 — 토크나이저 gpt-tokenizer 3.4.0 cl100k_base 고정 (신규, M0)
