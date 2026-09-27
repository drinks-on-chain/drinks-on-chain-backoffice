import { expect, test, type Page } from "@playwright/test";
import { STAFF, login, settled, totpNow, trackErrors } from "./support";

// 4A · Usuarios internos: invitar y aceptar desde el buzón simulado, bloquear con motivo (y verlo en
// la bitácora del tablero), protección del superusuario, permisos por rol y matriz.

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test("invitar a un usuario interno y aceptarlo desde el enlace del buzón", async ({ page }) => {
  const errors = trackErrors(page);
  const email = "nueva.soporte@drinksonchain.test";
  await login(page, STAFF.admin);
  await page.getByRole("link", { name: "Usuarios internos" }).click();
  await settled(page);

  await page.getByRole("button", { name: "Invitar usuario interno" }).click();
  const dialog = page.getByRole("dialog", { name: "Invitar a un usuario interno" });
  await dialog.getByLabel("Correo electrónico").fill(email);
  await dialog.getByRole("combobox", { name: "Rol" }).click();
  await page.getByRole("option", { name: "Soporte" }).click();
  await dialog.getByLabel("Motivo").fill("Refuerzo de soporte para la vendimia");
  await dialog.getByRole("button", { name: "Enviar la invitación" }).click();
  await expect(page.getByText(`Invitación enviada a ${email}.`, { exact: true })).toBeVisible();
  await expect(row(page, email)).toContainText("Invitado");

  // El correo llega al buzón simulado; su enlace abre /invitacion/{token} en esta misma app.
  await page.goto("/__mocks");
  await page.getByLabel("Filtrar por destinatario").fill(email);
  await row(page, "INVITATION").getByRole("link", { name: /Abrir/ }).click();
  await expect(page).toHaveURL(/\/invitacion\//);

  // Con la sesión de administración abierta, hay que salir para crear la cuenta nueva.
  await expect(page.getByText(/Has iniciado sesión como administracion@drinksonchain.test/)).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión y continuar" }).click();
  await page.getByLabel("Nombre completo").fill("Rocío Vargas");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("vendimia-2026");
  await page.getByLabel("Repite la contraseña").fill("vendimia-2026");
  await page.getByRole("button", { name: "Crear la cuenta y aceptar" }).click();

  // El personal de plataforma entra siempre con segundo factor: inscripción y códigos.
  await expect(page.getByRole("heading", { name: "Activa la verificación en dos pasos" })).toBeVisible();
  const secret = (await page.getByLabel("Clave para escribirla a mano").inputValue()).replace(/\s+/g, "");
  await page.getByLabel("Código de verificación").fill(await totpNow(page, secret));
  await page.getByLabel("He guardado los códigos en un lugar seguro").check();
  await page.getByRole("button", { name: "Entrar al back office" }).click();
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  await expect(page.getByText("Rocío Vargas").first()).toBeVisible();
  await expect(page.getByText("Soporte · Drinks on Chain")).toBeVisible();
  expect(errors).toEqual([]);
});

test("bloquear con motivo y verlo en la bitácora del tablero", async ({ page }) => {
  const errors = trackErrors(page);
  const reason = "Salida del equipo de soporte";
  await login(page, STAFF.superadmin);
  await page.goto("/usuarios");
  await settled(page);

  await row(page, "Pablo Rivera").getByRole("button", { name: "Acciones de Pablo Rivera" }).click();
  await page.getByRole("menuitem", { name: "Bloquear" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Bloquear a Pablo Rivera" });
  // Sin motivo no se puede.
  await dialog.getByRole("button", { name: "Bloquear" }).click();
  await expect(dialog.getByText(/mínimo 3 caracteres/)).toBeVisible();
  await dialog.getByLabel("Motivo").fill(reason);
  await dialog.getByRole("button", { name: "Bloquear" }).click();
  await expect(page.getByText("Pablo Rivera quedó bloqueado.", { exact: true })).toBeVisible();
  await expect(row(page, "Pablo Rivera")).toContainText("Bloqueado");
  await expect(row(page, "Pablo Rivera")).toContainText(reason);

  await page.getByRole("link", { name: "Tablero" }).click();
  const activity = page.getByRole("list", { name: "Actividad reciente" });
  await expect(activity.getByRole("listitem").first()).toContainText("Usuario interno bloqueado");
  await expect(activity.getByRole("listitem").first()).toContainText(`Motivo: «${reason}»`);

  // Y se puede filtrar la lista por estado desde la URL.
  await page.goto("/usuarios?estado=BLOCKED");
  await settled(page);
  await expect(row(page, "Pablo Rivera")).toBeVisible();
  await expect(row(page, "Ana Gutiérrez")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("el superusuario está protegido y nadie actúa sobre sí mismo", async ({ page }) => {
  await login(page, STAFF.admin);
  await page.goto("/usuarios");
  await settled(page);
  const superadmin = row(page, "Ana Gutiérrez");
  await expect(superadmin).toContainText("Protegido");
  // Solo se le puede enviar un enlace de contraseña: ni bloquear, ni cambiar el rol, ni el TOTP.
  await superadmin.getByRole("button", { name: "Acciones de Ana Gutiérrez" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Enviar enlace de contraseña"]);
  await page.keyboard.press("Escape");
  // Jorge (administración) no puede cambiar su rol ni bloquearse.
  const self = row(page, "Jorge Salinas");
  await expect(self).toContainText("(tú)");
  await expect(self.getByRole("button", { name: /Acciones de/ })).toHaveCount(0);
});

test("operaciones no gestiona usuarios internos, pero lee la matriz de permisos", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.operations);
  await page.goto("/usuarios");
  await expect(page.getByText("Solo administración gestiona los usuarios internos.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invitar usuario interno" })).toHaveCount(0);

  await page.getByRole("link", { name: "Matriz de permisos" }).first().click();
  const matrix = page.getByRole("table", { name: "Capacidades por rol" });
  await expect(matrix).toBeVisible();
  await expect(matrix.getByRole("rowheader", { name: /Usuarios internos/ })).toBeVisible();
  await expect(matrix.getByRole("columnheader", { name: /Operaciones/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("cambiar el rol y restablecer el segundo factor con motivo", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, STAFF.admin);
  await page.goto("/usuarios");
  await settled(page);

  await row(page, "Valeria Méndez").getByRole("button", { name: "Acciones de Valeria Méndez" }).click();
  await page.getByRole("menuitem", { name: "Cambiar el rol" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cambiar el rol de Valeria Méndez" });
  await dialog.getByRole("combobox", { name: "Rol nuevo" }).click();
  await page.getByRole("option", { name: "Soporte" }).click();
  await dialog.getByLabel("Motivo").fill("Pasa al turno de soporte");
  await dialog.getByRole("button", { name: "Cambiar el rol" }).click();
  await expect(page.getByText("Rol de Valeria Méndez cambiado.", { exact: true })).toBeVisible();
  await expect(row(page, "Valeria Méndez")).toContainText("Soporte");

  await row(page, "Valeria Méndez").getByRole("button", { name: "Acciones de Valeria Méndez" }).click();
  await page.getByRole("menuitem", { name: "Restablecer el segundo factor" }).click();
  const reset = page.getByRole("alertdialog", { name: /Restablecer el segundo factor/ });
  await reset.getByLabel("Motivo").fill("Cambió de teléfono");
  await reset.getByRole("button", { name: "Restablecer" }).click();
  await expect(row(page, "Valeria Méndez")).toContainText("Sin inscribir");
  expect(errors).toEqual([]);
});
