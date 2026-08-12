# ADR-0009: 예산 판정 토크나이저 — gpt-tokenizer cl100k_base 고정

- 상태: 채택 | 기록: 2026-08-13 (M0 결정 — PROGRESS 미결 항목 해소)

## 컨텍스트
INV-3(본문 ≤ 1,200토큰)은 이진 게이트라 결정적·오프라인·재현 가능한 카운터가 필요하다. Claude의 실제 토크나이저는 비공개이고, API 카운팅은 네트워크·키 의존이라 게이트 수단으로 부적합하다.

## 결정
`gpt-tokenizer`(순수 JS, package-lock.json으로 버전 고정)의 **cl100k_base** 인코딩으로 판정한다. 절대값 정확도보다 일관성을 우선한다(RUNBOOK #4).

## 근거
- 오프라인·결정적 — 누가 언제 돌려도 같은 판정(gates/DOD_GUIDE.md §2)
- cl100k_base는 광범위하게 쓰이는 참조 기준 — 예산 수치(목표 600~900, 상한 1,200)를 이 자로 해석
- 예산의 근거는 자릿수 논증(회피한 전체 읽기 1회 ≈ 10⁴, DESIGN §2.2)이라 토크나이저 간 편차에 강건

## 결과
- 판정 명령: `npm run check:budget` (scripts/token-budget.js)
- 토크나이저·인코딩 변경은 예산 재보정 + 새 ADR을 요구한다
- docs/ENVIRONMENT에 설치 버전 고정 기록
