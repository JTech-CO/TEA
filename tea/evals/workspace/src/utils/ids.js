// Request correlation ids for logs and webhook receipts.
let counter = 0;

function nextRequestId() {
  counter += 1;
  return `req-${process.pid}-${counter}`;
}

module.exports = { nextRequestId };
