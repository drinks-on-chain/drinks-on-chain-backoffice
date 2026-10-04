import { expect, test, type Page } from "@playwright/test";
import { STAFF, axe, login, settled, trackErrors } from "./support";

// Ola 2 · La plataforma solo lee la trazabilidad (contrato de la Ola 2 §14, §17 y §20): pestaña
// «Lotes» de la ficha de bodega (9 lotes de la Destilería Cinti Viejo en los mocks 0.5) y aviso de
// las reglas de lote en Configuración.

const CINTI_VIEJO = "/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d";
const INVITED = "/bodegas/140bd695-7a59-5480-811c-38ce57cdd80f";

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });
const results = (page: Page, text: string) => page.getByText(text, { exact: true });

test("pestaña «Lotes» de la ficha de bodega: solo lectura, filtros en la URL y pasaporte público", async ({ page }) => {
  // Todas las columnas (el candado aparece desde 1440 px y el laboratorio desde 1600 px).
  await page.setViewportSize({ width: 1600, height: 900 });
  const errors = trackErrors(page);
  // Nada de lo que hace la pestaña escribe: solo peticiones GET a los lotes.
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/lots") && r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
  });

  // Soporte ve la ficha y, por tanto, los lotes.
  await login(page, STAFF.support);
  await page.goto(CINTI_VIEJO);
  await settled(page);
  await page.getByRole("tab", { name: "Lotes" }).click();
  await expect(page).toHaveURL(/pestana=lotes$/);
  const panel = page.getByRole("tabpanel", { name: "Lotes" });
  await expect(panel.getByRole("heading", { name: "Lotes", level: 2 })).toBeVisible();
  await expect(panel.getByText(/Solo lectura: la trazabilidad la registra la bodega en el ERP/)).toBeVisible();
  await expect(results(page, "9 lotes")).toBeVisible();
  for (const name of [
    "Referencia",
    "Nombre",
    "Tipo",
    "Etapa",
    "Candado siguiente",
    "Botellas",
    "Laboratorio",
    "Código de lote",
    "Incidencias abiertas",
  ]) {
    await expect(panel.getByRole("columnheader", { name })).toBeVisible();
  }

  // El caso del contrato: certificado, conforme, con su código de lote y el enlace al pasaporte.
  const certified = row(page, "CVJ-L2026-005");
  await expect(certified).toContainText("Singani Gran Reserva 2026");
  await expect(certified).toContainText("Singani");
  await expect(certified).toContainText("Certificado");
  await expect(certified).toContainText("2.950");
  await expect(certified).toContainText("Conforme");
  await expect(certified).toContainText("CVJ-2026-SINGANI-004");
  const passport = certified.getByRole("link", { name: /Ver pasaporte público de CVJ-2026-SINGANI-004/ });
  await expect(passport).toHaveAttribute("href", "http://localhost:3005/b/CVJ-2026-SINGANI-004");
  await expect(passport).toHaveAttribute("target", "_blank");

  // Un lote en reposo muestra su candado; sin código de lote no hay pasaporte.
  const resting = row(page, "CVJ-L2026-001");
  await expect(resting).toContainText(/Reposo hasta el 13 oct 2026\s*Faltan \d+ días/);
  await expect(resting).toContainText("Sin análisis");
  await expect(resting.getByRole("link")).toHaveCount(0);
  await settled(page);
  expect(await axe(page), "lotes").toEqual([]);

  // Filtro por etapa y búsqueda, en la URL.
  await page.getByRole("combobox", { name: "Etapa" }).click();
  await page.getByRole("option", { name: "Embotellado" }).click();
  await expect(page).toHaveURL(/pestana=lotes&etapa=BOTTLED$/);
  await expect(results(page, "3 lotes")).toBeVisible();
  await expect(row(page, "CVJ-L2026-005")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Buscar" }).fill("gran reserva");
  await expect(page).toHaveURL(/etapa=BOTTLED&q=gran\+reserva$/);
  await expect(page.getByText("Ningún lote coincide", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Limpiar filtros" }).last().click();
  await expect(page).toHaveURL(/pestana=lotes$/);
  await expect(results(page, "9 lotes")).toBeVisible();

  await page.getByRole("searchbox", { name: "Buscar" }).fill("wine-003");
  await expect(results(page, "1 lote")).toBeVisible();
  await expect(row(page, "CVJ-L2025-003")).toContainText("CVJ-2026-WINE-003");

  // Ninguna acción de escritura: ni botones en las filas ni acciones sobre el lote.
  await expect(panel.getByRole("table").getByRole("button")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: /nuevo|crear|editar|descartar|embotellar|corregir|anular|cerrar/i }),
  ).toHaveCount(0);

  // Al cambiar de pestaña los filtros de los lotes no acompañan; con el teclado se vuelve a ella.
  await page.getByRole("tab", { name: /Equipo/ }).click();
  await expect(page).toHaveURL(/pestana=equipo$/);
  await page.getByRole("tab", { name: /Equipo/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Lotes" })).toBeFocused();
  await expect(page).toHaveURL(/pestana=lotes$/);
  await expect(results(page, "9 lotes")).toBeVisible();

  // Una bodega invitada todavía no tiene lotes.
  await page.goto(`${INVITED}?pestana=lotes`);
  await settled(page);
  await expect(page.getByText("Esta bodega aún no tiene lotes", { exact: true })).toBeVisible();

  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("configuración: las reglas de lote avisan de que solo afectan a los lotes nuevos", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.admin);
  await page.goto("/configuracion");
  await settled(page);

  // Un aviso, en el grupo de la trazabilidad.
  const notice = page.getByRole("note").filter({ hasText: "Solo afecta a los lotes nuevos" });
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText("los lotes existentes conservan la instantánea de reglas con la que nacieron");

  // En cada regla de lote (reposo, crianza mínima, altitud, cepas, mermas, límites de laboratorio).
  for (const key of [
    "trazabilidad.singani.reposoMinimoDias",
    "trazabilidad.vino.crianzaMinimaMeses",
    "trazabilidad.singani.altitudMinimaMsnm",
    "trazabilidad.singani.variedadesExigidas",
    "trazabilidad.embotellado.mermaMaximaPorcentaje",
    "trazabilidad.laboratorio.limites",
  ]) {
    await page.goto(`/configuracion/${key}`);
    await settled(page);
    await expect(notice, key).toHaveCount(1);
    await expect(notice).toContainText("solo afecta a los lotes que se creen después");
  }
  expect(await axe(page), "regla de lote").toEqual([]);

  // Un parámetro operativo se aplica de inmediato: sin aviso.
  await page.goto("/configuracion/invitacion.caducidadHoras");
  await settled(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(errors).toEqual([]);
});
