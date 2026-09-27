import {
  DashboardSchema,
  InvitationSchema,
  PermissionMatrixSchema,
  PlatformUserSchema,
  type InternalRole,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";

// Back office (contrato de la Ola 1 §5 y §8). Las pantallas usan los hooks de hooks.ts.

export type PlatformUserFilters = { status?: "ACTIVE" | "BLOCKED" | "INVITED"; role?: string };

/** `GET /v1/platform/dashboard`. */
export function fetchDashboard(signal?: AbortSignal) {
  return api("/v1/platform/dashboard", { schema: DashboardSchema, signal });
}

/** `GET /v1/platform/permissions` (PLT-04). */
export function fetchPermissions(signal?: AbortSignal) {
  return api("/v1/platform/permissions", { schema: PermissionMatrixSchema, signal });
}

/** `GET /v1/platform/users?status=&role=`: miembros de la plataforma + invitaciones pendientes. */
export async function fetchPlatformUsers(filters: PlatformUserFilters & PageParams, signal?: AbortSignal) {
  const data = await api("/v1/platform/users", { query: filters, signal });
  return toPage(data, PlatformUserSchema, filters);
}

/** `POST /v1/platform/users`: invita a un usuario interno. */
export function invitePlatformUser(body: { email: string; role: InternalRole; reason?: string | null }) {
  return api("/v1/platform/users", { method: "POST", body, schema: InvitationSchema });
}

/** `PATCH /v1/platform/users/{membershipId}`: cambia el rol (motivo obligatorio). */
export function updatePlatformUser(membershipId: string, body: { role: InternalRole; reason: string }) {
  return api(`/v1/platform/users/${membershipId}`, { method: "PATCH", body, schema: PlatformUserSchema });
}

/** `POST /v1/platform/users/{membershipId}/block|unblock` (motivo obligatorio). */
export function setPlatformUserBlocked(membershipId: string, blocked: boolean, reason: string) {
  return api(`/v1/platform/users/${membershipId}/${blocked ? "block" : "unblock"}`, {
    method: "POST",
    body: { reason },
    schema: PlatformUserSchema,
  });
}

/** `POST /v1/platform/users/{membershipId}/reset-mfa`: obliga a inscribir de nuevo el TOTP. */
export function resetPlatformUserMfa(membershipId: string, reason: string) {
  return api(`/v1/platform/users/${membershipId}/reset-mfa`, {
    method: "POST",
    body: { reason },
    schema: PlatformUserSchema,
  });
}

/** `POST /v1/platform/users/{userId}/send-password-reset` → 202. */
export async function sendPasswordReset(userId: string, reason: string) {
  await api(`/v1/platform/users/${userId}/send-password-reset`, { method: "POST", body: { reason } });
}

/** `POST /v1/invitations/{id}/resend|revoke`. */
export function manageInvitation(invitationId: string, action: "resend" | "revoke", reason: string) {
  return api(`/v1/invitations/${invitationId}/${action}`, { method: "POST", body: { reason }, schema: InvitationSchema });
}
