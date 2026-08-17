// Return handling: validates the order, restocks units, marks the order.
const { getOrder, updateOrder } = require('../db');
const inventory = require('./inventory');
const notifications = require('./notifications');

function processReturn(orderId, reason) {
  const order = getOrder(orderId);
  if (!order) return { ok: false, problem: 'order not found' };
  if (order.status === 'returned') return { ok: false, problem: 'already returned' };
  inventory.receive(order.sku, order.quantity);
  updateOrder(order.id, { status: 'returned', returnReason: reason || 'unspecified' });
  notifications.enqueue('order.returned', { orderId: order.id });
  return { ok: true, order: getOrder(order.id) };
}

module.exports = { processReturn };
