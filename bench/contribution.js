#!/usr/bin/env node
// 규칙별 기여도 분석 (M6, DESIGN §6.4) — 추가 측정 없이 수집 데이터로:
//  1) C군 내 핸들 × 총토큰 상관 — (태스크, 모델) 평균을 제거한 잔차 기준 (태스크 난이도 교란 통제)
//  2) 전달 기전 비용 분해 — Skill 호출·references 읽기 횟수를 로그에서 직접 계수,
//     Δ턴·ΔcacheRead와 산술 대조 (오버헤드 가설 검증)
//  3) B→C 핸들 행동 델타 — 규율이 실제로 행동을 바꿨는가
//  4) 태스크별 C−B 토큰 델타 — 절감이 존재하는 하위군이 있는가
// 사용: node bench/contribution.js --in bench/results/bench-*.json(쉼표 나열)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (+x).toFixed(d));

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// 로그에서 전달 기전 계수 — Skill 호출 수, references 읽기 수(성공 기준 아님·시도 기준)
function deliveryCounts(logPath) {
  let skillCalls = 0, refReads = 0, claudeMdReads = 0;
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
    for (const b of ev.message.content) {
      if (b.type !== 'tool_use') continue;
      if (b.name === 'Skill') skillCalls++;
      if (b.name === 'Read' && b.input) {
        const p = String(b.input.file_path || '').replace(/\\/g, '/').toLowerCase();
        if (p.includes('/skills/tea/')) refReads++;
        if (p.endsWith('/claude.md')) claudeMdReads++;
      }
    }
  }
  return { skillCalls, refReads, claudeMdReads };
}

function main() {
  const files = (argValue('--in', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const byId = new Map();
  for (const f of files) {
    for (const t of JSON.parse(fs.readFileSync(f, 'utf8')).trials) {
      if (t.classification === 'ok') byId.set(t.id, t);
    }
  }
  const trials = [...byId.values()];
  const HANDLES = ['r1_searchLedReadRatio', 'r2_rangedReadRatio', 'r3_repeatReads', 'r4_treeCalls',
    'w1_fullRewriteRatio', 'w2_anchorMisses', 'w3_newFiles', 'w4_unrequestedArtifacts', 'w5_codeRestatements',
    't1_reverts', 't2_sameFileChurn', 't3_editFailureRatio'];
  const hv = (t, k) => (t.handles && t.handles.handles ? t.handles.handles[k] : null);

  // ---------- 1) C군 잔차 상관 (핸들 값 ↑ = 규칙 위반 방향인 핸들: r3, w1, w2, w4, w5, t1, t2, t3 / 준수 방향: r1, r2) ----------
  const C = trials.filter((t) => t.arm === 'C');
  const groups = new Map(); // task|model → C trials
  for (const t of C) {
    const k = `${t.task}|${t.model}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  console.log('=== 1) C군 내 핸들 × 총토큰 잔차 상관 (태스크·모델 평균 제거, n=' + C.length + ') ===');
  console.log('    양(+)의 r = 핸들 값이 클수록 토큰 증가');
  for (const h of HANDLES) {
    const xs = [], ys = [];
    for (const [, ts] of groups) {
      const vals = ts.map((t) => hv(t, h)).filter((v) => v !== null && v !== undefined);
      if (vals.length < 2) continue;
      const mh = mean(vals);
      const mt = mean(ts.map((t) => t.metrics.totalTokens));
      for (const t of ts) {
        const v = hv(t, h);
        if (v === null || v === undefined) continue;
        xs.push(v - mh);
        ys.push(t.metrics.totalTokens - mt);
      }
    }
    console.log(`  ${h.padEnd(26)} r = ${r2(pearson(xs, ys))}  (표본 ${xs.length})`);
  }

  // ---------- 2) 전달 기전 분해 ----------
  console.log('\n=== 2) 전달 기전 비용 분해 (C군 로그 직접 계수) ===');
  for (const model of ['sonnet', 'opus']) {
    const Cm = C.filter((t) => t.model === model);
    const Bm = trials.filter((t) => t.arm === 'B' && t.model === model);
    const counts = Cm.map((t) => {
      const lp = path.join(ROOT, t.log);
      return fs.existsSync(lp) ? deliveryCounts(lp) : null;
    }).filter(Boolean);
    const mSkill = mean(counts.map((c) => c.skillCalls));
    const mRef = mean(counts.map((c) => c.refReads));
    const dTurns = mean(Cm.map((t) => t.metrics.numTurns)) - mean(Bm.map((t) => t.metrics.numTurns));
    const dCacheRead = mean(Cm.map((t) => t.metrics.cacheReadTokens)) - mean(Bm.map((t) => t.metrics.cacheReadTokens));
    const bPerTurn = mean(Bm.map((t) => t.metrics.cacheReadTokens)) / mean(Bm.map((t) => t.metrics.numTurns));
    console.log(`  ${model}: Skill 호출 ${r2(mSkill)}회/세션 · references 읽기 ${r2(mRef)}회/세션`);
    console.log(`    Δ턴 ${r2(dTurns)} vs 전달 행위 합 ${r2(mSkill + mRef)} — 추가 턴의 ${r2(((mSkill + mRef) / dTurns) * 100, 0)}%를 전달 기전이 설명`);
    console.log(`    ΔcacheRead ${Math.round(dCacheRead)} vs Δ턴×B군 턴당 컨텍스트(${Math.round(bPerTurn)}) = ${Math.round(dTurns * bPerTurn)} — 산술 정합 ${r2((dTurns * bPerTurn / dCacheRead) * 100, 0)}%`);
  }

  // ---------- 3) B→C 핸들 행동 델타 ----------
  console.log('\n=== 3) B→C 핸들 행동 델타 (규율이 행동을 바꿨는가) ===');
  for (const model of ['sonnet', 'opus']) {
    const Bm = trials.filter((t) => t.arm === 'B' && t.model === model);
    const Cm = C.filter((t) => t.model === model);
    const row = HANDLES.map((h) => {
      const b = mean(Bm.map((t) => hv(t, h)).filter((v) => v !== null));
      const c = mean(Cm.map((t) => hv(t, h)).filter((v) => v !== null));
      return `${h.split('_')[0]} ${r2(b)}→${r2(c)}`;
    }).join(' · ');
    console.log(`  ${model}: ${row}`);
  }

  // ---------- 4) 태스크별 C−B 델타 ----------
  console.log('\n=== 4) 태스크별 C−B 총토큰 델타 (절감 하위군 존재 여부) ===');
  const tasks = [...new Set(trials.map((t) => t.task))].sort();
  for (const model of ['sonnet', 'opus']) {
    const parts = [];
    let neg = 0;
    for (const task of tasks) {
      const b = mean(trials.filter((t) => t.arm === 'B' && t.model === model && t.task === task).map((t) => t.metrics.totalTokens));
      const c = mean(trials.filter((t) => t.arm === 'C' && t.model === model && t.task === task).map((t) => t.metrics.totalTokens));
      const d = Math.round((c - b) / 1000);
      if (d < 0) neg++;
      parts.push(`${task.replace('tmpl-', '')} ${d > 0 ? '+' : ''}${d}k`);
    }
    console.log(`  ${model} (절감 태스크 ${neg}/${tasks.length}): ${parts.join(' · ')}`);
  }
}

main();
