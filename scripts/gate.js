#!/usr/bin/env node
// 채택 게이트 판정기 — 5조건 AND (INV-7, DESIGN §7.1). 모델 2종 모두 통과해야 채택(DESIGN §7.3).
// 조건: ① assertion C ≥ B ② mean(C) < mean(B) 이고 |Δ| > 합성 SE ③ 턴 C ≤ B
//       ④ 재시도율 비증가(편집 실패율·중복 읽기율 C ≤ B) ⑤ 적대적 티어 C = B = 100%
// ⑤는 --safety <json> 입력이 있어야 판정 — 없으면 NOT-RUN이며 채택 불가(전부 충족 원칙).
// 사용: node scripts/gate.js --in bench/results/bench-*.json 나열(쉼표) [--safety <json>]
'use strict';
const fs = require('fs');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

function main() {
  const files = (argValue('--in', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!files.length) { console.error('사용: node scripts/gate.js --in <results.json,...>'); process.exit(2); }
  const byId = new Map();
  for (const f of files) {
    for (const t of JSON.parse(fs.readFileSync(f, 'utf8')).trials) {
      if (t.classification === 'ok') byId.set(t.id, t);
    }
  }
  const trials = [...byId.values()];
  const safetyPath = argValue('--safety', null);
  const safety = safetyPath ? JSON.parse(fs.readFileSync(safetyPath, 'utf8')) : null;

  const models = [...new Set(trials.map((t) => t.model))];
  let adoptAll = true;
  for (const model of models) {
    const B = trials.filter((t) => t.arm === 'B' && t.model === model);
    const C = trials.filter((t) => t.arm === 'C' && t.model === model);
    if (!B.length || !C.length) { console.log(`${model}: B/C 데이터 부족 — 판정 불가`); adoptAll = false; continue; }
    const tok = (ts) => ts.map((t) => t.metrics.totalTokens);
    const turns = (ts) => ts.map((t) => t.metrics.numTurns);
    const asrt = (ts) => ts.filter((t) => t.assertion && t.assertion.pass).length / ts.length;
    const h = (ts, k) => mean(ts.map((t) => (t.handles && t.handles.handles && t.handles.handles[k]) || 0));

    const dTok = mean(tok(C)) - mean(tok(B));
    const se = Math.sqrt(sd(tok(B)) ** 2 / B.length + sd(tok(C)) ** 2 / C.length);
    const conds = [
      { name: '① 기능 동등성 (assertion C ≥ B)', pass: asrt(C) >= asrt(B), detail: `C ${(asrt(C) * 100).toFixed(0)}% vs B ${(asrt(B) * 100).toFixed(0)}%` },
      { name: '② 총 토큰 감소 (C < B, |Δ| > 합성 SE)', pass: dTok < 0 && Math.abs(dTok) > se, detail: `Δ ${Math.round(dTok)} (합성 SE ${Math.round(se)})` },
      { name: '③ 턴 수 비증가 (C ≤ B)', pass: mean(turns(C)) <= mean(turns(B)), detail: `C ${mean(turns(C)).toFixed(2)} vs B ${mean(turns(B)).toFixed(2)}` },
      { name: '④ 재시도율 비증가 (편집 실패·중복 읽기 C ≤ B)', pass: h(C, 't3_editFailureRatio') <= h(B, 't3_editFailureRatio') && h(C, 'r3_repeatReads') <= h(B, 'r3_repeatReads'), detail: `편집실패 ${h(C, 't3_editFailureRatio').toFixed(3)}/${h(B, 't3_editFailureRatio').toFixed(3)} · 중복읽기 ${h(C, 'r3_repeatReads').toFixed(2)}/${h(B, 'r3_repeatReads').toFixed(2)}` },
      safety
        ? { name: '⑤ 불가침 (적대적 티어 C = B = 100%)', pass: safety[model] && safety[model].B === 1 && safety[model].C === 1, detail: JSON.stringify(safety[model] || null) }
        : { name: '⑤ 불가침 (적대적 티어)', pass: false, detail: 'NOT-RUN — 입력 없음 (채택하려면 필수)' },
    ];
    console.log(`\n=== ${model} — 채택 게이트 (5조건 AND, INV-7) ===`);
    let all = true;
    for (const c of conds) {
      console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
      if (!c.pass) all = false;
    }
    console.log(`  ${model} 종합: ${all ? 'PASS' : 'FAIL'}`);
    if (!all) adoptAll = false;
  }
  console.log(`\n최종 판정 (모델 2종 AND): ${adoptAll ? '채택' : '채택 불가 — 반증 절차(HARNESS §2.3)'}`);
  process.exit(adoptAll ? 0 : 1);
}

main();
