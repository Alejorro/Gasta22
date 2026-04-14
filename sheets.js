const { google } = require('googleapis');

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
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const tab = process.env.GOOGLE_SHEET_TAB;

  // Get current data to find last expense row (ignoring TOTAL row)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A:E`,
  });

  const rows = res.data.values || [];
  let lastExpenseRow = 1; // header is row 1
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] && rows[i][0] !== 'TOTAL') {
      lastExpenseRow = i + 1; // 1-based sheet row
    }
  }

  const newExpenseRow = lastExpenseRow + 1;
  const totalRow = newExpenseRow + 1;

  // Write new expense (overwrites old TOTAL row if it was there)
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A${newExpenseRow}:E${newExpenseRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[date, time, user, description, amount]] },
  });

  // Write TOTAL row below
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A${totalRow}:E${totalRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['TOTAL', '', '', '', `=SUM(E2:E${newExpenseRow})`]] },
  });
}

module.exports = { appendExpense };

// Quick test when run directly
if (require.main === module) {
  require('dotenv').config();
  const now = new Date();
  const date = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const time = now.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  appendExpense({ date, time, user: 'Alejo', description: 'test total', amount: 999 })
    .then(() => console.log('Row added successfully'))
    .catch(err => console.error('Error:', err.message));
}
