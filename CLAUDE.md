@AGENTS.md

# drinks-on-chain-backoffice

S3 · Back office de Drinks on Chain (`admin.`): herramienta del personal interno. Nació de `drinks-on-chain-app-template` (remoto `template`; mejoras con `git merge template/dev`). Lee también el `CLAUDE.md` de la carpeta paraguas, `plan/contratos/o1-backoffice-y-bodegas.md`, `plan/contratos/o3-tokenizacion.md` (4C) y `docs-front/05` §5.

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
- Invitaciones de una bodega con `GET /v1/platform/organizations/{id}/invitations` y cuenta completa con `GET /v1/platform/accounts/{userId}` (ya no se derivan de la bitácora). Tipos de recurso de la bitácora en `snake_case` y códigos de acción del backend (`src/lib/platform/labels.ts`).
- Componentes de `@drinks-on-chain/ui`; si falta uno reutilizable, se añade allí. Los arreglos locales a componentes del paquete se marcan con "Pendiente de corregir en …".
- Módulos de otras olas ocultos con `NEXT_PUBLIC_FLAG_*` (`src/lib/navigation.tsx`).
- Lista de espera (`/lista-de-espera`, contrato `plan/contratos/o1b-lista-de-espera.md` con las precisiones de `drinks-on-chain-mocks/docs/CONTRATO.md` §9): `src/lib/platform/waitlist.ts` (API y hooks) y `waitlist-utils.ts` (filtros ↔ URL, cuerpo del PATCH, WhatsApp). Capacidad `waitlist`: `waitlist.read` (todo el personal) y `waitlist.manage` (sin soporte: editar y exportar). Sin motivo obligatorio (el PATCH no lo lleva). El enlace de WhatsApp sale de `links.whatsapp()` (`NEXT_PUBLIC_URL_WHATSAPP`).
- Trazabilidad (contrato `plan/contratos/o2-erp-confiable.md` §14, §17 y §20): la plataforma **solo lee**; cualquier escritura es un 403 `TRC_PLATFORM_READ_ONLY`, así que aquí no hay acciones sobre lotes. Pestaña «Lotes» de la ficha de bodega (`lots-panel.tsx`, `src/lib/platform/lots.ts`: `GET /v1/lots?wineryId=`, filtros `etapa` y `q` en la URL) y enlace al pasaporte público con `links.passport()` (`NEXT_PUBLIC_URL_APP`). Las reglas con `appliesAt: "LOT"` llevan el aviso de `LOT_RULES_NOTICE` (`setting-value.ts`): un cambio solo afecta a los lotes nuevos.
- Tokenización, colecciones y cadena (4C, contrato `plan/contratos/o3-tokenizacion.md` con las precisiones de `drinks-on-chain-mocks/docs/CONTRATO.md` §13): `src/lib/platform/tokenization.ts`, `collections.ts` y `chain.ts` (API y hooks) con sus modelos puros en `tokenization-utils.ts`, `collections-utils.ts` y `chain-utils.ts` (filtros ↔ URL, acciones según estado y permisos) y los textos en `chain-labels.ts`. Capacidades: `tokenization.read`/`chain.read` (todo el personal), `tokenization.manage`/`chain.manage` (sin soporte) y `chain.admin` (solo administración: abandonar una transacción, pausar o reanudar un contrato en la red y decidir un cierre con quemas).
- `Idempotency-Key` (obligatoria en aprobar, publicar, pausar y reanudar una colección, decidir el cierre, reintentar una transacción y pausar o reanudar un contrato): `runIdempotent()` y `useIdempotency()` de `src/lib/api/idempotency.ts`; la clave se conserva solo si no hubo respuesta del servidor. Nunca generes la clave dentro de la función de la API.
- Errores `TOK_…` y `CHN_…`: `explainRuleError()` de `src/lib/platform/rule-errors.ts` (mensaje en español con `expected`, `actual` y `meta`, y errores por campo del formulario) y `RuleErrorAlert`; los diálogos de motivo ya los explican.
- Transacciones de la red: `TxStatusBadge` (`TxStatus` de `src/components/chain/tx-ref.tsx`; en tablas, `announce={false}`), `ChainAddress` y `ExplorerLink`. El enlace al explorador sale **solo** del `explorerUrl` del backend: ningún host del explorador en el código. Refresco con `refetchInterval` de 5 s (`pollWhile`) únicamente mientras haya algo en curso.
- Dinero: importes en bolivianos con `parseBobToMinor()` (sobre el único `parseDecimal`) y enviados como centavos enteros (`amountMinor`); se muestran con `fmtBob()`. Saldos de la red con `fmtXlm()`.
- Acciones que llegan a la red y afectan a toda una bodega (pausar o reanudar su contrato) y decisiones con quemas: confirmación seria (`SeriousReasonDialog`: motivo y escribir el identificador). La pausa de una colección es comercial y no toca la red.
- E2E de la Ola 3 (`e2e/tokenization.spec.ts`): el estado de la Ola 3 de los mocks vive en memoria (una recarga lo devuelve a los fixtures): tras una escritura se navega por el menú (`nav()`), no con `page.goto`. Escenarios con `useScenario()` antes de entrar y reloj de la red con `settleChain()`.
- Panel `/__mocks`: los escenarios salen de `SCENARIOS` y `SCENARIO_DESCRIPTIONS` del paquete (la lista crece con las olas); nunca un `Record<ScenarioName, …>` escrito a mano.
- E2E contra los mocks: el TOTP se genera con `generateTotp(DEMO_TOTP_SECRET)` (nunca el atajo `000000`); los correos se leen en el buzón simulado de `/__mocks`.
- E2E contra el backend real: `e2e/backend-real.spec.ts` solo con `E2E_REAL_API=1` (puerto 3113; ver README). Secretos solo por el entorno, datos con el sufijo de la ejecución y limpieza al final; nunca inscribir el TOTP ni cambiar la contraseña de la semilla.
