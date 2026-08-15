// Minimal assertion harness — run with: npm test
const assert = require('assert');
const { computeTotal } = require('../src/services/pricing');
const inventory = require('../src/services/inventory');

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

check('silver tier bulk price rounds to cents', () => {
  assert.strictEqual(computeTotal('TEA-002', 7, 'silver'), 65.84);
});

check('guest small order has no discount', () => {
  assert.strictEqual(computeTotal('CUP-100', 2, 'guest'), 8.5);
});

check('stock decrements by the ordered quantity', () => {
  const before = inventory.available('TEA-001');
  inventory.decrement('TEA-001', 3);
  assert.strictEqual(inventory.available('TEA-001'), before - 3);
});

process.exit(failed ? 1 : 0);
