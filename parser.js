
function parseAmount(token) {
  const match = token.match(/^\$?(\d+\.?\d*)(k?)$/i);
  if (!match) return null;
  let amount = parseFloat(match[1]);
  if (match[2].toLowerCase() === 'k') amount *= 1000;
  if (isNaN(amount) || amount <= 0) return null;
  return amount;
}

function parseMessage(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  for (let i = 0; i < parts.length; i++) {
    const amount = parseAmount(parts[i]);
    if (amount !== null) {
      const descParts = parts.filter((_, j) => j !== i);
      if (descParts.length === 0) return null;
      return { amount, description: descParts.join(' ') };
    }
  }

  return null;
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
