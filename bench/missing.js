#!/usr/bin/env node
// 벤치 결손 (id#arm#model#run) 계산 — bench/results/bench-*.json의 ok 트라이얼을 완료로 간주.
// 사용: node bench/missing.js [--arms B] [--models sonnet,opus] [--n 4]
// 출력: 결손 쌍 쉼표 목록 (군 순서 B → A → C — B군 재현 대조 선행, RUNBOOK #10) 또는 DONE
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'tasks.json'), 'utf8'));

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
const arms = argValue('--arms', 'B,A,C').split(',');
const models = argValue('--models', 'sonnet,opus').split(',');
const n = Number(argValue('--n', 4));

const done = new Set();
const dir = path.join(ROOT, 'bench', 'results');
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('bench-') && x.endsWith('.json'))) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const t of rec.trials) if (t.classification === 'ok') done.add(t.id);
  }
}
const ARM_ORDER = ['B', 'A', 'C'];
const missing = [];
for (const arm of ARM_ORDER) {
  if (!arms.includes(arm)) continue;
  for (const task of CONFIG.tasks) for (const model of models) {
    for (let r = 1; r <= n; r++) {
      const id = `${task.id}#${arm}#${model}#${r}`;
      if (!done.has(id)) missing.push(id);
    }
  }
}
process.stdout.write(missing.length ? missing.join(',') : 'DONE');
