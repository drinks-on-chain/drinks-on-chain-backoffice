import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { DEMO_PASSWORD, DEMO_TOTP_SECRET, generateTotp } from "@drinks-on-chain/mocks/fixtures";

// Utilidades de las e2e del back office contra los mocks: sesión por la interfaz con el segundo
// factor real (código TOTP generado con el secreto de demo, nunca el atajo 000000), errores de
// consola y de red, y auditoría axe (WCAG 2.1 A y AA).

export { DEMO_PASSWORD, DEMO_TOTP_SECRET, generateTotp };

export const STAFF = {
  superadmin: "gestor@drinksonchain.test",
  admin: "administracion@drinksonchain.test",
  operations: "operaciones@drinksonchain.test",
  support: "soporte@drinksonchain.test",
  notEnrolled: "analista@drinksonchain.test",
} as const;

/**
 * Al arrancar, la app intenta recuperar la sesión con la cookie de renovación
 * (`POST /api/v1/auth/refresh`): sin cookie responde 401 y es lo esperado.
 */
const BOOT_REFRESH = /^401 \/api\/v1\/auth\/refresh$/;

export function trackErrors(page: Page, expected: RegExp[] = []) {
  const allowed = [BOOT_REFRESH, ...expected];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()),
  );
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const line = `${r.status()} ${new URL(r.url()).pathname}`;
    if (!allowed.some((re) => re.test(line))) errors.push(line);
  });
  return errors;
}

/** Código TOTP válido ahora; si está a punto de cambiar, espera al siguiente paso de 30 s. */
export async function totpNow(page: Page, secret: string = DEMO_TOTP_SECRET): Promise<string> {
  const left = 30_000 - (Date.now() % 30_000);
  if (left < 3_000) await page.waitForTimeout(left + 200);
  return generateTotp(secret);
}

export async function fillCredentials(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

/** Entra como personal de plataforma con TOTP inscrito y espera al tablero. */
export async function login(page: Page, email: string = STAFF.superadmin) {
  await fillCredentials(page, email);
  await expect(page.getByRole("heading", { name: "Verificación en dos pasos" })).toBeVisible();
  await page.getByLabel("Código de verificación").fill(await totpNow(page));
  await expect(page.getByRole("heading", { name: "Tablero", level: 1 })).toBeVisible();
}

/** Espera a que la pantalla termine de cargar: un h1 visible y ningún esqueleto. */
export async function settled(page: Page) {
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator(".animate-shimmer")).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // Deja terminar las animaciones de entrada (diálogos, toasts) antes de medir contrastes.
  await page.waitForTimeout(350);
}

/** Violaciones serias o críticas de axe (las menores se revisan a mano). */
export async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1).join(" ")}`),
    }));
}
