"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  InvitationSchema,
  MemberSchema,
  UserAccountStatusSchema,
  type MemberStatus,
  type WineryRole,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { fetchAllPages } from "@/lib/api/pagination";
import { manageInvitation, sendPasswordReset } from "./api";
import { fetchAudit } from "./audit";
import { accountStatusFromAudit, invitationsFromAudit } from "./derive";
import { keys, useInvalidate } from "./query";

// Equipo de cualquier organización desde el back office (contrato de la Ola 1 §5): miembros,
// invitaciones, rol, bloqueo con motivo, recuperación de contraseña y bloqueo de la cuenta
// completa (`/v1/platform/accounts/{userId}`, solo administración, §11 bis).

export type MemberFilters = { status?: MemberStatus; role?: string };

const orgPath = (organizationId: string) => `/v1/platform/organizations/${encodeURIComponent(organizationId)}`;

export async function fetchMembers(organizationId: string, params: MemberFilters & PageParams, signal?: AbortSignal) {
  const data = await api(`${orgPath(organizationId)}/members`, { query: params, signal });
  return toPage(data, MemberSchema, params);
}

export const changeMemberRole = (organizationId: string, membershipId: string, role: WineryRole, reason: string) =>
  api(`${orgPath(organizationId)}/members/${encodeURIComponent(membershipId)}`, {
    method: "PATCH",
    body: { role, reason },
    schema: MemberSchema,
  });

export const setMemberBlocked = (organizationId: string, membershipId: string, blocked: boolean, reason: string) =>
  api(`${orgPath(organizationId)}/members/${encodeURIComponent(membershipId)}/${blocked ? "block" : "unblock"}`, {
    method: "POST",
    body: { reason },
    schema: MemberSchema,
  });

export const inviteMember = (
  organizationId: string,
  body: { email: string; role: WineryRole; reason?: string | null },
) => api(`${orgPath(organizationId)}/invitations`, { method: "POST", body, schema: InvitationSchema });

export const setAccountBlocked = (userId: string, blocked: boolean, reason: string) =>
  api(`/v1/platform/accounts/${encodeURIComponent(userId)}/${blocked ? "block" : "unblock"}`, {
    method: "POST",
    body: { reason },
    schema: UserAccountStatusSchema,
  });

/** Invitaciones de la organización, reconstruidas con la bitácora (ver `derive.ts`). */
export async function fetchOrganizationInvitations(organizationId: string, signal?: AbortSignal) {
  const page = await fetchAllPages((p) => fetchAudit({ ...p, organizationId, resourceType: "INVITATION" }, signal), {
    maxItems: 1_000,
  });
  return invitationsFromAudit(page.items);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useMembers(organizationId: string, params: MemberFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.members(organizationId), "list", params],
    queryFn: ({ signal }) => fetchMembers(organizationId, params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOrganizationInvitations(organizationId: string, enabled = true) {
  return useQuery({
    queryKey: [...keys.members(organizationId), "invitations"],
    queryFn: ({ signal }) => fetchOrganizationInvitations(organizationId, signal),
    enabled,
  });
}

/** Estado de la cuenta completa de una persona (último bloqueo o desbloqueo de la bitácora). */
export function useAccountStatus(userId: string | null) {
  return useQuery({
    queryKey: [...keys.accounts, userId],
    queryFn: async ({ signal }) => {
      const page = await fetchAudit({ resourceType: "USER", resourceId: userId!, limit: 100 }, signal);
      return accountStatusFromAudit(page.items, userId!);
    },
    enabled: Boolean(userId),
  });
}

function useTeamInvalidate(organizationId: string) {
  const invalidate = useInvalidate();
  // El número de miembros de la ficha y del directorio también cambia.
  return () => invalidate(keys.members(organizationId), keys.wineries);
}

export function useChangeMemberRole(organizationId: string) {
  const invalidate = useTeamInvalidate(organizationId);
  return useMutation({
    mutationFn: (v: { membershipId: string; role: WineryRole; reason: string }) =>
      changeMemberRole(organizationId, v.membershipId, v.role, v.reason),
    onSuccess: invalidate,
  });
}

export function useSetMemberBlocked(organizationId: string) {
  const invalidate = useTeamInvalidate(organizationId);
  return useMutation({
    mutationFn: (v: { membershipId: string; blocked: boolean; reason: string }) =>
      setMemberBlocked(organizationId, v.membershipId, v.blocked, v.reason),
    onSuccess: invalidate,
  });
}

export function useInviteMember(organizationId: string) {
  const invalidate = useTeamInvalidate(organizationId);
  return useMutation({
    mutationFn: (body: { email: string; role: WineryRole; reason?: string | null }) =>
      inviteMember(organizationId, body),
    onSuccess: invalidate,
  });
}

export function useManageOrganizationInvitation(organizationId: string) {
  const invalidate = useTeamInvalidate(organizationId);
  return useMutation({
    mutationFn: (v: { invitationId: string; action: "resend" | "revoke"; reason: string }) =>
      manageInvitation(v.invitationId, v.action, v.reason),
    onSuccess: invalidate,
  });
}

export function useSendMemberPasswordReset() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { userId: string; reason: string }) => sendPasswordReset(v.userId, v.reason),
    onSuccess: () => invalidate(),
  });
}

export function useSetAccountBlocked() {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { userId: string; blocked: boolean; reason: string }) =>
      setAccountBlocked(v.userId, v.blocked, v.reason),
    onSuccess: (status) => {
      client.setQueryData([...keys.accounts, status.userId], {
        blocked: status.status === "BLOCKED",
        reason: status.blockedReason,
        at: null,
        by: null,
      });
      return invalidate(keys.accounts);
    },
  });
}
