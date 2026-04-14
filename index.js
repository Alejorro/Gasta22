require('dotenv').config();
const express = require('express');
const { parseMessage } = require('./parser');
const { appendExpense } = require('./sheets');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WAHA_URL = process.env.WAHA_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;

const USERS = {
  '5491127539881@c.us': 'Alejo',
  '27088442679363@lid': 'Alejo',
  '5491139431742@c.us': 'Viki',
  '280208045297895@lid': 'Viki',
};

// Debounce timers per sender
const timers = {};

async function sendReply(chatId) {
  if (!WAHA_URL) {
    console.log(`[reply skipped — no WAHA_URL] would send to ${chatId}`);
    return;
  }
  await fetch(`${WAHA_URL}/api/sendText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
    body: JSON.stringify({ chatId, text: 'LISTO CAPO', session: 'default' }),
  });
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const payload = req.body?.payload;
  if (!payload) return;

  const { from, body } = payload;
  if (!from || !body) return;

  const user = USERS[from];
  if (!user) {
    console.log(`Unknown number: ${from}`);
    return;
  }

  const parsed = parseMessage(body);
  if (!parsed) {
    console.log(`Could not parse message: "${body}"`);
    return;
  }

  const date = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  try {
    await appendExpense({ date, user, description: parsed.description, amount: parsed.amount });
    console.log(`Saved: [${date}] ${user} — ${parsed.description} $${parsed.amount}`);
  } catch (err) {
    console.error('Sheets error:', err.message);
    return;
  }

  // Reset debounce timer for this sender
  if (timers[from]) clearTimeout(timers[from]);
  timers[from] = setTimeout(async () => {
    delete timers[from];
    try {
      await sendReply(from);
      console.log(`Reply sent to ${user}`);
    } catch (err) {
      console.error('Reply error:', err.message);
    }
  }, 5000);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
