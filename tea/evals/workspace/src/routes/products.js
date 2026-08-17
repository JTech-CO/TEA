const { allProducts, findProduct } = require('../services/catalog');
const inventory = require('../services/inventory');
const { unitPrice } = require('../services/pricing');
const { paginate } = require('../utils/format');

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function handleProducts(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'method not allowed' });
  const detail = req.url.match(/^\/products\/([\w-]+)$/);
  if (detail) {
    const product = findProduct(detail[1]);
    if (!product) return respond(res, 404, { error: 'product not found' });
    let price = null;
    try {
      price = unitPrice(product.sku);
    } catch {
      price = null; // catalog entries without a price row are display-only
    }
    return respond(res, 200, { ...product, price, inStock: inventory.available(product.sku) });
  }
  const url = new URL(req.url, 'http://local');
  const active = allProducts().filter((p) => p.active);
  return respond(res, 200, paginate(active, url.searchParams.get('page'), url.searchParams.get('perPage')));
}

module.exports = { handleProducts };
