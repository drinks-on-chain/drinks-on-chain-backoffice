# drinks-on-chain-backoffice

**S3 · Back office de Drinks on Chain** (`admin.`): la herramienta del personal interno para dar de alta y gestionar bodegas, usuarios internos, configuración y bitácora. Nace de [`drinks-on-chain-app-template`](https://github.com/drinks-on-chain/drinks-on-chain-app-template) (Next.js 16, `@drinks-on-chain/ui`, `@drinks-on-chain/mocks`). Planificación en [drinks-on-chain-docsfront](https://github.com/drinks-on-chain/drinks-on-chain-docsfront) (`03` §8, `05` §5) y en el contrato de la Ola 1 del plan maestro.

## Qué hay (4A)

| Pantalla                                                                         | Ruta                                                      | Contrato              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| Entrar con segundo factor (verificar, inscribir con QR, códigos de recuperación) | `/login`                                                  | Ola 1 §1              |
| Recuperar y restablecer la contraseña                                            | `/recuperar-contrasena`, `/restablecer-contrasena?token=` | Ola 1 §1              |
| Aceptar la invitación de un usuario interno (cuenta nueva o existente)           | `/invitacion/[token]`                                     | Ola 1 §2              |
| Tablero: KPI, alertas y actividad reciente                                       | `/`                                                       | Ola 1 §8              |
| Usuarios internos: invitar, rol, bloquear, TOTP, invitaciones                    | `/usuarios`                                               | Ola 1 §5              |
| Matriz de permisos                                                               | `/usuarios/permisos`                                      | Ola 1 §5 (PLT-04)     |
| Mi perfil: nombre, idioma, contraseña, cerrar todas las sesiones                 | `/perfil`                                                 | Ola 1 §1              |
| Solicitudes, bodegas, configuración y bitácora                                   | `/solicitudes`, `/bodegas`, `/configuracion`, `/bitacora` | 4B (rutas preparadas) |
| Datos de prueba: escenario, entrar como, **buzón simulado**                      | `/__mocks`                                                | solo con mocks        |

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

## Variables de entorno

| Variable                                                                    | Uso                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_ORIGIN`                                                                | **Solo servidor.** Origen del backend: Next reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*`. Obligatoria sin mocks y en el build. Desarrollo: `https://136.243.223.39.sslip.io` |
| `NEXT_PUBLIC_MOCKS`                                                         | `1` arranca MSW y habilita `/__mocks` (demos). Con `1` no hace falta `API_ORIGIN`                                                                                            |
| `NEXT_PUBLIC_URL_ERP`                                                       | ERP de las bodegas: "Abrir el ERP" para quien también es miembro de una bodega y las invitaciones de bodega                                                                  |
| `NEXT_PUBLIC_URL_LANDING`, `NEXT_PUBLIC_URL_BODEGAS`, `NEXT_PUBLIC_URL_APP` | Enlaces a los otros sitios; nunca se escriben hosts en componentes                                                                                                           |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                            | Cloudflare Turnstile en "recuperar contraseña". Vacía: sin widget y con el token de prueba de Turnstile                                                                      |
| `NEXT_PUBLIC_FLAG_TOKENIZATION`, `…_PICKUP_POINTS`, `…_SUPPORT`, `…_ORDERS` | Módulos de otras olas (4C, 4D, 4F) en el menú (`1` = visible)                                                                                                                |

## Despliegue

Vercel (framework Next.js, `pnpm build`, Node 22): producción desde `main`, previews desde `dev`, `NEXT_PUBLIC_MOCKS=1` en producción hasta la integración con el backend.

## Paquetes compartidos

`@drinks-on-chain/ui` y `@drinks-on-chain/mocks` se instalan desde el tarball de su GitHub Release (hoy `ui` 0.3.0-rc.1 y `mocks` 0.3.0-rc.2):

```bash
pnpm add https://github.com/drinks-on-chain/drinks-on-chain-design-system/releases/download/vX.Y.Z/drinks-on-chain-ui-X.Y.Z.tgz
pnpm add https://github.com/drinks-on-chain/drinks-on-chain-mocks/releases/download/vX.Y.Z/drinks-on-chain-mocks-X.Y.Z.tgz
```
