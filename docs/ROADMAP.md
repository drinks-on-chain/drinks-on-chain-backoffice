# Roadmap del Backoffice (S3)

Sub-etapas 4A–4F de `docs-front/03-roadmap-frontend.md` v3 §8, ordenadas por las olas del plan maestro. Contrato: `plan/contratos/o1-backoffice-y-bodegas.md` (Ola 1) y `o0-sesiones-y-estandares.md` (sesiones). Se marca `- [x] … · fecha` al terminar cada paso.

| Sub-etapa                              | Ola      | Qué                                                                                                                |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| 4A Acceso y tablero                    | 1        | Login con TOTP, tablero, usuarios internos por invitación con rol y matriz de permisos                             |
| 4B Solicitudes, bodegas y equipo       | 1        | Bandeja de solicitudes, alta directa, directorio y ficha de bodega, equipo de una bodega, configuración y bitácora |
| 4C Tokenización                        | 3        | Bandeja de solicitudes de tokenización, colecciones con estado de emisión                                          |
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
- [ ] Contra el backend de desarrollo cuando publique la Etapa 1 (O1-BE-1)

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
- [ ] Invitaciones de una bodega con `GET /v1/platform/organizations/{id}/invitations` cuando el contrato la añada (hoy se reconstruyen con los eventos `INVITATION_*` de la bitácora) y estado de la cuenta completa con una lectura propia (hoy, último `USER_BLOCKED`/`USER_UNBLOCKED`)
- [ ] Contra el backend de desarrollo cuando publique la Etapa 1 (O1-BE-1)

## 4C · Tokenización (Ola 3)

- [ ] Bandeja de solicitudes de tokenización, datos comerciales, colecciones con estado de emisión y explorador

## 4F · Pedidos y reseñas (Ola 4)

- [ ] Pedidos, colecciones con ventas, moderación de reseñas

## 4D · Puntos de canje, soporte y campañas (Ola 5)

- [ ] Puntos de canje, cajeros, tabletas, helpdesk, entrega asistida, campañas post-canje

## 4E · Calidad (cada ola)

- [x] Ola 1 · 4A: teclado completo, paginación (`limit` ≤ 100) y ordenación en la tabla de usuarios, Playwright del recorrido · 2026-09-27
- [x] Ola 1 · 4B: filtros y página en la URL, paginación (`limit` ≤ 100) y ordenación en todas las listas; Playwright con mocks: solicitud tomar → reunión → aprobar → correo del buzón → aceptar → bodega activa con prefijo, rechazo, alta directa, suspender y verlo en la bitácora, bloquear miembro y cuenta completa, mínimo legal (rechazo y excepción), CSV, verificación de la cadena, soporte sin escritura; axe en todas las pantallas y diálogos nuevos; teclado (detalle de la bitácora, pestañas, ⌘K) · 2026-09-27
- [ ] Recorrido H1 con el repo `drinks-on-chain-e2e`
