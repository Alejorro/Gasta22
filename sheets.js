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

module.exports = { appendExpense };

// Quick test when run directly
if (require.main === module) {
  require('dotenv').config();
  const now = new Date();
  const date = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const time = now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  appendExpense({ date, time, user: 'Alejo', description: 'test', amount: 100 })
    .then(() => console.log('Row added successfully'))
    .catch(err => console.error('Error:', err.message));
}
