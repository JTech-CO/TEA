#!/usr/bin/env node
// INV-6: ID·측정 핸들 정합 감사 — ID와 핸들이 없는 규칙은 규칙이 아니다 (DESIGN §4.1).
// 원장: rules/catalog.json. 측정 축(READ/WRITE/THINK) 규칙은 핸들 필수, 축별 규칙 수는 원장의 선언과 일치해야 한다.
// tea/SKILL.md 존재 시 본문↔원장 교차 검증 (원장의 모든 ID가 본문에, 본문의 모든 ID가 원장에 — M2 DoD 4·5).
// 사용: node scripts/rule-audit.js [--catalog 경로] [--skill 경로]
// 종료 코드: 0 통과 / 1 실패 / 2 원장 부재
'use strict';
const fs = require('fs');

const MEASURED_AXES = ['READ', 'WRITE', 'THINK'];
const VALID_AXES = ['ladder', 'READ', 'WRITE', 'THINK', 'forbidden', 'stub'];
const ID_RE = /^[LRWTXP]\d+$/;

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

function main() {
  const catalogPath = argValue('--catalog', 'rules/catalog.json');
  const skillPath = argValue('--skill', 'tea/SKILL.md');

  if (!fs.existsSync(catalogPath)) {
    console.log(`[rule-audit] 원장 없음: ${catalogPath}`);
    process.exit(2);
  }
  const failures = [];
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (e) {
    console.log(`[rule-audit] 원장 파싱 실패: ${e.message}`);
    process.exit(1);
  }
  const rules = Array.isArray(catalog.rules) ? catalog.rules : [];
  if (rules.length === 0) failures.push('원장에 규칙이 없다');

  const seenIds = new Set();
  const seenHandles = new Set();
  for (const r of rules) {
    if (!r.id || !ID_RE.test(r.id)) failures.push(`ID 형식 위반: ${JSON.stringify(r.id)}`);
    else if (seenIds.has(r.id)) failures.push(`ID 중복: ${r.id}`);
    else seenIds.add(r.id);
    if (!VALID_AXES.includes(r.axis)) failures.push(`${r.id || '?'}: 축 불명 ${JSON.stringify(r.axis)}`);
    if (!r.text || !String(r.text).trim()) failures.push(`${r.id || '?'}: 문안 없음`);
    if (MEASURED_AXES.includes(r.axis)) {
      if (!r.handle || !String(r.handle).trim()) failures.push(`${r.id || '?'}: 측정 핸들 없음 (INV-6)`);
      else if (seenHandles.has(r.handle)) failures.push(`${r.id}: 핸들 중복 — ${r.handle}`);
      else seenHandles.add(r.handle);
    }
  }

  // 축별 기대 수 — 원장이 스스로 선언 (M6에서 규칙 제거 시 선언도 같은 커밋에서 갱신)
  if (catalog.expectedMeasured) {
    for (const [axis, n] of Object.entries(catalog.expectedMeasured)) {
      const actual = rules.filter((r) => r.axis === axis).length;
      if (actual !== n) failures.push(`${axis} 규칙 수 ${actual} != 선언 ${n}`);
    }
  }

  const measured = rules.filter((r) => MEASURED_AXES.includes(r.axis));
  const withHandle = measured.filter((r) => r.handle && String(r.handle).trim());

  // 본문 교차 검증 (M2~)
  let crossNote = `${skillPath} 부재 — 원장 단독 감사 (M2 전 정상)`;
  if (fs.existsSync(skillPath)) {
    const body = fs.readFileSync(skillPath, 'utf8');
    const bodyIds = new Set(body.match(/\b[LRWTXP]\d+\b/g) || []);
    const missing = [...seenIds].filter((id) => !bodyIds.has(id));
    const unknown = [...bodyIds].filter((id) => !seenIds.has(id));
    if (missing.length) failures.push(`본문에 없는 원장 ID: ${missing.join(', ')}`);
    if (unknown.length) failures.push(`원장에 없는 본문 ID: ${unknown.join(', ')}`);
    crossNote = `본문 교차 검증 수행 — 본문 ID ${bodyIds.size}개`;
  }

  console.log(`[rule-audit] ${catalogPath}`);
  console.log(`  규칙 ${rules.length}개 / 측정 축 ${measured.length}개 / 핸들 ${withHandle.length}개`);
  console.log(`  ${crossNote}`);
  for (const f of failures) console.log(`  실패: ${f}`);
  console.log(`  판정: ${failures.length ? 'FAIL' : 'PASS'}`);
  process.exit(failures.length ? 1 : 0);
}

main();
