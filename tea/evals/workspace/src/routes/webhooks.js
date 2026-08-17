// Payment provider callbacks. The provider retries on non-2xx, so handlers
// must be idempotent.
const { getOrder, updateOrder } = require('../db');
const { processReturn } = require('../services/returns');
const notifications = require('../services/notifications');

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

function handleWebhooks(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'method not allowed' });
  readBody(req, (err, body) => {
    if (err) return respond(res, 400, { error: 'invalid json' });
    if (req.url === '/webhooks/payment') {
      const order = getOrder(Number(body.orderId));
      if (!order) return respond(res, 404, { error: 'order not found' });
      if (order.status !== 'paid') {
        updateOrder(order.id, { status: 'paid', paidRef: body.reference || null });
        notifications.enqueue('order.paid', { orderId: order.id });
      }
      return respond(res, 200, { ok: true });
    }
    if (req.url === '/webhooks/return') {
      const result = processReturn(Number(body.orderId), body.reason);
      if (!result.ok) return respond(res, 404, { error: result.problem });
      return respond(res, 200, { ok: true });
    }
    return respond(res, 404, { error: 'unknown webhook' });
  });
}

module.exports = { handleWebhooks };
