import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { STAFF, login, settled, trackErrors } from "./support";

// 4B · Configuración (mínimo legal: rechazo y excepción de administración), bitácora (exportar CSV
// y verificar la cadena) y permisos: soporte no ve acciones de escritura.

test("parámetro con mínimo legal: rechazo y excepción de administración", async ({ page }) => {
  // El rechazo del mínimo legal es un 422 esperado.
  const errors = trackErrors(page, [/^422 \/api\/v1\/platform\/settings\/.+\/overrides$/]);
  await login(page, STAFF.admin);
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await settled(page);
  await expect(page.getByRole("heading", { name: "Trazabilidad", level: 2 })).toBeVisible();
  await page.getByRole("link", { name: "Reposo mínimo tras la destilación" }).click();
  await expect(page.getByRole("heading", { name: "Reposo mínimo tras la destilación", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Añadir ajuste" }).click();
  const dialog = page.getByRole("dialog", { name: "Ajuste por bodega" });
  await dialog.getByRole("combobox", { name: "Bodegas" }).fill("Cinti");
  await page.getByRole("option", { name: /Destilería Cinti Viejo/ }).click();
  await dialog.getByRole("textbox", { name: "Valor" }).fill("150");
  await expect(dialog.getByText(/más laxo que el mínimo legal \(180 días\)/)).toBeVisible();
  await dialog.getByLabel("Motivo").fill("Ensayo de reposo corto con el ente regulador");
  await dialog.getByRole("button", { name: "Guardar el ajuste" }).click();
  // El backend lo rechaza en el campo del valor.
  await expect(dialog.getByRole("textbox", { name: "Valor" })).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText(/mínimo legal/).first()).toBeVisible();

  // Con la excepción de administración, se guarda y queda señalada.
  await dialog.getByRole("checkbox", { name: /Autorizar una excepción al mínimo legal/ }).click();
  await expect(dialog.getByText(/Vas a autorizar reglas por debajo de la norma/)).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar el ajuste" }).click();
  await expect(page.getByText("150 días en 1 bodega.", { exact: true })).toBeVisible();
  const override = page.getByRole("row").filter({ hasText: "Destilería Cinti Viejo" }).first();
  await expect(override).toContainText("Excepción legal");
  await expect(page.getByRole("table", { name: /Historial de/ })).toContainText("180 días");
  expect(errors).toEqual([]);
});

test("bitácora: filtros en la URL, exportar CSV y verificar la cadena", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.admin);
  await page.goto("/bitacora?accion=MEMBER_BLOCKED");
  await settled(page);
  const rows = page.getByRole("row");
  await expect(rows.nth(1)).toContainText("Miembro bloqueado");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bitacora-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  const lines = csv.trim().split(/\r?\n/);
  expect(lines[0]).toMatch(/^seq,occurredAt,/);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.slice(1).every((l) => l.includes("MEMBER_BLOCKED"))).toBe(true);
  await expect(page.getByText(/^Bitácora exportada: \d+ entradas? en CSV\.$/)).toBeVisible();

  await page.getByRole("button", { name: "Verificar la cadena" }).click();
  const result = page.getByRole("status").filter({ hasText: "Cadena íntegra" });
  await expect(result).toContainText(/Se comprobaron \d+ eventos/);
  expect(errors).toEqual([]);
});

test("soporte consulta pero no ve las acciones de escritura", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.support);

  await page.goto("/solicitudes?estado=RECEIVED");
  await settled(page);
  await page.getByRole("link", { name: "Vinos Artesanales Chocloca" }).click();
  await expect(page.getByRole("heading", { name: "Vinos Artesanales Chocloca", level: 1 })).toBeVisible();
  await expect(page.getByText(/modo lectura/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tomar la solicitud" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Añadir la nota" })).toHaveCount(0);

  await page.goto("/bodegas");
  await settled(page);
  await expect(page.getByRole("link", { name: "Nueva bodega" })).toHaveCount(0);
  await page.getByRole("link", { name: "Bodega Altos de Calamuchita" }).click();
  await expect(page.getByRole("heading", { name: "Bodega Altos de Calamuchita", level: 1 })).toBeVisible();
  for (const name of ["Editar el perfil", "Suspender", "Más acciones de la bodega"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }

  await page.goto("/configuracion/trazabilidad.singani.reposoMinimoDias");
  await settled(page);
  await expect(page.getByText("Solo administración cambia el estándar general.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar el estándar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Añadir ajuste" })).toHaveCount(0);

  await page.goto("/bitacora");
  await settled(page);
  await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verificar la cadena" })).toHaveCount(0);

  // En la paleta tampoco aparece el alta directa.
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("nueva bodega");
  await expect(page.getByRole("dialog", { name: "Paleta de comandos" }).getByRole("option", { name: /Nueva bodega/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
