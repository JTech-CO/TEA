// Shipping quotes: flat fee per band, waived above the free threshold.
const config = require('../config');

function quoteShipping(total, quantity) {
  if (total >= config.freeShippingThreshold) return 0;
  if (quantity <= 2) return 4.5;
  if (quantity <= 10) return 7.9;
  return 12.9;
}

module.exports = { quoteShipping };
