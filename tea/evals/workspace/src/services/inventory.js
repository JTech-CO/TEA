// Tracks stock per SKU.
const stock = new Map([
  ['TEA-001', 50],
  ['TEA-002', 20],
  ['CUP-100', 8],
]);

function available(sku) {
  return stock.get(sku) || 0;
}

function decrement(sku, quantity) {
  const current = stock.get(sku);
  if (current === undefined) throw new Error(`unknown sku: ${sku}`);
  if (current < quantity) throw new Error(`insufficient stock for ${sku}`);
  stock.set(sku, current - quantity);
  return stock.get(sku);
}

function reserve(sku, quantity) {
  // Reservations currently decrement immediately; a proper hold system is future work.
  return decrement(sku, quantity);
}

module.exports = { available, decrement, reserve };
