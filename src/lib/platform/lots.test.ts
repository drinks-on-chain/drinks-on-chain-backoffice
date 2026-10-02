import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetErpDb, setupMockServer } from "@drinks-on-chain/mocks/node";
import { DEMO_PASSWORD, demoUsers, erpFixtures, generateTotp } from "@drinks-on-chain/mocks/fixtures";
import type { LotLockInfo } from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { resetSessionForTests } from "@/lib/api/session";
import { applySession, login, verifyMfa } from "@/lib/auth/api";
import { isMfaChallenge } from "@/lib/auth/schemas";
import { labStatusLabel, lotProductLabel, lotStageLabel } from "./labels";
import { fetchWineryLots, hasLotFilters, lockLabel, lotFiltersFrom } from "./lots";
import { appliesToNewLotsOnly } from "./setting-value";
import { fetchSettings } from "./settings";

// Lotes de una bodega desde la plataforma (contrato de la Ola 2 §2.5, §14 y §20): solo lectura.

const from = (qs: string) => {
  const params = new URLSearchParams(qs);
  return lotFiltersFrom((key) => params.get(key));
};

describe("filtros de la pestaña «Lotes» ↔ URL", () => {
  it("lee la etapa y la búsqueda; lo demás de la URL de la ficha no cuenta", () => {
    expect(from("pestana=lotes")).toEqual({ stage: undefined, q: undefined });
    expect(from("pestana=lotes&etapa=RESTING&q=%20gran%20reserva%20")).toEqual({ stage: "RESTING", q: "gran reserva" });
    expect(hasLotFilters(from("pestana=lotes"))).toBe(false);
    expect(hasLotFilters(from("etapa=BOTTLED"))).toBe(true);
  });

  it("ignora una etapa desconocida (no debe provocar un 422)", () => {
    expect(from("etapa=LISTO&q=")).toEqual({ stage: undefined, q: undefined });
  });
});

describe("textos del lote", () => {
  const lock = (over: Partial<LotLockInfo>): LotLockInfo => ({
    kind: "REST",
    sourceId: "pb-1",
    unlockDate: "2026-10-13",
    released: false,
    daysRemaining: 18,
    rule: {
      settingKey: "trazabilidad.singani.reposoMinimoDias",
      minimum: 180,
      applied: 180,
      unit: "días",
      legalException: false,
    },
    ...over,
  });

  it("candado siguiente: tipo, fecha y días que faltan, o liberado", () => {
    expect(lockLabel(null)).toBeNull();
    expect(lockLabel(lock({}))).toBe("Reposo hasta el 13 oct 2026 · Faltan 18 días");
    expect(lockLabel(lock({ kind: "AGING", unlockDate: "2026-11-03", daysRemaining: 1 }))).toBe(
      "Crianza hasta el 3 nov 2026 · Falta 1 día",
    );
    expect(lockLabel(lock({ released: true, daysRemaining: 0 }))).toBe("Reposo · Liberado");
  });

  it("etapa, tipo y laboratorio en español; un código nuevo no rompe", () => {
    expect(lotStageLabel("RESTING")).toBe("Reposo");
    expect(lotStageLabel("CERTIFIED")).toBe("Certificado");
    expect(lotStageLabel("IN_TRANSIT")).toBe("In transit");
    expect(lotProductLabel(null)).toBe("Sin decidir");
    expect(lotProductLabel("SINGANI")).toBe("Singani");
    expect(labStatusLabel("NON_CONFORMING")).toBe("No conforme");
  });
});

describe("enlace al pasaporte público", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("solo existe con el Marketplace configurado (`NEXT_PUBLIC_URL_APP`)", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_URL_APP", "");
    expect((await import("@/lib/links")).links.passport("CVJ-2026-SINGANI-004")).toBeNull();

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_URL_APP", "https://app.ejemplo.bo/");
    expect((await import("@/lib/links")).links.passport("CVJ-2026-SINGANI-004")).toBe(
      "https://app.ejemplo.bo/b/CVJ-2026-SINGANI-004",
    );
  });
});

// Contra los handlers reales de `@drinks-on-chain/mocks` 0.5 (sin `fetch` simulado).
describe("lotes y reglas de lote contra los handlers de los mocks", () => {
  const server = setupMockServer();
  const winery = (prefix: string) => {
    const lot = erpFixtures.lots.find((l) => l.reference.startsWith(`${prefix}-`));
    if (!lot) throw new Error(`No hay lotes de ${prefix}`);
    return lot.wineryId;
  };

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  beforeEach(() => resetSessionForTests());
  afterEach(() => {
    server.resetHandlers();
    resetErpDb();
    resetSessionForTests();
  });
  afterAll(() => server.close());

  async function signIn(key: string) {
    const user = demoUsers.find((u) => u.key === key);
    if (!user) throw new Error(`No hay persona de demo «${key}»`);
    const challenge = await login({ email: user.email, password: DEMO_PASSWORD });
    if (!isMfaChallenge(challenge)) throw new Error("se esperaba el reto de segundo factor");
    applySession(await verifyMfa({ mfaToken: challenge.mfa.mfaToken, code: generateTotp(user.mfa!.secret!) }));
  }

  it("soporte lee los lotes de una bodega: solo los suyos, filtrados por etapa y por búsqueda", async () => {
    await signIn("soporte");
    const cinti = winery("CVJ");

    const all = await fetchWineryLots(cinti, { limit: 20, offset: 0 });
    expect(all.total).toBe(erpFixtures.lots.filter((l) => l.wineryId === cinti).length);
    expect(all.items.every((l) => l.wineryId === cinti && l.reference.startsWith("CVJ-"))).toBe(true);
    // Más reciente primero.
    const updated = all.items.map((l) => l.updatedAt);
    expect(updated).toEqual([...updated].sort().reverse());

    const certified = await fetchWineryLots(cinti, { stage: "CERTIFIED", limit: 20 });
    expect(certified.items.map((l) => l.lotCode)).toEqual(["CVJ-2026-SINGANI-004"]);
    expect(certified.items[0]).toMatchObject({ dossierStatus: "CLOSED", labStatus: "CONFORMING" });

    const resting = await fetchWineryLots(cinti, { stage: "RESTING", limit: 20 });
    expect(resting.items).toHaveLength(1);
    expect(resting.items[0]!.nextLock).toMatchObject({ kind: "REST", released: false });

    // `q` busca en el nombre, la referencia y el código de lote.
    const byCode = await fetchWineryLots(cinti, { q: "wine-003", limit: 20 });
    expect(byCode.items.map((l) => l.lotCode)).toEqual(["CVJ-2026-WINE-003"]);

    const other = await fetchWineryLots(winery("ALT"), { limit: 100 });
    expect(other.items.every((l) => l.reference.startsWith("ALT-"))).toBe(true);
  });

  it("la plataforma no escribe en la trazabilidad: 403 `TRC_PLATFORM_READ_ONLY`", async () => {
    await signIn("bo_admin");
    const cinti = winery("CVJ");
    const { items } = await fetchWineryLots(cinti, { stage: "ORIGIN", limit: 1 });
    const readOnly = { status: 403, code: "TRC_PLATFORM_READ_ONLY" };
    await expect(
      api(`/v1/lots/${items[0]!.id}`, { method: "PATCH", body: { name: "Cambiado desde la plataforma" } }),
    ).rejects.toMatchObject(readOnly);
    await expect(
      api(`/v1/lots/${items[0]!.id}/discard`, { method: "POST", body: { reason: "Prueba de solo lectura" } }),
    ).rejects.toMatchObject(readOnly);
  });

  it("las reglas de trazabilidad se aplican al crear el lote; las operativas, de inmediato", async () => {
    await signIn("soporte");
    const settings = await fetchSettings();
    const lotRules = settings.filter(appliesToNewLotsOnly).map((s) => s.key);
    // Reposo, crianza mínima, altitud, cepas, mermas y límites de laboratorio, entre otras.
    expect(lotRules).toEqual(
      expect.arrayContaining([
        "trazabilidad.singani.reposoMinimoDias",
        "trazabilidad.vino.crianzaMinimaMeses",
        "trazabilidad.singani.altitudMinimaMsnm",
        "trazabilidad.singani.variedadesExigidas",
        "trazabilidad.embotellado.mermaMaximaPorcentaje",
        "trazabilidad.laboratorio.limites",
      ]),
    );
    expect(lotRules.every((key) => key.startsWith("trazabilidad."))).toBe(true);
    expect(appliesToNewLotsOnly(settings.find((s) => s.key === "invitacion.caducidadHoras")!)).toBe(false);
  });
});
