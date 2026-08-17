// Outbound notification queue. Real transport is out of scope; we log and keep
// a bounded in-memory buffer so reports can show recent activity.
const { nowIso } = require('../utils/clock');

const MAX_BUFFER = 200;
const buffer = [];

function enqueue(topic, payload) {
  const entry = { topic, payload, at: nowIso() };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  console.log(`[notify] ${topic}`, JSON.stringify(payload));
  return entry;
}

function recent(limit) {
  return buffer.slice(-1 * Math.min(limit || 20, MAX_BUFFER));
}

module.exports = { enqueue, recent };
