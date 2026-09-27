import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3103);
// En local se usa el Chrome instalado; en CI, el Chromium que instala Playwright.
const channel = process.env.CI ? undefined : "chrome";

// Las pruebas de flujo corren siempre contra los mocks (sin backend).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // MSW arranca en el navegador y la sesión se recupera al cargar: margen para máquinas cargadas.
  expect: { timeout: 10_000 },
  // Los recorridos entran con segundo factor y visitan varias pantallas: margen para máquinas lentas.
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-BO",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], channel } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // El ERP se ofrece a quien también es miembro de una bodega.
    env: { NEXT_PUBLIC_MOCKS: "1", NEXT_PUBLIC_URL_ERP: "http://localhost:3002" },
  },
});
