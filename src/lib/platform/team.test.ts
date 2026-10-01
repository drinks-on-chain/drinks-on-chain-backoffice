import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invitation } from "@drinks-on-chain/mocks";
import { resetSessionForTests, setSession } from "@/lib/api/session";
import { ok, stubFetch } from "@/test/utils";
import { fetchAccount, fetchOrganizationInvitations } from "./team";

// Equipo de una bodega con las lecturas del backend (contrato O1 §11 bis): invitaciones de la
// organización y cuenta completa de una persona.

const invitation = (id: string, status: Invitation["status"], createdAt: string): Invitation => ({
  id,
  email: `${id}@x.test`,
  organizationId: "w1",
  organizationType: "WINERY",
  organizationName: "Bodega Uno",
  role: "ENOLOGIST",
  status,
  expiresAt: "2026-10-01T00:00:00.000Z",
  createdAt,
  invitedBy: { userId: "u1", fullName: "Ana", viaPlatform: true },
});

let fetchMock: ReturnType<typeof stubFetch>;
beforeEach(() => {
  fetchMock = stubFetch();
  setSession({ accessToken: "a", expiresIn: 900 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSessionForTests();
});

describe("fetchOrganizationInvitations", () => {
  it("pide las pendientes y las caducadas y las ordena de la más reciente a la más antigua", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      const status = url.searchParams.get("status");
      const items =
        status === "PENDING"
          ? [
              invitation("p1", "PENDING", "2026-09-20T00:00:00.000Z"),
              invitation("p2", "PENDING", "2026-09-26T00:00:00.000Z"),
            ]
          : [invitation("e1", "EXPIRED", "2026-09-22T00:00:00.000Z")];
      return ok({ items, total: items.length, limit: 100, offset: 0 });
    });
    const result = await fetchOrganizationInvitations("w1");
    expect(result.map((i) => i.id)).toEqual(["p2", "e1", "p1"]);
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toHaveLength(2);
    for (const u of urls)
      expect(u).toMatch(
        /^\/api\/v1\/platform\/organizations\/w1\/invitations\?limit=100&offset=0&status=(PENDING|EXPIRED)$/,
      );
  });
});

describe("fetchAccount", () => {
  it("lee la cuenta completa con sus membresías", async () => {
    fetchMock.mockResolvedValue(
      ok({
        userId: "u9",
        fullName: "Tomás Flores",
        email: "tomas@x.test",
        status: "BLOCKED",
        blockedReason: "Credenciales filtradas",
        blockedAt: "2026-09-27T10:00:00.000Z",
        memberships: [
          {
            membershipId: "m1",
            organizationId: "w1",
            organizationType: "WINERY",
            organizationName: "Bodega Uno",
            organizationStatus: "ACTIVE",
            role: "OWNER",
            status: "ACTIVE",
            blockedBy: null,
            blockedReason: null,
          },
        ],
      }),
    );
    const account = await fetchAccount("u9");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/v1/platform/accounts/u9");
    expect(account).toMatchObject({ status: "BLOCKED", blockedReason: "Credenciales filtradas" });
    expect(account.memberships[0]).toMatchObject({ organizationName: "Bodega Uno", role: "OWNER" });
  });
});
