import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, resetSessionForTests, setSession } from "@/lib/api/session";
import { ok, stubFetch } from "@/test/utils";
import { acceptInvitation, login, switchOrganization, updateMe } from "./api";

/** Respuesta de sesión tras H1: sin `refreshToken` ni `userRole/wineryId/memberRole`. */
const session = {
  user: { id: "u1", email: "a@b.test", fullName: "A", preferredLocale: "es", audience: "STAFF" },
  memberships: [],
  activeOrganizationId: "platform",
  tokens: { accessToken: "a2", tokenType: "Bearer", expiresIn: 900 },
};

describe("sesión y cuenta tras H1", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  const bodyOf = (i: number) => JSON.parse(String(fetchMock.mock.calls[i]![1]!.body));

  beforeEach(() => {
    fetchMock = stubFetch();
    resetSessionForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  it("switch-organization envía solo { organizationId }: el refresco va en la cookie", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await switchOrganization("platform");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/auth/switch-organization");
    expect(init!.credentials).toBe("include");
    expect(bodyOf(0)).toEqual({ organizationId: "platform" });
    expect(getAccessToken()).toBe("a2");
  });

  it("el login guarda el acceso de la sesión (sin refreshToken en el cuerpo)", async () => {
    fetchMock.mockResolvedValueOnce(ok(session));
    const res = await login({ email: "a@b.test", password: "x" });
    expect(res).toMatchObject({ activeOrganizationId: "platform" });
    expect(res).not.toHaveProperty("tokens.refreshToken");
    expect(getAccessToken()).toBe("a2");
  });

  it("aceptar con cuenta existente envía `{}` con la sesión (sin refresco en el cuerpo)", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await acceptInvitation("tok", {}, true);
    expect(fetchMock.mock.calls[0]![1]!.credentials).toBe("include");
    expect(bodyOf(0)).toEqual({});
  });

  it("PATCH /users/me solo acepta `me` completo", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    const user = { ...session.user, isActive: true, createdAt: "2026-01-01T00:00:00Z", wineryMemberships: [] };
    fetchMock.mockResolvedValueOnce(ok({ user, memberships: [], activeOrganizationId: "platform" }));
    await expect(updateMe({ fullName: "B" })).resolves.toMatchObject({ activeOrganizationId: "platform" });
    fetchMock.mockResolvedValueOnce(ok(user));
    await expect(updateMe({ fullName: "B" })).rejects.toThrow(/contrato/);
  });
});
