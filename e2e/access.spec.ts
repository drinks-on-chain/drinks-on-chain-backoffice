import { expect, test } from "@playwright/test";
import { demoStaff } from "@drinks-on-chain/mocks/fixtures";
import { STAFF, fillCredentials, login, totpNow, trackErrors } from "./support";

// 4A · Acceso: login con TOTP generado con el secreto de demo, código de recuperación,
// inscripción de la analista, guardia de audiencia y cierre de sesión.

test("sin sesión, la portada lleva al login", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("login del superusuario con el código TOTP de su app", async ({ page }) => {
  const errors = trackErrors(page, [/^401 \/api\/v1\/auth\/mfa\/verify$/]);
  await fillCredentials(page, STAFF.superadmin);
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();

  // Un código incorrecto se marca en el campo y no deja entrar.
  await page.getByLabel("Código de verificación").fill("000001");
  await expect(page.getByText(/El código no es válido/)).toBeVisible();
  await expect(page.getByLabel("Código de verificación")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Código de verificación").fill(await totpNow(page));
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  await expect(page.getByText("Ana Gutiérrez").first()).toBeVisible();
  // El acceso no se guarda en el almacenamiento del navegador.
  expect(await page.evaluate(() => sessionStorage.getItem("doc.session"))).toBeNull();

  // La recarga mantiene la sesión (cookie de renovación) sin volver a pedir el TOTP.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("entrar con un código de recuperación", async ({ page }) => {
  const errors = trackErrors(page);
  const admin = demoStaff.find((u) => u.email === STAFF.admin)!;
  await fillCredentials(page, STAFF.admin);
  await page.getByRole("button", { name: "Usar un código de recuperación" }).click();
  await page.getByLabel("Código de recuperación").fill(admin.mfa!.recoveryCodes[0]!.toLowerCase());
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("la analista inscribe el TOTP, guarda sus códigos y entra", async ({ page }) => {
  const errors = trackErrors(page);
  await fillCredentials(page, STAFF.notEnrolled);
  await expect(page.getByRole("heading", { name: "Activa la verificación en dos pasos" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR/ })).toBeVisible();

  // La clave se lee de la pantalla, como haría quien la teclea en su app.
  const secret = (await page.getByLabel("Clave para escribirla a mano").inputValue()).replace(/\s+/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel("Código de verificación").fill(await totpNow(page, secret));

  await expect(page.getByRole("heading", { name: "Guarda tus códigos de recuperación" })).toBeVisible();
  const enter = page.getByRole("button", { name: "Entrar al back office" });
  await expect(enter).toBeDisabled();
  await expect(page.getByText(/^[0-9A-F]{4}-[0-9A-F]{4}$/)).toHaveCount(10);
  await page.getByLabel("He guardado los códigos en un lugar seguro").check();
  await enter.click();
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
  await expect(page.getByText("Camila Torrez").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("una cuenta sin membresía de plataforma no entra y se le ofrece el ERP", async ({ page }) => {
  const errors = trackErrors(page);
  await fillCredentials(page, "enologa@cintiviejo.test");
  await expect(page.getByRole("heading", { name: "Este acceso no es para el back office" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir el ERP" })).toHaveAttribute("href", "http://localhost:3002/");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("cerrar sesión revoca la sesión: la recarga ya no entra", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /Menú de usuario/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("recuperar la contraseña desde el enlace del buzón simulado", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.getByLabel("Correo electrónico").fill(STAFF.support);
  await page.getByRole("button", { name: "Enviar el enlace" }).click();
  await expect(page.getByText(/te llegará un enlace/)).toBeVisible();

  await page.goto("/__mocks");
  await page.getByLabel("Filtrar por destinatario").fill(STAFF.support);
  const row = page.getByRole("row").filter({ hasText: "PASSWORD_RESET" }).first();
  await row.getByRole("link", { name: /Abrir/ }).click();
  await expect(page).toHaveURL(/\/restablecer-contrasena\?token=/);

  await page.getByLabel("Contraseña nueva").fill("corta");
  await page.getByLabel("Repite la contraseña").fill("corta");
  await page.getByRole("button", { name: "Guardar la contraseña" }).click();
  await expect(page.getByLabel("Contraseña nueva")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Contraseña nueva").fill("vendimia-2026");
  await page.getByLabel("Repite la contraseña").fill("vendimia-2026");
  await page.getByRole("button", { name: "Guardar la contraseña" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await fillCredentials(page, STAFF.support, "vendimia-2026");
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  expect(errors.filter((e) => !/^422 \/api\/v1\/auth\/reset-password$/.test(e))).toEqual([]);
});
