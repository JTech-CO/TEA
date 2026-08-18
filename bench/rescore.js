#!/usr/bin/env node
// 소급 재채점 — 채점 결함(untracked 신규 파일이 영역 판정에서 누락) 교정.
// 워크스페이스는 삭제됐지만 stream 로그에 Write/Edit 경로가 전부 남아 있으므로,
// 로그에서 편집·생성 경로를 재구성해 assertion을 다시 판정하고 결과 JSON을 갱신한다.
// 판정: classification ok AND (성공한 Edit/Write ≥1) AND (경로 중 task.area 포함 ≥1).
// 게이트 수치·정의는 불변 — 관측을 바로잡는 것이다. 원 판정은 assertionV1로 보존한다.
// 사용: node bench/rescore.js bench/results/bench-*.json
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EDIT_WRITE = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

function touchedAreas(logPath) {
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const okIds = new Set();
  const calls = [];
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'tool_use' && EDIT_WRITE.has(b.name) && b.input) {
          calls.push({ id: b.id, path: String(b.input.file_path || b.input.notebook_path || '') });
        }
      }
    }
    if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'tool_result' && !b.is_error) okIds.add(b.tool_use_id);
      }
    }
  }
  const paths = calls.filter((c) => okIds.has(c.id)).map((c) => c.path.replace(/\\/g, '/').toLowerCase());
  // 절대 경로(C:/.../bw-x/frontend/...)와 상대 경로(frontend/...) 모두 매칭해야 한다 —
  // 모델마다 경로 표기가 다르다 (opus는 절대, sonnet은 상대 관측)
  const inArea = (area) => paths.some((p) => new RegExp(`(^|/)${area}/`).test(p));
  return {
    edits: paths.length,
    frontend: inArea('frontend'),
    backend: inArea('backend'),
  };
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('사용: node bench/rescore.js <results.json...>'); process.exit(2); }
  let flips = 0, total = 0;
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const t of rec.trials) {
      if (t.classification !== 'ok') continue;
      total++;
      const logPath = path.join(ROOT, t.log);
      if (!fs.existsSync(logPath)) { console.error(`  로그 없음: ${t.log}`); continue; }
      const ta = touchedAreas(logPath);
      const pass = ta.edits > 0 && (t.area === 'frontend' ? ta.frontend : ta.backend);
      if (!t.assertion) t.assertion = {};
      if (t.assertion.assertionV1 === undefined) t.assertion.assertionV1 = t.assertion.pass;
      if (t.assertion.pass !== pass) flips++;
      t.assertion.pass = pass;
      t.assertion.rescoredFromLog = true;
      t.assertion.logEdits = ta.edits;
    }
    fs.writeFileSync(f, JSON.stringify(rec, null, 2));
    console.log(`재채점: ${f}`);
  }
  console.log(`ok 트라이얼 ${total}건 중 판정 변경 ${flips}건`);
}

main();
