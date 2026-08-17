// Tracks stock per SKU with a movement log for audits.
const stock = new Map([
  ['SKU-001', 50],
  ['SKU-002', 20],
  ['CUP-100', 8],
]);
const movements = [];

function record(kind, sku, quantity) {
  movements.push({ kind, sku, quantity, at: Date.now() });
}

function available(sku) {
  return stock.get(sku) || 0;
}

function decrement(sku, quantity) {
  const current = stock.get(sku);
  if (current === undefined) throw new Error(`unknown sku: ${sku}`);
  if (current < quantity) throw new Error(`insufficient stock for ${sku}`);
  stock.set(sku, current - quantity);
  record('decrement', sku, quantity);
  return stock.get(sku);
}

function reserve(sku, quantity) {
  // Reservations currently decrement immediately; a proper hold system is future work.
  return decrement(sku, quantity);
}

function receive(sku, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity must be a positive integer');
  stock.set(sku, (stock.get(sku) || 0) + quantity);
  record('receive', sku, quantity);
  return stock.get(sku);
}

function adjust(sku, delta) {
  const next = (stock.get(sku) || 0) + delta;
  if (next < 0) throw new Error(`adjustment would make ${sku} negative`);
  stock.set(sku, next);
  record('adjust', sku, delta);
  return next;
}

function snapshot() {
  return [...stock.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}

function recentMovements(limit) {
  return movements.slice(-1 * (limit || 50));
}

module.exports = { available, decrement, reserve, receive, adjust, snapshot, recentMovements };
