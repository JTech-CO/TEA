#!/usr/bin/env node
// INV-5: 규칙 문구 금칙어 검사 — 규칙은 행동만 기술하고 결과(토큰) 수준 서술을 금지한다 (ADR-0005).
// 기본 대상: tea/SKILL.md 본문(frontmatter 제외) + rules/catalog.json + tea/references/*.md
// 사용: node scripts/forbidden-terms.js [--file 경로]   (--file은 테스트용, frontmatter 제외 후 검사)
// 종료 코드: 0 통과 / 1 검출 / 2 대상 전부 부재
'use strict';
const fs = require('fs');
const path = require('path');

// 한국어 3종은 INV-5 원문, 영문은 그 등가어. 목록 변경은 ADR을 요구한다 (ADR-0005).
const PATTERNS = [
  { label: '토큰', re: /토큰/ },
  { label: '짧게', re: /짧게/ },
  { label: '줄여', re: /줄여/ },
  { label: 'token', re: /\btokens?\b/i },
  { label: 'shorten', re: /\bshorten(s|ed|ing)?\b/i },
  { label: 'reduce', re: /\breduc(e|es|ed|ing|tion)\b/i },
  { label: 'minimize', re: /\bminimi[sz](e|es|ed|ing)\b/i },
];

function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? md.slice(m[0].length) : md;
}

function scan(file, text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const p of PATTERNS) {
      if (p.re.test(line)) hits.push({ file, line: i + 1, term: p.label, text: line.trim().slice(0, 80) });
    }
  });
  return hits;
}

function main() {
  const fileArg = process.argv.indexOf('--file');
  let targets;
  if (fileArg !== -1) {
    targets = [{ file: process.argv[fileArg + 1], stripFm: true }];
  } else {
    targets = [
      { file: 'tea/SKILL.md', stripFm: true },
      { file: 'rules/catalog.json', stripFm: false },
    ];
    const refDir = 'tea/references';
    if (fs.existsSync(refDir)) {
      for (const f of fs.readdirSync(refDir)) {
        if (f.endsWith('.md')) targets.push({ file: path.join(refDir, f), stripFm: false });
      }
    }
  }
  const existing = targets.filter((t) => t.file && fs.existsSync(t.file));
  if (existing.length === 0) {
    console.log('[forbidden-terms] 검사 대상 없음 (M2 이전이면 정상)');
    process.exit(2);
  }
  let all = [];
  for (const t of existing) {
    let text = fs.readFileSync(t.file, 'utf8');
    if (t.stripFm) text = stripFrontmatter(text);
    all = all.concat(scan(t.file, text));
  }
  console.log(`[forbidden-terms] 대상 ${existing.length}개 파일`);
  for (const h of all) console.log(`  검출: ${h.file}:${h.line} [${h.term}] ${h.text}`);
  console.log(`  판정: ${all.length ? `FAIL (${all.length}건)` : 'PASS (0건)'}`);
  process.exit(all.length ? 1 : 0);
}

main();
