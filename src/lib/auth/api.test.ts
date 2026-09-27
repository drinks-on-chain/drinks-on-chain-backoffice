import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { ok, stubFetch } from "@/test/utils";
import { switchOrganization } from "./api";

const session = {
  user: {
    id: "u1",
    email: "a@b.test",
    fullName: "A",
    preferredLocale: "es",
    audience: "STAFF",
    userRole: "PLATFORM_ADMIN",
  },
  memberships: [],
  activeOrganizationId: "platform",
  tokens: { accessToken: "a2", tokenType: "Bearer", expiresIn: 900, refreshToken: "r2" },
};

describe("switch-organization (backend O0-BE-4)", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
    resetSessionForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSessionForTests();
  });

  it("envía la cookie de renovación de la sesión", async () => {
    setSession({ accessToken: "a1", expiresIn: 900 });
    fetchMock.mockResolvedValueOnce(ok(session));
    await switchOrganization("platform");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/auth/switch-organization");
    expect(init!.credentials).toBe("include");
    expect(JSON.parse(String(init!.body))).toEqual({ organizationId: "platform" });
  });

  it("mientras dure la tolerancia, envía también el refresco en el cuerpo (retirada en H1)", async () => {
    setSession({ accessToken: "a1", expiresIn: 900, refreshToken: "r1" });
    fetchMock.mockResolvedValueOnce(ok(session));
    await switchOrganization("platform");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      organizationId: "platform",
      refreshToken: "r1",
    });
  });
});
