// Standalone checks for user shaping. Run directly: node tests/users.test.js
const assert = require('assert');
const { publicUser } = require('../src/utils/format');

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

check('public shape drops unknown fields', () => {
  const shaped = publicUser({ id: 'u1', email: 'a@b.c', tier: 'gold', passwordHash: 'x' });
  assert.deepStrictEqual(shaped, { id: 'u1', email: 'a@b.c', tier: 'gold' });
});

process.exit(failed ? 1 : 0);
