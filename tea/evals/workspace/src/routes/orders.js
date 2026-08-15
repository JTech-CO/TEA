const { insertOrder, getOrder, listOrders } = require('../db');
const { validateOrder } = require('../utils/validate');
const inventory = require('../services/inventory');
const { computeTotal } = require('../services/pricing');

function readBody(req, callback) {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    try {
      callback(null, JSON.parse(raw || '{}'));
    } catch (e) {
      callback(e);
    }
  });
}

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function handleOrders(req, res) {
  if (req.method === 'POST') {
    readBody(req, (err, body) => {
      if (err) return respond(res, 400, { error: 'invalid json' });
      if (body.quantity !== undefined && typeof body.quantity === 'string') {
        return respond(res, 400, { error: 'quantity must be a number, not a string' });
      }
      const problem = validateOrder(body);
      if (problem) return respond(res, 400, { error: problem });
      try {
        inventory.reserve(body.sku, body.quantity);
        const total = computeTotal(body.sku, body.quantity, body.tier || 'guest');
        const order = insertOrder({ sku: body.sku, quantity: body.quantity, total });
        inventory.decrement(body.sku, body.quantity); // finalize stock after insert
        return respond(res, 201, order);
      } catch (e) {
        return respond(res, 500, { error: failure.message });
      }
    });
    return;
  }
  if (req.method === 'GET') {
    const idMatch = req.url.match(/^\/orders\/(\d+)$/);
    if (idMatch) {
      const order = getOrder(Number(idMatch[1]));
      if (!order) return respond(res, 404, { error: 'order not found' });
      return respond(res, 200, order);
    }
    return respond(res, 200, listOrders());
  }
  return respond(res, 405, { error: 'method not allowed' });
}

module.exports = { handleOrders };
