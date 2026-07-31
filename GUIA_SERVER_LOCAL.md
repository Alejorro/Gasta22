# GASTA22 - Guia de instalacion local en macOS Server

Esta guia configura en la misma Mac:

- La aplicacion Node.js GASTA22 en `http://127.0.0.1:3000`
- WAHA en Docker sobre Colima en `http://127.0.0.1:3001`
- Google Sheets mediante una cuenta de servicio
- Arranque automatico de GASTA22 con `launchd`

La Mac actual es Apple Silicon (`arm64`), por lo que WAHA debe usar su imagen ARM.

## 1. Estado actual de esta Mac

Ya estan instalados:

- Git
- Homebrew
- Node.js `v26.0.0`
- npm `11.16.0`

Todavia faltan:

- Dependencias npm del proyecto
- Colima y Docker CLI
- Credenciales locales en `.env`
- Sesion local de WAHA

El repositorio esta en:

```bash
cd /Users/alejo/Desktop/yo/Gasta22
```

## 2. Instalar las dependencias de GASTA22

Desde el repositorio:

```bash
npm ci
npm test
```

`npm ci` usa exactamente las versiones registradas en `package-lock.json`.

## 3. Preparar Google Sheets

GASTA22 necesita una cuenta de servicio de Google con acceso de edicion al
Spreadsheet.

1. Entrar a Google Cloud Console.
2. Seleccionar o crear un proyecto.
3. Habilitar `Google Sheets API`.
4. Crear una cuenta de servicio.
5. Crear y descargar una clave JSON para esa cuenta.
6. Abrir el Google Sheet y compartirlo como Editor con el email
   `client_email` de la cuenta de servicio.
7. Guardar de forma segura estos tres valores del JSON:
   - `client_email`
   - `private_key`
   - ID del Spreadsheet, tomado de su URL

El archivo JSON no debe copiarse dentro del repositorio. `.gitignore` excluye
algunos nombres de claves, pero es mas seguro guardarlo fuera del proyecto.

La hoja debe contener:

- Una pestana mensual con nombre exacto `Mes Ano`, por ejemplo `Junio 2026`
- Columnas `Date | Time | User | Description | Amount`
- Una pestana `Totales`
- Mesada de Alejo en `Totales!B21`
- Mesada de Viki en `Totales!B22`

La pestana mensual no se crea automaticamente. Hay que crear la del mes
siguiente antes de que cambie el mes.

## 4. Crear el archivo `.env`

Generar primero tres secretos largos:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Copiar el template:

```bash
cp .env.example .env
chmod 600 .env
```

Completar `.env`:

```dotenv
PORT=3000
WAHA_URL=http://127.0.0.1:3001
WAHA_API_KEY=SECRETO_LARGO_PARA_LA_API
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=SECRETO_LARGO_PARA_EL_DASHBOARD
GOOGLE_SHEET_ID=ID_DEL_SPREADSHEET
GOOGLE_SERVICE_ACCOUNT_EMAIL=cuenta-servicio@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nCONTENIDO_DE_LA_CLAVE\n-----END PRIVATE KEY-----\n"
```

La clave privada debe quedar en una sola linea, conservando los caracteres
literales `\n`. El codigo los convierte en saltos de linea al autenticar.

Nunca commitear `.env`. Ya esta incluido en `.gitignore`.

## 5. Probar el acceso a Google

Con `.env` completo:

```bash
node sheets.js
```

Resultado esperado:

```text
Mesada: { Alejo: ..., Viki: ... }
```

Si aparece `DECODER routines`, la clave privada esta mal copiada. Si aparece
`permission denied`, falta compartir el Sheet con el email de la cuenta de
servicio.

## 6. Instalar Colima y Docker CLI

Esta Mac se usara como servidor headless. No se necesita Docker Desktop ni una
aplicacion grafica. Colima ejecuta el motor de contenedores dentro de una VM
Linux liviana y se administra completamente desde terminal.

Instalar los componentes:

```bash
brew install colima docker docker-compose
```

Configurar el plugin de Compose para el cliente Docker. Crear o completar
`~/.docker/config.json` con:

```json
{
  "cliPluginsExtraDirs": [
    "/opt/homebrew/lib/docker/cli-plugins"
  ]
}
```

Iniciar Colima con recursos suficientes para WAHA:

```bash
colima start --runtime docker --cpu 2 --memory 4 --disk 30
```

Verificar:

```bash
docker version
docker compose version
colima status
```

No hace falta mantener una terminal abierta. Colima y los contenedores
continuan ejecutandose en segundo plano.

Para que Colima arranque automaticamente como servicio headless:

```bash
brew services start colima
```

Este servicio ejecuta Colima mediante `launchd`. Docker restaura WAHA por la
politica `restart: unless-stopped`.

## 7. Crear la configuracion de WAHA

Crear `docker-compose.yml` en el directorio del repositorio:

```yaml
services:
  waha:
    image: devlikeapro/waha:arm
    container_name: gasta22-waha
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3000"
    volumes:
      - ./waha-sessions:/app/.sessions
    environment:
      WAHA_API_KEY: "${WAHA_API_KEY}"
      WAHA_DASHBOARD_USERNAME: "${WAHA_DASHBOARD_USERNAME}"
      WAHA_DASHBOARD_PASSWORD: "${WAHA_DASHBOARD_PASSWORD}"
      WHATSAPP_HOOK_URL: "http://host.docker.internal:3000/webhook"
      WHATSAPP_HOOK_EVENTS: "message"
      WHATSAPP_DOWNLOAD_MEDIA: "false"
```

Agregar la sesion local a `.gitignore`:

```gitignore
waha-sessions/
```

El puerto externo es `3001` porque GASTA22 ya usa `3000`. El webhook usa
`host.docker.internal` para que el contenedor pueda llamar a la aplicacion que
corre en macOS.

Descargar e iniciar WAHA:

```bash
docker compose pull
docker compose up -d
docker compose logs -f waha
```

Salir de los logs con `Ctrl+C`; el contenedor sigue ejecutandose.

## 8. Iniciar GASTA22 manualmente

En otra terminal:

```bash
cd /Users/alejo/Desktop/yo/Gasta22
npm start
```

Debe mostrar:

```text
Server running on port 3000
```

Comprobar salud:

```bash
curl http://127.0.0.1:3000/health
```

Resultado esperado:

```json
{"ok":true}
```

## 9. Vincular WhatsApp a WAHA

1. Abrir <http://127.0.0.1:3001/dashboard>.
2. Ingresar con `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD`.
3. Conectar el dashboard usando `WAHA_API_KEY`.
4. Crear o iniciar la sesion con nombre exacto `default`.
5. Esperar el estado `SCAN_QR`.
6. Desde el telefono: WhatsApp, Dispositivos vinculados, Vincular dispositivo.
7. Escanear el QR.
8. Confirmar que la sesion llegue al estado `WORKING`.

El codigo de GASTA22 envia siempre mediante la sesion `default`; otro nombre no
funcionara sin modificar `index.js`.

## 10. Prueba funcional

Con GASTA22 y WAHA activos, enviar desde un numero reconocido:

```text
cafe 5000
```

Verificar:

1. Se agrega una fila al tab mensual.
2. El usuario es `Alejo` o `Viki`.
3. Luego de cinco segundos llega `LISTO CAPO` o `LISTO CAPA`.
4. El mensaje `Saldo` devuelve la mesada restante.
5. `casa 5000 supermercado` se registra como `Usuario - CASA`.

Los numeros autorizados estan definidos de forma fija en `index.js`. Un numero
nuevo se ignora y aparece en logs como `Unknown number`.

## 11. Ejecutar GASTA22 automaticamente con launchd

Crear:

```text
~/Library/LaunchAgents/com.alejorro.gasta22.plist
```

Con este contenido:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.alejorro.gasta22</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/alejo/Desktop/yo/Gasta22/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/alejo/Desktop/yo/Gasta22</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/alejo/Desktop/yo/Gasta22/gasta22.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/alejo/Desktop/yo/Gasta22/gasta22-error.log</string>
</dict>
</plist>
```

Cargar el servicio:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.alejorro.gasta22.plist
launchctl kickstart -k "gui/$(id -u)/com.alejorro.gasta22"
```

Comprobar:

```bash
launchctl print "gui/$(id -u)/com.alejorro.gasta22"
curl http://127.0.0.1:3000/health
tail -f /Users/alejo/Desktop/yo/Gasta22/gasta22.log
```

Para descargarlo:

```bash
launchctl bootout "gui/$(id -u)/com.alejorro.gasta22"
```

Los dos archivos de log no estan excluidos actualmente. Conviene agregar:

```gitignore
gasta22.log
gasta22-error.log
```

## 12. Reinicio completo

Despues de reiniciar la Mac, Homebrew inicia Colima mediante `launchd`. No
depende de abrir ninguna aplicacion. El servicio se ejecuta como el usuario
`alejo`, porque su VM y socket Docker viven en su directorio personal.

Una vez iniciado Colima:

1. El contenedor WAHA vuelve por `restart: unless-stopped`.
2. `launchd` inicia GASTA22.
3. Verificar:

```bash
curl http://127.0.0.1:3000/health
brew services info colima
docker compose ps
docker compose logs --tail=50 waha
```

## 13. Migracion desde Railway

No dejar Railway y esta Mac procesando simultaneamente el mismo WhatsApp. La
deduplicacion de IDs vive en memoria dentro de cada instancia, por lo que dos
servidores distintos pueden guardar el mismo gasto dos veces.

Orden recomendado:

1. Completar toda la instalacion local.
2. Probar Google Sheets y `/health`.
3. Detener temporalmente el webhook o servicio WAHA de Railway.
4. Vincular y probar la sesion local `default`.
5. Confirmar una sola fila por mensaje.
6. Mantener Railway detenido mientras la Mac sea el servidor principal.

Para volver a Railway, hacer el proceso inverso y no habilitar ambos webhooks a
la vez.

## 14. Operacion y actualizaciones

Actualizar GASTA22:

```bash
cd /Users/alejo/Desktop/yo/Gasta22
git pull --ff-only
npm ci
npm test
launchctl kickstart -k "gui/$(id -u)/com.alejorro.gasta22"
```

Actualizar WAHA:

```bash
cd /Users/alejo/Desktop/yo/Gasta22
docker compose pull
docker compose up -d
```

Diagnostico:

```bash
tail -n 100 gasta22.log
tail -n 100 gasta22-error.log
docker compose logs --tail=100 waha
docker compose ps
```

Las sesiones de WAHA quedan persistidas en `waha-sessions/`. Hacer una copia de
esa carpeta con WAHA detenido antes de cambios importantes.

## Referencias oficiales

- WAHA Quick Start: <https://waha.devlike.pro/docs/overview/quick-start/>
- WAHA Install & Update: <https://waha.devlike.pro/docs/how-to/install/>
- WAHA Events y webhooks: <https://waha.devlike.pro/docs/how-to/events/>
- WAHA Configuration: <https://waha.devlike.pro/docs/how-to/config/>
- Colima: <https://github.com/abiosoft/colima>
- Docker CLI en Homebrew: <https://formulae.brew.sh/formula/docker>
- Docker Compose en Homebrew:
  <https://formulae.brew.sh/formula/docker-compose>
