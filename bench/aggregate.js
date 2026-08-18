#!/usr/bin/env node
// 벤치마크 집계 — (태스크, 군, 모델) 셀별 mean±sd, 군 롤업, C−B 순기여 델타(INV-9).
// 채택 판정은 여기서 하지 않는다 — 그것은 M6 scripts/gate.js의 몫(INV-7).
// 사용:
//   node bench/aggregate.js --in bench/results/bench-<ts>.json[,파일2...]
//   node bench/aggregate.js --in <파일> --schema-check   (INV-8·9·10 스키마 게이트)
'use strict';
const fs = require('fs');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
const r = (x, d = 1) => (x === null || x === undefined ? '—' : (+x).toFixed(d));

function loadTrials(files) {
  const byId = new Map();
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const t of rec.trials) {
      const prev = byId.get(t.id);
      if (prev && prev.classification === 'ok') {
        console.error(`[aggregate] 병합 거부: ${t.id} 유효 관측 중복 (재추첨 금지)`);
        process.exit(1);
      }
      byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}

function main() {
  const files = (argValue('--in', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!files.length) { console.error('사용: node bench/aggregate.js --in <results.json>[,...]'); process.exit(2); }
  const trials = loadTrials(files);
  const ok = trials.filter((t) => t.classification === 'ok');
  const bad = trials.filter((t) => t.classification !== 'ok');

  if (process.argv.includes('--schema-check')) {
    // INV-10: 집계 스키마에 reasoning 필드 존재
    const hasReasoning = ok.length > 0 && ok.every((t) => t.metrics && 'reasoningTokens' in t.metrics);
    // INV-8: LOC 계열 필드 부재 (스키마 키 전체 검사)
    const keys = new Set();
    const walk = (o, prefix) => {
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(o)) { keys.add(prefix + k); walk(o[k], prefix + k + '.'); }
      }
    };
    trials.forEach((t) => walk(t, ''));
    const locKeys = [...keys].filter((k) => /(^|\.|_)loc(_|\.|$)|linesofcode/i.test(k));
    // INV-9: 3군 매트릭스
    const arms = new Set(trials.map((t) => t.arm));
    console.log(`INV-10 reasoning 필드: ${hasReasoning ? 'PASS' : 'FAIL'} (ok 트라이얼 ${ok.length}건 전수)`);
    console.log(`INV-8 LOC 필드 부재: ${locKeys.length === 0 ? 'PASS' : 'FAIL ' + locKeys.join(',')}`);
    console.log(`INV-9 군 매트릭스: [${[...arms].sort().join(',')}] ${'ABC'.split('').every((a) => arms.has(a)) ? '3군 전부 존재' : '(부분 실행)'}`);
    process.exit(hasReasoning && locKeys.length === 0 ? 0 : 1);
  }

  // 셀별 집계
  const cells = new Map();
  for (const t of ok) {
    const key = `${t.task}|${t.arm}|${t.model}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  console.log('\n셀별 집계 (task | arm | model | n | 총토큰 mean±sd | 턴 mean | assertion | $)');
  for (const [key, ts] of [...cells.entries()].sort()) {
    const tok = ts.map((t) => t.metrics.totalTokens);
    const turns = ts.map((t) => t.metrics.numTurns);
    const cost = ts.map((t) => t.metrics.costUsd || 0);
    const asrt = ts.filter((t) => t.assertion && t.assertion.pass).length;
    console.log(`  ${key.padEnd(38)} n=${ts.length}  ${r(mean(tok), 0)}±${r(sd(tok), 0)}  ${r(mean(turns), 1)}턴  ${asrt}/${ts.length}  $${r(mean(cost), 3)}`);
  }

  // 군 롤업 + C−B 델타 (모델별)
  const models = [...new Set(ok.map((t) => t.model))];
  for (const model of models) {
    console.log(`\n=== ${model} — 군 롤업 ===`);
    const byArm = {};
    for (const arm of ['A', 'B', 'C']) {
      const ts = ok.filter((t) => t.model === model && t.arm === arm);
      if (!ts.length) continue;
      const tok = ts.map((t) => t.metrics.totalTokens);
      const turns = ts.map((t) => t.metrics.numTurns);
      const reasoning = ts.map((t) => t.metrics.reasoningTokens);
      const asrt = ts.filter((t) => t.assertion && t.assertion.pass).length;
      const t3 = ts.map((t) => (t.handles && t.handles.handles && t.handles.handles.t3_editFailureRatio) || 0);
      const r3 = ts.map((t) => (t.handles && t.handles.handles && t.handles.handles.r3_repeatReads) || 0);
      byArm[arm] = { n: ts.length, tok, turns };
      console.log(`  ${arm}: n=${ts.length}  총토큰 ${r(mean(tok), 0)}±${r(sd(tok), 0)}  턴 ${r(mean(turns), 2)}±${r(sd(turns), 2)}  reasoning ${r(mean(reasoning), 0)}  assertion ${asrt}/${ts.length}  편집실패율 ${r(mean(t3), 3)}  중복읽기 ${r(mean(r3), 2)}`);
    }
    if (byArm.B && byArm.C) {
      const dTok = mean(byArm.C.tok) - mean(byArm.B.tok);
      const sB = sd(byArm.B.tok), sC = sd(byArm.C.tok);
      const combined = (sB !== null && sC !== null)
        ? Math.sqrt((sB * sB) / byArm.B.n + (sC * sC) / byArm.C.n) : null;
      const dTurns = mean(byArm.C.turns) - mean(byArm.B.turns);
      console.log(`  C−B (순기여): Δ총토큰 ${r(dTok, 0)} (합성 sd ${r(combined, 0)})  Δ턴 ${r(dTurns, 2)}`);
      if (combined !== null) {
        console.log(`  참고: |Δ| ${Math.abs(dTok) > combined ? '>' : '≤'} 합성 sd — ${Math.abs(dTok) > combined ? '신호 후보' : '분산에 묻힘 (RUNBOOK #13)'} · 채택 판정은 M6 gate.js`);
      }
    }
  }
  if (bad.length) {
    console.log(`\n판정 불가 ${bad.length}건 (재실행 대상):`);
    for (const t of bad) console.log(`  ${t.id}: ${t.classification} — ${String(t.error || '').slice(0, 80)}`);
  }
  process.exit(bad.length ? 1 : 0);
}

main();
