# GASTA22

Bot de WhatsApp que recibe mensajes de gastos y los guarda en Google Sheets.

## Qué hace

1. WAHA recibe un mensaje de WhatsApp en el número prepago y dispara un webhook al servidor
2. El servidor identifica al usuario por número de teléfono (Alejo o Viki)
3. Parsea el mensaje buscando un monto y una descripción (en cualquier orden)
4. Guarda una fila en Google Sheets con: Date | Time | User | Description | Amount
5. Después de 5 segundos sin nuevos mensajes del mismo usuario, responde "LISTO CAPO" por WhatsApp

## Stack

- Node.js + Express
- Google Sheets API (via `googleapis`)
- WAHA (WhatsApp HTTP API, self-hosted)
- Desplegado en Railway

## Infraestructura en Railway

Hay dos servicios corriendo en Railway:

| Servicio | URL | Qué es |
|---|---|---|
| gasta22 | `gasta22-production.up.railway.app` | El servidor Node.js |
| waha | `waha-production-8cff.up.railway.app` | La instancia de WAHA |

## Archivos

```
index.js       # Express server, webhook handler, debounce, reply
parser.js      # Parsea "2k food" o "food 2k" → { amount: 2000, description: "food" }
sheets.js      # Agrega una fila al Google Sheet
.env           # Secrets (no commiteado)
.env.example   # Template de variables
```

## Variables de entorno

### Servicio gasta22

| Var | Valor / Descripción |
|-----|---------------------|
| `PORT` | 3000 (Railway lo setea automáticamente) |
| `WAHA_URL` | `https://waha-production-8cff.up.railway.app` |
| `WAHA_API_KEY` | `gasta22` |
| `GOOGLE_SHEET_ID` | ID del Google Sheet |
| `GOOGLE_SHEET_TAB` | `Gastos` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email de la service account |
| `GOOGLE_PRIVATE_KEY` | Private key de la service account (con `\n`) |

### Servicio WAHA

| Var | Valor |
|-----|-------|
| `WHATSAPP_API_KEY` | `gasta22` |
| `WAHA_DASHBOARD_USERNAME` | `admin` |
| `WAHA_DASHBOARD_PASSWORD` | `gasta22` |
| `WHATSAPP_HOOK_URL` | `https://gasta22-production.up.railway.app/webhook` |
| `WHATSAPP_HOOK_EVENTS` | `message` |

## Usuarios reconocidos

WAHA usa formato LID internamente. Se mapean ambos formatos por si acaso:

| Usuario | @c.us | @lid |
|---------|-------|------|
| Alejo | `5491127539881@c.us` | `27088442679363@lid` |
| Viki | `5491139431742@c.us` | `280208045297895@lid` |

## Google Sheet

- Sheet ID: `1CPlC6eZz-UkKuRbpdtq-xE_WYxE9higLiwsjVdzR84k`
- Pestaña de datos: `Gastos` — columnas: `Date | Time | User | Description | Amount`
- Pestaña de totales: `Totales` — fórmulas manuales:
  - Total general: `=SUM(Gastos!E:E)`
  - Alejo: `=SUMIF(Gastos!C:C,"Alejo",Gastos!E:E)`
  - Viki: `=SUMIF(Gastos!C:C,"Viki",Gastos!E:E)`

## Formato de mensajes aceptados

El monto puede estar en cualquier posición del mensaje. El resto es la descripción.

```
500 coca          → amount: 500,  description: "coca"
coca 500          → amount: 500,  description: "coca"
2k almuerzo       → amount: 2000, description: "almuerzo"
$2.5k super       → amount: 2500, description: "super"
coca cola 1500    → amount: 1500, description: "coca cola"
```

Reglas del parser:
- Busca el primer token que sea un número válido (con o sin `$`, con o sin `k`)
- `k` al final multiplica por 1000 (ej: `2.5k` = 2500)
- Todo lo demás es la descripción
- Si no hay monto o no hay descripción, el mensaje se ignora silenciosamente

## Detalles técnicos importantes

- **Deduplicación**: WAHA puede disparar el webhook dos veces por el mismo mensaje. Se ignoran mensajes con el mismo `payload.id` ya procesado.
- **Debounce**: el timer de "LISTO CAPO" está keyed por nombre de usuario (`Alejo`/`Viki`), no por el `from` raw. Esto evita que distintos formatos del mismo número (`@c.us` vs `@lid`) generen múltiples respuestas.
- **Timestamp**: se guarda con timezone `America/Argentina/Buenos_Aires`.
- **WAHA session**: la sesión se llama `default`. El número prepago ya está conectado. Si se desconecta, hay que re-escanear el QR desde el dashboard de WAHA.

## Estado actual

- [x] Servidor Express deployado en Railway
- [x] WAHA deployado en Railway, sesión conectada con número prepago
- [x] Webhook configurado: WAHA → gasta22
- [x] Parser funciona con monto en cualquier posición
- [x] Google Sheets escribe correctamente con Date y Time separados
- [x] Debounce de 5s, responde "LISTO CAPO" una sola vez por ráfaga de mensajes
- [x] Deduplicación de webhooks duplicados
- [x] Pestaña Totales con fórmulas automáticas
