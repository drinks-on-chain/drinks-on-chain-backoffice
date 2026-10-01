import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetErpDb, setupMockServer } from "@drinks-on-chain/mocks/node";
import { DEMO_PASSWORD, demoUsers, generateTotp, type DemoUser } from "@drinks-on-chain/mocks/fixtures";
import { bootstrapSession, refreshSession } from "@/lib/api/client";
import { getAccessToken, getSessionStatus, resetSessionForTests } from "@/lib/api/session";
import { applySession, fetchMe, login, switchOrganization, verifyMfa } from "./api";
import { isMfaChallenge } from "./schemas";

// El cliente de sesión contra los handlers reales de `@drinks-on-chain/mocks` (sin `fetch`
// simulado): si el paquete cambia la forma de la sesión, esta prueba lo avisa antes que las e2e.
// Contrato de la Ola 1 §11 (retirada de H1): sin `tokens.refreshToken` en el cuerpo ni
// `user.userRole/wineryId/memberRole`; el rol sale de la membresía activa (`DemoUser.role`).

const RETIRED_USER_FIELDS = ["userRole", "wineryId", "memberRole"] as const;

function demo(key: string): DemoUser {
  const user = demoUsers.find((u) => u.key === key);
  if (!user) throw new Error(`No hay persona de demo «${key}»`);
  return user;
}

describe("sesión contra los handlers de los mocks", () => {
  const server = setupMockServer();

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  beforeEach(() => resetSessionForTests());
  afterEach(() => {
    server.resetHandlers();
    resetErpDb();
    resetSessionForTests();
  });
  afterAll(() => server.close());

  it("personal de plataforma: reto de segundo factor, sesión, `me`, renovación y cambio de organización", async () => {
    const admin = demo("admin");
    const challenge = await login({ email: admin.email, password: DEMO_PASSWORD });
    if (!isMfaChallenge(challenge)) throw new Error("se esperaba el reto de segundo factor");
    expect(challenge.mfa).toMatchObject({ required: true, enrolled: true });
    expect(getAccessToken()).toBeNull();

    const session = await verifyMfa({ mfaToken: challenge.mfa.mfaToken, code: generateTotp(admin.mfa!.secret!) });
    expect(session.tokens).toEqual({ accessToken: expect.any(String), tokenType: "Bearer", expiresIn: 900 });
    for (const field of RETIRED_USER_FIELDS) expect(session.user).not.toHaveProperty(field);
    expect(session.activeOrganizationId).toBe(admin.activeOrganizationId);

    applySession(session);
    expect(getSessionStatus()).toBe("authenticated");

    // El rol es el de la membresía activa: el mismo que anuncia `DemoUser.role` en `/__mocks`.
    const me = await fetchMe();
    for (const field of RETIRED_USER_FIELDS) expect(me.user).not.toHaveProperty(field);
    const active = me.memberships.find((m) => m.organizationId === me.activeOrganizationId);
    expect(active).toMatchObject({ organizationType: "PLATFORM", role: admin.role });
    expect(admin.role).toBe(admin.platformRole);

    // La renovación viaja solo en la cookie `doc_rt` (cuerpo vacío) y rota el acceso.
    const before = getAccessToken();
    await expect(refreshSession()).resolves.toEqual({ ok: true });
    expect(getAccessToken()).not.toBe(before);

    const switched = await switchOrganization(me.activeOrganizationId!);
    expect(switched.tokens).not.toHaveProperty("refreshToken");
    expect(getAccessToken()).toBe(switched.tokens.accessToken);
  });

  it("miembro de una bodega: sesión directa con el rol en la membresía", async () => {
    const owner = demo("altos_admin");
    const session = await login({ email: owner.email, password: DEMO_PASSWORD });
    if (isMfaChallenge(session)) throw new Error("se esperaba una sesión");
    expect(session.tokens).not.toHaveProperty("refreshToken");
    for (const field of RETIRED_USER_FIELDS) expect(session.user).not.toHaveProperty(field);
    const active = session.memberships.find((m) => m.organizationId === session.activeOrganizationId);
    expect(active).toMatchObject({ organizationType: "WINERY", role: owner.role });
  });

  it("al recargar, la sesión se recupera con la cookie sin leer nada del cuerpo", async () => {
    const owner = demo("altos_admin");
    const session = await login({ email: owner.email, password: DEMO_PASSWORD });
    if (isMfaChallenge(session)) throw new Error("se esperaba una sesión");
    // Recarga: la memoria se pierde y queda solo la cookie de renovación.
    resetSessionForTests();
    await bootstrapSession();
    expect(getSessionStatus()).toBe("authenticated");
    await expect(fetchMe()).resolves.toMatchObject({ activeOrganizationId: owner.activeOrganizationId });
  });
});
