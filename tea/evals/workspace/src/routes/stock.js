const inventory = require('../services/inventory');

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

function handleStock(req, res) {
  if (req.method === 'GET') {
    const single = req.url.match(/^\/stock\/([\w-]+)$/);
    if (single) return respond(res, 200, { sku: single[1], quantity: inventory.available(single[1]) });
    return respond(res, 200, inventory.snapshot());
  }
  if (req.method === 'POST' && req.url === '/stock/receive') {
    readBody(req, (err, body) => {
      if (err) return respond(res, 400, { error: 'invalid json' });
      try {
        const quantity = inventory.receive(body.sku, body.quantity);
        return respond(res, 200, { sku: body.sku, quantity });
      } catch (e) {
        return respond(res, 400, { error: e.message });
      }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/stock/adjust') {
    readBody(req, (err, body) => {
      if (err) return respond(res, 400, { error: 'invalid json' });
      try {
        const quantity = inventory.adjust(body.sku, body.delta);
        return respond(res, 200, { sku: body.sku, quantity });
      } catch (e) {
        return respond(res, 400, { error: e.message });
      }
    });
    return;
  }
  return respond(res, 405, { error: 'method not allowed' });
}

module.exports = { handleStock };
