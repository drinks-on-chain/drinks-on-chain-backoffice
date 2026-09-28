import { describe, expect, it } from "vitest";
import type { Membership, PlatformUser } from "@drinks-on-chain/mocks";
import type { MeResponse } from "@/lib/auth/schemas";
import {
  can,
  canActOnUser,
  canUseBackoffice,
  isPlatformActive,
  platformRole,
  wineryMemberships,
  type PlatformAction,
} from "./permissions";

const membership = (m: Partial<Membership> & Pick<Membership, "organizationId" | "role">): Membership => ({
  id: `m-${m.organizationId}`,
  organizationType: "PLATFORM",
  organizationName: m.organizationId,
  organizationStatus: "ACTIVE",
  status: "ACTIVE",
  ...m,
});

const me = (memberships: Membership[], activeOrganizationId: string | null, audience: "STAFF" | "CONSUMER" = "STAFF") =>
  ({ user: { id: "u-me", audience }, memberships, activeOrganizationId }) as unknown as MeResponse;

const staff = (role: Membership["role"]) => me([membership({ organizationId: "platform", role })], "platform");

describe("can() del back office", () => {
  it("administración y superusuario gestionan los usuarios internos; operaciones y soporte no", () => {
    for (const role of ["SUPERADMIN", "ADMIN"] as const) {
      expect(can(staff(role), "users.read")).toBe(true);
      expect(can(staff(role), "users.invite")).toBe(true);
      expect(can(staff(role), "users.block")).toBe(true);
    }
    for (const role of ["OPERATIONS", "SUPPORT"] as const) {
      expect(can(staff(role), "users.read")).toBe(false);
      expect(can(staff(role), "users.invite")).toBe(false);
    }
  });

  it("sigue la matriz del contrato §9", () => {
    const table: [PlatformAction, string[]][] = [
      ["dashboard.read", ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"]],
      ["permissions.read", ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"]],
      ["applications.manage", ["SUPERADMIN", "ADMIN", "OPERATIONS"]],
      ["applications.read", ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"]],
      ["wineries.suspend", ["SUPERADMIN", "ADMIN", "OPERATIONS"]],
      ["wineries.revoke", ["SUPERADMIN", "ADMIN"]],
      ["accounts.block", ["SUPERADMIN", "ADMIN"]],
      ["team.manage", ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"]],
      ["settings.read", ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"]],
      ["settings.write", ["SUPERADMIN", "ADMIN"]],
      ["audit.read", ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"]],
      ["audit.verify", ["SUPERADMIN", "ADMIN"]],
    ];
    for (const [action, allowed] of table) {
      for (const role of ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"] as const) {
        expect(can(staff(role), action), `${role} ${action}`).toBe(allowed.includes(role));
      }
    }
  });

  it("sin la plataforma activa no se puede nada (una bodega activa no da permisos aquí)", () => {
    const both = me(
      [
        membership({ organizationId: "platform", role: "ADMIN" }),
        membership({ organizationId: "altos", organizationType: "WINERY", role: "OWNER" }),
      ],
      "altos",
    );
    expect(platformRole(both)).toBeNull();
    expect(isPlatformActive(both)).toBe(false);
    expect(can(both, "dashboard.read")).toBe(false);
    // Pero puede usar el Backoffice (se cambia a la plataforma) y se le ofrece el ERP.
    expect(canUseBackoffice(both)).toBe(true);
    expect(wineryMemberships(both).map((m) => m.organizationId)).toEqual(["altos"]);
  });

  it("una membresía de plataforma bloqueada o un consumidor no entran", () => {
    const blocked = me([membership({ organizationId: "platform", role: "ADMIN", status: "BLOCKED" })], "platform");
    expect(canUseBackoffice(blocked)).toBe(false);
    expect(can(blocked, "dashboard.read")).toBe(false);
    expect(canUseBackoffice(me([], null, "CONSUMER"))).toBe(false);
    expect(
      canUseBackoffice(
        me([membership({ organizationId: "altos", organizationType: "WINERY", role: "OWNER" })], "altos"),
      ),
    ).toBe(false);
    expect(can(undefined, "dashboard.read")).toBe(false);
  });
});

describe("canActOnUser()", () => {
  const target = (p: Partial<PlatformUser>): PlatformUser =>
    ({ userId: "u-2", membershipId: "pm-2", role: "SUPPORT", status: "ACTIVE", ...p }) as PlatformUser;

  it("protege al superusuario y a uno mismo", () => {
    const admin = staff("ADMIN");
    expect(canActOnUser(admin, target({}), "users.block")).toBe(true);
    expect(canActOnUser(admin, target({ role: "SUPERADMIN" }), "users.block")).toBe(false);
    expect(canActOnUser(admin, target({ role: "SUPERADMIN" }), "users.changeRole")).toBe(false);
    expect(canActOnUser(admin, target({ userId: "u-me" }), "users.changeRole")).toBe(false);
  });

  it("no actúa sobre invitaciones pendientes (sin membresía) ni sin permiso", () => {
    expect(canActOnUser(staff("ADMIN"), target({ membershipId: null, status: "INVITED" }), "users.block")).toBe(false);
    expect(canActOnUser(staff("OPERATIONS"), target({}), "users.block")).toBe(false);
  });
});
