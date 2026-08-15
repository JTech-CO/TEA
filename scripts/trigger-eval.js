#!/usr/bin/env node
// M1 트리거 발화 평가 러너 — tea/evals/trigger.json의 문항을 headless Claude Code 세션으로 실행하고
// Skill(tea) 도구 호출 여부로 발화를 판정한다. 프로토콜 명세: docs/ENVIRONMENT.md "트리거 발화 판정".
//
// 사용:
//   node scripts/trigger-eval.js --smoke                    계측 배선 검증 (직접 지시 양성·무관 음성 각 1회)
//   node scripts/trigger-eval.js --set all --gate           전 문항 × 3회 실행 + 게이트 판정 (M1 DoD 2~4)
//   node scripts/trigger-eval.js --set train                학습셋만 (문안 반복 개선용 — 채택 판단 금지)
//   node scripts/trigger-eval.js --score <results.json> --gate   저장된 결과 재집계
//   옵션: --runs N, --concurrency N, --model ID, --cli <cli.js 경로>
//
// 종료 코드: 0 통과(게이트 미적용 시 실행 성공) / 1 게이트 미달·실행 실패 / 2 CLI 부재
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'tea', 'evals', 'trigger.json');
const WORKSPACE = path.join(ROOT, 'tea', 'evals', 'workspace');
const RESULTS_DIR = path.join(ROOT, 'tea', 'evals', 'results');
const RUN_TIMEOUT_MS = 240000;

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

// 2.x npm 패키지는 네이티브 바이너리(bin/claude.exe)를 설치한다. 구버전 cli.js는 폴백.
function findCli() {
  const explicit = argValue('--cli', null);
  if (explicit) return explicit;
  const npmGlobal = process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code');
  const candidates = [
    npmGlobal && path.join(npmGlobal, 'bin', 'claude.exe'),
    npmGlobal && path.join(npmGlobal, 'cli.js'),
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// description 파일 → 평가 워크스페이스의 스킬 스텁 생성. 본문은 M2 전까지 의도적 최소 (트리거는 메타로만 결정).
function generateSkillStub(descriptionFile) {
  const desc = fs.readFileSync(path.join(ROOT, descriptionFile), 'utf8').trim();
  const indented = desc.split(/\r?\n/).map((l) => (l.trim() === '' ? '' : `  ${l}`)).join('\n');
  const skill = [
    '---',
    'name: tea',
    'description: >-',
    indented,
    '---',
    '',
    'Active on every turn of a coding task. Do not drift back to read-everything,',
    'rewrite-everything defaults mid-session. Still active when uncertain. Off only',
    'on explicit "stop tea" / "normal mode".',
    '',
    '(Body intentionally minimal during M1 trigger evaluation — full rules land in M2.)',
    '',
  ].join('\n');
  const dir = path.join(WORKSPACE, '.claude', 'skills', 'tea');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill);
  return crypto.createHash('sha256').update(desc).digest('hex').slice(0, 12);
}

function runTrial(cliJs, protocol, prompt) {
  return new Promise((resolve) => {
    const cliArgs = [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--max-turns', String(protocol.max_turns),
      '--model', protocol.model,
      '--allowedTools', protocol.allowed_tools,
      '--strict-mcp-config',
    ];
    const isJs = cliJs.endsWith('.js') || cliJs.endsWith('.cjs');
    const child = isJs
      ? spawn(process.execPath, [cliJs, ...cliArgs], { cwd: WORKSPACE, env: process.env })
      : spawn(cliJs, cliArgs, { cwd: WORKSPACE, env: process.env });
    let fired = false;
    let numTurns = null;
    let costUsd = null;
    let durationMs = null;
    let errorMsg = null;
    let authFailure = false;
    const timer = setTimeout(() => {
      errorMsg = 'timeout';
      child.kill('SIGKILL');
    }, RUN_TIMEOUT_MS);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const block of ev.message.content) {
          if (block.type === 'tool_use' && block.name === 'Skill' && block.input
            && (block.input.skill === 'tea' || block.input.command === 'tea')) {
            fired = true;
          }
        }
      }
      if (ev.type === 'result') {
        numTurns = ev.num_turns;
        costUsd = ev.total_cost_usd;
        durationMs = ev.duration_ms;
        if (ev.is_error) {
          errorMsg = String(ev.result || 'api_error').slice(0, 200);
          if (/authenticate|login|oauth/i.test(errorMsg)) authFailure = true;
        }
      }
    });
    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !errorMsg) errorMsg = `exit ${code}: ${stderrBuf.slice(0, 200)}`;
      resolve({ fired, numTurns, costUsd, durationMs, error: errorMsg, authFailure });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ fired: false, numTurns: null, costUsd: null, durationMs: null, error: e.message, authFailure: false });
    });
  });
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  let aborted = false;
  async function lane() {
    while (!aborted) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      if (results[i] && results[i].authFailure) aborted = true;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
  return { results, aborted };
}

function ratio(n, d) {
  return d === 0 ? '—' : `${n}/${d}`;
}

// 게이트 환산: DESIGN §5.2의 비율(5/6, 7/8)을 트라이얼 수에 올림 적용 — 하향 없는 보수적 방향.
function score(results, applyGate) {
  const valid = results.trials.filter((t) => !t.error);
  const errors = results.trials.filter((t) => t.error);

  const byQuestion = new Map();
  for (const t of valid) {
    if (!byQuestion.has(t.id)) byQuestion.set(t.id, { ...t, firedCount: 0, total: 0 });
    const q = byQuestion.get(t.id);
    q.firedCount += t.fired ? 1 : 0;
    q.total += 1;
  }
  console.log('\n문항 × 발화 매트릭스');
  console.log('ID    class     type                 split  발화');
  for (const q of byQuestion.values()) {
    console.log(`${q.id.padEnd(5)} ${q.class.padEnd(9)} ${q.type.padEnd(20)} ${q.split.padEnd(6)} ${q.firedCount}/${q.total}`);
  }
  if (errors.length) {
    console.log(`\n오류 트라이얼 ${errors.length}건 (집계 제외 — 재실행 필요):`);
    for (const t of errors) console.log(`  ${t.id} run${t.run}: ${t.error}`);
  }

  const valPos = valid.filter((t) => t.split === 'val' && t.class === 'positive');
  const valNeg = valid.filter((t) => t.split === 'val' && t.class === 'negative');
  const trainPos = valid.filter((t) => t.split === 'train' && t.class === 'positive');
  const trainNeg = valid.filter((t) => t.split === 'train' && t.class === 'negative');
  const golf = valid.filter((t) => t.type === 'golf-compression');

  const recallFired = valPos.filter((t) => t.fired).length;
  const precisionQuiet = valNeg.filter((t) => !t.fired).length;
  const golfFired = golf.filter((t) => t.fired).length;

  console.log('\n집계 (트라이얼 단위)');
  console.log(`  학습셋: recall ${ratio(trainPos.filter((t) => t.fired).length, trainPos.length)}, precision ${ratio(trainNeg.filter((t) => !t.fired).length, trainNeg.length)}`);
  console.log(`  검증셋: recall ${ratio(recallFired, valPos.length)}, precision ${ratio(precisionQuiet, valNeg.length)}`);
  console.log(`  골프 문항 발화: ${ratio(golfFired, golf.length)} (0이어야 함)`);
  const cost = valid.reduce((s, t) => s + (t.costUsd || 0), 0);
  console.log(`  비용 합계: $${cost.toFixed(4)} / 유효 트라이얼 ${valid.length}`);

  if (!applyGate) return errors.length === 0;

  const gates = [];
  if (valPos.length > 0) {
    const need = Math.ceil((5 / 6) * valPos.length);
    gates.push({ name: `DoD 2 recall(검증) ≥ ${need}/${valPos.length}`, pass: recallFired >= need });
  } else gates.push({ name: 'DoD 2 recall(검증)', pass: false, note: '검증 양성 트라이얼 없음' });
  if (valNeg.length > 0) {
    const need = Math.ceil((7 / 8) * valNeg.length);
    gates.push({ name: `DoD 3 precision(검증) ≥ ${need}/${valNeg.length}`, pass: precisionQuiet >= need });
  } else gates.push({ name: 'DoD 3 precision(검증)', pass: false, note: '검증 음성 트라이얼 없음' });
  if (golf.length >= 6) {
    gates.push({ name: `DoD 4 골프 발화 0/${golf.length}`, pass: golfFired === 0 });
  } else gates.push({ name: 'DoD 4 골프 발화 0건', pass: false, note: `골프 트라이얼 ${golf.length}건 — 2문항 × 3회 필요` });
  if (errors.length > 0) gates.push({ name: '데이터 완전성 (오류 트라이얼 0)', pass: false });

  console.log('\n게이트 판정 (M1 DoD)');
  let allPass = true;
  for (const g of gates) {
    console.log(`  ${g.pass ? 'PASS' : 'FAIL'}  ${g.name}${g.note ? ` — ${g.note}` : ''}`);
    if (!g.pass) allPass = false;
  }
  console.log(`  종합: ${allPass ? 'PASS' : 'FAIL'}`);
  return allPass;
}

async function main() {
  const scorePath = argValue('--score', null);
  if (scorePath) {
    const results = JSON.parse(fs.readFileSync(scorePath, 'utf8'));
    const ok = score(results, hasFlag('--gate'));
    process.exit(ok ? 0 : 1);
  }

  const cliJs = findCli();
  if (!cliJs) {
    console.error('[trigger-eval] Claude Code CLI(cli.js)를 찾지 못했다. npm i -g @anthropic-ai/claude-code 후 재시도하거나 --cli로 경로 지정.');
    process.exit(2);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const protocol = { ...config.protocol };
  if (argValue('--model', null)) protocol.model = argValue('--model', null);
  const descHash = generateSkillStub(config.description_file);

  let questions;
  let runs;
  if (hasFlag('--smoke')) {
    questions = [
      { id: 'S-POS', class: 'smoke', type: 'direct-invoke', split: 'smoke', prompt: 'Invoke the tea skill via the Skill tool right now, then confirm it is active. Do nothing else.' },
      { id: 'S-NEG', class: 'smoke', type: 'unrelated', split: 'smoke', prompt: 'What is 2 + 2? Reply with just the number.' },
    ];
    runs = 1;
  } else {
    const set = argValue('--set', 'all');
    questions = config.questions.filter((q) => set === 'all' || q.split === set);
    runs = Number(argValue('--runs', protocol.runs_per_question));
  }
  const concurrency = Number(argValue('--concurrency', 2));

  const trials = [];
  for (const q of questions) for (let r = 1; r <= runs; r++) trials.push({ ...q, run: r });

  console.log(`[trigger-eval] CLI: ${cliJs}`);
  console.log(`[trigger-eval] 모델 ${protocol.model} · 문항 ${questions.length} × ${runs}회 = ${trials.length} 트라이얼 · 동시 ${concurrency} · description ${descHash}`);

  let done = 0;
  const { results, aborted } = await runPool(trials, async (t) => {
    let out = await runTrial(cliJs, protocol, t.prompt);
    if (out.error && !out.authFailure) out = await runTrial(cliJs, protocol, t.prompt); // 1회 재시도
    done++;
    console.log(`  [${done}/${trials.length}] ${t.id} run${t.run} → ${out.error ? `오류(${out.error.slice(0, 60)})` : out.fired ? '발화' : '미발화'}`);
    return { ...t, ...out };
  }, concurrency);

  if (aborted) {
    console.error('\n[trigger-eval] 인증 실패로 중단. 터미널에서 claude 로그인 후 재실행:');
    console.error('  claude   (브라우저 로그인 진행 후 종료)');
    process.exit(1);
  }

  const record = {
    startedAt: new Date().toISOString(),
    cli: cliJs,
    protocol,
    descriptionFile: config.description_file,
    descriptionHash: descHash,
    set: hasFlag('--smoke') ? 'smoke' : argValue('--set', 'all'),
    runsPerQuestion: runs,
    trials: results.map((t) => ({
      id: t.id, class: t.class, type: t.type, split: t.split, run: t.run,
      fired: t.fired, numTurns: t.numTurns, durationMs: t.durationMs, costUsd: t.costUsd, error: t.error || null,
    })),
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = record.startedAt.replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(RESULTS_DIR, `run-${stamp}-${record.set}.json`);
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2));
  console.log(`\n결과 저장: ${path.relative(ROOT, outPath)}`);

  if (hasFlag('--smoke')) {
    const pos = record.trials.find((t) => t.id === 'S-POS');
    const neg = record.trials.find((t) => t.id === 'S-NEG');
    const ok = pos && pos.fired === true && neg && neg.fired === false && !pos.error && !neg.error;
    console.log(`\n스모크 판정: ${ok ? 'PASS — 발화 검출 배선 정상' : 'FAIL — 계측 점검 필요 (RUNBOOK #8 원리)'}`);
    console.log(`  S-POS(직접 지시) 발화=${pos && pos.fired}, S-NEG(무관 질문) 발화=${neg && neg.fired}`);
    process.exit(ok ? 0 : 1);
  }

  const ok = score(record, hasFlag('--gate'));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`[trigger-eval] 오류: ${e.stack || e.message}`);
  process.exit(1);
});
