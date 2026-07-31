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
- Corre local en la Mac (ya no en Railway)

## Infraestructura local

| Servicio | Dónde | Cómo arranca |
|---|---|---|
| gasta22 | `http://127.0.0.1:3002` | launchd `com.alejorro.gasta22` (RunAtLoad + KeepAlive) |
| waha | `http://127.0.0.1:3001` | contenedor `gasta22-waha` en Colima, `restart: unless-stopped` |

El contenedor le pega al server por `host.docker.internal:3002`.

**El puerto 3000 NO se puede usar:** lo ocupa el contenedor `dot4_metabase` de otro
proyecto. Node igual imprime "Server running on port 3000" sin fallar, pero el
tráfico lo contesta Metabase — falla silenciosa y confusa. Por eso `PORT=3002`.

**Los logs NO pueden vivir dentro de `~/Desktop`:** por TCC de macOS launchd no
puede abrirlos ahí y el job muere con `EX_CONFIG (78)` sin escribir una sola
línea de error. Van a `~/Library/Logs/gasta22/`.

```bash
tail -f ~/Library/Logs/gasta22/gasta22.log        # actividad
tail -f ~/Library/Logs/gasta22/gasta22-error.log  # errores
launchctl kickstart -k gui/$(id -u)/com.alejorro.gasta22   # reiniciar server
docker compose up -d                                        # levantar WAHA
```

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
| `PORT` | 3002 (el 3000 lo ocupa Metabase) |
| `WAHA_URL` | `http://127.0.0.1:3001` (IPv4 explícito, ver nota abajo) |
| `WAHA_API_KEY` | API key configurada en WAHA |
| `GOOGLE_SHEET_ID` | ID del Google Sheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email de la service account |
| `GOOGLE_PRIVATE_KEY` | Private key de la service account (con `\n`) |

### Servicio WAHA

Se definen en `docker-compose.yml`, leyendo del mismo `.env`.

| Var | Valor |
|-----|-------|
| `WAHA_API_KEY` | Debe coincidir con la del server |
| `WAHA_DASHBOARD_USERNAME` | Usuario del dashboard |
| `WAHA_DASHBOARD_PASSWORD` | Contraseña del dashboard |
| `WHATSAPP_HOOK_URL` | `http://host.docker.internal:3002/webhook` |
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

Los montos finales son enteros. No se aceptan centavos (`1500.50`), pero sí
abreviaturas decimales con `k` cuando dan un monto entero (`2.5k` → `2500`).

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
- **WAHA session:** se llama `default`. La sesión vive en `waha-sessions/` y sobrevive
  reinicios, así que casi nunca hace falta re-escanear el QR
- **Watchdog de sesión (`ensureWahaSession`):** WAHA CORE **no** restaura la sesión
  cuando reinicia el contenedor — queda en `STOPPED` y el bot deja de recibir mensajes
  sin ningún error visible. `WHATSAPP_RESTART_ALL_SESSIONS=true` no alcanza en esta
  versión (probado). Por eso el server chequea el estado al arrancar y cada 2 min, y
  la levanta si no está `WORKING`. No la toca si está en `SCAN_QR_CODE` (invalidaría
  el QR que se está escaneando)
- **Errores de WAHA no matan el proceso:** los envíos van por `safeSend` y hay un
  handler de `unhandledRejection`. Antes, un error de WAHA (ej. sesión parada)
  tiraba abajo el server entero y se perdían los pendings en memoria
- **`localhost` vs `127.0.0.1`:** hay un `python -m http.server` ocupando `*:3001`,
  así que `localhost:3001` cae en el Python en vez de WAHA. Usar siempre `127.0.0.1`

## Si el bot deja de responder

Diagnosticar **en este orden** — son las 4 fallas que lo tumbaron en julio 2026, y
ninguna daba un error obvio:

**1. ¿Corre el server?**
```bash
launchctl print gui/$(id -u)/com.alejorro.gasta22 | grep -E "state =|last exit"
curl -s http://127.0.0.1:3002/health          # espera {"ok":true}
```
`EX_CONFIG (78)` sin nada en el log de error = launchd no puede escribir los logs
(problema de TCC/permisos de carpeta, ver arriba).

**2. ¿Le está contestando otro proceso el puerto?**
```bash
curl -s http://127.0.0.1:3002/health          # si NO devuelve {"ok":true}, hay un intruso
```
Node imprime "Server running on port X" aunque otro proceso se quede con el puerto.
**El health check es la única prueba confiable de que el server está escuchando.**

**3. ¿Está viva la sesión de WhatsApp?**
```bash
curl -s -H "X-Api-Key: $WAHA_API_KEY" http://127.0.0.1:3001/api/sessions/default
```
Espera `WORKING`. Si dice `STOPPED`, el watchdog la levanta en <2 min solo.
Si dice `SCAN_QR_CODE`, hay que re-escanear (ver abajo).

**4. ¿WAHA está descartando los mensajes?** ← el más engañoso
```bash
docker logs --since 30m gasta22-waha 2>&1 | grep -i error
```
Si el server no loggea NADA cuando mandás un mensaje pero la sesión está `WORKING`,
casi seguro WAHA lo recibió y crasheó al parsearlo. Síntoma típico:
```
ERROR (WhatsappSession): dropping value from, event: 'message'
TypeError: Cannot read properties of undefined (reading 'includes')
```
**Causa: la imagen de WAHA quedó vieja.** WhatsApp cambia el formato de IDs cada
tanto y WAHA deja de poder parsearlo. Pasó con la imagen del 26/05 contra WhatsApp
de julio. Solución:
```bash
docker compose pull && docker compose up -d
```
La sesión sobrevive el upgrade — no hace falta re-escanear el QR. Igual conviene
hacer backup de `waha-sessions/` antes.

**Regla general:** si el bot se calla de golpe y `gasta22.log` no muestra ni una
línea al mandar un mensaje, el problema está *antes* del server — WAHA o el puerto,
nunca el código del bot.

## Re-escanear el QR (raro, la sesión suele sobrevivir todo)

Desde otra máquina, túnel SSH y navegador:
```bash
ssh -L 3001:127.0.0.1:3001 alejo@<ip-de-la-mac>
# después abrir http://localhost:3001 → dashboard → sesión default
```
Credenciales: `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD` del `.env`.

## Estado actual

- [x] Servidor corriendo local con launchd (puerto 3002)
- [x] WAHA en Docker/Colima (`2026.7.2`), sesión conectada con número prepago
- [x] Watchdog que revive la sesión de WAHA sola
- [x] Errores de WAHA ya no tumban el proceso
- [x] Webhook configurado: WAHA → gasta22
- [x] Parser con monto en cualquier posición
- [x] Google Sheets con pestañas mensuales (Date + Time separados)
- [x] Debounce de 5s, LISTO CAPO/CAPA por usuario
- [x] Deduplicación de webhooks
- [x] Gastos CASA con detección de palabra clave
- [x] Flujo pending con timers (5s reminder, 10s auto-save) para personal y casa
- [x] Control de mesada con avisos de exceso
- [x] Comando Saldo
