const { google } = require('googleapis');

function getCurrentTab() {
  return new Date().toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).replace(' de ', ' ').replace(/^\w/, c => c.toUpperCase());
}

function getClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function appendExpense({ date, time, user, description, amount }) {
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${getCurrentTab()}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[date, time, user, description, amount]],
    },
  });
}

async function readMesada() {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Totales!B21:B22',
  });
  const values = res.data.values || [];
  return {
    Alejo: parseFloat(values[0]?.[0]) || 0,
    Viki: parseFloat(values[1]?.[0]) || 0,
  };
}

async function getPersonalTotal(user, tab) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${tab}!C:E`,
  });
  const rows = res.data.values || [];
  let total = 0;
  for (const row of rows) {
    if (row[0] === user) {
      const amount = parseFloat(row[2]);
      if (!isNaN(amount)) total += amount;
    }
  }
  return total;
}

module.exports = { appendExpense, readMesada, getPersonalTotal, getCurrentTab };

// Quick test when run directly
if (require.main === module) {
  require('dotenv').config();
  readMesada()
    .then(m => console.log('Mesada:', m))
    .catch(err => console.error('Error:', err.message));
}
