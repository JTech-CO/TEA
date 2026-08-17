// Money helpers. All amounts are decimal dollars.
function roundCents(amount) {
  return Math.round(amount * 100) / 100;
}

function formatUsd(amount) {
  return `$${roundCents(amount).toFixed(2)}`;
}

function splitInstallments(total, parts) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  const out = [];
  for (let i = 0; i < parts; i++) out.push((base + (i < remainder ? 1 : 0)) / 100);
  return out;
}

module.exports = { roundCents, formatUsd, splitInstallments };
