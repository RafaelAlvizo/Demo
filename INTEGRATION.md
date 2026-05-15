# TORAM -> HikCentral (como conecta el codigo)

## Que hace la app

Este proyecto es un probador web para HikCentral Open API (Artemis):

1. Consulta version, organizaciones, personas y grupos de privilegio.
2. Crea personas en HikCentral con el endpoint `/artemis/api/resource/v1/person/single/add`.
3. Puede asignar la persona creada a un grupo de privilegio.
4. Incluye una vista `DEMO` que simula una compra y luego dispara el alta de persona.

## Flujo tecnico actual

1. El navegador firma requests Artemis con `X-Ca-Key`, `X-Ca-Signature`, `X-Ca-Nonce` y `X-Ca-Timestamp`.
2. En `npm run dev`, el frontend llama rutas relativas como `POST /hikcentral-proxy/artemis/api/resource/v1/person/single/add`.
3. Vite (`vite.config.ts`) hace de proxy hacia `VITE_APP_HIK_PROXY_TARGET` o `VITE_APP_HIKCENTRAL_BASE_URL` y elimina el prefijo `/hikcentral-proxy`.
4. Eso evita CORS y tambien ayuda con certificados autofirmados durante desarrollo.
5. La prueba `Probar conexiones` reutiliza ese proxy cuando el host objetivo coincide con el destino configurado.

## Soporte para Hik con IP publica

El proyecto ya puede trabajar con un HikCentral publico siempre que el equipo donde corres `npm run dev` tenga alcance a ese host.

Configura en `.env.local`:

```env
VITE_APP_API_MODE=real
VITE_APP_HIK_DEVICE_BASE_URL=https://TU_IP_O_DOMINIO_PUBLICO
VITE_APP_HIKCENTRAL_BASE_URL=https://TU_IP_O_DOMINIO_PUBLICO
VITE_APP_HIKCENTRAL_APP_KEY=...
VITE_APP_HIKCENTRAL_APP_SECRET=...
VITE_APP_HIK_ORG_INDEX_CODE=...
```

Despues reinicia `npm run dev`.

## Produccion / Vercel

Para despliegue publico, la app usa la Function same-origin `/api/hik-proxy`.

Ese backend:

- recibe la peticion del frontend,
- firma Artemis del lado servidor,
- reenvia a HikCentral,
- y devuelve la respuesta a la UI.

Variables recomendadas en Vercel:

```env
HIKCENTRAL_BASE_URL=https://TU_HOST_PUBLICO_HIK
HIKCENTRAL_APP_KEY=...
HIKCENTRAL_APP_SECRET=...
HIKCENTRAL_ALLOW_INSECURE_TLS=false
VITE_APP_API_MODE=real
```

El proxy `/hikcentral-proxy` sigue existiendo solo para `npm run dev`. En produccion ya no hace falta
exponer `APP_SECRET` al navegador.

Si la Function responde `proxy_error` y el motivo apunta a TLS/certificado, pueden probar temporalmente
`HIKCENTRAL_ALLOW_INSECURE_TLS=true` mientras validan el certificado del host HikCentral.

## Sobre el error 502

Cuando aparece `502 Bad Gateway`, normalmente el proxy si llega a HikCentral pero el servicio interno de OpenAPI/Artemis no responde bien. Las causas mas probables son:

- OpenAPI / integracion de terceros no habilitado o sin licencia.
- Ruta distinta en la version instalada de HikCentral.
- Host, puerto o protocolo incorrectos en `VITE_APP_HIKCENTRAL_BASE_URL`.

Si `https://TU_HOST_PUBLICO/artemis/...` ya falla fuera de TORAM, el problema esta en HikCentral y no en este frontend.
