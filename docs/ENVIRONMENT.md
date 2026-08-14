# ENVIRONMENT — 실행 환경 고정

> RUNBOOK #1·#4의 기준 문서. 여기 명시된 버전·도구와 다른 환경의 게이트 수치는 신뢰하지 않는다.

## 개발 호스트
| 항목 | 값 |
|---|---|
| OS | Windows 11 Pro (10.0.26200) |
| 셸 | PowerShell 5.1 (주) / Git Bash (POSIX 스크립트) |
| Node.js | v25.2.0 (요구: ≥18, package.json engines) |
| npm | 11.6.2 |
| git | 2.54.0.windows.1 — `core.hooksPath=.githooks`, `.gitattributes`로 LF 고정 |

## 토크나이저 (INV-3 판정 기준 — ADR-0009)
| 항목 | 값 |
|---|---|
| 패키지 | gpt-tokenizer 3.4.0 (package-lock.json으로 고정) |
| 인코딩 | **cl100k_base** |
| 원칙 | 절대값보다 일관성(RUNBOOK #4). 변경 시 예산 재보정 + 새 ADR |

예산 수치 해석(DESIGN §2.2): 본문 목표 600~900 / 상한 1,200토큰, description 목표 90~120 / 상한 150단어 — 전부 위 토크나이저·공백 분할 단어 수 기준.

## 검증 명령 (리포 루트에서)
| 명령 | 판정 대상 | 불변식 |
|---|---|---|
| `npm run selftest` | 게이트 스크립트 자기시험 (픽스처 양방향 판정) | — |
| `npm run check:budget` | tea/SKILL.md 예산 (본문 토큰·description 단어) | INV-3 |
| `npm run check:terms` | 금칙어 — 본문(frontmatter 제외)+references+원장 | INV-5 |
| `npm run check:rules` | 규칙 ID·핸들 정합, 본문↔원장 교차(M2~) | INV-6 |
| pre-commit (자동) | 시크릿·.env·1MB 초과 파일 차단 | INV-1·2 |

종료 코드 규약: **0 통과 / 1 실패 / 2 대상 부재**(해당 산출물이 아직 없는 phase에서는 정상).

## 벤치마크 실행 환경 (M4에서 확정)
- 대상 레포: tiangolo/full-stack-fastapi-template (ADR-0006)
- 실행: headless 에이전트 세션, 완료 통지 즉시 저장(RUNBOOK #9)
- 검증 모델 2종: **미확정 — 사용자 입력 대기 (M5 진입 차단)**
- M1 트리거 평가의 실행 클라이언트·모델: M1 착수 시 이 문서에 추가
