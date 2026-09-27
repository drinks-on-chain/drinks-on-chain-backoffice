import { describe, expect, it } from "vitest";
import type { AuditEvent } from "@drinks-on-chain/mocks";
import { accountStatusFromAudit, auditDiff, formatAuditValue, invitationsFromAudit } from "./derive";

// Vistas derivadas de la bitácora: invitaciones de una bodega, estado de la cuenta completa y el
// antes/después de un evento.

let seq = 0;
function event(action: string, resource: AuditEvent["resource"], extra: Partial<AuditEvent> = {}): AuditEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    seq,
    occurredAt: `2026-09-2${Math.min(seq, 9)}T10:00:00Z`,
    actor: {
      userId: "u-ana",
      fullName: "Ana Gutiérrez",
      role: "SUPERADMIN",
      organizationId: "platform",
      viaPlatform: true,
    },
    source: { app: "BACKOFFICE", ip: null, deviceId: null },
    action,
    resource,
    organizationId: "w1",
    before: null,
    after: null,
    reason: null,
    correlationId: null,
    hash: "a".repeat(64),
    prevHash: null,
    ...extra,
  };
}

describe("invitationsFromAudit", () => {
  it("reconstruye cada invitación con su último estado y caducidad", () => {
    const inv = (id: string) => ({ type: "INVITATION", id });
    const events = [
      event("INVITATION_CREATED", inv("i1"), {
        after: { email: "a@x.test", role: "ENOLOGIST", expiresAt: "2026-09-25T10:00:00Z" },
      }),
      event("INVITATION_CREATED", inv("i2"), {
        after: { email: "b@x.test", role: "OPERATOR", expiresAt: "2026-09-26T10:00:00Z" },
      }),
      event("INVITATION_CREATED", inv("i3"), {
        after: { email: "c@x.test", role: "OWNER", expiresAt: "2026-09-27T10:00:00Z" },
      }),
      event("INVITATION_EXPIRED", inv("i1")),
      event("INVITATION_RESENT", inv("i1"), { after: { status: "PENDING", expiresAt: "2026-09-30T10:00:00Z" } }),
      event("INVITATION_REVOKED", inv("i2")),
      event("INVITATION_ACCEPTED", inv("i3")),
      // Eventos de otros recursos o sin datos se ignoran.
      event("MEMBER_JOINED", { type: "MEMBERSHIP", id: "m1" }),
      event("INVITATION_REVOKED", inv("desconocida")),
    ];
    // El orden de llegada no importa: se ordena por `seq`.
    const result = invitationsFromAudit([...events].reverse());
    expect(result.map((i) => [i.id, i.status, i.expiresAt])).toEqual([
      ["i3", "ACCEPTED", "2026-09-27T10:00:00Z"],
      ["i2", "REVOKED", "2026-09-26T10:00:00Z"],
      ["i1", "PENDING", "2026-09-30T10:00:00Z"],
    ]);
    expect(result[2]).toMatchObject({
      email: "a@x.test",
      role: "ENOLOGIST",
      invitedBy: "Ana Gutiérrez",
      viaPlatform: true,
    });
  });
});

describe("accountStatusFromAudit", () => {
  it("toma el último bloqueo o desbloqueo de esa persona", () => {
    const user = (id: string) => ({ type: "USER", id });
    const events = [
      event("USER_BLOCKED", user("u1"), { reason: "Fraude" }),
      event("USER_UNBLOCKED", user("u1"), { reason: "Aclarado" }),
      event("USER_BLOCKED", user("u2"), { reason: "Otra persona" }),
      event("USER_PASSWORD_RESET_SENT", user("u1")),
    ];
    expect(accountStatusFromAudit(events, "u1")).toMatchObject({ blocked: false, reason: "Aclarado" });
    expect(accountStatusFromAudit(events, "u2")).toMatchObject({
      blocked: true,
      reason: "Otra persona",
      by: "Ana Gutiérrez",
    });
    expect(accountStatusFromAudit(events, "u3")).toEqual({ blocked: false, reason: null, at: null, by: null });
  });
});

describe("auditDiff", () => {
  it("une los campos de los dos lados y pone primero los que cambian", () => {
    expect(auditDiff({ status: "ACTIVE", region: "Tarija" }, { status: "SUSPENDED", region: "Tarija" })).toEqual([
      { key: "status", before: "ACTIVE", after: "SUSPENDED", changed: true },
      { key: "region", before: "Tarija", after: "Tarija", changed: false },
    ]);
    expect(auditDiff(null, { email: "a@x.test" })).toEqual([
      { key: "email", before: undefined, after: "a@x.test", changed: true },
    ]);
    expect(auditDiff(null, null)).toEqual([]);
  });

  it("formatea los valores para leerlos", () => {
    expect(formatAuditValue(null)).toBe("vacío");
    expect(formatAuditValue(undefined)).toBe("—");
    expect(formatAuditValue(true)).toBe("sí");
    expect(formatAuditValue(["A", "B"])).toBe("A, B");
    expect(formatAuditValue({ max: 300 })).toBe('{"max":300}');
  });
});
