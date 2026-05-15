# TORAM demo

Frontend React + TypeScript + Vite para probar integraciones con HikCentral Open API (Artemis).

## Que hace este proyecto

La app tiene dos vistas principales:

- `Tester`: prueba endpoints reales de HikCentral como version, organizaciones, personas, alta de persona y asignacion a grupos de privilegio.
- `DEMO`: simula una compra de acceso y luego intenta crear la persona en HikCentral con ese mismo flujo.

Cuando `VITE_APP_API_MODE=real`, el navegador firma cada request Artemis con `X-Ca-Key` + HMAC y, en `npm run dev`, Vite hace de proxy hacia tu servidor HikCentral para evitar problemas de CORS/certificados. Cuando `VITE_APP_API_MODE=mock`, la app responde con datos simulados y no toca la red.

## Como correrlo

```bash
npm install
npm run dev
```

El comando correcto para desarrollo es `npm run dev`.

## Configuracion para Hik publico

1. Copia `.env.example` a `.env.local` si todavia no existe.
2. Configura estas variables con la IP o dominio publico de HikCentral:

```env
VITE_APP_API_MODE=real
VITE_APP_HIK_DEVICE_BASE_URL=https://TU_HOST_PUBLICO_HIK
VITE_APP_HIKCENTRAL_BASE_URL=https://TU_HOST_PUBLICO_HIK
VITE_APP_HIKCENTRAL_APP_KEY=...
VITE_APP_HIKCENTRAL_APP_SECRET=...
VITE_APP_HIK_ORG_INDEX_CODE=...
```

3. Reinicia `npm run dev` cada vez que cambies `.env.local`.

Si el proxy de desarrollo debe apuntar a otro host o puerto distinto del URL publico, puedes usar `VITE_APP_HIK_PROXY_TARGET`.

## Nota importante de seguridad

Esta app firma Artemis desde el frontend y usa variables `VITE_*`, por lo que esos valores se incrustan en el bundle del navegador. Eso esta bien para pruebas controladas con `npm run dev`, pero no es una arquitectura segura para publicar el frontend tal cual en internet. Para un despliegue real conviene mover la firma y el proxy Artemis a un backend/BFF.
