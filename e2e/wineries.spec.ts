import { expect, test, type Page } from "@playwright/test";
import { STAFF, login, settled, trackErrors } from "./support";

// 4B · Bodegas: alta directa con invitación al dueño, suspender con motivo y verlo en la
// bitácora, equipo de cualquier bodega (bloquear a un miembro) y bloqueo de la cuenta completa.

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

async function openWinery(page: Page, name: string) {
  await page.goto(`/bodegas?q=${encodeURIComponent(name)}`);
  await settled(page);
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test("alta directa: bodega invitada con la invitación del dueño", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.operations);
  await page.getByRole("link", { name: "Bodegas", exact: true }).click();
  await settled(page);
  await page.getByRole("link", { name: "Nueva bodega" }).click();
  await expect(page.getByRole("heading", { name: "Nueva bodega", level: 1 })).toBeVisible();

  // Sin datos no se envía: el foco va al primer campo con error.
  await page.getByRole("button", { name: "Dar de alta e invitar al dueño" }).click();
  await expect(page.getByLabel("Razón social")).toBeFocused();

  await page.getByLabel("Razón social").fill("Bodega La Cañada S.R.L.");
  await page.getByLabel("Nombre comercial").fill("Bodega La Cañada");
  await page.getByRole("textbox", { name: "NIT", exact: true }).fill("7012345678");
  await page.getByLabel("Región").fill("Valle Central de Tarija · Uriondo");
  await page.getByRole("textbox", { name: "Correo de contacto", exact: true }).fill("contacto@lacanada.test");
  await page.getByLabel("Nombre del dueño").fill("Rosa Mamani");
  await page.getByLabel("Correo del dueño").fill("rosa@lacanada.test");
  await page.getByLabel("Motivo").fill("Bodega conocida en la feria de Uriondo");
  await page.getByRole("button", { name: "Dar de alta e invitar al dueño" }).click();

  await expect(page.getByText("Bodega La Cañada dada de alta. Invitación enviada a rosa@lacanada.test.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/bodegas\/[^/]+\?pestana=equipo$/);
  await expect(page.getByRole("heading", { name: "Bodega La Cañada", level: 1 })).toBeVisible();
  await expect(page.getByText("Invitada", { exact: true }).first()).toBeVisible();
  await expect(row(page, "rosa@lacanada.test")).toContainText("Pendiente");
  await expect(row(page, "rosa@lacanada.test")).toContainText("Dueño");
  expect(errors).toEqual([]);
});

test("suspender con motivo y ver la entrada en la bitácora", async ({ page }) => {
  const errors = trackErrors(page);
  const reason = "Auditoría de trazabilidad pendiente";
  await login(page, STAFF.operations);
  await openWinery(page, "Bodega Altos de Calamuchita");

  await page.getByRole("button", { name: "Suspender" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Suspender Bodega Altos de Calamuchita" });
  await dialog.getByLabel("Motivo").fill(reason);
  await dialog.getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByText("Bodega Altos de Calamuchita quedó suspendida.", { exact: true })).toBeVisible();
  await expect(page.getByText("Suspendida", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reactivar" })).toBeVisible();

  await page.getByRole("tab", { name: "Historial" }).click();
  await expect(page.getByRole("list", { name: "Historial de estados" }).getByRole("listitem").first()).toContainText(
    `Motivo: «${reason}»`,
  );

  await page.getByRole("link", { name: "Ver la bitácora de esta bodega" }).click();
  await expect(page).toHaveURL(/\/bitacora\?organizacion=/);
  await settled(page);
  const first = page.getByRole("row").nth(1);
  await expect(first).toContainText("Bodega suspendida");
  await expect(first).toContainText(reason);
  await first.getByRole("button", { name: /Ver el evento/ }).click();
  const panel = page.getByRole("dialog", { name: "Bodega suspendida" });
  await expect(panel.getByRole("row", { name: /status/ })).toContainText("ACTIVE");
  await expect(panel.getByRole("row", { name: /status/ })).toContainText("SUSPENDED");
  await expect(panel).toContainText(`«${reason}»`);
  expect(errors).toEqual([]);
});

test("bloquear a un miembro de una bodega y la cuenta completa de una persona", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.admin);
  await openWinery(page, "Destilería Cinti Viejo");
  await page.getByRole("tab", { name: /Equipo/ }).click();

  // Bloqueo en la bodega (motivo obligatorio).
  await row(page, "Rubén Flores").getByRole("button", { name: "Acciones de Rubén Flores" }).click();
  await page.getByRole("menuitem", { name: "Bloquear en esta bodega" }).click();
  const block = page.getByRole("alertdialog", { name: /Bloquear a Rubén Flores/ });
  await block.getByRole("button", { name: "Bloquear" }).click();
  await expect(block.getByText(/mínimo 3 caracteres/)).toBeVisible();
  await block.getByLabel("Motivo").fill("Uso de la cuenta de otra persona");
  await block.getByRole("button", { name: "Bloquear" }).click();
  await expect(page.getByText("Rubén Flores quedó bloqueado en Destilería Cinti Viejo.", { exact: true })).toBeVisible();
  await expect(row(page, "Rubén Flores")).toContainText("Bloqueado por la plataforma");

  // Cuenta completa desde la persona (solo administración).
  await row(page, "Ing. Tomás Flores").getByRole("button", { name: "Acciones de Ing. Tomás Flores" }).click();
  await page.getByRole("menuitem", { name: "Ver la persona" }).click();
  const person = page.getByRole("dialog", { name: "Ing. Tomás Flores" });
  await expect(person).toContainText("Cuenta activa");
  await person.getByRole("button", { name: "Bloquear la cuenta completa" }).click();
  const account = page.getByRole("alertdialog", { name: /Bloquear la cuenta completa/ });
  await account.getByLabel("Motivo").fill("Credenciales filtradas");
  await account.getByRole("button", { name: "Bloquear la cuenta" }).click();
  await expect(page.getByText("Cuenta de Ing. Tomás Flores bloqueada.", { exact: true })).toBeVisible();

  await row(page, "Ing. Tomás Flores").getByRole("button", { name: "Acciones de Ing. Tomás Flores" }).click();
  await page.getByRole("menuitem", { name: "Ver la persona" }).click();
  await expect(page.getByRole("dialog", { name: "Ing. Tomás Flores" })).toContainText("Cuenta bloqueada");
  await expect(page.getByRole("dialog", { name: "Ing. Tomás Flores" })).toContainText("Credenciales filtradas");
  expect(errors).toEqual([]);
});
