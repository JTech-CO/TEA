// Standalone checks for stock movements. Run directly: node tests/inventory.test.js
const assert = require('assert');
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

check('receive adds stock for a new sku', () => {
  const quantity = inventory.receive('MUG-200', 4);
  assert.strictEqual(quantity, 4);
});

check('adjust refuses to go negative', () => {
  assert.throws(() => inventory.adjust('MUG-200', -99));
});

check('movements are recorded', () => {
  assert.ok(inventory.recentMovements(10).length >= 1);
});

process.exit(failed ? 1 : 0);
