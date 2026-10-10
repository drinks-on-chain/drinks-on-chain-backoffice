import { expect, test, type Page, type Response } from "@playwright/test";
import {
  ChainAlertSchema,
  ChainEventSchema,
  ChainTransactionSchema,
  CollectionSchema,
  CollectionSummarySchema,
  DashboardSchema,
  LotClosureSummarySchema,
  PlatformChainAccountsSchema,
  PlatformTokenizationRequestSchema,
  PublicChainRegistrySchema,
  ReconciliationRunSchema,
  TokenizationRequestSummarySchema,
  WineryChainAccountViewSchema,
} from "@drinks-on-chain/mocks";
import { REAL, STAFF, totpFor } from "./real-api";
import { settled, trackErrors } from "./support";

// Cotejo de **solo lectura** de las pantallas de la Ola 3 (4C) contra el backend real de desarrollo:
// cada respuesta real de las rutas de tokenización, colecciones y cadena se valida aquí contra los
// esquemas de `@drinks-on-chain/mocks` (los que usa la app), y cada pantalla debe pintarse sin
// errores también con listas vacías y con la cadena sin configurar. No escribe nada: ninguna
// petición que no sea GET sale hacia las rutas de la plataforma. Solo con `E2E_REAL_API=1`.

test.skip(process.env.E2E_REAL_API !== "1", "Solo con E2E_REAL_API=1");
test.skip(
  !REAL.apiOrigin || !REAL.password || !REAL.totpSecret,
  "Faltan E2E_API_ORIGIN, E2E_PASSWORD o E2E_TOTP_SECRET",
);

type Check = { safeParse: (data: unknown) => { success: boolean; error?: { issues: unknown[] } } };
const page_ = (item: Check): Check => ({
  safeParse(data) {
    const items = (data as { items?: unknown[] } | null)?.items;
    if (!Array.isArray(items))
      return { success: false, error: { issues: [{ message: "no es una página { items }" }] } };
    for (const [index, row] of items.entries()) {
      const result = item.safeParse(row);
      if (!result.success) return { success: false, error: { issues: [{ index }, ...(result.error?.issues ?? [])] } };
    }
    return { success: true };
  },
});

const ID = "[\\w-]+";
/** Ruta del backend (sin `/api`) → esquema de `data`. */
const CONTRACT: [RegExp, Check][] = [
  [/^\/v1\/platform\/dashboard$/, DashboardSchema],
  [/^\/v1\/platform\/tokenization-requests$/, page_(TokenizationRequestSummarySchema)],
  [new RegExp(`^/v1/platform/tokenization-requests/${ID}$`), PlatformTokenizationRequestSchema],
  [/^\/v1\/platform\/collections$/, page_(CollectionSummarySchema)],
  [new RegExp(`^/v1/platform/collections/${ID}$`), CollectionSchema],
  [/^\/v1\/platform\/lot-closures$/, page_(LotClosureSummarySchema)],
  [/^\/v1\/platform\/chain\/transactions$/, page_(ChainTransactionSchema)],
  [/^\/v1\/platform\/chain\/accounts$/, PlatformChainAccountsSchema],
  [/^\/v1\/platform\/chain\/events$/, page_(ChainEventSchema)],
  [/^\/v1\/platform\/chain\/reconciliation\/runs$/, page_(ReconciliationRunSchema)],
  [/^\/v1\/platform\/chain\/alerts$/, page_(ChainAlertSchema)],
  [new RegExp(`^/v1/platform/wineries/${ID}/chain-account$`), WineryChainAccountViewSchema],
  [/^\/v1\/public\/chain\/registry$/, PublicChainRegistrySchema],
];

/** Rutas del menú que el backend puede poner en `link` de una alerta del tablero. */
const KNOWN_LINKS =
  /^\/(solicitudes|bodegas|usuarios|configuracion|bitacora|lista-de-espera|tokenizacion|colecciones|cadena)(\/|\?|$)/;

test("Ola 3 en solo lectura: las respuestas reales pasan los esquemas y nada revienta con listas vacías", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  const checked = new Map<string, number>();
  const mismatches: string[] = [];
  const writes: string[] = [];
  const pending: Promise<void>[] = [];
  let dashboardLinks: string[] = [];

  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/platform") && request.method() !== "GET") writes.push(`${request.method()} ${path}`);
  });
  page.on("response", (response: Response) => {
    const path = new URL(response.url()).pathname.replace(/^\/api/, "");
    const entry = CONTRACT.find(([route]) => route.test(path));
    if (!entry || response.request().method() !== "GET" || response.status() !== 200) return;
    pending.push(
      response
        .json()
        .then((body: { data?: unknown }) => {
          const result = entry[1].safeParse(body.data);
          const route = entry[0].source;
          checked.set(route, (checked.get(route) ?? 0) + 1);
          // Solo la ruta y dónde no cuadra (rutas de campo y mensajes de zod): nunca los datos.
          if (!result.success) mismatches.push(`${path}: ${JSON.stringify(result.error?.issues.slice(0, 6))}`);
          if (path === "/v1/platform/dashboard") {
            const alerts = (body.data as { alerts?: { link?: string | null }[] }).alerts ?? [];
            dashboardLinks = alerts.flatMap((a) => (a.link ? [a.link] : []));
          }
        })
        .catch(() => undefined),
    );
  });

  /** La pantalla terminó de cargar, con su título y sin ningún estado de error. */
  async function healthy(target: Page, what: string) {
    await settled(target);
    await expect(target.getByText(/No se pudo cargar|No se pudieron cargar|datos inesperados/), what).toHaveCount(0);
    await expect(target.getByRole("heading", { level: 1 }), what).toHaveCount(1);
  }

  // Entra operaciones (lee todo); el recorrido no pulsa ningún control de escritura.
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(STAFF.operations);
  await page.getByLabel("Contraseña").fill(REAL.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await page.getByLabel("Código de verificación").fill(await totpFor(page));
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();

  // Tablero con los bloques de la Ola 3.
  await healthy(page, "tablero");
  const board = page.getByRole("region", { name: "Tokenización y cadena" });
  await expect(board.getByText("Solicitudes de tokenización", { exact: true })).toBeVisible();
  await expect(board.getByText("Alertas de la cadena", { exact: true })).toBeVisible();
  await expect(board.getByText(/Saldo de operaciones/)).toBeVisible();

  // Bandeja (y la primera solicitud, si hay alguna: con la lista vacía, el enlace del estado vacío no cuenta).
  await page.goto("/tokenizacion");
  await healthy(page, "bandeja");
  await expect(page.getByText(/^\d+ solicitud(es)?$/)).toBeVisible();
  await page.goto("/tokenizacion?estado=APPROVED");
  await healthy(page, "bandeja (aprobadas)");
  const request = page.locator('table a[href^="/tokenizacion/"]').first();
  if (await request.count()) {
    await request.click();
    await expect(page).toHaveURL(/\/tokenizacion\/[\w-]+$/);
    await healthy(page, "detalle de la solicitud");
    await expect(page.getByRole("heading", { name: "Revisión del lote" })).toBeVisible();
  }

  // Colecciones en tarjetas y en tabla (y la primera, si hay alguna, con sus pestañas de lectura).
  await page.goto("/colecciones");
  await healthy(page, "colecciones");
  await expect(page.getByText(/^\d+ (colección|colecciones)$/)).toBeVisible();
  await page.goto("/colecciones?vista=tabla");
  await healthy(page, "colecciones (tabla)");
  const collection = page.locator('table a[href^="/colecciones/"]').first();
  if (await collection.count()) {
    await collection.click();
    await expect(page).toHaveURL(/\/colecciones\/[\w-]+$/);
    await healthy(page, "detalle de la colección");
    for (const tab of [/^NFT/, /^Emisiones/, "Historial"]) {
      await page.getByRole("tab", { name: tab }).click();
      await healthy(page, `colección · ${String(tab)}`);
    }
  }

  // Cadena y sus pestañas.
  for (const [path, heading] of [
    ["/cadena", "Transacciones"],
    ["/cadena/cuentas", /Cuentas de la plataforma/],
    ["/cadena/eventos", "Eventos de los contratos"],
    ["/cadena/conciliaciones", "Conciliaciones con la red"],
    ["/cadena/alertas?estado=todas", "Alertas de la cadena"],
  ] as const) {
    await page.goto(path);
    await healthy(page, path);
    await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
  }

  // Pestaña «Cadena» de la primera bodega activa (sin tocarla).
  await page.goto("/bodegas?estado=ACTIVE");
  await healthy(page, "bodegas");
  const winery = page.locator('table a[href^="/bodegas/"]').first();
  if (await winery.count()) {
    await winery.click();
    await expect(page).toHaveURL(/\/bodegas\/[\w-]+$/);
    await page.getByRole("tab", { name: "Cadena" }).click();
    await healthy(page, "bodega · cadena");
    await expect(page.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toBeVisible();
  }

  await Promise.all(pending);
  // Resumen para el registro de la ejecución: qué rutas se cotejaron (sin datos).
  console.log(`Rutas cotejadas con su esquema: ${JSON.stringify(Object.fromEntries(checked))}`);
  console.log(`Enlaces de las alertas del tablero: ${JSON.stringify(dashboardLinks)}`);

  expect(mismatches, "respuestas reales que no pasan el esquema").toEqual([]);
  // Las rutas de las listas se pidieron de verdad (el cotejo no pasa por no haber mirado).
  for (const route of [
    "dashboard",
    "tokenization-requests$",
    "collections$",
    "transactions$",
    "accounts$",
    "events$",
    "runs$",
    "alerts$",
  ]) {
    expect(
      [...checked.keys()].some((key) => key.includes(route.replace("$", ""))),
      `se cotejó ${route}`,
    ).toBe(true);
  }
  for (const link of dashboardLinks) expect(link, "enlace de una alerta del tablero").toMatch(KNOWN_LINKS);
  expect(writes, "el recorrido no escribe").toEqual([]);
  expect(errors).toEqual([]);
});
