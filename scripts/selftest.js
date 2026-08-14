#!/usr/bin/env node
// M0 DoD 1·2: 게이트 스크립트가 픽스처에서 통과/실패 양방향을 정확히 판정하는지 자기시험.
// 픽스처 통과는 판정 로직의 검증이다 — 실전 판정은 M2에서 실제 산출물로 한다 (M0 리스크 참조).
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const F = 'scripts/fixtures';

function run(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8' }).status;
}

function main() {
  // 시크릿 픽스처는 저장소에 두지 않는다 — 훅이 자기 픽스처를 차단하는 자기모순 방지. 임시 생성 후 삭제.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-selftest-'));
  const secretFile = path.join(tmp, 'leaked.txt');
  fs.writeFileSync(secretFile, 'aws_key = AKIA' + 'ABCDEFGHIJKLMNOP' + '\n');

  const cases = [
    ['token-budget: 정상 예산 → PASS', ['scripts/token-budget.js', `${F}/skill-pass.md`], 0],
    ['token-budget: 본문 상한 초과 → FAIL', ['scripts/token-budget.js', `${F}/skill-fail-budget.md`], 1],
    ['token-budget: 대상 부재 → 코드 2', ['scripts/token-budget.js', `${F}/no-such-file.md`], 2],
    ['forbidden-terms: 깨끗한 본문 + description의 token 언급 허용 → PASS', ['scripts/forbidden-terms.js', '--file', `${F}/skill-pass.md`], 0],
    ['forbidden-terms: 금칙어 포함 본문 → FAIL', ['scripts/forbidden-terms.js', '--file', `${F}/skill-fail-terms.md`], 1],
    ['forbidden-terms: 기본 대상(원장) 검사 → PASS', ['scripts/forbidden-terms.js'], 0],
    ['rule-audit: 실제 원장 → PASS', ['scripts/rule-audit.js'], 0],
    ['rule-audit: 결손 원장(핸들 누락·ID 중복·축 불명) → FAIL', ['scripts/rule-audit.js', '--catalog', `${F}/catalog-fail.json`], 1],
    ['secret-scan: 키 패턴 → 차단', ['scripts/secret-scan.js', '--paths', secretFile], 1],
    ['secret-scan: 깨끗한 파일 → 통과', ['scripts/secret-scan.js', '--paths', `${F}/skill-pass.md`], 0],
  ];

  let fail = 0;
  for (const [name, args, expected] of cases) {
    const got = run(args);
    const ok = got === expected;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (기대 ${expected}, 실제 ${got})`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fail ? `\n자기시험 실패 ${fail}건` : `\n자기시험 전항 통과 (${cases.length}/${cases.length})`);
  process.exit(fail ? 1 : 0);
}

main();
