import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetErpDb, setupMockServer } from "@drinks-on-chain/mocks/node";
import { DEMO_PASSWORD, demoUsers, generateTotp } from "@drinks-on-chain/mocks/fixtures";
import { WAITLIST_CSV_COLUMNS } from "@drinks-on-chain/mocks";
import { ApiError } from "@/lib/api/errors";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { applySession, login, verifyMfa } from "@/lib/auth/api";
import { isMfaChallenge } from "@/lib/auth/schemas";
import { fail, stubFetch } from "@/test/utils";
import { fetchDashboard, fetchPermissions } from "./api";
import { saveFile } from "./audit";
import { exportWaitlist, fetchWaitlist, fetchWaitlistSources, isExportTooLarge, updateWaitlistEntry } from "./waitlist";

// Lista de espera (contrato O1b §2 con las precisiones del backend v0.1.1).

describe("cliente de la lista de espera", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    setSession({ accessToken: "a", expiresIn: 900 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  const csvResponse = (body: string, headers: Record<string, string>) =>
    new Response(body, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", ...headers } });

  it("exporta con los filtros activos y lee el nombre y las filas de las cabeceras", async () => {
    fetchMock.mockResolvedValue(
      csvResponse("﻿position,type\r\n1,WINERY\r\n", {
        "Content-Disposition": 'attachment; filename="lista-de-espera-20260925-1200.csv"',
        "X-Export-Rows": "1",
      }),
    );
    const file = await exportWaitlist({
      type: "WINERY",
      status: "NEW",
      source: "tarija-2026",
      q: "valle",
      from: "2026-09-19",
      to: undefined,
    });
    expect(file.filename).toBe("lista-de-espera-20260925-1200.csv");
    expect(file.rows).toBe(1);
    expect(await file.blob.text()).toContain("1,WINERY");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "/api/v1/platform/waitlist/export?type=WINERY&status=NEW&source=tarija-2026&q=valle&from=2026-09-19",
    );
    expect((init!.headers as Record<string, string>).Accept).toBe("text/csv");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer a");
  });

  it("sin cabeceras cuenta las filas del CSV y no inventa el nombre", async () => {
    fetchMock.mockResolvedValue(csvResponse("position,type\r\n1,CONSUMER\r\n2,CONSUMER\r\n", {}));
    const file = await exportWaitlist({ type: "CONSUMER" });
    expect(file).toMatchObject({ filename: null, rows: 2 });
  });

  it("más de 50.000 filas → 422 `WAITLIST_EXPORT_TOO_LARGE`", async () => {
    fetchMock.mockResolvedValue(fail(422, "WAITLIST_EXPORT_TOO_LARGE", "La exportación tiene 60000 filas"));
    const error = await exportWaitlist({ type: "CONSUMER" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isExportTooLarge(error)).toBe(true);
    expect(isExportTooLarge(new ApiError({ status: 422, code: "VALIDATION_ERROR", message: "x" }))).toBe(false);
  });

  it("guarda el archivo con un enlace temporal de descarga", () => {
    // jsdom no implementa las URL de blob.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn(() => "blob:lista");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("lista-de-espera-20260925-1200.csv");
      expect(this.href).toBe("blob:lista");
      expect(this.isConnected).toBe(true);
    });
    try {
      const blob = new Blob(["a,b"], { type: "text/csv" });
      saveFile(blob, "lista-de-espera-20260925-1200.csv");
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledTimes(1);
      // El enlace no se queda en el documento.
      expect(document.querySelector("a[download]")).toBeNull();
    } finally {
      click.mockRestore();
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    }
  });
});

// Contra los handlers reales de `@drinks-on-chain/mocks` 0.4.1 (sin `fetch` simulado): si el
// paquete o el contrato cambian, esta prueba lo avisa antes que las e2e.
describe("lista de espera contra los handlers de los mocks", () => {
  const server = setupMockServer();

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
    return user;
  }

  it("lista por tipo con filtros, orígenes con recuento y bloque del tablero", async () => {
    await signIn("operaciones");

    const consumers = await fetchWaitlist({ type: "CONSUMER", limit: 20, offset: 0 });
    expect(consumers).toMatchObject({ total: 38, limit: 20, offset: 0 });
    expect(consumers.items).toHaveLength(20);
    expect(consumers.items.every((e) => e.type === "CONSUMER")).toBe(true);
    // Más reciente primero.
    const dates = consumers.items.map((e) => e.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());

    const wineries = await fetchWaitlist({ type: "WINERY", limit: 100, offset: 0 });
    expect(wineries.total).toBe(14);

    // Arreglo plano; la suma de los recuentos es el total de la pestaña.
    const sources = await fetchWaitlistSources("CONSUMER");
    expect(sources.reduce((sum, s) => sum + s.count, 0)).toBe(38);
    const event = sources.find((s) => s.source === "tarija-2026")!;
    const filtered = await fetchWaitlist({ type: "CONSUMER", source: "tarija-2026", status: "NEW", limit: 100 });
    expect(filtered.items.every((e) => e.source === "tarija-2026" && e.status === "NEW")).toBe(true);
    expect(filtered.total).toBeLessThanOrEqual(event.count);

    const day = await fetchWaitlist({ type: "CONSUMER", from: "2026-09-19", to: "2026-09-19", limit: 100 });
    expect(day.total).toBeGreaterThan(0);
    expect(day.items.every((e) => e.createdAt.startsWith("2026-09-19"))).toBe(true);

    const dashboard = await fetchDashboard();
    expect(dashboard.waitlist).toMatchObject({ consumers: 38, wineries: 14 });

    const matrix = await fetchPermissions();
    expect(matrix.capabilities.find((c) => c.key === "waitlist")?.roles).toMatchObject({
      SUPERADMIN: "FULL",
      ADMIN: "FULL",
      OPERATIONS: "FULL",
      SUPPORT: "READ",
    });
  });

  it("contactar con nota, volver a nuevo y borrar las notas", async () => {
    const user = await signIn("operaciones");
    const { items } = await fetchWaitlist({ type: "CONSUMER", status: "NEW", limit: 1 });
    const entry = items[0]!;

    const contacted = await updateWaitlistEntry(entry.id, { status: "CONTACTED", notes: "Respondió por WhatsApp." });
    expect(contacted).toMatchObject({
      status: "CONTACTED",
      notes: "Respondió por WhatsApp.",
      contactedBy: user.fullName,
    });
    expect(contacted.contactedAt).not.toBeNull();

    // Descartar conserva quién la contactó; volver a nuevo lo borra.
    const discarded = await updateWaitlistEntry(entry.id, { status: "DISCARDED" });
    expect(discarded).toMatchObject({ status: "DISCARDED", contactedBy: user.fullName });
    const again = await updateWaitlistEntry(entry.id, { status: "NEW", notes: null });
    expect(again).toMatchObject({ status: "NEW", notes: null, contactedAt: null, contactedBy: null });
  });

  it("exporta el CSV con los filtros, el nombre del `Content-Disposition` y `X-Export-Rows`", async () => {
    await signIn("bo_admin");
    const file = await exportWaitlist({ type: "WINERY" });
    expect(file.filename).toMatch(/^lista-de-espera-\d{8}-\d{4}\.csv$/);
    expect(file.rows).toBe(14);
    const lines = (await file.blob.text()).replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(WAITLIST_CSV_COLUMNS.join(","));
    expect(lines.slice(1).every((l) => l.includes(",WINERY,"))).toBe(true);
  });

  it("soporte lee, pero no edita ni exporta (403)", async () => {
    await signIn("soporte");
    const page = await fetchWaitlist({ type: "CONSUMER", limit: 1 });
    expect(page.total).toBe(38);
    await expect(fetchWaitlistSources("WINERY")).resolves.not.toHaveLength(0);

    const denied = { status: 403, code: "AUTH_INSUFFICIENT_PERMISSIONS" };
    await expect(updateWaitlistEntry(page.items[0]!.id, { status: "CONTACTED" })).rejects.toMatchObject(denied);
    await expect(exportWaitlist({ type: "CONSUMER" })).rejects.toMatchObject(denied);
  });
});
