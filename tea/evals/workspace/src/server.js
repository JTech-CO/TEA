// Entry point for the orders service HTTP API.
const http = require('http');
const { handleUsers } = require('./routes/users');
const { handleOrders } = require('./routes/orders');
const { handleProducts } = require('./routes/products');
const { handleStock } = require('./routes/stock');
const { handleReports } = require('./routes/reports');
const { handleHealth } = require('./routes/health');
const { handleWebhooks } = require('./routes/webhooks');
const { withLogging } = require('./middleware/logging');
const { requireKey } = require('./middleware/auth');

const PORT = process.env.PORT || 3000;

const routes = [
  ['/users', handleUsers],
  ['/orders', handleOrders],
  ['/products', handleProducts],
  ['/stock', requireKey(handleStock)],
  ['/reports', handleReports],
  ['/health', handleHealth],
  ['/webhooks', requireKey(handleWebhooks)],
];

const server = http.createServer(withLogging((req, res) => {
  for (const [prefix, handler] of routes) {
    if (req.url.startsWith(prefix)) return handler(req, res);
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}));

server.listen(PORT, () => {
  console.log(`orders-service listening on ${PORT}`);
});
