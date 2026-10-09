# Roadmap del Backoffice (S3)

Sub-etapas 4A–4F de `docs-front/03-roadmap-frontend.md` v3 §8, ordenadas por las olas del plan maestro. Contrato: `plan/contratos/o1-backoffice-y-bodegas.md` (Ola 1) y `o0-sesiones-y-estandares.md` (sesiones). Se marca `- [x] … · fecha` al terminar cada paso.

| Sub-etapa                              | Ola      | Qué                                                                                                                |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| 4A Acceso y tablero                    | 1        | Login con TOTP, tablero, usuarios internos por invitación con rol y matriz de permisos                             |
| 4B Solicitudes, bodegas y equipo       | 1        | Bandeja de solicitudes, alta directa, directorio y ficha de bodega, equipo de una bodega, configuración y bitácora |
| 4C Tokenización                        | 3        | Bandeja de solicitudes de tokenización, colecciones con estado de emisión, cierre con faltante y cadena            |
| 4D Puntos de canje, soporte y campañas | 5        | Puntos de canje, cajeros, tabletas, helpdesk, entrega asistida, campañas                                           |
| 4E Calidad                             | cada ola | Teclado completo, paginación y ordenación, Playwright del recorrido de cada hito                                   |
| 4F Pedidos y reseñas                   | 4        | Pedidos, colecciones con ventas, moderación de reseñas                                                             |

## Base del repo (O1-BO-1)

- [x] Repo `drinks-on-chain/drinks-on-chain-backoffice` desde la plantilla con su historial (remoto `template`), ramas `main` y `dev` · 2026-09-27
- [x] Paquete `drinks-on-chain-backoffice`, puerto 3003, e2e en 3103, `README.md`, `CLAUDE.md`, `.env.example` · 2026-09-27
- [x] `@drinks-on-chain/ui` 0.3.0-rc.1 y `@drinks-on-chain/mocks` 0.3.0-rc.2 · 2026-09-27
- [x] CI heredada de la plantilla (lint, tipos, pruebas, build y e2e) · 2026-09-27
- [ ] Proyecto de Vercel (lo crea la coordinación) y configuración `attach`/`dev` en `.claude/launch.json` del paraguas

## 4A · Acceso y tablero (O1-BO-1, Ola 1)

- [x] `X-Client-App: BACKOFFICE` en todas las peticiones · 2026-09-27
- [x] Login con correo y contraseña → reto TOTP: verificar (`OtpInput`) o código de recuperación · 2026-09-27
- [x] Inscripción: QR desde `otpauthUrl` y `SecretReveal`, confirmación y los 10 códigos de recuperación una sola vez con aceptación explícita · 2026-09-27
- [x] Reto caducado, 5 fallos (429 con la espera de `Retry-After`) y `AUTH_MFA_REQUIRED` · 2026-09-27
- [x] Recuperar y restablecer la contraseña (Turnstile con `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) · 2026-09-27
- [x] Aceptar invitación de usuario interno (`/invitacion/[token]`, cuenta nueva o existente, sesión de otra persona) · 2026-09-27
- [x] Cerrar sesión y cerrar todas; perfil propio (nombre, idioma, contraseña) · 2026-09-27
- [x] `AdminShell` con navegación (4B preparada, otras olas por bandera), `CommandPalette` con navegación y acciones rápidas · 2026-09-27
- [x] Guardia por audiencia y organización de plataforma; cambio automático a la plataforma; ERP ofrecido a quien también es miembro de una bodega · 2026-09-27
- [x] Tablero (`GET /v1/platform/dashboard`): KPI de solicitudes, bodegas, invitaciones (y por caducar) y bloqueados; alertas; actividad reciente de la bitácora · 2026-09-27
- [x] Usuarios internos: filtros en la URL, invitar, cambiar rol, bloquear/desbloquear, restablecer TOTP, enlace de contraseña, reenviar/anular invitaciones, todo con `ReasonDialog`; superusuario protegido · 2026-09-27
- [x] Matriz de permisos (`RoleMatrix` desde `GET /v1/platform/permissions`) · 2026-09-27
- [x] `can()` por rol de plataforma; el backend manda (403 → aviso) · 2026-09-27
- [x] `/__mocks` con el buzón simulado (enlaces clicables) y entrada del personal con TOTP · 2026-09-27
- [x] Pruebas unitarias: `can()`, flujo TOTP, formularios con `details` por campo, cliente (`X-Client-App`, `Retry-After`) · 2026-09-27
- [x] E2E con mocks (escritorio): TOTP real, inscripción, recuperación, invitar y aceptar desde el buzón, bloquear con motivo y verlo en el tablero, matriz, teclado y ⌘K, axe sin violaciones serias, sin errores de consola · 2026-09-27
- [x] Verificación visual contra `docs-front/design-system/03-backoffice.html` · 2026-09-27
- [x] Contra el backend de desarrollo (Etapa 1 de O1-BE-1): login con TOTP, inscripción, recuperación por correo, tablero, usuarios internos (invitar y aceptar desde Mailpit, rol, bloqueo con motivo), matriz; `e2e/backend-real.spec.ts` (`E2E_REAL_API=1`) y job manual `e2e-backend-real` en CI · 2026-09-27

## 4B · Solicitudes, bodegas y equipo (O1-BO-2, Ola 1)

- [x] Bandeja de solicitudes (filtros de estado, asignada y búsqueda en la URL, paginación) y detalle: tomar, notas, agendar reunión, reunión hecha, aprobar (dueño por defecto el contacto, editable) y rechazar con motivo; historial desde la bitácora; enlaces a la bodega creada y a la invitación · 2026-09-27
- [x] Alta directa de bodega con invitación al dueño (validación en el cliente y `details` por campo; `ORG_TAX_ID_TAKEN` en el NIT) · 2026-09-27
- [x] Directorio (estado, región, categoría, búsqueda, paginación) y ficha de bodega: perfil editable con motivo, estado, `lotPrefix`, dueño, historial (`Timeline`), suspender, reactivar, revocar (ADMIN) y transferir la titularidad (ADMIN, qué pasa con el dueño anterior) · 2026-09-27
- [x] Equipo de cualquier bodega: miembros con quién bloqueó, invitaciones pendientes (reenviar, anular), invitar, rol, bloquear/desbloquear con motivo, enlace de contraseña y, desde la persona, bloqueo de la cuenta completa (`/v1/platform/accounts/{userId}`, ADMIN) · 2026-09-27
- [x] Configuración agrupada por prefijo; estándar general con editor según el tipo (número con unidad, sí/no, lista, enumeración, número o ilimitado, JSON validado); ajustes por bodega a una selección (`Combobox` múltiple) o a todas, excepción al mínimo legal (ADMIN) con aviso, volver al estándar (masivo), historial; `SETTING_BELOW_LEGAL_MINIMUM` / `SETTING_LEVEL_NOT_ALLOWED` en el campo · 2026-09-27
- [x] Bitácora: tabla densa con filtros en la URL (fechas, persona, organización, acción, recurso), detalle en `SlideOver` con antes/después, exportación CSV, verificación de la cadena (ADMIN) y enlaces desde las fichas · 2026-09-27
- [x] Tablero: los KPI y su desglose enlazan con las listas filtradas · 2026-09-27
- [x] ⌘K: "Nueva bodega", "Ir a solicitud…" y búsqueda de solicitudes y bodegas en el servidor · 2026-09-27
- [x] `@drinks-on-chain/ui` 0.3.0-rc.2 (foco de diálogos encadenados y `RoleMatrix` desplazable): fuera los parches locales · 2026-09-27
- [x] Invitaciones de una bodega con `GET /v1/platform/organizations/{id}/invitations` y cuenta completa con `GET /v1/platform/accounts/{userId}` (estado y membresías en el panel de la persona): fuera las vistas derivadas de la bitácora · 2026-09-27
- [x] `@drinks-on-chain/mocks` 0.4.0-rc.1 (alineado con el backend de la Ola 1): tipos de recurso de la bitácora en `snake_case` y códigos de acción del backend · 2026-09-27
- [x] Contra el backend de desarrollo (Etapa 1 de O1-BE-1): solicitudes (tomar, nota, reunión, aprobar y activación del dueño, rechazar, ⌘K), alta directa con reenvío y activación, suspender/reactivar, equipo (invitar/anular, bloqueo en la bodega, cuenta completa), transferir la titularidad, configuración (estándar y vuelta atrás, excepción legal y vuelta al estándar), bitácora (filtros, CSV, verificación), en `e2e/backend-real.spec.ts` · 2026-09-27
- [x] IP real del cliente detrás del proxy (O1-OPS-1): `rewrites` sustituidos por `src/proxy.ts`, que reescribe `/api/v1/*` a `${API_ORIGIN}/v1/*` con `X-DOC-Client-IP` firmada (HMAC con `PROXY_SHARED_SECRET`, variable de servidor) · 2026-09-27

## Lista de espera (O1b, añadido a la Ola 1)

Contrato: `plan/contratos/o1b-lista-de-espera.md` §2 con las precisiones del backend `v0.1.1` (`drinks-on-chain-mocks/docs/CONTRATO.md` §9). No es la Ola 2.

- [x] `@drinks-on-chain/mocks` 0.4.1 (esquemas, fixtures y handlers de la lista de espera; bloque `waitlist` obligatorio en el tablero) · 2026-10-01
- [x] Capacidad `waitlist`: `waitlist.read` (los cuatro roles de plataforma) y `waitlist.manage` (sin soporte) en `can()`; entrada "Lista de espera" en el menú y en ⌘K según la capacidad · 2026-10-01
- [x] Pantalla `/lista-de-espera`: pestañas Consumidores / Bodegas con su total (roles ARIA, flechas), pestaña y filtros en la URL (búsqueda con espera, estado, origen con recuento de `/sources?type=`, fechas), tabla con columnas por tipo y paginación `limit`/`offset`; estados vacío, de carga y de error · 2026-10-01
- [x] Detalle en panel lateral (`SlideOver`): todos los datos, mensaje, idioma, consentimiento, quién y cuándo la contactó, enlaces `mailto:` y de WhatsApp (`NEXT_PUBLIC_URL_WHATSAPP`); marcar como contactado, descartar, volver a nuevo y notas (≤ 1000) en un solo `PATCH`; soporte, en solo lectura · 2026-10-01
- [x] Exportar CSV con los filtros activos (cliente de API autenticado → blob → descarga con el nombre del `Content-Disposition`), aviso con las filas de `X-Export-Rows` y manejo del 422 `WAITLIST_EXPORT_TOO_LARGE` · 2026-10-01
- [x] Tablero: tarjeta "Lista de espera" (total, consumidores, bodegas, últimas 24 h) con enlaces a la pantalla · 2026-10-01
- [x] Bitácora: textos de `WAITLIST_JOINED`, `WAITLIST_STATUS_CHANGED`, `WAITLIST_EXPORTED` y del recurso `waitlist_entry` · 2026-10-01
- [x] Pruebas: unitarias (filtros ↔ URL, cuerpo del PATCH, número de WhatsApp, recuento del CSV, descarga), cliente contra los handlers reales de los mocks (lista, orígenes, PATCH, CSV, 403 de soporte) y `e2e/waitlist.spec.ts` (tablero → lista, pestañas, origen, contactar con nota, volver a nuevo, CSV, soporte sin acciones, axe y teclado) · 2026-10-01
- [ ] Contra el backend real de desarrollo (`e2e/backend-real.spec.ts`): pendiente de añadir el recorrido de la lista de espera

## Ola 2 · La plataforma lee la trazabilidad (O2, opcional del contrato §17)

Contrato: `plan/contratos/o2-erp-confiable.md` §14 (permisos), §17 (fila «Backoffice») y §20 (la plataforma solo lee: las escrituras dan 403 `TRC_PLATFORM_READ_ONLY`). Mocks `0.5.0-rc.3` (cierre H2).

- [x] `@drinks-on-chain/mocks` 0.5.0-rc.3: sin cambios en las pantallas de la plataforma; el panel `/__mocks` toma los escenarios de `SCENARIOS` y `SCENARIO_DESCRIPTIONS` (lo único que dejó de compilar); textos de las acciones y recursos de la bitácora de la Ola 2 (`LOT_CREATED`, `BOTTLED`, `DOSSIER_CLOSED`…, recurso `lot`) · 2026-10-02
- [x] Ficha de bodega · pestaña «Lotes» de solo lectura (`GET /v1/lots?wineryId=`): tabla densa con referencia, nombre, tipo, etapa, candado siguiente, botellas, laboratorio, código de lote e incidencias abiertas; etapa y búsqueda en la URL; estados vacío, de carga y de error; sin acciones de escritura; enlace «Ver pasaporte público» a `{NEXT_PUBLIC_URL_APP}/b/{código de lote}` (`links.passport()`); visible para quien ve la ficha · 2026-10-02
- [x] Configuración: aviso en el grupo de trazabilidad y en cada regla que se aplica al crear el lote (reposo, crianza mínima, altitud, cepas, mermas, límites de laboratorio…) de que un cambio solo afecta a los lotes que se creen después · 2026-10-02
- [x] Pruebas: unitarias (filtros ↔ URL, candado, enlace al pasaporte, reglas de lote), cliente contra los handlers reales (lotes por bodega, filtros, 403 `TRC_PLATFORM_READ_ONLY`) y `e2e/lots.spec.ts` (pestaña con soporte, filtros, pasaporte, sin escrituras, teclado, bodega sin lotes, aviso de configuración); `?pestana=lotes` en la auditoría axe · 2026-10-02
- [ ] Detalle del lote en solo lectura (línea de tiempo, grafo, expediente) desde la pestaña: no está en el contrato de esta ola
- [ ] Recorrido de los lotes contra el backend real en `e2e/backend-real.spec.ts` (cuando el servidor de desarrollo despliegue el cierre H2)

## 4C · Tokenización, colecciones y cadena (O3-BO-1, Ola 3)

Contrato: `plan/contratos/o3-tokenizacion.md` (§2.3–§2.4, §3, §5.4–§5.6, §6, §7, §8, §9, §10, §11) con las precisiones de `drinks-on-chain-mocks/docs/CONTRATO.md` §13. Construida **contra mocks** (`0.6.0-rc.1`); el backend de la apertura aún no está desplegado.

- [x] `@drinks-on-chain/mocks` 0.6.0-rc.1 y `@drinks-on-chain/ui` 0.4.0-rc.1 (`TxStatusBadge`, `ChainAddress`, `ExplorerLink`, `StatusBadge kind="tokenizationRequest"`); fuera la bandera `NEXT_PUBLIC_FLAG_TOKENIZATION` · 2026-10-09
- [x] Capacidades `tokenization.read`/`manage`, `chain.read`/`manage` y `chain.admin` en `can()`; menú y ⌘K con «Tokenización», «Colecciones» y «Cadena» (y búsqueda de solicitudes de tokenización y colecciones) según la capacidad · 2026-10-09
- [x] Tablero: bloques `tokenization` (solicitudes abiertas y la más antigua, colecciones publicadas, emitiendo, emisiones fallidas, faltantes) y `chain` (alertas, transacciones fallidas y atascadas, última conciliación, saldos e indexador), con enlaces a las listas filtradas · 2026-10-09
- [x] Bandeja `/tokenizacion` (`TokenizationInbox`): abiertas por defecto, filtros en la URL (estado, bodega, tipo, asignada, búsqueda), antigüedad resaltada, «Tomar» desde la fila · 2026-10-09
- [x] Detalle `/tokenizacion/[id]`: revisión del lote en lectura (candados, fecha estimada, D.O., incidencias, laboratorio, expediente, límites recalculados), identidad de la bodega, notas internas, editor de datos comerciales con imágenes y portada, precio en bolivianos (`parseDecimal` → centavos) con la sugerencia de la política, pedir cambios (mensaje y campos), aprobar (con «publicar al emitir») y rechazar con `ReasonDialog`; errores `TOK_…` explicados campo a campo · 2026-10-09
- [x] Colecciones `/colecciones` en tarjetas (`CollectionCard`) y tabla, con estado, emisión y contrato en el explorador; aviso de los cierres con faltante sin decidir · 2026-10-09
- [x] Detalle `/colecciones/[id]`: métricas, datos comerciales, NFT paginados (estado y rango de botellas), emisiones con sus transacciones (`TxStatusBadge`, refresco cada 5 s solo con algo en curso, reintento de una emisión fallida), historial de cuota, precio y estados; publicar, pausar, reanudar, cerrar y editar datos y precio · 2026-10-09
- [x] Cierre con faltante: cifras, NFT afectados, decisión (quemas solo `chain.admin`, con confirmación seria) y resolución ítem a ítem (devolución o sustitución) · 2026-10-09
- [x] Cadena `/cadena`: transacciones (filtros, detalle con intentos e historial, reintentar, abandonar), cuentas de la plataforma y saldos con aviso de saldo bajo, eventos, conciliaciones (lanzar, ver con sus alertas) y alertas (resolver con nota) · 2026-10-09
- [x] Ficha de bodega · pestaña «Cadena»: identidad (estado, cuenta, contrato), NFT por lote, últimas transacciones; reaprovisionar, pausar y reanudar el contrato en la red con motivo y confirmación seria · 2026-10-09
- [x] Soporte en solo lectura (los controles no aparecen; un 403 se explica); `Idempotency-Key` por intención en las diez operaciones que la exigen · 2026-10-09
- [x] Pruebas: unitarias de los modelos (filtros ↔ URL, acciones por estado y rol, datos comerciales y precio, cierre, idempotencia, errores `TOK_…`/`CHN_…`), cliente contra los handlers reales con la red simulada (`src/lib/platform/tokenization.test.ts`) y `e2e/tokenization.spec.ts` (bandeja → pedir cambios → aprobar → emisión confirmada → publicar/pausar/reanudar; emisión fallida y reintento; faltante y decisión; alerta y resolución; cadena e identidad; soporte sin escritura; ⌘K), con axe y sin errores de consola · 2026-10-09
- [ ] Contra el backend real de desarrollo (cuando despliegue la apertura de la Ola 3): cotejar rutas y formas, y añadir el recorrido a `e2e/backend-real.spec.ts`
- [ ] `CollectionCard` a `@drinks-on-chain/ui` (hoy local en `src/components/tokenization/collection-card.tsx`)
- [ ] Correos de la tokenización en el buzón simulado y cierre con NFT vendidos sin botella como escenario (mocks `rc.2`)

## 4F · Pedidos y reseñas (Ola 4)

- [ ] Pedidos, colecciones con ventas, moderación de reseñas

## 4D · Puntos de canje, soporte y campañas (Ola 5)

- [ ] Puntos de canje, cajeros, tabletas, helpdesk, entrega asistida, campañas post-canje

## 4E · Calidad (cada ola)

- [x] Ola 1 · 4A: teclado completo, paginación (`limit` ≤ 100) y ordenación en la tabla de usuarios, Playwright del recorrido · 2026-09-27
- [x] Ola 1 · 4B: filtros y página en la URL, paginación (`limit` ≤ 100) y ordenación en todas las listas; Playwright con mocks: solicitud tomar → reunión → aprobar → correo del buzón → aceptar → bodega activa con prefijo, rechazo, alta directa, suspender y verlo en la bitácora, bloquear miembro y cuenta completa, mínimo legal (rechazo y excepción), CSV, verificación de la cadena, soporte sin escritura; axe en todas las pantallas y diálogos nuevos; teclado (detalle de la bitácora, pestañas, ⌘K) · 2026-09-27
- [x] Ola 3 · 4C: teclado completo y diálogos modales en las pantallas nuevas, filtros y página en la URL, paginación (`limit` ≤ 100), axe en las 17 rutas nuevas y en sus diálogos, Playwright del recorrido · 2026-10-09
- [ ] Recorrido H1 con el repo `drinks-on-chain-e2e`

## Cierre de la Ola 1 (H1) · retirada de la compatibilidad transitoria

Contrato: `plan/contratos/o1-backoffice-y-bodegas.md` §11 y `o0-sesiones-y-estandares.md` §5. Llega con la plantilla (`git merge template/dev`).

- [x] Sin `refreshToken` en el cuerpo: ni se guarda ni se reenvía en `refresh` ni en `switch-organization` (aceptar una invitación ya no lo enviaba); el de la respuesta se ignora · 2026-09-27
- [x] Login, segundo factor, sesión y `me` con los esquemas de `src/lib/auth/schemas.ts` (sin `tokens.refreshToken` ni `user.userRole/wineryId/memberRole`); `/__mocks` muestra el rol de la membresía activa · 2026-09-27
- [x] `PATCH /v1/users/me` solo con `{ user, memberships, activeOrganizationId }`; `details` solo como `{ field, message }` · 2026-09-27
- [x] Aviso "Tu sesión se cerró por seguridad" en el login también al recargar con una sesión revocada (unitaria y E2E) · 2026-09-27
- [x] `@drinks-on-chain/mocks` 0.4.0-rc.2 (retirada de H1 en los mocks) con la plantilla: esquemas de sesión y `me` reexportados salvo `tokens.refreshToken` (obsoleto hasta 0.5), `/__mocks` con `DemoUser.role` y pruebas sin campos de 0.1 · 2026-09-27
- [x] `@drinks-on-chain/ui` 0.3.1-rc.1 con la plantilla: "Mi perfil" del menú de usuario del `AdminShell` navega con `linkComponent` sin recargar (E2E) · 2026-09-27
- [x] CI en verde con `mocks` 0.4.0-rc.2: la prueba del login afirma lo que hace el Backoffice (`login()` no abre la sesión; la aplica el flujo al terminar) y `src/lib/auth/mocks-contract.test.ts` recorre la sesión contra los handlers reales del paquete (reto, sesión, `me`, renovación, cambio de organización) · 2026-10-01
