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

module.exports = { insertOrder, getOrder, listOrders, deleteOrder, upsertUser, getUser };
