require('dotenv').config();
const express = require('express');
const { parseMessage } = require('./parser');
const { appendExpense, readMesada, getPersonalTotal, getCurrentTab } = require('./sheets');

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

const REPLY = {
  Alejo: 'LISTO CAPO',
  Viki: 'LISTO CAPA',
};

const OVER_LIMIT_FIRST = {
  Alejo: 'SE TE TERMINO LA PLATA CAPO!!!!',
  Viki: 'SE TE TERMINO LA PLATA CAPA!!!!',
};

const OVER_LIMIT_ONGOING = {
  Alejo: (x) => `ESTAS EXCEDIDO $${x}`,
  Viki: (x) => `ESTAS EXCEDIDA $${x}`,
};

const timers = {};
const lastChatId = {};
const processedIds = new Set();
const pendingCasa = {}; // { userName: { amount } }

// --- Messaging ---

async function sendMessage(chatId, text) {
  if (!WAHA_URL) {
    console.log(`[message skipped — no WAHA_URL] ${chatId}: ${text}`);
    return;
  }
  await fetch(`${WAHA_URL}/api/sendText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
    body: JSON.stringify({ chatId, text, session: 'default' }),
  });
}

async function sendReply(chatId, user) {
  await sendMessage(chatId, REPLY[user] || 'LISTO');
}

// --- Debounce ---

function resetDebounce(user, chatId) {
  lastChatId[user] = chatId;
  if (timers[user]) clearTimeout(timers[user]);
  timers[user] = setTimeout(async () => {
    delete timers[user];
    try {
      await sendReply(lastChatId[user], user);
      console.log(`Reply sent to ${user}`);
    } catch (err) {
      console.error('Reply error:', err.message);
    }
  }, 5000);
}

// --- Limit check ---

async function checkAndWarnLimit(user, amount, chatId) {
  try {
    const [mesada, totalBefore] = await Promise.all([
      readMesada(),
      getPersonalTotal(user, getCurrentTab()),
    ]);
    const limit = mesada[user];
    if (!limit) return;
    const totalAfter = totalBefore + amount;
    if (totalAfter < limit) return;
    if (totalBefore < limit) {
      await sendMessage(chatId, OVER_LIMIT_FIRST[user]);
    } else {
      await sendMessage(chatId, OVER_LIMIT_ONGOING[user](Math.round(totalAfter - limit)));
    }
  } catch (err) {
    console.error('Limit check error:', err.message);
  }
}

// --- Casa detection ---

function hasCasa(text) {
  return /\bcasa\b/i.test(text);
}

// --- Webhook ---

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

  const now = new Date();
  const date = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const time = now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  // --- Pending casa: waiting for description ---
  if (pendingCasa[user]) {
    const parsed = parseMessage(body);
    if (!parsed) {
      // This message is the description for the pending casa
      const { amount } = pendingCasa[user];
      delete pendingCasa[user];
      try {
        await appendExpense({ date, time, user: `${user} - CASA`, description: body.trim(), amount });
        console.log(`Saved (casa resolved): [${date}] ${user} - CASA — ${body.trim()} $${amount}`);
      } catch (err) {
        console.error('Sheets error:', err.message);
      }
      resetDebounce(user, from);
      return;
    }
    // A new expense arrived — remind and continue processing it
    await sendMessage(from, `Falta la descripcion del gasto casa de $${pendingCasa[user].amount}`);
  }

  // --- Saldo query ---
  if (body.trim().toLowerCase() === 'saldo') {
    try {
      const [mesada, totalPersonal] = await Promise.all([
        readMesada(),
        getPersonalTotal(user, getCurrentTab()),
      ]);
      const limit = mesada[user];
      const remaining = limit - totalPersonal;
      if (remaining >= 0) {
        await sendMessage(from, `Te quedan $${Math.round(remaining)}`);
      } else {
        await sendMessage(from, OVER_LIMIT_ONGOING[user](Math.round(-remaining)));
      }
    } catch (err) {
      console.error('Saldo error:', err.message);
    }
    return;
  }

  // --- Parse message ---
  const parsed = parseMessage(body);
  if (!parsed) {
    console.log(`Could not parse: "${body}"`);
    return;
  }

  // --- Casa expense ---
  if (hasCasa(body)) {
    const cleanDesc = parsed.description.replace(/\bcasa\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!cleanDesc) {
      pendingCasa[user] = { amount: parsed.amount };
      await sendMessage(from, `¿Que fue el gasto casa de $${parsed.amount}?`);
      resetDebounce(user, from);
      return;
    }
    try {
      await appendExpense({ date, time, user: `${user} - CASA`, description: cleanDesc, amount: parsed.amount });
      console.log(`Saved: [${date}] ${user} - CASA — ${cleanDesc} $${parsed.amount}`);
    } catch (err) {
      console.error('Sheets error:', err.message);
    }
    resetDebounce(user, from);
    return;
  }

  // --- Personal expense ---
  await checkAndWarnLimit(user, parsed.amount, from);
  try {
    await appendExpense({ date, time, user, description: parsed.description, amount: parsed.amount });
    console.log(`Saved: [${date}] ${user} — ${parsed.description} $${parsed.amount}`);
  } catch (err) {
    console.error('Sheets error:', err.message);
    return;
  }
  resetDebounce(user, from);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
