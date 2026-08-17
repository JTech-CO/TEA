// Response shaping helpers shared by route handlers.
function publicUser(user) {
  return { id: user.id, email: user.email, tier: user.tier };
}

function publicOrder(order) {
  const { id, sku, quantity, total, tax, shippingFee, status } = order;
  return { id, sku, quantity, total, tax, shippingFee, status };
}

function paginate(items, page, perPage) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(perPage) || 20));
  const start = (p - 1) * size;
  return { page: p, perPage: size, totalItems: items.length, items: items.slice(start, start + size) };
}

module.exports = { publicUser, publicOrder, paginate };
