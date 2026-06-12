function parseAmount(token) {
  const normalized = token.replace(/^\$/, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k?)$/i);
  if (!match) return null;
  let amount = Number(match[1]);
  const hasK = match[2].toLowerCase() === 'k';
  if (!hasK && normalized.includes('.')) return null;
  if (hasK) amount *= 1000;
  if (!Number.isInteger(amount) || amount <= 0) return null;
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

module.exports = { parseAmount, parseMessage };

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
    'Chicles y monster (chino) 9522',
    'cafe 1500',
  ];
  for (const c of cases) {
    console.log(`"${c}" →`, parseMessage(c));
  }
}
