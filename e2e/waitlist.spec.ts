import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { STAFF, axe, login, settled, trackErrors } from "./support";

// O1b · Lista de espera contra los mocks 0.4.1 (38 consumidores y 14 bodegas): tarjeta del tablero,
// pestañas y filtros en la URL, detalle con seguimiento (contactar con nota, volver a nuevo),
// exportación CSV con los filtros activos y soporte en solo lectura.

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const results = (page: Page, text: string) => page.getByText(text, { exact: true });

/**
 * Cierra el panel con Esc. Con un aviso (toast) a la vista, el primer Esc descarta el aviso —es la
 * capa superior— y el siguiente cierra el panel.
 */
async function closeWithEscape(page: Page, panel: Locator, notice: string) {
  await page.keyboard.press("Escape");
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
}

test("del tablero a la lista: pestañas, filtro por origen y contactar con nota", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.operations);
  await settled(page);

  // Tarjeta del tablero: total, desglose por tipo y enlace a la pantalla.
  const card = page.getByRole("region", { name: "Indicadores" });
  await expect(card.getByRole("link", { name: /^38 consumidores/ })).toBeVisible();
  await expect(card.getByRole("link", { name: /^14 bodegas/ })).toHaveAttribute(
    "href",
    "/lista-de-espera?tipo=bodegas",
  );
  await card.getByRole("link", { name: "Ver la lista de espera" }).click();
  await expect(page.getByRole("heading", { name: "Lista de espera", level: 1 })).toBeVisible();
  await settled(page);

  // Pestaña de consumidores: la más reciente primero, paginada.
  const consumers = page.getByRole("tab", { name: "Consumidores (38)" });
  const wineries = page.getByRole("tab", { name: "Bodegas (14)" });
  await expect(consumers).toHaveAttribute("aria-selected", "true");
  await expect(results(page, "38 inscripciones")).toBeVisible();
  await expect(page.getByRole("row").nth(1)).toContainText("Julio César Molina");
  await page.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(row(page, "Lucía Fernández Rojas")).toBeVisible();

  // Pestaña de bodegas: otra tabla, y la URL lo recuerda (sin la página anterior).
  await wineries.click();
  await expect(page).toHaveURL(/\/lista-de-espera\?tipo=bodegas$/);
  await expect(wineries).toHaveAttribute("aria-selected", "true");
  await expect(results(page, "14 inscripciones")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Bodega" })).toBeVisible();
  await expect(page.getByRole("row").nth(1)).toContainText("Bodega Cepas de San Roque");

  // Filtro por origen, con el recuento de cada uno; «sin origen» no es una opción.
  await page.getByRole("combobox", { name: "Origen" }).click();
  await expect(page.getByRole("option")).toHaveText(["Todos", "tarija-2026 (7)", "boletin (1)", "instagram (1)"]);
  await page.getByRole("option", { name: "tarija-2026 (7)" }).click();
  await expect(page).toHaveURL(/tipo=bodegas&origen=tarija-2026$/);
  await expect(results(page, "7 inscripciones")).toBeVisible();
  await expect(row(page, "Bodega Cepas de San Roque")).toHaveCount(0);
  await settled(page);
  expect(await axe(page), "lista").toEqual([]);

  // Detalle: datos, enlaces de correo y de WhatsApp y seguimiento.
  const eye = page.getByRole("button", { name: "Ver la inscripción de Viñedos Pampa Grande de Camargo" });
  await eye.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Viñedos Pampa Grande de Camargo" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "pampagrande@example.com" })).toHaveAttribute(
    "href",
    "mailto:pampagrande@example.com",
  );
  await expect(panel.getByRole("link", { name: /\+591 73597564/ })).toHaveAttribute(
    "href",
    "https://wa.me/59173597564",
  );
  await expect(panel.getByText("Aceptó ser contactado el")).toBeVisible();
  await expect(panel.getByText("Aún no", { exact: true })).toBeVisible();
  await settled(page);
  expect(await axe(page), "detalle").toEqual([]);

  // Marcar como contactado con una nota: un solo cambio, con quién y cuándo.
  await panel.getByLabel("Notas internas").fill("Llamada hecha: envían la ficha de la bodega esta semana.");
  await panel.getByRole("button", { name: "Marcar como contactado" }).click();
  await expect(page.getByText("Inscripción marcada como contactada.", { exact: true })).toBeVisible();
  await expect(panel.getByText("Contactada", { exact: true }).first()).toBeVisible();
  await expect(panel).toContainText("Valeria Méndez");
  await expect(panel.getByRole("button", { name: "Marcar como contactado" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Volver a nuevo" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Descartar" })).toBeVisible();

  // Esc cierra y devuelve el foco; la fila y el filtro por estado lo reflejan.
  await closeWithEscape(page, panel, "Inscripción marcada como contactada.");
  await expect(eye).toBeFocused();
  await expect(row(page, "Viñedos Pampa Grande de Camargo")).toContainText("Contactada");
  await page.getByRole("combobox", { name: "Estado" }).click();
  await page.getByRole("option", { name: "Contactada" }).click();
  await expect(page).toHaveURL(/estado=CONTACTED/);
  await expect(results(page, "4 inscripciones")).toBeVisible();

  // La nota quedó guardada; volver a nuevo borra quién la contactó.
  await eye.click();
  await expect(panel.getByLabel("Notas internas")).toHaveValue(
    "Llamada hecha: envían la ficha de la bodega esta semana.",
  );
  await panel.getByRole("button", { name: "Volver a nuevo" }).click();
  await expect(page.getByText("La inscripción vuelve a estar como nueva.", { exact: true })).toBeVisible();
  await expect(panel.getByText("Aún no", { exact: true })).toBeVisible();
  await closeWithEscape(page, panel, "La inscripción vuelve a estar como nueva.");
  await expect(results(page, "3 inscripciones")).toBeVisible();

  // Pestañas con el teclado: las flechas cambian de pestaña y quitan el filtro de origen.
  await wineries.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(consumers).toBeFocused();
  await expect(consumers).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/lista-de-espera\?estado=CONTACTED$/);
  await expect(results(page, "5 inscripciones")).toBeVisible();
  expect(errors).toEqual([]);
});

test("exporta el CSV con los filtros activos", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.admin);
  await page.goto("/lista-de-espera?tipo=bodegas&origen=tarija-2026");
  await settled(page);
  await expect(results(page, "7 inscripciones")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  // El nombre es el del `Content-Disposition` del backend.
  expect(download.suggestedFilename()).toMatch(/^lista-de-espera-\d{8}-\d{4}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  const lines = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
  expect(lines[0]).toMatch(/^position,type,status,fullName,email,/);
  expect(lines).toHaveLength(8);
  expect(lines.slice(1).every((l) => l.includes(",WINERY,") && l.includes("tarija-2026"))).toBe(true);
  await expect(page.getByText("Lista de espera exportada: 7 inscripciones en CSV.", { exact: true })).toBeVisible();

  // La exportación queda en la bitácora.
  await page.goto("/bitacora?accion=WAITLIST_EXPORTED");
  await settled(page);
  await expect(page.getByRole("row").nth(1)).toContainText("Lista de espera exportada");
  expect(errors).toEqual([]);
});

test("soporte consulta la lista sin acciones de edición ni de exportación", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.support);
  await page.getByRole("link", { name: "Lista de espera", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lista de espera", level: 1 })).toBeVisible();
  await settled(page);
  await expect(page.getByText(/modo lectura/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar CSV" })).toHaveCount(0);
  await expect(results(page, "38 inscripciones")).toBeVisible();

  // Búsqueda con espera, reflejada en la URL.
  await page.getByRole("tab", { name: "Bodegas (14)" }).click();
  await page.getByRole("searchbox", { name: "Buscar" }).fill("parral");
  await expect(page).toHaveURL(/tipo=bodegas&q=parral$/);
  await expect(results(page, "1 inscripción")).toBeVisible();

  await page.getByRole("button", { name: "Ver la inscripción de Bodega Parral del Abuelo" }).click();
  const panel = page.getByRole("dialog", { name: "Bodega Parral del Abuelo" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Valeria Méndez");
  await expect(panel).toContainText("Llamada hecha: interesados");
  await expect(panel.getByText(/Solo operaciones y administración cambian el estado/)).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  for (const name of ["Marcar como contactado", "Descartar", "Volver a nuevo", "Guardar notas"]) {
    await expect(panel.getByRole("button", { name })).toHaveCount(0);
  }
  await settled(page);
  expect(await axe(page), "detalle en solo lectura").toEqual([]);
  expect(errors).toEqual([]);
});
