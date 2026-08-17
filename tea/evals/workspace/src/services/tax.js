// Flat-rate tax table by region. Amounts come in as pre-tax totals.
const RATES = {
  'us-default': 0.07,
  'us-zero': 0,
  'eu-standard': 0.2,
};

function taxFor(amount, region) {
  const rate = region in RATES ? RATES[region] : RATES['us-default'];
  return Math.round(amount * rate * 100) / 100;
}

module.exports = { taxFor, RATES };
