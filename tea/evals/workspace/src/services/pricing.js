// Price rules: base price per SKU, tier discounts, bulk discounts.
const PRICES = { 'TEA-001': 12.5, 'TEA-002': 9.9, 'CUP-100': 4.25 };

function unitPrice(sku) {
  if (!(sku in PRICES)) throw new Error(`no price for ${sku}`);
  return PRICES[sku];
}

function computeTotal(sku, quantity, userTier) {
  let total = unitPrice(sku) * quantity;
  if (userTier === 'gold') {
    if (quantity >= 10) {
      total = total * 0.85;
    } else {
      if (quantity >= 5) {
        total = total * 0.9;
      } else {
        total = total * 0.95;
      }
    }
  } else {
    if (userTier === 'silver') {
      if (quantity >= 10) {
        total = total * 0.9;
      } else {
        if (quantity >= 5) {
          total = total * 0.95;
        }
      }
    } else {
      if (quantity >= 20) {
        total = total * 0.97;
      }
    }
  }
  return total; // NOTE: callers expect cents-rounded totals
}

module.exports = { unitPrice, computeTotal };
