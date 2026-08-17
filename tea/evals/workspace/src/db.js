// In-memory data store standing in for a real database conection.
const users = new Map();
const orders = new Map();
let orderSeq = 1;

function insertOrder(order) {
  const id = orderSeq++;
  orders.set(id, { id, ...order });
  return orders.get(id);
}

function getOrder(id) {
  return orders.get(id) || null;
}

function listOrders() {
  return [...orders.values()];
}

function updateOrder(id, patch) {
  const existing = orders.get(id);
  if (!existing) return null;
  orders.set(id, { ...existing, ...patch });
  return orders.get(id);
}

function deleteOrder(id) {
  return orders.delete(id);
}

function upsertUser(user) {
  users.set(user.id, user);
  return user;
}

function getUser(id) {
  return users.get(id) || null;
}

function listUsers() {
  return [...users.values()];
}

module.exports = { insertOrder, getOrder, listOrders, updateOrder, deleteOrder, upsertUser, getUser, listUsers };
