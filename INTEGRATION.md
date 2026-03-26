# TORAM ↔ HikCentral (cómo conecta el código)

## Qué hace la app (flujo técnico)

1. **Navegador** (p. ej. `http://localhost:5173`): el front solo llama a rutas **relativas** en modo desarrollo:  
   `POST /hikcentral-proxy/artemis/api/resource/v1/person/single/add`
2. **Vite (`vite.config.ts`)** recibe eso y hace de **proxy** hacia  
   `VITE_APP_HIK_PROXY_TARGET` o `VITE_APP_HIKCENTRAL_BASE_URL`, quitando el prefijo `/hikcentral-proxy`.  
   Ejemplo: `https://127.0.0.1/artemis/api/resource/v1/person/single/add`
3. Eso evita **CORS** en desarrollo. **Solo existe con `npm run dev`**.
4. **Autenticación Artemis** (`src/api/artemisAuth.ts`): HikCentral OpenAPI espera cabeceras **X-Ca-Key**, **X-Ca-Signature** (HMAC-SHA256), **Content-MD5**, **X-Ca-Timestamp**, **X-Ca-Nonce**, no `X-App-Key` plano. Las variables `VITE_APP_HIKCENTRAL_APP_KEY` / `SECRET` son ese par de Artemis.

## Mismo ordenador: VS Code + HikCentral local

- `VITE_APP_HIKCENTRAL_BASE_URL` = exactamente cómo abres el cliente web (p. ej. `https://127.0.0.1` o con puerto `https://127.0.0.1:7443`).
- Tras cambiar `.env.local`: **parar y volver a ejecutar** `npm run dev`.
- Comprueba en la cabecera de la app la pastilla **API: real**.

## Sobre el error **502 Bad Gateway**

Suele ser respuesta **nginx** del propio HikCentral: el proxy de Vite **sí llega** a tu servidor, pero el *upstream* interno (servicio Artemis/OpenAPI) no responde bien. Causas típicas:

- Módulo **OpenAPI / integración de terceros** no instalado o no licenciado.
- **Ruta distinta** en tu versión: ajusta `VITE_APP_HIK_ENDPOINT_PERSON_ADD` según el PDF oficial de **tu** versión.
- **Puerto o protocolo** incorrectos en `VITE_APP_HIKCENTRAL_BASE_URL` (probar con el mismo host/puerto que en el navegador).

Tras el cambio a firma Artemis, si había **401/403** por auth, debería mejorar; el **502** puro sigue siendo sobre todo **URL/servicio** en el servidor.

## PDFs que compartiste

- **MinMoe / eventos HTTP**: habla de **ISAPI en el terminal** (puerta), no del endpoint `/artemis` de HikCentral. Es otro tipo de integración.
- **Desarrollar aplicaciones HIKVISION**: menciona **Hik-Central OpenAPI**; la documentación detallada de rutas y firma suele estar en **https://tpp.hikvision.com** (registro) o en el paquete/PDF que acompaña a **HikCentral Professional** para tu versión.

## Variables imprescindibles en `.env.local` (modo real)

| Variable | Uso |
|----------|-----|
| `VITE_APP_API_MODE` | `real` |
| `VITE_APP_HIKCENTRAL_BASE_URL` | Base del servidor (ej. `https://127.0.0.1`) |
| `VITE_APP_HIKCENTRAL_APP_KEY` / `SECRET` | Pareja Artemis (OpenAPI) |
| `VITE_APP_HIK_ORG_INDEX_CODE` | Índice del departamento (p. ej. Visitas) |
| `VITE_APP_HIK_ACCESS_*` | Opcional: índices de nivel de acceso para el segundo POST |

Opcional: `VITE_APP_HIK_PROXY_TARGET` si el destino del proxy Node debe ser distinto.
