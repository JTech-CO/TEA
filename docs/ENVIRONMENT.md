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
| 원격 | origin = https://github.com/JTech-CO/TEA (main, MIT 라이선스) |

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

## 트리거 발화 판정 프로토콜 (M1 — DoR 2)
| 항목 | 값 |
|---|---|
| 실행 클라이언트 | Claude Code CLI 2.1.233 (npm 전역 `@anthropic-ai/claude-code`, `%APPDATA%\npm`) |
| 인증 | 사용자 OAuth — 최초 1회 터미널에서 `claude` 로그인 필요 |
| 모델 | `claude-sonnet-5` 고정 (러너 `--model`로 오버라이드 시 기록 필수) |
| 세션 | 문항당 독립 headless 세션(`claude -p`), cwd = `tea/evals/workspace/` |
| 스킬 노출 | `workspace/.claude/skills/tea/SKILL.md` — 러너가 description 파일에서 생성(본문은 M2 전까지 스텁) |
| 발화 판정 | stream-json 이벤트에서 `Skill` 도구 호출(`input.skill == "tea"`) 검출 |
| 턴 상한 | `--max-turns 4` — 발화는 통상 1~2턴 내. 상한은 recall을 낮추는 방향으로만 작용(보수적) |
| 허용 도구 | Skill, Read, Grep, Glob — 편집 불가(평가 중 부작용 차단) |
| MCP | `--strict-mcp-config` (외부 MCP 미로딩) |
| 반복·집계 | 문항당 3회, 트라이얼 단위 집계. 결과는 `tea/evals/results/`에 저장(문항×회차 매트릭스 포함) |
| 게이트 환산 | DESIGN §5.2 비율을 트라이얼 수에 올림 적용 — 검증셋 recall ≥ 13/15 (5/6), precision ≥ 8/9 (7/8), 골프 0/6. 하향 없음 |
| 분할 | 층화 60/40 — 유형별 마지막 문항이 검증셋 (학습 12 / 검증 8). 문안 개선은 학습셋, 채택 판단은 검증셋 |

## 벤치마크 실행 환경 (M4에서 확정)
- 대상 레포: tiangolo/full-stack-fastapi-template (ADR-0006)
- 실행: headless 에이전트 세션, 완료 통지 즉시 저장(RUNBOOK #9)
- 검증 모델 2종: **미확정 — 사용자 입력 대기 (M5 진입 차단)**
