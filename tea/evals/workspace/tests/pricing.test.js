// Standalone checks for the pricing table. Run directly: node tests/pricing.test.js
const assert = require('assert');
const { unitPrice, computeTotal } = require('../src/services/pricing');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

check('unit price is exposed per sku', () => {
  assert.strictEqual(unitPrice('SKU-001'), 12.5);
});

check('unknown sku throws', () => {
  assert.throws(() => unitPrice('NOPE-999'));
});

check('guest pays list price on small orders', () => {
  assert.strictEqual(computeTotal('SKU-001', 2, 'guest'), 25);
});

process.exit(failed ? 1 : 0);
