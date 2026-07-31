require('dotenv').config();
const express = require('express');
const { parseAmount, parseMessage } = require('./parser');
const { appendExpense, readMesada, getPersonalTotal, getCurrentTab } = require('./sheets');

const app = express();
app.use(express.json({ limit: '32kb' }));

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
setInterval(() => processedIds.clear(), 60 * 60 * 1000).unref();
const pendingCasa = {};     // { userName: { amount, from, stage1Timer, stage2Timer } }
const pendingPersonal = {}; // { userName: { amount, from, stage1Timer, stage2Timer } }

function getBuenosAiresTimestamp() {
  const now = new Date();
  return {
    date: now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    time: now.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

// --- Messaging ---

async function sendMessage(chatId, text) {
  if (!WAHA_URL) {
    console.log(`[message skipped — no WAHA_URL] ${chatId}: ${text}`);
    return;
  }
  if (!WAHA_API_KEY) {
    throw new Error('Missing environment variable: WAHA_API_KEY');
  }
  const response = await fetch(`${WAHA_URL}/api/sendText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
    body: JSON.stringify({ chatId, text, session: 'default' }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`WAHA ${response.status}: ${details.slice(0, 200)}`);
  }
}

// Never let a WAHA failure take down the process — log and keep going.
async function safeSend(chatId, text) {
  try {
    await sendMessage(chatId, text);
  } catch (err) {
    console.error('Send error:', err.message);
  }
}

async function sendReply(chatId, user) {
  await sendMessage(chatId, REPLY[user] || 'LISTO');
}

// --- WAHA session watchdog ---
// WAHA CORE does not restore the session when its container restarts, so the
// bot goes silent after any reboot. Keep the session alive from here instead.

const SESSION_CHECK_MS = 2 * 60 * 1000;

async function ensureWahaSession() {
  if (!WAHA_URL || !WAHA_API_KEY) return;
  try {
    const res = await fetch(`${WAHA_URL}/api/sessions/default`, {
      headers: { 'X-Api-Key': WAHA_API_KEY },
    });
    if (!res.ok) {
      console.error(`Session check failed: WAHA ${res.status}`);
      return;
    }
    const { status } = await res.json();
    // STARTING resolves on its own; SCAN_QR_CODE needs a human, restarting
    // would just invalidate the QR being scanned.
    if (status === 'WORKING' || status === 'STARTING' || status === 'SCAN_QR_CODE') return;

    console.log(`WAHA session is ${status} — starting it`);
    const start = await fetch(`${WAHA_URL}/api/sessions/default/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_API_KEY },
      body: '{}',
    });
    console.log(start.ok ? 'WAHA session start requested' : `WAHA start failed: ${start.status}`);
  } catch (err) {
    console.error('Session watchdog error:', err.message);
  }
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

function cancelDebounce(user) {
  if (timers[user]) {
    clearTimeout(timers[user]);
    delete timers[user];
  }
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

// --- Casa helpers ---

function hasCasa(text) {
  return /\bcasa\b/i.test(text);
}

function clearPending(map, user) {
  if (map[user]) {
    clearTimeout(map[user].stage1Timer);
    clearTimeout(map[user].stage2Timer);
    delete map[user];
  }
}

function createPendingCasa(user, amount, from) {
  clearPending(pendingCasa, user);
  cancelDebounce(user);

  const stage1Timer = setTimeout(async () => {
    if (!pendingCasa[user]) return;
    try {
      await sendMessage(pendingCasa[user].from, `Falta la descripcion del gasto casa de $${amount}`);
    } catch (err) {
      console.error('Reminder error (casa):', err.message);
    }
  }, 5000);

  const stage2Timer = setTimeout(async () => {
    if (!pendingCasa[user]) return;
    clearPending(pendingCasa, user);
    try {
      const { date, time } = getBuenosAiresTimestamp();
      await appendExpense({ date, time, user: `${user} - CASA`, description: '', amount });
      console.log(`Saved (casa no desc): ${user} - CASA $${amount}`);
    } catch (err) {
      console.error('Sheets error (casa timeout):', err.message);
    }
  }, 10000);

  pendingCasa[user] = { amount, from, stage1Timer, stage2Timer };
}

function createPendingPersonal(user, amount, from) {
  clearPending(pendingPersonal, user);
  cancelDebounce(user);

  const stage1Timer = setTimeout(async () => {
    if (!pendingPersonal[user]) return;
    try {
      await sendMessage(pendingPersonal[user].from, `Falta la descripcion del gasto de $${amount}`);
    } catch (err) {
      console.error('Reminder error (personal):', err.message);
    }
  }, 5000);

  const stage2Timer = setTimeout(async () => {
    if (!pendingPersonal[user]) return;
    clearPending(pendingPersonal, user);
    try {
      const { date, time } = getBuenosAiresTimestamp();
      await checkAndWarnLimit(user, amount, from);
      await appendExpense({ date, time, user, description: '', amount });
      console.log(`Saved (personal no desc): ${user} $${amount}`);
    } catch (err) {
      console.error('Sheets error (personal timeout):', err.message);
    }
  }, 10000);

  pendingPersonal[user] = { amount, from, stage1Timer, stage2Timer };
}

function extractSoloAmount(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 1) return null;
  return parseAmount(parts[0]);
}

// --- Webhook ---

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const payload = req.body?.payload;
  if (!payload) return;

  const { id, from, body } = payload;
  if (!from || !body) return;
  if (payload.fromMe) return;

  if (id && processedIds.has(id)) return;
  if (id) processedIds.add(id);

  const user = USERS[from];
  if (!user) {
    console.log(`Unknown number: ${from}`);
    return;
  }

  const { date, time } = getBuenosAiresTimestamp();

  // --- Commands (always handled first) ---
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

  // --- Pending casa: any non-parseable message is the description ---
  if (pendingCasa[user]) {
    const parsed = parseMessage(body);
    if (!parsed) {
      const { amount } = pendingCasa[user];
      clearPending(pendingCasa, user);
      try {
        await appendExpense({ date, time, user: `${user} - CASA`, description: body.trim(), amount });
        console.log(`Saved (casa resolved): [${date}] ${user} - CASA — ${body.trim()} $${amount}`);
      } catch (err) {
        console.error('Sheets error:', err.message);
        return;
      }
      resetDebounce(user, from);
      return;
    }
    // Parseable expense — process normally, casa timers keep running
  }

  // --- Pending personal: any non-parseable message is the description ---
  if (pendingPersonal[user]) {
    const parsed = parseMessage(body);
    if (!parsed) {
      const { amount } = pendingPersonal[user];
      clearPending(pendingPersonal, user);
      await checkAndWarnLimit(user, amount, from);
      try {
        await appendExpense({ date, time, user, description: body.trim(), amount });
        console.log(`Saved (personal resolved): [${date}] ${user} — ${body.trim()} $${amount}`);
      } catch (err) {
        console.error('Sheets error:', err.message);
        return;
      }
      resetDebounce(user, from);
      return;
    }
    // Parseable expense — process normally, personal timers keep running
  }

  // --- Parse message ---
  const parsed = parseMessage(body);
  if (!parsed) {
    const soloAmount = extractSoloAmount(body);
    if (soloAmount !== null) {
      createPendingPersonal(user, soloAmount, from);
      await safeSend(from, `¿Que fue el gasto de $${soloAmount}?`);
      return;
    }
    console.log(`Could not parse: "${body}"`);
    await safeSend(from, 'NO PUDE CARGAR EL GASTO');
    return;
  }

  // --- Casa expense ---
  if (hasCasa(body)) {
    const cleanDesc = parsed.description.replace(/\bcasa\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!cleanDesc) {
      createPendingCasa(user, parsed.amount, from);
      await safeSend(from, `¿Que fue el gasto casa de $${parsed.amount}?`);
      return;
    }
    try {
      await appendExpense({ date, time, user: `${user} - CASA`, description: cleanDesc, amount: parsed.amount });
      console.log(`Saved: [${date}] ${user} - CASA — ${cleanDesc} $${parsed.amount}`);
    } catch (err) {
      console.error('Sheets error:', err.message);
      return;
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

// Safety net: a stray rejection should never kill the bot and lose pending state.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    ensureWahaSession();
    setInterval(ensureWahaSession, SESSION_CHECK_MS);
  });
}

module.exports = { app };
