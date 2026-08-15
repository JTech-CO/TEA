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
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'tea', 'evals', 'trigger.json');
const WORKSPACE_SRC = path.join(ROOT, 'tea', 'evals', 'workspace');
const RESULTS_DIR = path.join(ROOT, 'tea', 'evals', 'results');
const RUN_TIMEOUT_MS = 600000;

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

function buildSkillText(descriptionFile) {
  const desc = fs.readFileSync(path.join(ROOT, descriptionFile), 'utf8').trim();
  const indented = desc.split(/\r?\n/).map((l) => (l.trim() === '' ? '' : `  ${l}`)).join('\n');
  const text = [
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
  return { text, hash: crypto.createHash('sha256').update(desc).digest('hex').slice(0, 12) };
}

// 트라이얼마다 리포 밖 임시 디렉터리에 워크스페이스를 새로 복사한다.
// 두 가지를 동시에 막는다 — (1) 리포 루트 CLAUDE.md·git 컨텍스트가 상위 탐색으로 상속되어 발화를 편향시키는 것,
// (2) 앞 트라이얼의 편집이 뒤 트라이얼의 조건을 바꾸는 것.
// fs.cpSync는 이 환경(Node 25 / Windows)에서 프로세스를 하드 크래시시킨다 — 수동 재귀 복사로 대체.
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function prepareTrialWorkspace(skillText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trigger-'));
  copyDir(WORKSPACE_SRC, dir);
  const skillDir = path.join(dir, '.claude', 'skills', 'tea');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillText);
  return dir;
}

function runTrial(cliJs, protocol, prompt, workspace) {
  return new Promise((resolve) => {
    const cliArgs = [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--max-turns', String(protocol.max_turns),
      '--model', protocol.model,
      // 격리된 일회용 복사본에서만 실행하므로 권한 프롬프트를 우회한다.
      // 이전 프로토콜(--allowedTools 화이트리스트)은 도구 목록을 제한하지 못한 채 거부만 유발했고,
      // 거부가 턴을 소진해 상한 초과를 만들었다 — 발화 트라이얼이 선택적으로 탈락하는 편향의 원인.
      '--permission-mode', 'bypassPermissions',
      '--strict-mcp-config',
    ];
    const isJs = cliJs.endsWith('.js') || cliJs.endsWith('.cjs');
    const child = isJs
      ? spawn(process.execPath, [cliJs, ...cliArgs], { cwd: workspace, env: process.env })
      : spawn(cliJs, cliArgs, { cwd: workspace, env: process.env });
    let fired = false;
    let firedAtTurn = null;
    let assistantTurns = 0;
    let numTurns = null;
    let costUsd = null;
    let durationMs = null;
    let errorMsg = null;
    let terminalReason = null;
    let denials = 0;
    let authFailure = false;
    let truncated = false;
    const timer = setTimeout(() => {
      errorMsg = 'timeout';
      truncated = true;
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
        assistantTurns++;
        for (const block of ev.message.content) {
          if (block.type === 'tool_use' && block.name === 'Skill' && block.input
            && (block.input.skill === 'tea' || block.input.command === 'tea')) {
            if (!fired) firedAtTurn = assistantTurns;
            fired = true;
          }
        }
      }
      if (ev.type === 'result') {
        numTurns = ev.num_turns;
        costUsd = ev.total_cost_usd;
        durationMs = ev.duration_ms;
        terminalReason = ev.terminal_reason || ev.subtype || null;
        denials = Array.isArray(ev.permission_denials) ? ev.permission_denials.length : 0;
        if (ev.subtype === 'error_max_turns' || ev.terminal_reason === 'max_turns') {
          truncated = true; // 오류가 아니라 절단 — 발화했으면 유효 관측, 미발화면 판정 보류
        } else if (ev.is_error) {
          errorMsg = String(ev.result || ev.subtype || 'api_error').slice(0, 200);
          if (/authenticate|login|oauth/i.test(errorMsg)) authFailure = true;
        }
      }
    });
    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !errorMsg && !truncated) errorMsg = `exit ${code}: ${stderrBuf.slice(0, 200)}`;
      resolve({ fired, firedAtTurn, numTurns, costUsd, durationMs, terminalReason, denials, truncated, error: errorMsg, authFailure });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ fired: false, firedAtTurn: null, numTurns: null, costUsd: null, durationMs: null, terminalReason: null, denials: 0, truncated: false, error: e.message, authFailure: false });
    });
  });
}

// 트라이얼 3상태 분류 — 절단된 미발화를 "미발화"로 세면 발화 트라이얼만 탈락하는 편향이 생긴다.
//   fired      발화 관측 (절단 여부와 무관하게 유효 — 발화는 이미 일어났다)
//   quiet      자연 종료했고 발화 없음 (유효)
//   ambiguous  절단됐고 발화 없음 (판정 불가 — 게이트를 막고 재실행 대상)
//   error      실행 실패 (판정 불가)
function classify(t) {
  if (t.error) return 'error';
  if (t.fired) return 'fired';
  if (t.truncated) return 'ambiguous';
  return 'quiet';
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
  const all = results.trials.map((t) => ({ ...t, verdict: classify(t) }));
  const unusable = all.filter((t) => t.verdict === 'error' || t.verdict === 'ambiguous');
  const valid = all.filter((t) => t.verdict === 'fired' || t.verdict === 'quiet');

  const byQuestion = new Map();
  for (const t of all) {
    if (!byQuestion.has(t.id)) byQuestion.set(t.id, { ...t, runs: [] });
    byQuestion.get(t.id).runs.push(t);
  }
  console.log('\n문항 × 회차 매트릭스  (F=발화 · q=미발화 · ?=절단·판정보류 · E=오류)');
  console.log('ID    class     type                 split  회차       발화/유효  최초발화턴');
  const mark = { fired: 'F', quiet: 'q', ambiguous: '?', error: 'E' };
  for (const q of byQuestion.values()) {
    const marks = q.runs.map((t) => mark[t.verdict]).join(' ');
    const v = q.runs.filter((t) => t.verdict === 'fired' || t.verdict === 'quiet');
    const f = q.runs.filter((t) => t.verdict === 'fired');
    const turns = f.map((t) => t.firedAtTurn).filter((n) => n != null);
    console.log(`${q.id.padEnd(5)} ${q.class.padEnd(9)} ${q.type.padEnd(20)} ${q.split.padEnd(6)} ${marks.padEnd(10)} ${String(f.length).padStart(4)}/${String(v.length).padEnd(4)}  ${turns.length ? turns.join(',') : '—'}`);
  }
  if (unusable.length) {
    console.log(`\n판정 불가 트라이얼 ${unusable.length}건 (재실행 대상):`);
    for (const t of unusable) {
      console.log(`  ${t.id} run${t.run}: ${t.verdict}${t.error ? ` — ${t.error}` : ` — ${t.terminalReason}, ${t.numTurns}턴, 거부 ${t.denials}건`}`);
    }
  }

  const pick = (split, cls) => valid.filter((t) => t.split === split && t.class === cls);
  const valPos = pick('val', 'positive');
  const valNeg = pick('val', 'negative');
  const trainPos = pick('train', 'positive');
  const trainNeg = pick('train', 'negative');
  const golf = valid.filter((t) => t.type === 'golf-compression');

  const recallFired = valPos.filter((t) => t.fired).length;
  const precisionQuiet = valNeg.filter((t) => !t.fired).length;
  const golfFired = golf.filter((t) => t.fired).length;

  console.log('\n집계 (유효 트라이얼 단위 — 판정 불가 제외)');
  console.log(`  학습셋: recall ${ratio(trainPos.filter((t) => t.fired).length, trainPos.length)}, precision ${ratio(trainNeg.filter((t) => !t.fired).length, trainNeg.length)}`);
  console.log(`  검증셋: recall ${ratio(recallFired, valPos.length)}, precision ${ratio(precisionQuiet, valNeg.length)}`);
  console.log(`  골프 문항 발화: ${ratio(golfFired, golf.length)} (0이어야 함)`);
  const cost = all.reduce((s, t) => s + (t.costUsd || 0), 0);
  const truncCount = all.filter((t) => t.truncated).length;
  const denialTotal = all.reduce((s, t) => s + (t.denials || 0), 0);
  console.log(`  비용 합계 $${cost.toFixed(4)} · 유효 ${valid.length}/${all.length} · 절단 ${truncCount} · 권한거부 ${denialTotal}`);

  if (!applyGate) return unusable.length === 0;

  const gates = [];
  const needRecall = Math.ceil((5 / 6) * valPos.length);
  gates.push(valPos.length
    ? { name: `DoD 2 recall(검증) ${recallFired}/${valPos.length} ≥ ${needRecall}`, pass: recallFired >= needRecall }
    : { name: 'DoD 2 recall(검증)', pass: false, note: '유효 트라이얼 없음' });
  const needPrec = Math.ceil((7 / 8) * valNeg.length);
  gates.push(valNeg.length
    ? { name: `DoD 3 precision(검증) ${precisionQuiet}/${valNeg.length} ≥ ${needPrec}`, pass: precisionQuiet >= needPrec }
    : { name: 'DoD 3 precision(검증)', pass: false, note: '유효 트라이얼 없음' });
  gates.push(golf.length >= 6
    ? { name: `DoD 4 골프 발화 ${golfFired}/${golf.length} = 0`, pass: golfFired === 0 }
    : { name: 'DoD 4 골프 발화 0건', pass: false, note: `유효 골프 트라이얼 ${golf.length}건 — 2문항 × 3회 필요` });
  gates.push({ name: `데이터 완전성 (판정 불가 ${unusable.length}건 = 0)`, pass: unusable.length === 0 });

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
  if (argValue('--max-turns', null)) protocol.max_turns = Number(argValue('--max-turns', null));
  const { text: skillText, hash: descHash } = buildSkillText(config.description_file);

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
  console.log(`[trigger-eval] 모델 ${protocol.model} · 상한 ${protocol.max_turns}턴 · 문항 ${questions.length} × ${runs}회 = ${trials.length} 트라이얼 · 동시 ${concurrency} · description ${descHash}`);

  let done = 0;
  const { results, aborted } = await runPool(trials, async (t) => {
    const runOnce = async () => {
      const ws = prepareTrialWorkspace(skillText);
      try {
        return await runTrial(cliJs, protocol, t.prompt, ws);
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    };
    let out = await runOnce();
    if (out.error && !out.authFailure) out = await runOnce(); // 실행 실패만 1회 재시도 (절단은 재시도 대상 아님)
    done++;
    const label = out.error ? `오류(${out.error.slice(0, 50)})` : out.fired ? `발화(턴${out.firedAtTurn})` : out.truncated ? '절단·판정보류' : '미발화';
    console.log(`  [${done}/${trials.length}] ${t.id} run${t.run} → ${label}`);
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
      fired: t.fired, firedAtTurn: t.firedAtTurn ?? null, truncated: !!t.truncated,
      terminalReason: t.terminalReason || null, denials: t.denials || 0,
      numTurns: t.numTurns, durationMs: t.durationMs, costUsd: t.costUsd, error: t.error || null,
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
