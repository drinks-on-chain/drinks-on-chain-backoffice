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

  for (const path of [
    "/",
    "/usuarios",
    "/usuarios/permisos",
    "/perfil",
    "/solicitudes",
    "/solicitudes/a95bd787-dc58-5089-ad12-8b47afab9306",
    "/bodegas",
    "/bodegas/nueva",
    "/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d",
    "/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d?pestana=equipo",
    "/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d?pestana=lotes",
    "/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d?pestana=historial",
    "/configuracion",
    "/configuracion/trazabilidad.singani.altitudMinimaMsnm",
    "/bitacora",
    "/lista-de-espera",
    "/lista-de-espera?tipo=bodegas&estado=CONTACTED",
    // Ola 3 · 4C: tokenización, colecciones y cadena.
    "/tokenizacion",
    "/tokenizacion?estado=APPROVED",
    "/tokenizacion/6cdd52d3-6fa7-52a0-a209-fca325e999b6",
    "/tokenizacion/a8494b4d-8407-5160-86be-9f6226731095",
    "/colecciones",
    "/colecciones?vista=tabla",
    "/colecciones/20c275fc-7330-5935-911c-2c5800a0911a",
    "/colecciones/20c275fc-7330-5935-911c-2c5800a0911a?pestana=nft",
    "/colecciones/20c275fc-7330-5935-911c-2c5800a0911a?pestana=emisiones",
    "/colecciones/20c275fc-7330-5935-911c-2c5800a0911a?pestana=historial",
    "/colecciones/b2cae191-9e2f-5a4e-bfea-8e1ff140cdf0?pestana=cierre",
    "/cadena",
    "/cadena/cuentas",
    "/cadena/eventos",
    "/cadena/conciliaciones",
    "/cadena/alertas?estado=todas",
    "/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d?pestana=cadena",
    "/__mocks",
  ]) {
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

  test("diálogos de 4B: aprobar, ajuste por bodega, persona y evento de la bitácora", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, STAFF.superadmin);

    await page.goto("/solicitudes/ec224afe-19c4-5478-8f67-66f0d3fae8cf");
    await settled(page);
    await page.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Aprobar/ })).toBeVisible();
    await settled(page);
    expect(await axe(page), "aprobar").toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto("/configuracion/trazabilidad.singani.altitudMinimaMsnm");
    await settled(page);
    await page.getByRole("button", { name: "Añadir ajuste" }).click();
    await expect(page.getByRole("dialog", { name: "Ajuste por bodega" })).toBeVisible();
    await settled(page);
    expect(await axe(page), "ajuste").toEqual([]);
    await page.keyboard.press("Escape");

    await page.goto("/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d?pestana=equipo");
    await settled(page);
    await page.getByRole("button", { name: "Acciones de Rubén Flores" }).click();
    await page.getByRole("menuitem", { name: "Ver la persona" }).click();
    await expect(page.getByRole("dialog", { name: "Rubén Flores" })).toBeVisible();
    await settled(page);
    expect(await axe(page), "persona").toEqual([]);
    expect(errors).toEqual([]);
  });
});

test("bitácora y ficha con teclado: detalle del evento, Esc devuelve el foco; pestañas con flechas", async ({
  page,
}) => {
  await login(page, STAFF.admin);
  await page.goto("/bitacora");
  await settled(page);
  const eye = page.getByRole("button", { name: /Ver el evento nº/ }).first();
  await eye.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Cambios" })).toBeVisible();
  await settled(page);
  expect(await axe(page), "evento").toEqual([]);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(eye).toBeFocused();
  expect(await hasVisibleFocus(page)).toBe(true);

  await page.goto("/bodegas/04de1441-989d-5c3e-b06f-033f3961d19d");
  await settled(page);
  await page.getByRole("tab", { name: "Perfil" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Equipo/ })).toBeFocused();
  await expect(page).toHaveURL(/pestana=equipo/);
  await expect(page.getByRole("table", { name: /Miembros de/ })).toBeVisible();
});
