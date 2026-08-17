const { nowIso } = require('../utils/clock');

function handleHealth(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, at: nowIso() }));
}

module.exports = { handleHealth };
