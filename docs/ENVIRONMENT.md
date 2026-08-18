# ENVIRONMENT — 실행 환경 고정

> RUNBOOK #1·#4의 기준 문서. 여기 명시된 버전·도구와 다른 환경의 게이트 수치는 신뢰하지 않는다.

## 개발 호스트
| 항목 | 값 |
|---|---|
| OS | Windows 11 Pro (10.0.26200) |
| 셸 | PowerShell 5.1 (주) / Git Bash (POSIX 스크립트) |
| Node.js | v25.2.0 (요구: ≥18, package.json engines). **주의: 이 빌드는 fs 재귀 복사·삭제에서 무출력 하드 크래시(exit 127)** — cpSync 100% 재현 |
| 러너 전용 Node | v22.23.2 LTS 단일 바이너리 — `tools/node22/node.exe` (비커밋, `curl -sL -o tools/node22/node.exe https://nodejs.org/dist/latest-v22.x/win-x64/node.exe`). trigger-eval은 반드시 이걸로 실행 |
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

## 트리거 발화 판정 프로토콜 v2 (M1 — DoR 2)
| 항목 | 값 |
|---|---|
| 실행 클라이언트 | Claude Code CLI 2.1.233 (npm 전역 `@anthropic-ai/claude-code`, `%APPDATA%\npm`) |
| 인증 | 사용자 OAuth — 최초 1회 터미널에서 `claude` 로그인 필요 |
| 모델 | `claude-sonnet-5` 고정 (러너 `--model`로 오버라이드 시 기록 필수) |
| 세션 | 트라이얼당 독립 headless 세션(`claude -p`) |
| 워크스페이스 | **트라이얼마다 리포 밖 임시 디렉터리에 새로 복사.** 리포 루트 `CLAUDE.md`가 상위 탐색으로 상속되어 발화를 편향시키는 것과, 앞 트라이얼의 편집이 뒤 트라이얼 조건을 바꾸는 것을 동시에 차단 |
| 스킬 노출 | 복사본의 `.claude/skills/tea/SKILL.md` — 러너가 description 파일에서 생성(본문은 M2 전까지 스텁) |
| 발화 판정 | stream-json 이벤트에서 `Skill` 도구 호출(`input.skill == "tea"`) 검출. 최초 발화 턴 번호도 기록 |
| 턴 상한 | `--max-turns 30` (v2.1 — 픽스처 확장으로 상향. 절단·판정보류 급증 방지, 측정 중립적) |
| 권한 | `--permission-mode bypassPermissions` — 일회용 격리 복사본이므로 안전. 화이트리스트 방식은 거부를 유발해 턴을 소진시킨다(RUNBOOK #21) |
| MCP | `--strict-mcp-config` (외부 MCP 미로딩) |
| 환경 변수 | 화이트리스트만 자식에 전달. `process.env` 통째 전달은 `CLAUDE_CODE_ENTRYPOINT` 등 부모 세션 흔적을 누출시킨다 |
| 트라이얼 분류 | `fired` 발화(절단 여부 무관 — 유효) / `quiet` 자연종료·미발화(유효) / `ambiguous` 절단·미발화(**판정 보류**) / `error` 실행 실패. 보류·실패는 게이트를 막는다. 타임아웃은 오류가 아니라 절단 계열 |
| 재시도 | 실행 실패이고 **미발화**인 트라이얼만 1회 재실행. 발화를 본 트라이얼은 재실행 금지 — 결과에 의존하는 재시도는 조건부 재추첨이라 발화 관측만 선택적으로 폐기한다. 모든 시도를 `attempts`에 기록하고, 폐기된 시도에 발화가 있으면 게이트를 막는다 |
| 반복·집계 | 문항당 3회. 결과는 `tea/evals/results/`에 저장 — 문항×회차 매트릭스, 최초 발화 턴, 절단·거부 카운트, `init` 지문(CLI 버전·스킬 노출 여부·메모리 경로), `attempts`, `runKey` |
| 게이트 환산 | DESIGN §5.2 비율을 **유효** 트라이얼 수에 올림 적용 — 검증셋 recall ≥ ⌈5/6⌉, precision ≥ ⌈7/8⌉, 골프 0건. 하향 없음 |
| precision 분모 | 검증 음성에서 **골프 문항 제외**. 골프는 DoD 4가 0건 기준으로 따로 판정하므로 포함 시 같은 트라이얼이 두 게이트에 이중 계상되고 DoD 3이 희석된다 |
| recall의 실제 형상 | 검증 양성은 유형당 1문항이므로 ⌈5/6 × 15⌉ = 13은 **"유형 5종 전부 최소 1회 발화 AND 총 미발화 ≤ 2"**와 동치. 한 유형이 0/3이면 나머지가 만점이어도 통과 불가 |
| 무결성 게이트 | 판정 불가 0건 · 폐기된 발화 관측 0건 · 스킬 미노출 세션 0건. 수치 게이트와 동급으로 차단 |
| 분할 | 층화 60/40 — 유형별 마지막 문항이 검증셋. 문안 개선은 학습셋, 채택 판단은 검증셋 |
| 로딩 어댑터 (v2.2) | 워크스페이스 `CLAUDE.md`에 어댑터 지시문 2문장(ADR-0010) — 배포 조건과 동일하게 측정. M1 게이트 수치는 불변, 측정 대상이 "스킬 단독"에서 "스킬+어댑터"로 재정의됨 |
| 픽스처 중립성 | 워크스페이스에 `tea`·`eval`·`trigger`·`sandbox` 어휘가 0건이어야 한다(SKU명·package.json description 포함). **예외: `CLAUDE.md` 어댑터 파일 — 측정 대상 시스템의 일부(ADR-0010)** |
| 픽스처 규모 (v2.1) | 31파일 804줄 — routes 7·services 8·middleware 2·utils 5·tests 4·데이터·설정. DESIGN §5.2 "자력 처리 곤란" 요건 대응(9파일 토이 레포는 전 트라이얼 자력 완료 → 미발화, RUNBOOK #5). 문항이 참조하는 경로·심볼·시드 버그 4종은 불변 유지 |

**v1 폐기 사유(2026-08-15).** 초판은 `--max-turns 4` + 도구 화이트리스트를 썼다. 화이트리스트는 도구 목록을 제한하지 못한 채 권한 거부만 만들었고(1세션 8건), 거부가 턴을 소진해 상한을 넘겼다. 스킬을 호출한 세션은 턴을 하나 더 쓰므로 상한 초과 확률이 높아 "오류"로 제외됐고, 그 결과 **발화 트라이얼만 선택적으로 탈락**해 recall이 0/11로 관측됐다. 실제로는 제외된 26건 중 18건이 발화했다. 게이트가 아니라 계측을 고쳤다(HARNESS §2.3 1단계, RUNBOOK #20~22).

## 벤치마크 실행 환경 (M4)
- 대상 레포: tiangolo/full-stack-fastapi-template — `bench/target/`에 클론(비커밋, .gitignore)
- 실행: headless 에이전트 세션, 완료 통지 즉시 저장(RUNBOOK #9). M1 인프라 재사용(Node22 러너·분리 실행·증분 저장·재개 루프)
- **검증 모델 2종: `claude-sonnet-5` + `claude-opus-5`** (사용자 확정 2026-08-19 — INV-7 모델 2종 게이트, DESIGN §7.3)
- **Ponytail 4.9.0** — user 스코프 플러그인 설치(스킬 6종·훅 3종·상시 ~983tok). 전역 `%APPDATA%\ponytail\config.json` = `{"defaultMode":"off"}` (비벤치마크 세션 오염 방지)
- **군별 모드 제어**: `PONYTAIL_DEFAULT_MODE` env가 config를 이긴다(2026-08-19 프로브 실증: config off + env full → 주입 확인). A군 `off` / B·C군 `full`을 트라이얼 env로 주입 — 결정적 3군 분리(INV-9)
