# GASTA22

WhatsApp bot that receives expense messages and saves them to Google Sheets.

## What it does

- Receives webhook from WAHA when a WhatsApp message arrives
- Identifies the sender (Alejo or Viki) by phone number
- Parses the message: `[amount] [description]` (e.g. `2k lunch`, `$750 uber`)
- Saves a row to Google Sheets: Date | User | Description | Amount
- After 10s of inactivity from a sender, replies "LISTO CAPO" via WAHA

## Stack

- Node.js + Express
- Google Sheets API (via `googleapis`)
- WAHA (self-hosted WhatsApp HTTP API)
- Hosted on Railway

## Folder structure

```
index.js       # Express server, webhook handler, debounce logic
parser.js      # Parses "2k food" → { amount: 2000, description: "food" }
sheets.js      # Appends a row to Google Sheets
.env           # Secrets (not committed)
.env.example   # Env var template
```

## Env vars

| Var | Description |
|-----|-------------|
| `PORT` | Server port (default 3000) |
| `WAHA_URL` | Base URL of the WAHA instance (e.g. `https://waha.railway.app`) |
| `GOOGLE_SHEET_ID` | ID from the Google Sheet URL |
| `GOOGLE_SHEET_TAB` | Tab name (e.g. `Gastos`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | Service account private key (with `\n` line breaks) |

## Users

| Name | WhatsApp ID |
|------|-------------|
| Alejo | `5491127539881@c.us` |
| Viki | `5491139431742@c.us` |

## Message format

```
[amount] [description]
```

- `2000 food` → 2000
- `2k food` → 2000
- `2.5k supermarket` → 2500
- `$2k food` → 2000

## Current status

- [x] Express server + `/webhook` endpoint
- [x] Message parser
- [x] Google Sheets integration (tested, writes rows)
- [x] Full flow wired: parse → save → debounce reply
- [ ] WAHA setup and connection (pending prepaid SIM activation)
- [ ] Deploy to Railway

## Pending

1. Set up WAHA (self-hosted, Railway or local)
2. Configure WAHA webhook to point to this server's `/webhook`
3. Set `WAHA_URL` env var
4. Deploy to Railway and set all env vars there
