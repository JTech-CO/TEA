#!/usr/bin/env node
// 3군 벤치마크 러너 — A(스킬 없음) / B(Ponytail) / C(Ponytail+TEA) × 모델 2종 (INV-9).
// 선행 벤치(DietrichGebert/ponytail benchmarks/agentic)의 실행 레시피를 승계하고 스코어링만 교체:
//   승계 — 고정 픽스처(cd83fc1), 12티켓 원문, NO_RUN 시스템 프롬프트(전 군 동일),
//          --setting-sources project,local (user 플러그인 전면 배제), --plugin-dir (군별 정확히 1개 로드),
//          --strict-mcp-config, 실행 도구 차단(여기서는 Bash,PowerShell — Windows 등가)
//   교체 — LOC 배제(INV-8), 총 토큰(input+cache+output, reasoning 별도 필드 — INV-10)·턴 수 채점,
//          stream-json 전량 저장(비커밋, INV-2) + 측정 핸들 12종 파싱, 증분 저장·재개(--pairs)
// 사용:
//   tools/node22/node.exe bench/run3.js --tasks tmpl-be-count --arms B --models sonnet --n 1   (파일럿)
//   tools/node22/node.exe bench/run3.js --tasks all --arms A,B,C --models sonnet,opus --n 4    (M5 본 실행)
//   옵션: --pairs id#arm#model#run,... (결손 재개) · --concurrency N · --dry (매트릭스만 출력)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'bench', 'target');
const RESULTS_DIR = path.join(ROOT, 'bench', 'results');
const LOGS_ROOT = path.join(ROOT, 'bench', 'logs');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'tasks.json'), 'utf8'));
const MODELS = { sonnet: 'claude-sonnet-5', opus: 'claude-opus-5' };
const TRIAL_TIMEOUT_MS = 600000;

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}
function hasFlag(flag) { return process.argv.includes(flag); }

function findCli() {
  const explicit = argValue('--cli', null);
  if (explicit) return explicit;
  const p = process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  if (p && fs.existsSync(p)) return p;
  return null;
}

function ponytailDir() {
  const env = process.env.PONYTAIL_PLUGIN_DIR;
  if (env) return env;
  const p = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'ponytail');
  if (fs.existsSync(path.join(p, '.claude-plugin', 'plugin.json'))) return p;
  return null;
}

// 자식 세션 env — 화이트리스트 + 군별 Ponytail 모드 (trigger-eval에서 검증된 방식)
const ENV_WHITELIST = [
  'PATH', 'Path', 'PATHEXT', 'COMSPEC', 'ComSpec', 'SystemRoot', 'SystemDrive', 'windir',
  'USERPROFILE', 'USERNAME', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'ProgramFiles', 'ProgramData', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
];
function childEnv(arm) {
  const env = {};
  for (const k of ENV_WHITELIST) if (process.env[k] !== undefined) env[k] = process.env[k];
  // A군은 플러그인 자체가 없지만(off) 벨트-서스펜더로 명시. B·C군은 선행 공개치의 기본 모드 full.
  env.PONYTAIL_DEFAULT_MODE = arm === 'A' ? 'off' : 'full';
  return env;
}

// Node 25 fs 크래시 회피 — 네이티브 도구 (trigger-eval에서 검증)
function copyDirNative(src, dest) {
  const r = spawnSync('robocopy', [src, dest, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
    '/XD', '.git', 'node_modules', 'dist', 'build', '.venv', '__pycache__', '.pytest_cache',
    '/XF', '*.log'], { windowsHide: true });
  if (r.status === null || r.status >= 8) throw new Error(`robocopy 실패: status=${r.status}`);
}
function removeDirNative(dir) {
  try { spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', dir], { windowsHide: true }); } catch { /* 누수 허용 */ }
}
function git(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { windowsHide: true, encoding: 'utf8' });
}

// TEA 주입물 — 단일 출처: tea/SKILL.md + references, 어댑터는 M1 확정본(ADR-0010)
const TEA_SKILL = fs.readFileSync(path.join(ROOT, 'tea', 'SKILL.md'), 'utf8');
const TEA_ADAPTER = fs.readFileSync(path.join(ROOT, 'tea', 'evals', 'workspace', 'CLAUDE.md'), 'utf8');
const TEA_REFS = fs.readdirSync(path.join(ROOT, 'tea', 'references'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(ROOT, 'tea', 'references', f), 'utf8') }));

function prepWorkspace(arm) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-'));
  copyDirNative(TARGET, ws);
  if (arm === 'C') {
    const skillDir = path.join(ws, '.claude', 'skills', 'tea');
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), TEA_SKILL);
    for (const r of TEA_REFS) fs.writeFileSync(path.join(skillDir, 'references', r.name), r.text);
    const cm = path.join(ws, 'CLAUDE.md');
    const prior = fs.existsSync(cm) ? fs.readFileSync(cm, 'utf8') + '\n\n' : '';
    fs.writeFileSync(cm, prior + TEA_ADAPTER);
  }
  // 채점 기준 스냅샷 — git diff의 기준 커밋
  git(ws, ['init', '-q']);
  git(ws, ['-c', 'user.name=bench', '-c', 'user.email=bench@local', 'add', '-A']);
  git(ws, ['-c', 'user.name=bench', '-c', 'user.email=bench@local', 'commit', '-q', '-m', 'base']);
  return ws;
}

function treeKill(pid) {
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }); } catch { /* 무시 */ }
}

function runTrial(cli, task, arm, model, logPath) {
  return new Promise((resolve) => {
    const ws = prepWorkspace(arm);
    const args = [
      '-p', task.prompt,
      '--model', MODELS[model],
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'stream-json', '--verbose',
      '--setting-sources', 'project,local',
      '--strict-mcp-config',
      '--disallowedTools', 'Bash,PowerShell',
      '--append-system-prompt', CONFIG.no_run,
    ];
    if (arm !== 'A') args.push('--plugin-dir', ponytailDir());
    const child = spawn(cli, args, {
      cwd: ws, env: childEnv(arm),
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: true,
    });
    const logStream = fs.createWriteStream(logPath);
    let init = null;
    let result = null;
    let teaFired = false;
    let killed = false;
    const timer = setTimeout(() => { killed = true; treeKill(child.pid); }, TRIAL_TIMEOUT_MS);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      logStream.write(line + '\n');
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'system' && ev.subtype === 'init') {
        init = { model: ev.model, skills: ev.skills || [], permissionMode: ev.permissionMode };
      }
      if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const b of ev.message.content) {
          if (b.type === 'tool_use' && b.name === 'Skill' && b.input && b.input.skill === 'tea') teaFired = true;
        }
      }
      if (ev.type === 'result') result = ev;
    });
    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += d; });
    child.on('close', () => {
      clearTimeout(timer);
      logStream.end();
      // 채점: diff 존재 + 티켓 영역(frontend/backend) 접촉 = 기능 수행 (assertion v1)
      const diff = git(ws, ['diff', '--numstat', 'HEAD']);
      const diffLines = (diff.stdout || '').split('\n').filter(Boolean);
      const touched = diffLines.map((l) => l.split('\t')[2] || '').filter(Boolean);
      const areaTouched = touched.some((p) => p.replace(/\\/g, '/').startsWith(task.area + '/'));
      const status = git(ws, ['status', '--porcelain']);
      const untracked = (status.stdout || '').split('\n').filter((l) => l.startsWith('??')).length;
      removeDirNative(ws);

      let row = {
        classification: 'error', error: null,
        assertion: { pass: false, filesChanged: diffLines.length + untracked, areaTouched },
        teaFired, init,
      };
      if (result) {
        const u = result.usage || {};
        const input = u.input_tokens || 0;
        const output = u.output_tokens || 0;
        const reasoning = (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0;
        const cacheCreation = u.cache_creation_input_tokens || 0;
        const cacheRead = u.cache_read_input_tokens || 0;
        row.metrics = {
          inputTokens: input, outputTokens: output,
          reasoningTokens: reasoning, // INV-10 — 총 토큰에 포함(output에 계상됨), 관측 위해 별도 노출
          cacheCreationTokens: cacheCreation, cacheReadTokens: cacheRead,
          totalTokens: input + cacheCreation + cacheRead + output,
          numTurns: result.num_turns, durationMs: result.duration_ms,
          costUsd: result.total_cost_usd,
          denials: Array.isArray(result.permission_denials) ? result.permission_denials.length : 0,
        };
        row.classification = result.is_error ? 'error' : 'ok';
        if (result.is_error) row.error = String(result.result || result.subtype || 'api_error').slice(0, 200);
        row.assertion.pass = row.classification === 'ok' && (diffLines.length + untracked) > 0 && areaTouched;
      } else if (killed) {
        row.classification = 'killed';
        row.error = `timeout ${TRIAL_TIMEOUT_MS}ms`;
      } else {
        row.error = `no result event: ${stderrBuf.slice(0, 150)}`;
      }
      row.authFailure = !!(row.error && /authenticate|login|oauth|(weekly|session|usage) limit|rate.?limit/i.test(row.error));
      resolve(row);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      logStream.end();
      removeDirNative(ws);
      resolve({ classification: 'error', error: e.message, authFailure: false, teaFired: false, init: null, assertion: { pass: false } });
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

async function main() {
  const cli = findCli();
  if (!cli) { console.error('[run3] claude.exe를 찾지 못했다'); process.exit(2); }

  const taskArg = argValue('--tasks', 'all');
  const tasks = CONFIG.tasks.filter((t) => taskArg === 'all' || taskArg.split(',').includes(t.id));
  const arms = argValue('--arms', 'A,B,C').split(',');
  const models = argValue('--models', 'sonnet').split(',');
  const n = Number(argValue('--n', 1));
  const concurrency = Number(argValue('--concurrency', 2));

  let trials = [];
  const pairsArg = argValue('--pairs', null);
  if (pairsArg) {
    for (const pair of pairsArg.split(',')) {
      const [tid, arm, model, run] = pair.split('#');
      const task = CONFIG.tasks.find((t) => t.id === tid);
      if (!task) { console.error(`[run3] 태스크 없음: ${tid}`); process.exit(1); }
      trials.push({ task, arm, model, run: Number(run) });
    }
  } else {
    for (const task of tasks) for (const arm of arms) for (const model of models) {
      for (let r = 1; r <= n; r++) trials.push({ task, arm, model, run: r });
    }
  }
  for (const t of trials) {
    if (t.arm !== 'A' && !ponytailDir()) { console.error('[run3] Ponytail 플러그인 디렉터리를 찾지 못했다 (PONYTAIL_PLUGIN_DIR)'); process.exit(2); }
    if (!MODELS[t.model]) { console.error(`[run3] 모델 별칭 없음: ${t.model}`); process.exit(1); }
  }

  const fixtureCommit = (git(TARGET, ['rev-parse', '--short', 'HEAD']).stdout || '').trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logDir = path.join(LOGS_ROOT, `bench-${stamp}`);
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `bench-${stamp}.json`);

  const meta = {
    startedAt: new Date().toISOString(),
    fixtureCommit,
    teaSkillHash: crypto.createHash('sha256').update(TEA_SKILL).digest('hex').slice(0, 12),
    adapterHash: crypto.createHash('sha256').update(TEA_ADAPTER).digest('hex').slice(0, 12),
    models: MODELS, trialTimeoutMs: TRIAL_TIMEOUT_MS, noRun: CONFIG.no_run,
    cliFlags: 'bypassPermissions | stream-json | setting-sources=project,local | strict-mcp-config | disallowedTools=Bash,PowerShell | plugin-dir(B,C) | PONYTAIL_DEFAULT_MODE A:off B/C:full',
  };
  const done = [];
  const flush = (complete) => {
    fs.writeFileSync(outPath, JSON.stringify({ meta, complete, expectedTrials: trials.length, trials: done }, null, 2));
  };

  console.log(`[run3] 픽스처 ${fixtureCommit} · 트라이얼 ${trials.length}건 (동시 ${concurrency}) · 로그 ${path.relative(ROOT, logDir)}`);
  if (hasFlag('--dry')) {
    for (const t of trials) console.log(`  ${t.task.id}#${t.arm}#${t.model}#${t.run}`);
    process.exit(0);
  }

  const { parseFile } = require('./parse-handles');
  let counter = 0;
  const { aborted } = await runPool(trials, async (t) => {
    const id = `${t.task.id}#${t.arm}#${t.model}#${t.run}`;
    const logPath = path.join(logDir, id.replace(/#/g, '_') + '.jsonl');
    const out = await runTrial(cli, t.task, t.arm, t.model, logPath);
    let handles = null;
    try { handles = parseFile(logPath, t.task.prompt); } catch (e) { handles = { parseError: e.message }; }
    counter++;
    const m = out.metrics || {};
    console.log(`  [${counter}/${trials.length}] ${id} → ${out.classification}${out.error ? ` (${String(out.error).slice(0, 60)})` : ''} · ${m.totalTokens || '-'}tok · ${m.numTurns || '-'}턴 · assertion=${out.assertion && out.assertion.pass}`);
    const row = { id, task: t.task.id, area: t.task.area, arm: t.arm, model: t.model, run: t.run, log: path.relative(ROOT, logPath), ...out, handles };
    done.push(row);
    flush(false);
    return row;
  }, concurrency);

  if (aborted) {
    flush(false);
    console.error('[run3] 인증·한도로 전체 중단 — 증분 저장분 유지, --pairs로 재개');
    process.exit(1);
  }
  flush(true);
  console.log(`[run3] 완료 — 결과 ${path.relative(ROOT, outPath)}`);
  const bad = done.filter((r) => r.classification !== 'ok').length;
  process.exit(bad ? 1 : 0);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  try { process.on(sig, () => { console.error(`[run3] ${sig} — 증분 저장분 유지, --pairs로 재개`); process.exit(1); }); } catch { /* 무시 */ }
}
process.on('uncaughtException', (e) => { console.error(`[run3] uncaughtException: ${e.stack || e.message}`); process.exit(1); });

main().catch((e) => { console.error(`[run3] 오류: ${e.stack || e.message}`); process.exit(1); });
