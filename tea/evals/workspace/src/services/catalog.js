// Product catalog backed by the seed file. Pricing keeps its own table for
// historical reasons; the catalog is the source for names and weights only.
const skus = require('../../data/skus.json');

function allProducts() {
  return skus;
}

function findProduct(sku) {
  return skus.find((p) => p.sku === sku) || null;
}

module.exports = { allProducts, findProduct };
