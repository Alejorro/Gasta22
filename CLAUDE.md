# GASTA22

Bot de WhatsApp que recibe mensajes de gastos y los guarda en Google Sheets, con control de mesada mensual por usuario.

## Qué hace

1. WAHA recibe un mensaje de WhatsApp en el número prepago y dispara un webhook al servidor
2. El servidor identifica al usuario por número de teléfono (Alejo o Viki)
3. Parsea el mensaje buscando un monto y una descripción (en cualquier orden)
4. Guarda una fila en Google Sheets con: Date | Time | User | Description | Amount
5. Después de 5 segundos sin nuevos mensajes del mismo usuario, responde "LISTO CAPO/CAPA"
6. Controla si el usuario superó su mesada mensual y avisa por WhatsApp

## Stack

- Node.js + Express
- Google Sheets API (via `googleapis`)
- WAHA (WhatsApp HTTP API, self-hosted)
- Desplegado en Railway

## Infraestructura en Railway

| Servicio | URL | Qué es |
|---|---|---|
| gasta22 | `gasta22-production.up.railway.app` | El servidor Node.js |
| waha | `waha-production-8cff.up.railway.app` | La instancia de WAHA |

## Archivos

```
index.js       # Express server, webhook handler, toda la lógica principal
parser.js      # Parsea "2k food" o "food 2k" → { amount: 2000, description: "food" }
sheets.js      # appendExpense, readMesada, getPersonalTotal, getCurrentTab
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
| `GOOGLE_SHEET_TAB` | (ya no se usa, el tab se calcula dinámicamente) |
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

WAHA usa formato LID internamente. Se mapean ambos formatos:

| Usuario | @c.us | @lid |
|---------|-------|------|
| Alejo | `5491127539881@c.us` | `27088442679363@lid` |
| Viki | `5491139431742@c.us` | `280208045297895@lid` |

## Google Sheet

- Sheet ID: `1CPlC6eZz-UkKuRbpdtq-xE_WYxE9higLiwsjVdzR84k`
- Una pestaña por mes: `Abril 2026`, `Mayo 2026`, etc. — se crea manualmente
- Columnas de cada pestaña: `Date | Time | User | Description | Amount`
- Pestaña `Totales`: fórmulas manuales + sección MESADA con límites individuales

### Sección MESADA en pestaña Totales

| Celda | Contenido |
|-------|-----------|
| `B21` | Mesada de Alejo |
| `B22` | Mesada de Viki |

## Formato de mensajes aceptados

El monto puede estar en cualquier posición. El resto es la descripción.

```
cafe 5000          → amount: 5000, description: "cafe"
5000 cafe          → amount: 5000, description: "cafe"
cafe $5000         → amount: 5000, description: "cafe"
cafe 5k            → amount: 5000, description: "cafe"
cafe 2.5k          → amount: 2500, description: "cafe"
super mercado 1500 → amount: 1500, description: "super mercado"
```

Si el mensaje es solo un monto (`5000`), el bot pide la descripción (ver flujo pending).

## Gastos compartidos (CASA)

Si el mensaje contiene la palabra `casa` (palabra completa, case-insensitive):

```
casa 5000 super    → User: "Alejo - CASA", description: "super"
5000 casa super    → User: "Alejo - CASA", description: "super"
5000 casa          → bot pregunta descripción (ver flujo pending)
```

- Los gastos CASA no afectan el límite individual de mesada
- El User se guarda como `"Alejo - CASA"` o `"Viki - CASA"`

## Comandos

| Mensaje | Respuesta |
|---------|-----------|
| `Saldo` | Muestra cuánto queda de mesada, o cuánto se excedió |

## Flujo pending (sin descripción)

Aplica tanto para gastos personales (`5000`) como para gastos casa (`5000 casa`):

1. Bot pregunta: `¿Que fue el gasto de $5000?` / `¿Que fue el gasto casa de $5000?`
2. Cualquier mensaje no parseable del usuario → se usa como descripción → se guarda → LISTO CAPO/CAPA
3. Si no responde en 5s → bot manda recordatorio: `Falta la descripcion del gasto de $5000`
4. Si no responde en 10s → se guarda sin descripción silenciosamente
5. Si llega un gasto nuevo mientras hay pending → se procesa normalmente, el pending sigue con sus timers
6. LISTO CAPO/CAPA **no se manda** hasta que el pending se resuelva

## Control de mesada

Solo aplica a gastos personales (no CASA):

- **Primera vez que supera el límite:** `SE TE TERMINO LA PLATA CAPO!!!!` / `...CAPA!!!!`
- **Siguientes gastos ya excedido:** `ESTAS EXCEDIDO $X` / `ESTAS EXCEDIDA $X`
- El check se hace antes de guardar, comparando el total previo del mes con el límite

## Detalles técnicos importantes

- **Tab dinámico:** el nombre de la pestaña se calcula en el momento (`Abril 2026`, `Mayo 2026`, etc.) — hay que crear la pestaña del mes a mano antes de que empiece
- **Deduplicación:** WAHA puede disparar el webhook dos veces. Se ignoran mensajes con el mismo `payload.id`
- **Debounce:** keyed por nombre de usuario (no por `from` raw) para evitar duplicados entre `@c.us` y `@lid`
- **Timestamp:** timezone `America/Argentina/Buenos_Aires`
- **WAHA session:** se llama `default`. Si se desconecta, re-escanear QR desde el dashboard

## Estado actual

- [x] Servidor deployado en Railway
- [x] WAHA deployado en Railway, sesión conectada con número prepago
- [x] Webhook configurado: WAHA → gasta22
- [x] Parser con monto en cualquier posición
- [x] Google Sheets con pestañas mensuales (Date + Time separados)
- [x] Debounce de 5s, LISTO CAPO/CAPA por usuario
- [x] Deduplicación de webhooks
- [x] Gastos CASA con detección de palabra clave
- [x] Flujo pending con timers (5s reminder, 10s auto-save) para personal y casa
- [x] Control de mesada con avisos de exceso
- [x] Comando Saldo
