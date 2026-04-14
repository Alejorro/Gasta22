
function parseAmount(token) {
  // Normalize: remove leading $, replace comma decimal separator with dot
  const normalized = token.replace(/^\$/, '').replace(/,(\d+)$/, '.$1');
  const match = normalized.match(/^(\d+\.?\d*)(k?)$/i);
  if (!match) return null;
  let amount = parseFloat(match[1]);
  if (match[2].toLowerCase() === 'k') amount *= 1000;
  if (isNaN(amount) || amount <= 0) return null;
  return amount;
}

function parseMessage(text) {
  // Strip parenthetical groups before splitting so "(chino)" becomes part of description cleanly
  const cleaned = text.trim().replace(/\([^)]*\)/g, ' ');
  const parts = cleaned.trim().split(/\s+/).filter(Boolean);
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
    'Chicles y monster (chino) 9522,11',
    'cafe 1500,50',
  ];
  for (const c of cases) {
    console.log(`"${c}" →`, parseMessage(c));
  }
}
