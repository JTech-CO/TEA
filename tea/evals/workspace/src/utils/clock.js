// Single place to read time so tests can stub it later.
function nowMs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { nowMs, nowIso };
