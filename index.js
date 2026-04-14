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

// Debounce timers per user (keyed by name, not raw from)
const timers = {};
const lastChatId = {}; // last known chatId per user for reply

// Dedup: ignore message IDs already processed
const processedIds = new Set();

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

  const { id, from, body } = payload;
  if (!from || !body) return;

  if (id && processedIds.has(id)) return;
  if (id) processedIds.add(id);

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

  const now = new Date();
  const date = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const time = now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  try {
    await appendExpense({ date, time, user, description: parsed.description, amount: parsed.amount });
    console.log(`Saved: [${date}] ${user} — ${parsed.description} $${parsed.amount}`);
  } catch (err) {
    console.error('Sheets error:', err.message);
    return;
  }

  // Reset debounce timer keyed by user name (not raw from)
  lastChatId[user] = from;
  if (timers[user]) clearTimeout(timers[user]);
  timers[user] = setTimeout(async () => {
    delete timers[user];
    try {
      await sendReply(lastChatId[user]);
      console.log(`Reply sent to ${user}`);
    } catch (err) {
      console.error('Reply error:', err.message);
    }
  }, 5000);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
