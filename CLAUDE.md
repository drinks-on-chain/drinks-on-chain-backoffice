@AGENTS.md

# drinks-on-chain-backoffice

S3 · Back office de Drinks on Chain (`admin.`): herramienta del personal interno. Nació de `drinks-on-chain-app-template` (remoto `template`; mejoras con `git merge template/dev`). Lee también el `CLAUDE.md` de la carpeta paraguas, `plan/contratos/o1-backoffice-y-bodegas.md` y `docs-front/05` §5.

## Flujo

- Trabajo en `dev`; ramas cortas `feat/o<ola>-<tarea>` integradas en `dev`; PR `dev → main` al cerrar la ola (lo fusiona el usuario). Conventional Commits con `Refs:` y autor `brayan gomez <brayankgr@gmail.com>`.
- Puertas antes de integrar: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` y `pnpm e2e`.
- Puerto local **3003** (`dev`, `dev:mocks`, `start`); las e2e levantan su propio servidor en **3103**. No arranques un segundo `next dev` si el 3003 ya está ocupado.

## Reglas del Backoffice

- **Shell**: `AdminShell` de `@drinks-on-chain/ui` montado en `src/components/app-frame.tsx` (barra lateral Cava Reserva, contenido Oro Líquido, Inter 14 px). Densidad **compacta** en tablas (`density="compact"`), filtros persistentes en la URL, un solo botón en oro por pantalla (la acción crítica).
- **Guardia**: audiencia `STAFF` y organización activa de tipo `PLATFORM`. Si la activa es una bodega se cambia a la plataforma; quien además es miembro de una bodega opera aquí solo con la plataforma y se le ofrece abrir el ERP (`NEXT_PUBLIC_URL_ERP`). Sin TOTP en la sesión → `AUTH_MFA_REQUIRED` → volver a entrar.
- **Permisos**: `can(me, acción)` de `src/lib/platform/permissions.ts` (roles de plataforma; el superusuario = administración) y `canActOnUser()` (nunca sobre el superusuario ni sobre uno mismo). Oculta o desactiva lo que no se puede; **el backend manda**: un 403 se avisa, no se esconde.
- **Motivo obligatorio**: toda acción sobre terceros (bloquear, cambiar rol, restablecer TOTP, enviar enlaces, reenviar o anular invitaciones…) pasa por `ReasonDialog` (3–500 caracteres) y el `reason` va en el cuerpo; un 422 con `details[{ field: 'reason' }]` se marca en el campo.
- **Cabecera `X-Client-App: BACKOFFICE`** en todas las peticiones (la pone `src/lib/api/client.ts`; la bitácora y los enlaces de los correos dependen de ella).
- **Teclado completo**: `⌘K`/`Ctrl+K` y `/` abren la `CommandPalette` (navegación y acciones rápidas), `Esc` cierra, salto al contenido, foco visible y de vuelta al disparador al cerrar diálogos.
- Estados cargando (skeleton), vacío (EmptyState con acción) y error (ErrorState con reintento) en cada pantalla.

## Código

- Las pantallas nunca llaman a `fetch` ni conocen URLs: hooks de `src/lib/auth` y `src/lib/platform` sobre `src/lib/api`, validados con los esquemas de `@drinks-on-chain/mocks`.
- Sesión del contrato de la Ola 0: acceso solo en memoria, renovación con la cookie `doc_rt`; nada de tokens en `sessionStorage`/`localStorage`. API en `/api/v1/*` del propio origen (`src/proxy.ts` la reescribe a `API_ORIGIN` con la IP del cliente firmada con `PROXY_SHARED_SECRET`).
- Segundo factor: `src/lib/auth/login-flow.ts` (máquina de estados pura) y `src/components/auth/mfa-steps.tsx` (verificar, inscribir con QR y `SecretReveal`, códigos de recuperación una sola vez). Lo usan el login y la aceptación de invitaciones.
- Listas con filtros y página en la URL (`useUrlParams` de `src/lib/use-url-params.ts`, `?pagina=`) y `limit` ≤ 100; errores de formulario con `fieldErrorsFrom()`; cifras y fechas con `src/lib/format.ts`; textos en `src/lib/i18n/es.ts` y códigos de la bitácora en `src/lib/platform/labels.ts`.
- Acciones con motivo sobre terceros con `ReasonActionDialog` (`src/components/reason-action-dialog.tsx`); tarjetas con encabezado real con `SectionHeader`.
- Lo que el contrato aún no expone al back office se deriva de la bitácora en `src/lib/platform/derive.ts` (invitaciones de una bodega, estado de la cuenta completa); se sustituye cuando llegue la ruta.
- Componentes de `@drinks-on-chain/ui`; si falta uno reutilizable, se añade allí. Los arreglos locales a componentes del paquete se marcan con "Pendiente de corregir en …".
- Módulos de otras olas ocultos con `NEXT_PUBLIC_FLAG_*` (`src/lib/navigation.tsx`).
- E2E contra los mocks: el TOTP se genera con `generateTotp(DEMO_TOTP_SECRET)` (nunca el atajo `000000`); los correos se leen en el buzón simulado de `/__mocks`.
