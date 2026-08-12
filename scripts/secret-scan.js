#!/usr/bin/env node
// INV-1·2 집행: 커밋 전 시크릿·대용량 차단.
// 기본은 staged 모드(pre-commit 훅에서 호출), --paths <files...>는 테스트용.
// 종료 코드: 0 통과 / 1 차단
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');

const SECRET_PATTERNS = [
  { label: 'Anthropic 키', re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { label: 'OpenAI 키', re: /sk-proj-[A-Za-z0-9_-]{20,}/ },
  { label: 'AWS 액세스 키', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'GitHub 토큰', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { label: 'GitHub PAT', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { label: '개인키 블록', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: '범용 키 대입', re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i },
];
const MAX_BYTES = 1024 * 1024; // INV-2: 세션 로그 원본·벤치 아티팩트 등 대용량 커밋 방지

function stagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR -z', { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function main() {
  const pathsArg = process.argv.indexOf('--paths');
  const files = pathsArg !== -1 ? process.argv.slice(pathsArg + 1) : stagedFiles();
  const blocks = [];
  for (const f of files) {
    const base = f.split(/[\\/]/).pop();
    if (/^\.env(\.|$)/.test(base) && base !== '.env.example') {
      blocks.push(`${f}: .env 파일은 커밋 금지 (INV-1)`);
    }
    if (!fs.existsSync(f)) continue;
    const stat = fs.statSync(f);
    if (stat.size > MAX_BYTES) {
      blocks.push(`${f}: ${(stat.size / 1024 / 1024).toFixed(1)}MB > 1MB — 대용량 산출물 커밋 금지 (INV-2)`);
      continue;
    }
    const text = fs.readFileSync(f, 'utf8');
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(text)) blocks.push(`${f}: ${p.label} 패턴 검출 (INV-1)`);
    }
  }
  if (blocks.length) {
    console.error('[secret-scan] 커밋 차단:');
    for (const b of blocks) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`[secret-scan] 통과 (${files.length}개 파일)`);
  process.exit(0);
}

main();
