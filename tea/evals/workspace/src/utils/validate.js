// Order payload validation. Returns a problem string, or null when valid.
const MAX_QUANTITY = 1000;

function validateOrder(body) {
  if (!body || typeof body !== 'object') {
    return 'body must be an object';
  }
  if (!body.sku || typeof body.sku !== 'string') {
    return 'sku is required';
  }
  if (typeof body.quantity !== 'number' || Number.isNaN(body.quantity)) {
    return 'quantity must be a number';
  }
  if (!Number.isInteger(body.quantity) || body.quantity <= 0) {
    return 'quantity must be a positive integer';
  }
  if (body.quantity > MAX_QUANTITY) {
    return `quantity must be at most ${MAX_QUANTITY}`;
  }
  if (body.tier && !['guest', 'silver', 'gold'].includes(body.tier)) {
    return 'tier must be guest, silver, or gold';
  }
  return null;
}

module.exports = { validateOrder, MAX_QUANTITY };
