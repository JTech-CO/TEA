// Entry point for the orders service HTTP API.
const http = require('http');
const { handleUsers } = require('./routes/users');
const { handleOrders } = require('./routes/orders');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/users')) return handleUsers(req, res);
  if (req.url.startsWith('/orders')) return handleOrders(req, res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`orders-service listening on ${PORT}`);
});
