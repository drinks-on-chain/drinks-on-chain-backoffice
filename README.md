# drinks-on-chain-backoffice

**S3 · Back office de Drinks on Chain** (`admin.`): la herramienta del personal interno para dar de alta y gestionar bodegas, usuarios internos, configuración y bitácora, y para tramitar la tokenización (solicitudes, colecciones y la red). Nace de [`drinks-on-chain-app-template`](https://github.com/drinks-on-chain/drinks-on-chain-app-template) (Next.js 16, `@drinks-on-chain/ui`, `@drinks-on-chain/mocks`). Planificación en [drinks-on-chain-docsfront](https://github.com/drinks-on-chain/drinks-on-chain-docsfront) (`03` §8, `05` §5) y en el contrato de la Ola 1 del plan maestro.

## Qué hay (4A, 4B, la lista de espera y 4C)

| Pantalla                                                                                                                                                              | Ruta                                                                                         | Contrato                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| Entrar con segundo factor (verificar, inscribir con QR, códigos de recuperación)                                                                                      | `/login`                                                                                     | Ola 1 §1                 |
| Recuperar y restablecer la contraseña                                                                                                                                 | `/recuperar-contrasena`, `/restablecer-contrasena?token=`                                    | Ola 1 §1                 |
| Aceptar la invitación de un usuario interno (cuenta nueva o existente)                                                                                                | `/invitacion/[token]`                                                                        | Ola 1 §2                 |
| Tablero: KPI (con la lista de espera), alertas y actividad reciente                                                                                                   | `/`                                                                                          | Ola 1 §8                 |
| Usuarios internos: invitar, rol, bloquear, TOTP, invitaciones                                                                                                         | `/usuarios`                                                                                  | Ola 1 §5                 |
| Matriz de permisos                                                                                                                                                    | `/usuarios/permisos`                                                                         | Ola 1 §5 (PLT-04)        |
| Mi perfil: nombre, idioma, contraseña, cerrar todas las sesiones                                                                                                      | `/perfil`                                                                                    | Ola 1 §1                 |
| Bandeja de solicitudes y detalle (tomar, notas, reunión, aprobar, rechazar)                                                                                           | `/solicitudes`, `/solicitudes/[id]`                                                          | Ola 1 §3                 |
| Directorio, alta directa y ficha de bodega (perfil, estado, historial, equipo, **lotes en solo lectura**)                                                             | `/bodegas`, `/bodegas/nueva`, `/bodegas/[id]`                                                | Ola 1 §4, §5 · Ola 2 §17 |
| Configuración: estándar, ajustes por bodega, excepción legal, historial; aviso de que las reglas de lote solo afectan a los lotes nuevos                              | `/configuracion`, `/configuracion/[clave]`                                                   | Ola 1 §6 · Ola 2 §2.3    |
| Bitácora: filtros, detalle con antes/después, CSV y verificación de la cadena                                                                                         | `/bitacora`                                                                                  | Ola 1 §7                 |
| Lista de espera: consumidores y bodegas, filtros, seguimiento y CSV                                                                                                   | `/lista-de-espera`                                                                           | O1b §2                   |
| **Tokenización** (4C): bandeja de solicitudes y detalle con la revisión del lote, datos comerciales, precio, pedir cambios, aprobar y rechazar                        | `/tokenizacion`, `/tokenizacion/[id]`                                                        | Ola 3 §5                 |
| **Colecciones** (4C): tarjetas y tabla; detalle con NFT, emisiones y transacciones, historiales, publicar, pausar, reanudar, cerrar, editar y cierre con faltante     | `/colecciones`, `/colecciones/[id]`                                                          | Ola 3 §6, §8.4           |
| **Cadena** (4C): transacciones (reintentar, abandonar), cuentas y saldos, eventos, conciliaciones y alertas; identidad de cada bodega en su ficha (`?pestana=cadena`) | `/cadena`, `/cadena/cuentas`, `/cadena/eventos`, `/cadena/conciliaciones`, `/cadena/alertas` | Ola 3 §2.4, §3, §8       |
| Datos de prueba: escenario, entrar como, **buzón simulado**                                                                                                           | `/__mocks`                                                                                   | solo con mocks           |

`AdminShell` con paleta de comandos (`⌘K`/`Ctrl+K` y `/`), guardia por audiencia y organización de plataforma, permisos por rol con `can()`, motivo obligatorio (`ReasonDialog`) en las acciones sobre terceros y `X-Client-App: BACKOFFICE` en todas las peticiones. Reglas completas en [`CLAUDE.md`](CLAUDE.md); avance en [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Empezar

Requisitos: Node 22 (`.nvmrc`) y pnpm 10 (`corepack enable`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev:mocks        # http://localhost:3003 con datos de prueba
```

Personal de demo (contraseña `demo1234`; secreto TOTP `DRINKSONCHAINDEMOTOTPKEY`, el código actual se ve en `/__mocks`):

| Correo                              | Rol            | TOTP                                     |
| ----------------------------------- | -------------- | ---------------------------------------- |
| `gestor@drinksonchain.test`         | Superusuario   | Inscrito                                 |
| `administracion@drinksonchain.test` | Administración | Inscrito                                 |
| `operaciones@drinksonchain.test`    | Operaciones    | Inscrito                                 |
| `soporte@drinksonchain.test`        | Soporte        | Inscrito                                 |
| `analista@drinksonchain.test`       | Operaciones    | Sin inscribir (recorrido de inscripción) |

Los correos (invitaciones, recuperación) llegan al **buzón simulado** de `/__mocks`: sus enlaces al back office se abren en esta misma app.

| Script                                     | Qué hace                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:mocks`              | Servidor de desarrollo en 3003 sin / con MSW                                                          |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Calidad (el typecheck genera antes los tipos de rutas de Next)                                        |
| `pnpm build`, `pnpm start`                 | Build y servidor de producción (3003)                                                                 |
| `pnpm e2e`                                 | Playwright (escritorio) contra un build con mocks en el puerto 3103; en local usa el Chrome instalado |
| `E2E_CAPTURAS=1 pnpm e2e tokenization`     | Además guarda capturas de las pantallas de la Ola 3 en `capturas/o3-bo-1/` (ignorada por git)         |

### Contra el backend real de desarrollo

`e2e/backend-real.spec.ts` recorre el back office contra el backend de desarrollo (login con TOTP, invitar y aceptar un usuario interno con inscripción del TOTP, recuperar la contraseña por correo, rol, bloqueo y matriz, alta directa y activación, suspender/reactivar, equipo y cuenta completa, transferir la titularidad, configuración y excepción legal, bitácora con CSV y verificación, solicitudes y ⌘K). Queda fuera de `pnpm e2e` salvo con `E2E_REAL_API=1`:

```bash
# Secretos solo en el entorno (nunca como argumentos ni en archivos del repo)
export E2E_PASSWORD="$(ssh drinksonchain-server "sed -n 's/^SEED_DEMO_PASSWORD=//p' ~/doc-dev/.env")"
export E2E_TOTP_SECRET="$(ssh drinksonchain-server "sed -n 's/^SEED_DEMO_TOTP_SECRET=//p' ~/doc-dev/.env")"
ssh -N -L 18025:127.0.0.1:8025 drinksonchain-server &   # Mailpit (solo escucha en el servidor)
E2E_REAL_API=1 E2E_API_ORIGIN=https://136.243.223.39.sslip.io E2E_MAILPIT_URL=http://127.0.0.1:18025 pnpm e2e
```

- Construye sin mocks y sirve en el puerto **3113**; un solo worker, sin reintentos, sin trazas, capturas ni vídeos.
- Todo lo que crea lleva el sufijo de la ejecución (correos `nombre+bo-<run>@example.test`, bodegas `Bodega Directa <run>`…). No inscribe el TOTP ni cambia contraseñas de la semilla; el parámetro que cambia se deja como estaba y, al terminar (aunque falle un paso), revoca las bodegas de la prueba y bloquea al usuario interno creado.
- Sin `E2E_MAILPIT_URL` se saltan los pasos que leen correos. El formulario público de solicitudes admite 10 envíos por IP y hora (el resto, 202 sin crear nada): cada ejecución usa 2.
- En CI: job manual `e2e-backend-real` (`workflow_dispatch`, entrada `api_origin`) con los secretos del repo `E2E_PASSWORD`, `E2E_TOTP_SECRET` y, opcional, `E2E_MAILPIT_URL`.

## Variables de entorno

| Variable                                                                    | Uso                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_ORIGIN`                                                                | **Solo servidor.** Origen del backend: `src/proxy.ts` reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*`. Obligatoria sin mocks, también en el build (se valida al construir). Desarrollo: `https://136.243.223.39.sslip.io`                                   |
| `PROXY_SHARED_SECRET`                                                       | **Solo servidor, nunca `NEXT_PUBLIC_`.** Firma la IP del cliente para el backend (O1-OPS-1): mismo valor que en el backend del entorno (si hay varios separados por comas, firma con el primero). Vacía = sin firma: el backend usa la IP de la conexión |
| `NEXT_PUBLIC_MOCKS`                                                         | `1` arranca MSW y habilita `/__mocks` (demos). Con `1` no hace falta `API_ORIGIN`                                                                                                                                                                        |
| `NEXT_PUBLIC_URL_ERP`                                                       | ERP de las bodegas: "Abrir el ERP" para quien también es miembro de una bodega y las invitaciones de bodega                                                                                                                                              |
| `NEXT_PUBLIC_URL_LANDING`, `NEXT_PUBLIC_URL_BODEGAS`, `NEXT_PUBLIC_URL_APP` | Enlaces a los otros sitios; nunca se escriben hosts en componentes. Con `NEXT_PUBLIC_URL_APP` (Marketplace), la pestaña «Lotes» enlaza al pasaporte público `/b/{código de lote}`                                                                        |
| `NEXT_PUBLIC_URL_WHATSAPP`                                                  | Servicio de los enlaces "Escribir por WhatsApp" de la lista de espera. Vacía: `https://wa.me`                                                                                                                                                            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                            | Cloudflare Turnstile en "recuperar contraseña". Vacía: sin widget y con el token de prueba de Turnstile                                                                                                                                                  |
| `NEXT_PUBLIC_FLAG_PICKUP_POINTS`, `…_SUPPORT`, `…_ORDERS`                   | Módulos de otras olas (4D, 4F) en el menú (`1` = visible)                                                                                                                                                                                                |

## Despliegue

Vercel (framework Next.js, `pnpm build`, Node 22): producción desde `main`, previews desde `dev`, `NEXT_PUBLIC_MOCKS=1` en producción hasta la integración con el backend.

**IP real del cliente** (O1-OPS-1, de la plantilla): `src/proxy.ts` (`src/lib/api-proxy.ts`) reescribe `/api/v1/*` al backend sin tocar método, cuerpo (en streaming, sin límite de tamaño de función), cookies ni respuesta (`Set-Cookie`, `Retry-After`, `Content-Disposition`), y con `PROXY_SHARED_SECRET` añade `X-DOC-Client-IP`, `X-DOC-Proxy-Timestamp` y `X-DOC-Proxy-Signature` (HMAC-SHA256 de `MÉTODO|RUTA_CON_QUERY|IP|TIMESTAMP`, query canónica). La IP sale de `x-real-ip`/`x-forwarded-for`, que en Vercel pone la plataforma; fuera de Vercel hace falta un proxy delante que los reescriba. Las `X-DOC-*` del cliente se descartan.

**Sesión tras el cierre de la Ola 1 (H1, de la plantilla)**: el refresco viaja solo en la cookie `doc_rt` (ni `refresh` ni `switch-organization` llevan `refreshToken` en el cuerpo; el que aún llegue en una respuesta se ignora); la sesión, el login con segundo factor y `me` se validan con `src/lib/auth/schemas.ts`, sin `user.userRole/wineryId/memberRole`; `PATCH /v1/users/me` devuelve `me` completo y los `details` solo se leen como `{ field, message }`. Si la sesión se revoca (bloqueo, reutilización del refresco), el login avisa "Tu sesión se cerró por seguridad", también tras recargar.

## Paquetes compartidos

`@drinks-on-chain/ui` y `@drinks-on-chain/mocks` se instalan desde el tarball de su GitHub Release (hoy `ui` 0.3.1 y `mocks` 0.5.0-rc.3: Ola 1, lista de espera y el cierre H2 de la Ola 2, donde la plataforma solo lee la trazabilidad):

```bash
pnpm add https://github.com/drinks-on-chain/drinks-on-chain-design-system/releases/download/vX.Y.Z/drinks-on-chain-ui-X.Y.Z.tgz
pnpm add https://github.com/drinks-on-chain/drinks-on-chain-mocks/releases/download/vX.Y.Z/drinks-on-chain-mocks-X.Y.Z.tgz
```
