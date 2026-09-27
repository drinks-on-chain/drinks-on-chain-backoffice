import type { AuditEvent, InvitationStatus, MembershipRole } from "@drinks-on-chain/mocks";

// Vistas que el contrato de la Ola 1 no expone al back office y que se derivan de la bitácora
// (fuente única, inmutable y con los mismos datos en los mocks y en el backend):
//
// - Invitaciones de una bodega: el contrato solo lista las de la organización activa del dueño
//   (`GET /v1/organizations/current/invitations`); el back office las reconstruye con los
//   eventos `INVITATION_*` de esa organización (decisión anotada en docs/ROADMAP.md, a la espera
//   de `GET /v1/platform/organizations/{id}/invitations`).
// - Estado de la cuenta completa de una persona: `POST /v1/platform/accounts/{userId}/block`
//   devuelve `UserAccountStatus`, pero no hay lectura; se toma el último `USER_BLOCKED` /
//   `USER_UNBLOCKED` de esa persona.

export type DerivedInvitation = {
  id: string;
  email: string;
  role: MembershipRole | string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string | null;
  invitedBy: string | null;
  viaPlatform: boolean;
};

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Invitaciones de una organización reconstruidas con sus eventos (más recientes primero). */
export function invitationsFromAudit(events: readonly AuditEvent[]): DerivedInvitation[] {
  const byId = new Map<string, DerivedInvitation>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const id = e.resource.type === "INVITATION" ? e.resource.id : null;
    if (!id) continue;
    const current = byId.get(id);
    switch (e.action) {
      case "INVITATION_CREATED":
      case "PLATFORM_USER_INVITED": {
        const email = text(e.after?.email);
        if (!email) break;
        byId.set(id, {
          id,
          email,
          role: text(e.after?.role) ?? "—",
          status: "PENDING",
          createdAt: e.occurredAt,
          expiresAt: text(e.after?.expiresAt),
          invitedBy: e.actor.fullName,
          viaPlatform: e.actor.viaPlatform,
        });
        break;
      }
      case "INVITATION_RESENT":
        if (current)
          byId.set(id, { ...current, status: "PENDING", expiresAt: text(e.after?.expiresAt) ?? current.expiresAt });
        break;
      case "INVITATION_REVOKED":
        if (current) byId.set(id, { ...current, status: "REVOKED" });
        break;
      case "INVITATION_ACCEPTED":
        if (current) byId.set(id, { ...current, status: "ACCEPTED" });
        break;
      case "INVITATION_EXPIRED":
        if (current && current.status === "PENDING") byId.set(id, { ...current, status: "EXPIRED" });
        break;
    }
  }
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export type AccountStatus = { blocked: boolean; reason: string | null; at: string | null; by: string | null };

/** Estado de la cuenta completa según el último bloqueo o desbloqueo registrado. */
export function accountStatusFromAudit(events: readonly AuditEvent[], userId: string): AccountStatus {
  const last = events
    .filter(
      (e) =>
        e.resource.type === "USER" &&
        e.resource.id === userId &&
        (e.action === "USER_BLOCKED" || e.action === "USER_UNBLOCKED"),
    )
    .sort((a, b) => b.seq - a.seq)[0];
  if (!last) return { blocked: false, reason: null, at: null, by: null };
  return {
    blocked: last.action === "USER_BLOCKED",
    reason: last.reason,
    at: last.occurredAt,
    by: last.actor.fullName,
  };
}

export type DiffRow = { key: string; before: unknown; after: unknown; changed: boolean };

/**
 * Antes y después de un evento en filas (campos de los dos lados, en orden estable: primero los
 * que cambian). Un lado `null` (creación o borrado) muestra solo el otro.
 */
export function auditDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffRow[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const rows = keys.map((key) => {
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    return { key, before: b, after: a, changed: JSON.stringify(b) !== JSON.stringify(a) };
  });
  return rows.sort((x, y) => Number(y.changed) - Number(x.changed));
}

/** Valor de la bitácora legible: textos tal cual, sí/no, listas separadas por comas y JSON. */
export function formatAuditValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number"))
    return value.join(", ");
  return JSON.stringify(value);
}
