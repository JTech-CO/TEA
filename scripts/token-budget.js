#!/usr/bin/env node
// INV-3: SKILL.md 예산 이진 판정. 기준: DESIGN §2.2 (본문 상한 1,200토큰), 토크나이저: ADR-0009 (cl100k_base).
// 사용: node scripts/token-budget.js [파일경로]   (기본: tea/SKILL.md)
// 종료 코드: 0 통과 / 1 실패 / 2 대상 파일 부재
'use strict';
const fs = require('fs');

const LIMITS = {
  bodyMaxTokens: 1200,
  bodyTargetTokens: [600, 900],
  descMaxWords: 150,
  descTargetWords: [90, 120],
};

function splitFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? { frontmatter: m[1], body: md.slice(m[0].length) } : { frontmatter: '', body: md };
}

// 간이 YAML — description: 단일행 값과 >-/| 블록 스칼라만 지원 (frontmatter 규약이 그 이상을 쓰지 않음)
function extractDescription(frontmatter) {
  const lines = frontmatter.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^description\s*:/.test(l));
  if (idx === -1) return '';
  const inline = lines[idx].replace(/^description\s*:\s*/, '').trim();
  const parts = [];
  if (inline && !/^[>|][+-]?$/.test(inline)) parts.push(inline);
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    if (/^\s/.test(l)) parts.push(l.trim());
    else break;
  }
  return parts.join(' ').replace(/^["']|["']$/g, '').trim();
}

function countWords(s) {
  return s ? s.split(/\s+/).filter(Boolean).length : 0;
}

async function main() {
  const file = process.argv[2] || 'tea/SKILL.md';
  if (!fs.existsSync(file)) {
    console.log(`[token-budget] 대상 없음: ${file} (M2 이전이면 정상)`);
    process.exit(2);
  }
  const { encode } = await import('gpt-tokenizer/encoding/cl100k_base');
  const md = fs.readFileSync(file, 'utf8');
  const { frontmatter, body } = splitFrontmatter(md);
  const bodyTokens = encode(body).length;
  const desc = extractDescription(frontmatter);
  const descWords = countWords(desc);

  const failures = [];
  const warnings = [];
  if (bodyTokens > LIMITS.bodyMaxTokens) {
    failures.push(`본문 ${bodyTokens}tok > 상한 ${LIMITS.bodyMaxTokens} (INV-3)`);
  } else if (bodyTokens < LIMITS.bodyTargetTokens[0] || bodyTokens > LIMITS.bodyTargetTokens[1]) {
    warnings.push(`본문 ${bodyTokens}tok — 목표 ${LIMITS.bodyTargetTokens.join('~')} 밖 (상한 내)`);
  }
  if (frontmatter && !desc) failures.push('frontmatter에 description 없음');
  if (descWords > LIMITS.descMaxWords) {
    failures.push(`description ${descWords}단어 > 상한 ${LIMITS.descMaxWords}`);
  } else if (desc && (descWords < LIMITS.descTargetWords[0] || descWords > LIMITS.descTargetWords[1])) {
    warnings.push(`description ${descWords}단어 — 목표 ${LIMITS.descTargetWords.join('~')} 밖 (상한 내)`);
  }

  console.log(`[token-budget] ${file} (cl100k_base)`);
  console.log(`  본문: ${bodyTokens} 토큰 / 상한 ${LIMITS.bodyMaxTokens}`);
  console.log(`  description: ${descWords} 단어 / 상한 ${LIMITS.descMaxWords}`);
  for (const w of warnings) console.log(`  경고: ${w}`);
  for (const f of failures) console.log(`  실패: ${f}`);
  console.log(`  판정: ${failures.length ? 'FAIL' : 'PASS'}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`[token-budget] 오류: ${e.message}`);
  process.exit(1);
});
