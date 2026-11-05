import { defineConfig, devices } from "@playwright/test";

// Dos modos:
// - Por defecto, las pruebas de flujo contra los mocks (sin backend), puerto 3103.
// - `E2E_REAL_API=1`: solo `backend-real.spec.ts` contra el backend de `E2E_API_ORIGIN`, puerto
//   3113. Los secretos (`E2E_PASSWORD`, `E2E_TOTP_SECRET`) llegan por el entorno; sin trazas,
//   capturas ni vídeos, que podrían contenerlos.
const REAL = process.env.E2E_REAL_API === "1";
const PORT = Number(process.env.E2E_PORT ?? (REAL ? 3113 : 3103));
// En local se usa el Chrome instalado; en CI, el Chromium que instala Playwright.
const channel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "./e2e",
  testMatch: REAL ? "backend-real*.spec.ts" : "*.spec.ts",
  testIgnore: REAL ? undefined : "backend-real*.spec.ts",
  fullyParallel: !REAL,
  workers: REAL ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  // Contra el backend real no se reintenta: el recorrido crea datos y un reintento los duplicaría.
  retries: process.env.CI && !REAL ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // MSW arranca en el navegador y la sesión se recupera al cargar: margen para máquinas cargadas.
  expect: { timeout: REAL ? 20_000 : 10_000 },
  // Los recorridos entran con segundo factor y visitan varias pantallas: margen para máquinas lentas.
  timeout: REAL ? 180_000 : 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-BO",
    trace: REAL ? "off" : "retain-on-failure",
    actionTimeout: REAL ? 30_000 : 0,
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "escritorio", use: { ...devices["Desktop Chrome"], channel } }],
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // El ERP se ofrece a quien también es miembro de una bodega; el Marketplace (`URL_APP`) da el
    // enlace al pasaporte público de un lote.
    env: REAL
      ? {
          NEXT_PUBLIC_MOCKS: "0",
          API_ORIGIN: process.env.E2E_API_ORIGIN ?? "",
          NEXT_PUBLIC_URL_ERP: "http://localhost:3002",
        }
      : {
          NEXT_PUBLIC_MOCKS: "1",
          NEXT_PUBLIC_URL_ERP: "http://localhost:3002",
          NEXT_PUBLIC_URL_APP: "http://localhost:3005",
        },
  },
});
