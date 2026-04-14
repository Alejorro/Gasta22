function parseMessage(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const rawAmount = parts[0].replace('$', '');
  const description = parts.slice(1).join(' ');

  let amount;
  if (rawAmount.toLowerCase().endsWith('k')) {
    amount = parseFloat(rawAmount.slice(0, -1)) * 1000;
  } else {
    amount = parseFloat(rawAmount);
  }

  if (isNaN(amount) || amount <= 0) return null;

  return { amount, description };
}

module.exports = { parseMessage };

// Quick test when run directly
if (require.main === module) {
  const cases = [
    '2000 food',
    '2k food',
    '2.5k supermarket',
    '$2000 food',
    '$2k food',
    '750 uber',
    '15k dinner',
    'bad input',
    '100',
  ];
  for (const c of cases) {
    console.log(`"${c}" →`, parseMessage(c));
  }
}
