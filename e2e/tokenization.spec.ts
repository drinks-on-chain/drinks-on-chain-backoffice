import { expect, test, type Page } from "@playwright/test";
import {
  STAFF,
  axe,
  capture,
  login,
  nav,
  resubmitAsWinery,
  settleChain,
  settled,
  trackErrors,
  useScenario,
} from "./support";

// Ola 3 · 4C: tokenización, colecciones y cadena contra los mocks 0.6 (contrato
// `plan/contratos/o3-tokenizacion.md`). La red es la simulada del paquete: las transacciones
// avanzan solas con el tiempo y `window.__docMocks.chain.settle()` las confirma de golpe (reloj
// simulado). El estado de la Ola 3 vive en memoria: tras una escritura se navega sin recargar.

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const count = (page: Page, text: string) => page.getByText(text, { exact: true });
const h1 = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });
const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();

/** Elige una opción de un `Select` del sistema de diseño. */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("bandeja → pedir cambios → aprobar → emisión confirmada → publicar, pausar y reanudar", async ({ page }) => {
  test.slow();
  const errors = trackErrors(page);
  await login(page, STAFF.operations);

  // El tablero trae los bloques nuevos, con enlaces a las listas filtradas.
  await settled(page);
  const board = page.getByRole("region", { name: "Tokenización y cadena" });
  await expect(board.getByText("Solicitudes de tokenización", { exact: true })).toBeVisible();
  await expect(board.getByText("Alertas de la cadena", { exact: true })).toBeVisible();
  await expect(board.getByText(/Saldo de operaciones · Testnet/)).toBeVisible();
  await capture(page, "01-tablero");

  // Bandeja: por defecto las abiertas; filtros en la URL.
  await nav(page, "Tokenización");
  await expect(h1(page, "Solicitudes de tokenización")).toBeVisible();
  await settled(page);
  await expect(count(page, "3 solicitudes")).toBeVisible();
  for (const name of ["Lote", "Bodega", "Tipo", "Botellas", "Estado", "Asignada", "Antigüedad"]) {
    await expect(page.getByRole("columnheader", { name, exact: true })).toBeVisible();
  }
  await expect(row(page, "Singani El Molino 2026")).toContainText("En revisión");
  await expect(row(page, "Tannat La Angostura 2024")).toContainText("Cambios pedidos");
  expect(await axe(page), "bandeja").toEqual([]);
  await capture(page, "02-bandeja");

  await choose(page, "Tipo", "Ampliación de cuota");
  await expect(page).toHaveURL(/tipo=QUOTA_INCREASE$/);
  await expect(count(page, "1 solicitud")).toBeVisible();
  await choose(page, "Estado", "Rechazada");
  await expect(page).toHaveURL(/tipo=QUOTA_INCREASE&estado=REJECTED$/);
  await expect(page.getByText("Ninguna solicitud coincide", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL(/\/tokenizacion$/);
  await choose(page, "Asignada", "A mí");
  await expect(page).toHaveURL(/asignada=me$/);
  await expect(count(page, "1 solicitud")).toBeVisible();
  await choose(page, "Asignada", "Cualquiera");
  await expect(count(page, "3 solicitudes")).toBeVisible();

  // Tomar la ampliación (sin asignar) desde la bandeja abre su detalle en revisión.
  const increase = row(page, "Singani El Portillo 2025");
  await expect(increase).toContainText("Ampliación de cuota");
  await expect(increase).toContainText("Sin asignar");
  await increase.getByRole("button", { name: /Tomar/ }).click();
  await expect(h1(page, "Singani El Portillo 2025")).toBeVisible();
  await expect(toast(page, "Solicitud tomada: ahora está en revisión y asignada a ti.")).toBeVisible();
  await settled(page);
  // La revisión: lote en lectura, límites recalculados sobre las botellas e identidad de la bodega.
  await expect(page.getByRole("heading", { name: "Revisión del lote" })).toBeVisible();
  await expect(page.getByText(/el límite es [\d.]+ \(botellas con código activo\)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Identidad en la red" })).toBeVisible();

  // Pedir cambios: mensaje y campos; la solicitud queda a la espera de la bodega.
  await page.getByRole("button", { name: "Pedir cambios" }).click();
  const changes = page.getByRole("dialog", { name: "Pedir cambios a la bodega" });
  await expect(changes).toBeVisible();
  await changes.getByRole("button", { name: "Pedir cambios" }).click();
  await expect(changes.getByText(/Explica qué debe cambiar la bodega/)).toBeVisible();
  await changes.getByLabel("Mensaje para la bodega").fill("Falta la nota de cata y la portada de la colección.");
  await changes.getByRole("checkbox", { name: "Nota de cata" }).click();
  await changes.getByRole("checkbox", { name: "Imágenes" }).click();
  await settled(page);
  expect(await axe(page), "pedir cambios").toEqual([]);
  await capture(page, "03-pedir-cambios");
  await changes.getByRole("button", { name: "Pedir cambios" }).click();
  await expect(changes).toHaveCount(0);
  await expect(page.getByText("Espera a que la bodega la corrija y la reenvíe desde el ERP.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Cambios pedidos" })).toContainText("Falta la nota de cata y la portada");
  // Ya no está en revisión: no hay nada que decidir.
  await expect(page.getByRole("button", { name: /Aprobar/ })).toHaveCount(0);

  // De vuelta a la bandeja (sin recargar) y a la solicitud en revisión con datos completos.
  await page.getByRole("navigation", { name: "Ruta" }).getByRole("link", { name: "Tokenización" }).click();
  await expect(row(page, "Singani El Portillo 2025")).toContainText("Cambios pedidos");
  await page.getByRole("link", { name: "Singani El Molino 2026", exact: true }).click();
  await expect(h1(page, "Singani El Molino 2026")).toBeVisible();
  await settled(page);
  await expect(page.getByText(/Aún se pueden autorizar/)).toBeVisible();
  await expect(page.getByText("Denominación de origen")).toBeVisible();
  await expect(page.getByText("Candados", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Política de precio sin definir; puedes fijar un precio manual o dejarlo vacío."),
  ).toBeVisible();
  expect(await axe(page), "detalle de la solicitud").toEqual([]);
  await capture(page, "04-solicitud-en-revision");

  // Nota interna.
  await page.getByLabel("Nota nueva").fill("Datos comerciales revisados con la bodega.");
  await page.getByRole("button", { name: "Añadir la nota" }).click();
  await expect(page.getByRole("list", { name: "Notas internas de la solicitud" })).toContainText(
    "Datos comerciales revisados con la bodega.",
  );

  // Precio en bolivianos: se valida con parseDecimal y se guarda en centavos.
  const price = page.getByLabel("Precio por botella");
  await price.fill("abc");
  await page.getByRole("button", { name: "Guardar los datos" }).click();
  await expect(page.getByText("Escribe un importe en bolivianos, p. ej. 180 o 180,50.")).toBeVisible();
  await price.fill("180,5");
  await page.getByLabel("Maridaje").fill("Quesos de cabra y fruta fresca.");
  await page.getByRole("button", { name: "Guardar los datos" }).click();
  await expect(toast(page, "Datos comerciales guardados.")).toBeVisible();
  await expect(price).toHaveValue("180,50");

  // Aprobar sin «publicar al emitir»: colección y emisión en curso.
  await page.getByRole("button", { name: "Aprobar y emitir" }).click();
  const approve = page.getByRole("dialog", { name: "Aprobar y emitir los NFT" });
  await expect(approve).toBeVisible();
  await expect(approve).toContainText("Bs 180,50");
  await expect(approve).toContainText("400 · cuota resultante 400");
  await expect(approve.getByRole("checkbox", { name: "Publicar al emitir" })).not.toBeChecked();
  await settled(page);
  expect(await axe(page), "aprobar").toEqual([]);
  await capture(page, "05-aprobar");
  await approve.getByRole("button", { name: "Aprobar y emitir" }).click();
  await expect(approve).toHaveCount(0);
  await expect(page.getByText("Solicitud aprobada: emisión en curso")).toBeVisible();
  await page.getByRole("link", { name: "Seguir la emisión en la colección" }).click();

  // Colección emitiendo: la pantalla se actualiza sola; el reloj simulado confirma la emisión.
  await expect(page).toHaveURL(/\/colecciones\/[\w-]+\?pestana=emisiones$/);
  await expect(h1(page, "Singani El Molino 2026")).toBeVisible();
  await expect(page.getByText("Emitiendo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Hay una operación en curso en la red")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toHaveCount(0);
  await capture(page, "06-coleccion-emitiendo");
  await settleChain(page);
  await expect(page.getByText("Lista para publicar", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Hay una operación en curso en la red")).toHaveCount(0);
  await expect(page.getByText(/Botellas 1–400 · ids \d+–\d+/)).toBeVisible();
  const mintTxs = page.getByRole("list", { name: "Transacciones de la emisión 1" });
  await expect(mintTxs).toContainText("Confirmada");
  await expect(mintTxs.getByRole("link", { name: /Ver en el explorador/ })).toHaveAttribute(
    "href",
    /^https:\/\/stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}$/,
  );
  await settled(page);
  expect(await axe(page), "emisiones").toEqual([]);
  await capture(page, "07-coleccion-emisiones");

  // Publicar (preventa), pausar con motivo y reanudar.
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const publish = page.getByRole("alertdialog", { name: "Publicar la colección" });
  await expect(publish).toContainText("400 NFT disponibles");
  await publish.getByRole("button", { name: "Publicar" }).click();
  await expect(toast(page, "Colección publicada.")).toBeVisible();
  await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Preventa", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Pausar la venta" }).click();
  const pause = page.getByRole("alertdialog", { name: "Pausar la venta" });
  await expect(pause).toContainText("no toca la red");
  await pause.getByLabel("Motivo").fill("Revisión de la ficha con la bodega");
  await pause.getByRole("button", { name: "Pausar" }).click();
  await expect(toast(page, "Colección pausada.")).toBeVisible();
  await expect(page.getByText("Pausada", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Reanudar la venta" }).click();
  await page.getByRole("alertdialog", { name: "Reanudar la venta" }).getByRole("button", { name: "Reanudar" }).click();
  await expect(toast(page, "Venta reanudada.")).toBeVisible();
  await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();

  // Historial: cuota, precio y estados con su motivo.
  await page.getByRole("tab", { name: "Historial" }).click();
  const history = page.getByRole("tabpanel", { name: "Historial" });
  await expect(history.getByRole("list", { name: "Historial de precio" })).toContainText("Bs 180,50");
  await expect(history.getByRole("list", { name: "Historial de estados de la colección" })).toContainText(
    "Revisión de la ficha con la bodega",
  );

  // NFT paginados y filtrados por rango de botellas.
  await page.getByRole("tab", { name: /^NFT/ }).click();
  await expect(count(page, "400 NFT")).toBeVisible();
  await page.getByLabel("Desde la botella").fill("391");
  await page.getByLabel("Hasta la botella").fill("400");
  await page.getByRole("button", { name: "Aplicar el rango" }).click();
  await expect(page).toHaveURL(/desde=391&hasta=400/);
  await expect(count(page, "10 NFT")).toBeVisible();
  await settled(page);
  expect(await axe(page), "nft").toEqual([]);
  await capture(page, "08-coleccion-nft");

  // La colección nueva está en la lista, en tarjetas y en tabla.
  await nav(page, "Colecciones");
  await expect(h1(page, "Colecciones")).toBeVisible();
  await expect(count(page, "5 colecciones")).toBeVisible();
  await settled(page);
  expect(await axe(page), "colecciones (tarjetas)").toEqual([]);
  await capture(page, "09-colecciones-tarjetas");
  await page.getByRole("button", { name: "Tabla" }).click();
  await expect(page).toHaveURL(/vista=tabla$/);
  await expect(row(page, "Singani El Molino 2026")).toContainText("Publicada");
  await expect(row(page, "Singani El Molino 2026")).toContainText("400 / 400");
  await settled(page);
  expect(await axe(page), "colecciones (tabla)").toEqual([]);
  await capture(page, "10-colecciones-tabla");
  expect(errors).toEqual([]);
});

test("emisión fallida: aviso, reintento con motivo y confirmación", async ({ page }) => {
  test.slow();
  const errors = trackErrors(page);
  await useScenario(page, "emision-fallida");
  await login(page, STAFF.operations);

  await nav(page, "Colecciones");
  await choose(page, "Emisión", "Fallida");
  await expect(page).toHaveURL(/emision=FAILED$/);
  await expect(count(page, "1 colección")).toBeVisible();
  await page.getByRole("link", { name: "Singani Preventa 2026", exact: true }).click();
  await expect(h1(page, "Singani Preventa 2026")).toBeVisible();
  await settled(page);

  // La emisión falló: se explica el error y no se puede publicar.
  const failure = page.getByRole("alert").filter({ hasText: "La emisión falló" });
  await expect(failure).toContainText("Los NFT no existen hasta que se confirme");
  await expect(failure).toContainText("Revisa la custodia y reintenta a mano.");
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toHaveCount(0);
  // Una emisión fallida no se consulta en bucle.
  await expect(page.getByText("Hay una operación en curso en la red")).toHaveCount(0);
  await page.getByRole("tab", { name: /^Emisiones/ }).click();
  await expect(page.getByRole("list", { name: "Transacciones de la emisión 1" })).toContainText("Fallida");
  await expect(page.getByRole("list", { name: "Transacciones de la emisión 1" })).toContainText("CHN_AUTH_FAILED");
  expect(await axe(page), "emisión fallida").toEqual([]);
  await capture(page, "11-emision-fallida");

  // Reintentar con motivo: vuelve a la cola y el reloj simulado la confirma.
  await failure.getByRole("button", { name: "Reintentar la emisión" }).click();
  const retry = page.getByRole("alertdialog", { name: "Reintentar la transacción" });
  await retry.getByLabel("Motivo").fill("Clave de la bodega revisada en el custodio");
  await retry.getByRole("button", { name: "Reintentar" }).click();
  await expect(toast(page, "Transacción en cola: se envía de nuevo a la red.")).toBeVisible();
  await expect(page.getByText("La emisión falló")).toHaveCount(0);
  await expect(page.getByText("Hay una operación en curso en la red")).toBeVisible();
  await settleChain(page);
  await expect(page.getByText("Lista para publicar", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeVisible();

  // En «Cadena», el detalle de la transacción guarda el intento fallido y el confirmado.
  await page
    .getByRole("list", { name: "Transacciones de la emisión 1" })
    .getByRole("link", { name: /Ver intentos/ })
    .click();
  await expect(page).toHaveURL(/\/cadena\?tx=[\w-]+$/);
  const panel = page.getByRole("dialog", { name: "Emisión de NFT" });
  await expect(panel).toBeVisible();
  const attempts = panel.getByRole("table", { name: "Historial de la transacción" });
  await expect(attempts).toContainText("CHN_AUTH_FAILED");
  await expect(attempts).toContainText("Confirmada");
  // Confirmada: ya no hay nada que reintentar ni abandonar.
  await expect(panel.getByRole("button", { name: /Reintentar|Abandonar/ })).toHaveCount(0);
  await settled(page);
  expect(await axe(page), "detalle de la transacción").toEqual([]);
  await capture(page, "13-cadena-transaccion");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).not.toHaveURL(/tx=/);

  // La lista, filtrada por tipo en la URL.
  await choose(page, "Tipo", "Emisión de NFT");
  await expect(page).toHaveURL(/tipo=MINT_BATCH$/);
  await expect(row(page, "Destilería Cinti Viejo").first()).toContainText("Confirmada");
  await settled(page);
  expect(await axe(page), "transacciones").toEqual([]);
  await capture(page, "12-cadena-transacciones");
  expect(errors).toEqual([]);
});

test("faltante de botellas: operaciones ve el cierre pero no lo decide", async ({ page }) => {
  const errors = trackErrors(page);
  await useScenario(page, "faltante-botellas");
  await login(page, STAFF.operations);

  // El aviso de la lista lleva al cierre; operaciones lo ve pero no decide (implica quemas).
  await nav(page, "Colecciones");
  const notice = page.getByRole("alert").filter({ hasText: "Cierres con faltante sin decidir" });
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: /Faltan 20 botellas/ }).click();
  await expect(page).toHaveURL(/pestana=cierre$/);
  await expect(page.getByRole("heading", { name: /Cierre del lote/, level: 2 })).toContainText("Faltante sin decidir");
  await expect(
    page.getByText(/Faltan 20 botellas: 20 NFT sin vender se queman y 0 vendidos quedan sin botella/),
  ).toBeVisible();
  await expect(page.getByText("Hay faltante: la decisión implica quemas y solo la toma administración.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Decidir el cierre/ })).toHaveCount(0);
  await settled(page);
  expect(await axe(page), "cierre (operaciones)").toEqual([]);
  expect(errors).toEqual([]);
});

test("faltante de botellas: administración decide, las quemas se confirman y el cierre queda resuelto", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await useScenario(page, "faltante-botellas");
  await login(page, STAFF.admin);
  await nav(page, "Colecciones");
  await page
    .getByRole("alert")
    .getByRole("link", { name: /Faltan 20 botellas/ })
    .click();
  await expect(page.getByRole("heading", { name: /Cierre del lote/, level: 2 })).toBeVisible();
  await capture(page, "14-cierre-con-faltante");
  await page.getByRole("button", { name: "Decidir el cierre y quemar" }).click();
  const decide = page.getByRole("dialog", { name: "Decidir el cierre del lote" });
  await expect(decide).toContainText("Las quemas no se pueden deshacer");
  const confirm = decide.getByRole("button", { name: "Decidir y quemar 20 NFT" });
  // Confirmación seria: motivo y la cifra de NFT que se queman.
  await expect(confirm).toBeDisabled();
  await decide.getByLabel("Motivo").fill("Embotellado con merma: 1.040 botellas");
  await decide.getByLabel(/Escribe 20/).fill("20");
  await expect(confirm).toBeEnabled();
  await settled(page);
  expect(await axe(page), "decidir el cierre").toEqual([]);
  await capture(page, "15-decidir-cierre");
  await confirm.click();
  await expect(decide).toHaveCount(0);
  await expect(toast(page, "Cierre decidido: las quemas van camino de la red.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Cierre del lote/, level: 2 })).toContainText("Decidido, en curso");
  const affected = page.getByRole("table", { name: "NFT afectados por el cierre" });
  await expect(affected.getByRole("row")).toHaveCount(21);
  await expect(affected).toContainText("Quema (sin vender)");

  await settleChain(page);
  await expect(page.getByRole("heading", { name: /Cierre del lote/, level: 2 })).toContainText("Resuelto", {
    timeout: 20_000,
  });
  await expect(affected).toContainText("Confirmada");
  await settled(page);
  expect(await axe(page), "cierre resuelto").toEqual([]);
  await capture(page, "16-cierre-resuelto");

  // Los 20 NFT con el número de botella más alto quedan quemados.
  await page.getByRole("tab", { name: /^NFT/ }).click();
  await choose(page, "Estado", "Quemado");
  await expect(count(page, "20 NFT")).toBeVisible();
  await expect(row(page, "1.060")).toContainText("Faltante de botellas");
  expect(errors).toEqual([]);
});

test("alerta de evento inesperado: del tablero a la alerta y su resolución con nota", async ({ page }) => {
  const errors = trackErrors(page);
  await useScenario(page, "alerta-evento-inesperado");
  await login(page, STAFF.operations);
  await settled(page);
  await expect(
    page.getByRole("region", { name: "Tokenización y cadena" }).getByText("Alertas de la cadena", { exact: true }),
  ).toBeVisible();

  await nav(page, "Cadena");
  await page.getByRole("navigation", { name: "Secciones de la cadena" }).getByRole("link", { name: "Alertas" }).click();
  await expect(page).toHaveURL(/\/cadena\/alertas$/);
  await choose(page, "Nivel", "Crítica");
  await expect(page).toHaveURL(/nivel=CRITICAL$/);
  await expect(count(page, "1 alerta")).toBeVisible();
  const alert = row(page, "Evento no originado por el sistema");
  await expect(alert).toContainText("Crítica");
  await settled(page);
  expect(await axe(page), "alertas").toEqual([]);
  await capture(page, "17-cadena-alertas");

  await alert.getByRole("button", { name: /Resolver/ }).click();
  const panel = page.getByRole("dialog", { name: "Evento no originado por el sistema" });
  await expect(panel).toContainText("Lo que dice la base");
  await expect(panel).toContainText("Lo que dice la red");
  await panel.getByRole("button", { name: "Resolver la alerta" }).click();
  await expect(panel.getByText(/Explica qué se comprobó y cómo se resolvió/)).toBeVisible();
  await panel.getByLabel("Nota de resolución").fill("Rol concedido en una prueba de la pista de contratos; revocado.");
  await settled(page);
  expect(await axe(page), "resolver alerta").toEqual([]);
  await capture(page, "18-resolver-alerta");
  await panel.getByRole("button", { name: "Resolver la alerta" }).click();
  await expect(toast(page, "Alerta resuelta.")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(page.getByText("Ninguna alerta coincide", { exact: true })).toBeVisible();

  // Queda entre las resueltas, con quién y la nota.
  await choose(page, "Estado", "Resueltas");
  await expect(page).toHaveURL(/estado=resolved/);
  await expect(row(page, "Evento no originado por el sistema")).toContainText("Resuelta");

  // El evento que la originó, en «Eventos».
  await page.getByRole("navigation", { name: "Secciones de la cadena" }).getByRole("link", { name: "Eventos" }).click();
  await page.getByRole("checkbox", { name: "Solo los no originados por el sistema" }).click();
  await expect(page).toHaveURL(/sinOrigen=1$/);
  await expect(row(page, "role_granted")).toContainText("No originado por el sistema");
  await settled(page);
  expect(await axe(page), "eventos").toEqual([]);
  await capture(page, "19-cadena-eventos");
  expect(errors).toEqual([]);
});

test("cadena: cuentas y saldos, conciliación, e identidad de la bodega (pausar y reanudar el contrato)", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await login(page, STAFF.admin);

  await nav(page, "Cadena");
  const sections = page.getByRole("navigation", { name: "Secciones de la cadena" });
  await expect(count(page, "13 transacciones")).toBeVisible();

  // Cuentas de la plataforma y saldos; los enlaces al explorador salen del backend.
  await sections.getByRole("link", { name: "Cuentas y saldos" }).click();
  await expect(page.getByRole("heading", { name: /Cuentas de la plataforma · Testnet/ })).toBeVisible();
  await expect(page.getByText("9.482,531 XLM")).toBeVisible();
  await expect(page.getByText("Saldo suficiente").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ver en el explorador/ }).first()).toHaveAttribute(
    "href",
    /^https:\/\/stellar\.expert\/explorer\/testnet\/account\/G[A-Z2-7]{55}$/,
  );
  await settled(page);
  expect(await axe(page), "cuentas").toEqual([]);
  await capture(page, "20-cadena-cuentas");

  // Conciliación manual.
  await sections.getByRole("link", { name: "Conciliaciones" }).click();
  await expect(count(page, "5 conciliaciones")).toBeVisible();
  await page.getByRole("button", { name: "Lanzar una conciliación" }).click();
  const start = page.getByRole("dialog", { name: "Lanzar una conciliación" });
  await expect(start).toBeVisible();
  await settled(page);
  expect(await axe(page), "lanzar conciliación").toEqual([]);
  await start.getByRole("button", { name: "Lanzar" }).click();
  await expect(start).toHaveCount(0);
  await expect(toast(page, /Conciliación (terminada|lanzada)/)).toBeVisible();
  await expect(count(page, "6 conciliaciones")).toBeVisible();
  await page
    .getByRole("button", { name: /Ver la conciliación/ })
    .first()
    .click();
  const run = page.getByRole("dialog", { name: "Conciliación" });
  await expect(run).toContainText("Manual");
  await expect(run).toContainText("Alertas de esta conciliación");
  await settled(page);
  expect(await axe(page), "conciliación").toEqual([]);
  await capture(page, "21-cadena-conciliacion");
  await page.keyboard.press("Escape");
  await expect(run).toHaveCount(0);

  // Identidad de Cinti Viejo en su ficha.
  await nav(page, "Bodegas");
  await page.getByRole("link", { name: "Destilería Cinti Viejo", exact: true }).click();
  await page.getByRole("tab", { name: "Cadena" }).click();
  await expect(page).toHaveURL(/pestana=cadena$/);
  const chain = page.getByRole("tabpanel", { name: "Cadena" });
  await expect(chain.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toContainText("Activa");
  await expect(chain.getByText("CVJ", { exact: true }).first()).toBeVisible();
  await expect(chain.getByRole("table", { name: /NFT por lote/ })).toContainText("Singani Preventa 2026");
  await settled(page);
  expect(await axe(page), "identidad de la bodega").toEqual([]);
  await capture(page, "22-bodega-cadena");

  // Pausar el contrato en la red: motivo y escribir el símbolo para confirmar.
  await chain.getByRole("button", { name: "Pausar el contrato en la red" }).click();
  const pause = page.getByRole("dialog", { name: "Pausar el contrato en la red" });
  await expect(pause).toContainText("TODA la bodega");
  const confirm = pause.getByRole("button", { name: "Pausar el contrato" });
  await expect(confirm).toBeDisabled();
  await pause.getByLabel("Motivo").fill("Simulacro de incidente");
  await pause.getByLabel("Escribe CVJ para confirmar").fill("cvj");
  await expect(confirm).toBeDisabled();
  await pause.getByLabel("Escribe CVJ para confirmar").fill("CVJ");
  await expect(confirm).toBeEnabled();
  await settled(page);
  expect(await axe(page), "pausar el contrato").toEqual([]);
  await capture(page, "23-pausar-contrato");
  await confirm.click();
  await expect(toast(page, "Pausa enviada a la red.")).toBeVisible();
  await settleChain(page);
  await expect(chain.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toContainText(
    "Pausada en la red",
    {
      timeout: 20_000,
    },
  );
  await expect(chain.getByText("Contrato pausado en la red")).toBeVisible();
  await expect(chain.getByRole("button", { name: "Pausar el contrato en la red" })).toHaveCount(0);

  // Reanudar: la firma la clave custodiada de la bodega.
  await chain.getByRole("button", { name: "Reanudar el contrato en la red" }).click();
  const resume = page.getByRole("dialog", { name: "Reanudar el contrato en la red" });
  await resume.getByLabel("Motivo").fill("Simulacro terminado");
  await resume.getByLabel("Escribe CVJ para confirmar").fill("CVJ");
  await resume.getByRole("button", { name: "Reanudar el contrato" }).click();
  await expect(toast(page, "Reanudación enviada a la red.")).toBeVisible();
  await settleChain(page);
  await expect(chain.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toContainText("Activa", {
    timeout: 20_000,
  });
  expect(errors).toEqual([]);
});

test("ciclo completo de una solicitud: pedir cambios → la bodega reenvía → tomar → aprobar y publicar al emitir", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await login(page, STAFF.operations);
  await nav(page, "Tokenización");
  await page.getByRole("link", { name: "Singani El Molino 2026", exact: true }).click();
  await expect(h1(page, "Singani El Molino 2026")).toBeVisible();
  const requestId = new URL(page.url()).pathname.split("/").pop()!;

  // Operaciones pide el maridaje.
  await page.getByRole("button", { name: "Pedir cambios" }).click();
  const changes = page.getByRole("dialog", { name: "Pedir cambios a la bodega" });
  await changes.getByLabel("Mensaje para la bodega").fill("Falta el maridaje para la ficha.");
  await changes.getByRole("checkbox", { name: "Maridaje" }).click();
  await changes.getByRole("button", { name: "Pedir cambios" }).click();
  await expect(page.getByText("Espera a que la bodega la corrija y la reenvíe desde el ERP.")).toBeVisible();

  // La bodega atiende lo pedido y reenvía desde el ERP (simulado por los mocks).
  await resubmitAsWinery(page, requestId);
  await page.getByRole("navigation", { name: "Ruta" }).getByRole("link", { name: "Tokenización" }).click();
  await page.getByRole("searchbox", { name: "Buscar" }).fill("molino");
  await expect(page).toHaveURL(/q=molino$/);
  const resubmitted = row(page, "Singani El Molino 2026");
  await expect(resubmitted).toContainText("Enviada");
  await expect(resubmitted).toContainText("Sin asignar");

  // Vuelve a la bandeja sin asignar: se toma otra vez y trae lo que completó la bodega.
  await resubmitted.getByRole("button", { name: /Tomar/ }).click();
  await expect(h1(page, "Singani El Molino 2026")).toBeVisible();
  await settled(page);
  await expect(page.getByLabel("Maridaje")).toHaveValue(/\S/);
  const asked = page.getByRole("list", { name: "Cambios pedidos" });
  await expect(asked).toContainText("Falta el maridaje para la ficha.");
  await expect(asked).toContainText("resuelto el");
  await expect(page.getByRole("list", { name: "Historial de la solicitud" })).toContainText("Cambios pedidos");

  // Aprobar con «publicar al emitir»: al confirmarse la emisión, la colección sale publicada sola.
  await page.getByRole("button", { name: "Aprobar y emitir" }).click();
  const approve = page.getByRole("dialog", { name: "Aprobar y emitir los NFT" });
  await approve.getByRole("checkbox", { name: "Publicar al emitir" }).click();
  await approve.getByRole("button", { name: "Aprobar y emitir" }).click();
  await page.getByRole("link", { name: "Seguir la emisión en la colección" }).click();
  await expect(page.getByText("Emitiendo", { exact: true }).first()).toBeVisible();
  await settleChain(page);
  await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Preventa", { exact: true }).first()).toBeVisible();
  // La tabla de transacciones se pone al día con la emisión: nada queda «En cola».
  const txs = page.getByRole("table", { name: "Transacciones de la colección" });
  await expect(txs).toContainText("Confirmada");
  await expect(txs).not.toContainText("En cola");
  await capture(page, "07-coleccion-emisiones");
  expect(errors).toEqual([]);
});

test("faltante con vendidos: tras decidir, cada NFT vendido sin botella se resuelve a mano", async ({ page }) => {
  test.slow();
  const errors = trackErrors(page);
  await useScenario(page, "faltante-vendidos");
  await login(page, STAFF.admin);
  await nav(page, "Colecciones");
  await page
    .getByRole("alert")
    .getByRole("link", { name: /Faltan 20 botellas/ })
    .click();
  const heading = page.getByRole("heading", { name: /Cierre del lote/, level: 2 });
  await expect(heading).toContainText("Faltante sin decidir");
  await expect(
    page.getByText(/Faltan 20 botellas: 10 NFT sin vender se queman y 10 vendidos quedan sin botella/),
  ).toBeVisible();
  // Antes de decidir no se resuelve nada.
  await expect(page.getByRole("button", { name: /^Resolver/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Decidir el cierre y quemar" }).click();
  const decide = page.getByRole("dialog", { name: "Decidir el cierre del lote" });
  await decide.getByLabel("Motivo").fill("Embotellado con merma");
  await decide.getByLabel(/Escribe 10/).fill("10");
  await decide.getByRole("button", { name: "Decidir y quemar 10 NFT" }).click();
  await expect(decide).toHaveCount(0);
  await settleChain(page);
  const affected = page.getByRole("table", { name: "NFT afectados por el cierre" });
  await expect(affected.getByRole("row").filter({ hasText: "Confirmada" })).toHaveCount(10, { timeout: 20_000 });
  // Quedan los 10 vendidos, con su pedido, pendientes de resolver: el cierre sigue en curso.
  const resolveButtons = page.getByRole("button", { name: /^Resolver/ });
  await expect(resolveButtons).toHaveCount(10);
  await expect(affected).toContainText("Pagado el");
  await expect(heading).toContainText("Decidido, en curso");
  await capture(page, "25-cierre-vendidos-sin-botella");

  // Devolución del primero, con nota.
  await resolveButtons.first().click();
  const resolve = page.getByRole("dialog", { name: /Resolver la botella/ });
  await resolve.getByRole("button", { name: "Registrar la resolución" }).click();
  await expect(resolve.getByText(/Explica qué se hizo/)).toBeVisible();
  await resolve.getByLabel("Nota").fill("Importe devuelto por transferencia.");
  await settled(page);
  expect(await axe(page), "resolver un ítem").toEqual([]);
  await capture(page, "26-resolver-item");
  await resolve.getByRole("button", { name: "Registrar la resolución" }).click();
  await expect(resolve).toHaveCount(0);
  await expect(affected).toContainText("Devolución");
  await expect(affected).toContainText("Importe devuelto por transferencia.");
  await expect(resolveButtons).toHaveCount(9);

  // Sustitución del resto; con el último, el cierre queda resuelto.
  for (let left = 9; left > 0; left--) {
    await resolveButtons.first().click();
    await choose(page, "Resolución", "Sustitución por otra botella");
    await resolve.getByLabel("Nota").fill("Botella de otra añada acordada con el comprador.");
    await resolve.getByRole("button", { name: "Registrar la resolución" }).click();
    await expect(resolve).toHaveCount(0);
    await expect(resolveButtons).toHaveCount(left - 1);
  }
  await expect(heading).toContainText("Resuelto");
  await expect(affected.getByRole("row").filter({ hasText: "Sustitución" })).toHaveCount(9);
  await settled(page);
  expect(await axe(page), "cierre con vendidos resuelto").toEqual([]);
  expect(errors).toEqual([]);
});

test("cadena sin configurar: la ficha de la bodega lo avisa y el 409 se explica", async ({ page }) => {
  // Reaprovisionar responde 409 `CHN_DISABLED`: es lo esperado.
  const errors = trackErrors(page, [/^409 \/api\/v1\/platform\/wineries\/[\w-]+\/chain\/provision$/]);
  await useScenario(page, "cadena-sin-configurar");
  await login(page, STAFF.admin);
  await nav(page, "Bodegas");
  await page.getByRole("link", { name: "Bodega Altos de Calamuchita", exact: true }).click();
  await page.getByRole("tab", { name: "Cadena" }).click();
  const chain = page.getByRole("tabpanel", { name: "Cadena" });
  await expect(chain.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toContainText("Sin aprovisionar");
  const notice = chain.getByRole("alert").filter({ hasText: "La cadena no está configurada en este entorno" });
  await expect(notice).toContainText("no se puede aprovisionar la identidad de ninguna bodega");
  await settled(page);
  expect(await axe(page), "cadena sin configurar").toEqual([]);
  await capture(page, "27-cadena-sin-configurar");

  await chain.getByRole("button", { name: "Reaprovisionar" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reaprovisionar la identidad" });
  await dialog.getByLabel("Motivo").fill("Primer aprovisionamiento");
  await dialog.getByRole("button", { name: "Reaprovisionar" }).click();
  await expect(dialog).toContainText("La cadena no está configurada en este entorno");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(chain.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toContainText("Sin aprovisionar");
  expect(errors).toEqual([]);
});

test("soporte lee la tokenización y la cadena, sin ningún control de escritura", async ({ page }) => {
  // Recorre seis pantallas con recarga: margen para máquinas lentas.
  test.slow();
  const errors = trackErrors(page);
  // Nada de lo que hace soporte escribe: solo peticiones GET a las rutas de la Ola 3.
  const writes: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (
      /\/api\/v1\/platform\/(tokenization-requests|collections|chain|lot-closures)/.test(url.pathname) &&
      r.method() !== "GET"
    ) {
      writes.push(`${r.method()} ${url.pathname}`);
    }
  });
  await login(page, STAFF.support);

  // Bandeja y detalle: no puede tomar, editar, pedir cambios, aprobar ni rechazar.
  await page.goto("/tokenizacion");
  await settled(page);
  await expect(page.getByRole("note")).toContainText("Consulta en modo lectura");
  await expect(count(page, "3 solicitudes")).toBeVisible();
  await expect(page.getByRole("button", { name: /Tomar/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Singani El Molino 2026", exact: true }).click();
  await expect(h1(page, "Singani El Molino 2026")).toBeVisible();
  await settled(page);
  await expect(page.getByText(/Consulta en modo lectura: solo operaciones y administración tramitan/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Aprobar|Rechazar|Pedir cambios|Tomar|Guardar los datos|Añadir/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Precio por botella")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Revisión del lote" })).toBeVisible();
  expect(await axe(page), "solicitud (soporte)").toEqual([]);
  await capture(page, "24-soporte-solicitud");

  // Colección lista para publicar: sin publicar, editar ni cerrar.
  await page.goto("/colecciones");
  await settled(page);
  await page.getByRole("link", { name: "Singani El Portillo 2025", exact: true }).click();
  await expect(h1(page, "Singani El Portillo 2025")).toBeVisible();
  await settled(page);
  await expect(page.getByText("Lista para publicar", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Publicar|Pausar|Reanudar|Editar|Más acciones/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Cierre del lote" }).click();
  await expect(page.getByRole("button", { name: /Decidir|Resolver/ })).toHaveCount(0);
  expect(await axe(page), "colección (soporte)").toEqual([]);

  // Cadena: ve transacciones, conciliaciones y alertas; no reintenta, no concilia, no resuelve.
  await page.goto("/cadena");
  await settled(page);
  await expect(page.getByRole("note")).toContainText("Consulta en modo lectura");
  await page
    .getByRole("button", { name: /Ver la transacción/ })
    .first()
    .click();
  const tx = page.getByRole("dialog");
  await expect(tx).toContainText("Intentos e historial");
  await expect(tx.getByRole("button", { name: /Reintentar|Abandonar/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/cadena/conciliaciones");
  await settled(page);
  await expect(page.getByRole("button", { name: "Lanzar una conciliación" })).toHaveCount(0);
  await page.goto("/cadena/alertas");
  await settled(page);
  await expect(page.getByRole("button", { name: /Resolver/ })).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Ver : / })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("las alertas las resuelven operaciones y administración");
  await page.keyboard.press("Escape");

  // Identidad de la bodega: sin reaprovisionar ni pausar.
  await page.goto("/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d?pestana=cadena");
  await settled(page);
  const chain = page.getByRole("tabpanel", { name: "Cadena" });
  await expect(chain.getByRole("heading", { name: /Identidad en la red/, level: 2 })).toContainText("Activa");
  await expect(chain.getByRole("button", { name: /Pausar|Reanudar|Reaprovisionar/ })).toHaveCount(0);
  await expect(chain.getByText(/pausar o reanudar el contrato,\s+solo de administración/)).toBeVisible();
  expect(await axe(page), "identidad (soporte)").toEqual([]);

  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("⌘K lleva a las secciones nuevas y busca solicitudes de tokenización y colecciones", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.operations);
  await settled(page);
  const palette = page.getByRole("dialog", { name: "Paleta de comandos" });

  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette).toBeVisible();
  await page.keyboard.type("colecciones");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/colecciones$/);
  await expect(palette).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("cuentas y los saldos");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/cadena\/cuentas$/);

  // Búsqueda en el servidor: una solicitud abierta y una colección.
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("molino");
  await expect(palette.getByText("Ir a solicitud de tokenización…")).toBeVisible();
  await palette.getByRole("option", { name: /Singani El Molino 2026 · Destilería Cinti Viejo/ }).click();
  await expect(page).toHaveURL(/\/tokenizacion\/[\w-]+$/);
  await expect(h1(page, "Singani El Molino 2026")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("gran reserva");
  await expect(palette.getByText("Ir a colección…")).toBeVisible();
  await palette
    .getByRole("option", { name: /Singani Gran Reserva 2026/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/colecciones\/[\w-]+$/);
  expect(errors).toEqual([]);
});
