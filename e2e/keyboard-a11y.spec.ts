import { expect, test, type Page } from "@playwright/test";
import { STAFF, axe, login, settled, trackErrors } from "./support";

// 4A · Teclado (⌘K / Ctrl+K, "/", Tab, Esc) y auditoría axe sin violaciones serias.

/** El elemento con foco tiene un anillo visible (outline de 2 px o sombra). */
function hasVisibleFocus(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== "none";
  });
}

test("paleta de comandos con Ctrl+K y con /, solo con teclado", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await settled(page);

  // El primer Tab muestra el salto al contenido.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  expect(await hasVisibleFocus(page)).toBe(true);

  // Ctrl+K (⌘K en macOS) abre la paleta; se filtra, Intro navega y la paleta se cierra.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("usuarios internos");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/usuarios$/);
  await expect(palette).toHaveCount(0);
  await settled(page);

  // "/" también la abre; Esc la cierra.
  await page.keyboard.press("/");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);

  // Acción rápida: invitar desde la paleta abre el diálogo; Esc lo cierra.
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("invitar");
  await page.keyboard.press("Enter");
  const invite = page.getByRole("dialog", { name: "Invitar a un usuario interno" });
  await expect(invite).toBeVisible();
  // El foco queda atrapado dentro del diálogo.
  await expect(invite.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(invite).toHaveCount(0);
  await expect(page).toHaveURL(/\/usuarios$/);
  expect(errors).toEqual([]);
});

test("acciones por fila y ReasonDialog con teclado; Esc devuelve el foco", async ({ page }) => {
  await login(page, STAFF.admin);
  await page.goto("/usuarios");
  await settled(page);

  const trigger = page.getByRole("button", { name: "Acciones de Pablo Rivera" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Bloquear" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Bloquear a Pablo Rivera" });
  await expect(dialog).toBeVisible();
  // El foco empieza en el motivo.
  await expect(dialog.getByLabel("Motivo")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await hasVisibleFocus(page)).toBe(true);
});

test.describe("axe sin violaciones serias", () => {
  for (const path of [
    "/login",
    "/recuperar-contrasena",
    "/restablecer-contrasena?token=rst_demo",
    "/invitacion/demo-invitacion-soporte",
  ]) {
    test(`sin sesión ${path}`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(path);
      await settled(page);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("segundo factor: verificar e inscribir", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(STAFF.superadmin);
    await page.getByLabel("Contraseña").fill("demo1234");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
    await settled(page);
    expect(await axe(page)).toEqual([]);

    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(STAFF.notEnrolled);
    await page.getByLabel("Contraseña").fill("demo1234");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Activa la verificación en dos pasos" })).toBeVisible();
    await settled(page);
    expect(await axe(page)).toEqual([]);
  });

  for (const path of ["/", "/usuarios", "/usuarios/permisos", "/perfil", "/solicitudes", "/__mocks"]) {
    test(`con sesión ${path}`, async ({ page }) => {
      const errors = trackErrors(page);
      await login(page, STAFF.superadmin);
      await page.goto(path);
      await settled(page);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await axe(page), path).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("diálogos: invitar, cambiar el rol y paleta", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, STAFF.superadmin);
    await page.goto("/usuarios?invitar=1");
    await expect(page.getByRole("dialog", { name: "Invitar a un usuario interno" })).toBeVisible();
    await settled(page);
    expect(await axe(page), "invitar").toEqual([]);

    await page.goto("/usuarios");
    await settled(page);
    await page.getByRole("button", { name: "Acciones de Pablo Rivera" }).click();
    await page.getByRole("menuitem", { name: "Cambiar el rol" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await settled(page);
    expect(await axe(page), "cambiar rol").toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog", { name: "Paleta de comandos" })).toBeVisible();
    await settled(page);
    expect(await axe(page), "paleta").toEqual([]);
    expect(errors).toEqual([]);
  });
});
