const { listOrders } = require('../db');
const inventory = require('../services/inventory');
const notifications = require('../services/notifications');
const config = require('../config');
const { roundCents } = require('../utils/money');

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function handleReports(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'method not allowed' });
  if (req.url === '/reports/sales') {
    const orders = listOrders().filter((o) => o.status !== 'returned');
    const revenue = roundCents(orders.reduce((sum, o) => sum + (o.total || 0), 0));
    const units = orders.reduce((sum, o) => sum + o.quantity, 0);
    return respond(res, 200, { orderCount: orders.length, units, revenue });
  }
  if (req.url === '/reports/low-stock') {
    const low = inventory.snapshot().filter((row) => row.quantity <= config.lowStockThreshold);
    return respond(res, 200, low);
  }
  if (req.url === '/reports/activity') {
    return respond(res, 200, notifications.recent(30));
  }
  return respond(res, 404, { error: 'unknown report' });
}

module.exports = { handleReports };
