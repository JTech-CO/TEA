#!/usr/bin/env node
// 세션 로그(stream-json) → 측정 핸들 12종 추출. 원장: rules/catalog.json (INV-6).
// 각 핸들의 조작적 정의(operationalization)는 아래 주석에 원장 문구와 함께 명시한다.
// 사용: node bench/parse-handles.js <log.jsonl> [taskPrompt]   (모듈: parseFile/extract)
'use strict';
const fs = require('fs');

const READ_TOOLS = new Set(['Read']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit']);
const WRITE_TOOLS = new Set(['Write']);
const ARTIFACT_RE = /(test|spec|readme|example|sample|\.md$|\.ya?ml$|\.config\.)/i;
const FENCE_RE = /```[\s\S]*?```/g;

function parseEvents(lines) {
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* 비 JSON 줄 무시 */ }
  }
  return events;
}

function extract(events, taskPrompt) {
  const calls = [];
  const resultById = new Map();
  const assistantTexts = [];
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'tool_use') calls.push({ name: b.name, input: b.input || {}, id: b.id });
        if (b.type === 'text' && b.text) assistantTexts.push(b.text);
      }
    }
    if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'tool_result') {
          let text = '';
          if (typeof b.content === 'string') text = b.content;
          else if (Array.isArray(b.content)) text = b.content.map((c) => c.text || '').join('\n');
          resultById.set(b.tool_use_id, { isError: !!b.is_error, text });
        }
      }
    }
  }

  const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
  let searchSeen = 0;
  const readsByPath = new Map();
  const lastMutationAt = new Map();
  const seenPaths = new Set();
  const writtenLines = new Set();

  let reads = 0, readsAfterSearch = 0, rangedReads = 0, repeatReads = 0;
  let treeCalls = 0;
  let edits = 0, fullRewrites = 0, newFiles = 0, unrequestedArtifacts = 0;
  let anchorMisses = 0, editAttempts = 0, editFailures = 0;
  let reverts = 0, sameFileChurn = 0;
  const editHistory = [];
  let prevEditPath = null;
  const promptLower = String(taskPrompt || '').toLowerCase();

  const rememberWritten = (s) => {
    for (const l of String(s || '').split('\n')) {
      const t = l.trim();
      if (t.length >= 8) writtenLines.add(t);
    }
  };

  calls.forEach((c, i) => {
    const res = resultById.get(c.id) || { isError: false, text: '' };
    if (SEARCH_TOOLS.has(c.name)) {
      searchSeen++;
      // R4 "디렉터리 탐색은 필요한 깊이까지만 한다" — 핸들: 트리 탐색 호출 수·깊이
      if (c.name === 'Glob') treeCalls++;
      return;
    }
    if (READ_TOOLS.has(c.name)) {
      reads++;
      const p = norm(c.input.file_path);
      // R1 "파일을 열기 전에 검색으로 대상을 특정한다" — 핸들: 읽기 직전 검색 호출 유무
      // 조작화: 해당 읽기 이전에 검색 호출이 세션에 1회 이상 존재
      if (searchSeen > 0) readsAfterSearch++;
      // R2 "확인된 범위만 읽는다" — 핸들: 범위 지정 읽기 비율 (offset/limit 지정)
      if (c.input.offset !== undefined || c.input.limit !== undefined) rangedReads++;
      // R3 "이미 읽은 파일을 다시 읽지 않는다. 편집 후 검증은 예외" — 핸들: 동일 경로 중복 읽기 횟수
      // 조작화: 같은 경로 재읽기 중, 직전 읽기 이후 그 경로에 편집이 없었던 것만 센다
      const prior = readsByPath.get(p) || [];
      if (prior.length > 0) {
        const lastRead = prior[prior.length - 1];
        const mutated = (lastMutationAt.get(p) || -1) > lastRead;
        if (!mutated) repeatReads++;
      }
      prior.push(i);
      readsByPath.set(p, prior);
      seenPaths.add(p);
      return;
    }
    if (EDIT_TOOLS.has(c.name)) {
      editAttempts++;
      const p = norm(c.input.file_path || c.input.notebook_path);
      // T3 "대상 코드의 현재 상태를 모르는 채로 편집하지 않는다" — 핸들: 편집 실패율
      if (res.isError) {
        editFailures++;
        // W2 "편집 앵커는 고유성이 확보되는 최소 폭" — 핸들: 앵커 불일치 실패 횟수
        if (/not found|no match|not unique|found \d+ matches|does not match/i.test(res.text)) anchorMisses++;
      } else {
        edits++;
        const oldStr = c.input.old_string || '';
        const newStr = c.input.new_string || '';
        // T1 "되돌리기 비용이 확인 비용보다 크면 확인을 먼저" — 핸들: 편집 되돌림·재편집 횟수
        // 조작화: 이전 편집의 new_string을 정확히 되돌리는 편집
        for (const h of editHistory) {
          if (h.path === p && h.newStr && h.newStr === oldStr) { reverts++; break; }
        }
        // T2 "설계 선택은 편집 전에 해소" — 핸들: 동일 파일 연속 재편집 횟수
        if (prevEditPath === p) sameFileChurn++;
        editHistory.push({ path: p, oldStr, newStr });
        rememberWritten(newStr);
        lastMutationAt.set(p, i);
        seenPaths.add(p);
        prevEditPath = p;
      }
      return;
    }
    if (WRITE_TOOLS.has(c.name)) {
      editAttempts++;
      const p = norm(c.input.file_path);
      if (res.isError) { editFailures++; return; }
      // W1 "부분 치환 우선. 전체 재작성은 구조 변경에 한정" — 핸들: 전체 쓰기 대 부분 치환 비율
      // 조작화: 기존 관측 경로에 대한 Write = 전체 재작성, 미관측 경로 = 신규 생성(W3)
      if (seenPaths.has(p)) {
        fullRewrites++;
      } else {
        // W3 "새 파일 생성보다 기존 파일 확장을 우선" — 핸들: 신규 파일 생성 수
        newFiles++;
        // W4 "테스트·README·예제·설정은 요청 시에만" — 핸들: 요청 외 파일 생성 수
        const base = p.split('/').pop();
        if (ARTIFACT_RE.test(base) && !promptLower.includes('test') && !promptLower.includes('readme')) {
          unrequestedArtifacts++;
        }
      }
      rememberWritten(c.input.content);
      lastMutationAt.set(p, i);
      seenPaths.add(p);
      prevEditPath = null;
      return;
    }
    prevEditPath = null; // 다른 도구가 끼면 연속 편집이 아니다
  });

  // W5 "diff로 확인 가능한 내용을 산문으로 다시 쓰지 않는다" — 핸들: 응답 내 코드 블록 재게시 수
  // 조작화: 응답 텍스트의 코드 펜스(내용 ≥4줄) 중 60% 이상의 줄이 이미 기록된 내용과 일치
  let codeRestatements = 0;
  for (const text of assistantTexts) {
    const fences = text.match(FENCE_RE) || [];
    for (const f of fences) {
      const lines = f.split('\n').slice(1, -1).map((l) => l.trim()).filter((l) => l.length >= 8);
      if (lines.length < 4) continue;
      const hit = lines.filter((l) => writtenLines.has(l)).length;
      if (hit / lines.length >= 0.6) codeRestatements++;
    }
  }

  return {
    handles: {
      r1_searchLedReadRatio: reads ? +(readsAfterSearch / reads).toFixed(3) : null,
      r2_rangedReadRatio: reads ? +(rangedReads / reads).toFixed(3) : null,
      r3_repeatReads: repeatReads,
      r4_treeCalls: treeCalls,
      w1_fullRewriteRatio: (fullRewrites + edits) ? +(fullRewrites / (fullRewrites + edits)).toFixed(3) : null,
      w2_anchorMisses: anchorMisses,
      w3_newFiles: newFiles,
      w4_unrequestedArtifacts: unrequestedArtifacts,
      w5_codeRestatements: codeRestatements,
      t1_reverts: reverts,
      t2_sameFileChurn: sameFileChurn,
      t3_editFailureRatio: editAttempts ? +(editFailures / editAttempts).toFixed(3) : null,
    },
    counts: { toolCalls: calls.length, reads, searches: searchSeen, edits, writes: fullRewrites + newFiles, editAttempts, editFailures },
  };
}

function parseFile(path, taskPrompt) {
  const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
  return extract(parseEvents(lines), taskPrompt);
}

module.exports = { parseFile, extract, parseEvents };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('사용: node bench/parse-handles.js <log.jsonl>'); process.exit(2); }
  console.log(JSON.stringify(parseFile(file, process.argv[3] || ''), null, 2));
}
