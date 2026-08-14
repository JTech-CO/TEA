# FILE_TREE — 구조와 경계 규칙

## 트리 (M0 시점)
```
<root>/
├── CLAUDE.md                 하네스 포인터 (Claude Code 자동 로드)
├── package.json              검증 스크립트 러너 + 토크나이저 버전 고정
├── .gitattributes            줄바꿈 LF 고정 — 토큰 측정 일관성 (RUNBOOK #4)
├── .githooks/pre-commit      시크릿·대용량 차단 (INV-1·2)
├── docs/                     백서 세트 (docs/README.md 참조)
├── harness/                  운영 규율 팩 — phases/·decisions/·gates/
├── rules/catalog.json        규칙 원장 — ID·문안·측정 핸들 12종의 단일 출처
├── scripts/                  게이트 스크립트 4종 + selftest + fixtures/
└── tea/                      (M2~) SKILL.md, references/, evals/
    └── (M7~) .claude-plugin/, hooks/, commands/
```
`bench/`는 M4에서 추가한다 (아티팩트는 비커밋).

## 경계 규칙
1. **tea/는 호스트 의존 금지** — M0~M6 동안 스킬 파일만 둔다. 플러그인 어댑터는 M7에서 추가(ADR-0002). skills 상당 위치를 유지해 전환 시 어댑터만 얹는다(DESIGN §2.3)
2. **tea/evals/는 배포 제외** — 저장소 전용(DESIGN §2.1)
3. **rules/catalog.json이 규칙의 단일 출처** — SKILL.md 본문과의 정합은 `check:rules`가 강제(INV-6). 규칙 추가·제거는 원장과 본문을 **한 커밋에서 동기 수정**
4. **세션 로그 원본·벤치 아티팩트·.env는 비커밋** — .gitignore + pre-commit이 집행(INV-1·2). 커밋 대상은 요약 통계뿐
5. **harness/PROGRESS.md만 매 세션 갱신** — 나머지 하네스 파일은 결정·사건 발생 시에만
6. **금칙어 검사 범위** — tea/SKILL.md 본문(frontmatter 제외) + tea/references/ + rules/catalog.json. frontmatter description은 사용자 표현 매칭을 위해 "tokens" 언급이 허용된다(DESIGN §3.2, ADR-0005)
