"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  AccountDetailSchema,
  InvitationSchema,
  MemberSchema,
  UserAccountStatusSchema,
  type Invitation,
  type MemberStatus,
  type WineryRole,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { fetchAllPages } from "@/lib/api/pagination";
import { manageInvitation, sendPasswordReset } from "./api";
import { keys, useInvalidate } from "./query";

// Equipo de cualquier organización desde el back office (contrato de la Ola 1 §5 y §11 bis):
// miembros, invitaciones (`GET /v1/platform/organizations/{id}/invitations`), rol, bloqueo con
// motivo, recuperación de contraseña y la cuenta completa de una persona
// (`GET /v1/platform/accounts/{userId}` y `…/block|unblock`, solo administración).

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

/** Estados de invitación que el equipo muestra: las que aún se pueden gestionar. */
export const OPEN_INVITATION_STATUSES = ["PENDING", "EXPIRED"] as const;

/**
 * Invitaciones pendientes y caducadas de una organización (`GET …/invitations?status=`, lista
 * paginada), las más recientes primero.
 */
export async function fetchOrganizationInvitations(organizationId: string, signal?: AbortSignal) {
  const pages = await Promise.all(
    OPEN_INVITATION_STATUSES.map((status) =>
      fetchAllPages(
        async (p) =>
          toPage(
            await api(`${orgPath(organizationId)}/invitations`, { query: { ...p, status }, signal }),
            InvitationSchema,
            p,
          ),
        { maxItems: 500 },
      ),
    ),
  );
  return sortInvitations(pages.flatMap((page) => page.items));
}

/** Más recientes primero (el backend ordena cada estado por separado). */
export const sortInvitations = (items: Invitation[]) =>
  [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

/** `GET /v1/platform/accounts/{userId}`: estado de la cuenta completa y todas sus membresías. */
export const fetchAccount = (userId: string, signal?: AbortSignal) =>
  api(`/v1/platform/accounts/${encodeURIComponent(userId)}`, { schema: AccountDetailSchema, signal });

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

/** Cuenta completa de una persona: estado y membresías. */
export function useAccount(userId: string | null) {
  return useQuery({
    queryKey: [...keys.accounts, userId],
    queryFn: ({ signal }) => fetchAccount(userId!, signal),
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

export function useSetAccountBlocked(organizationId?: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { userId: string; blocked: boolean; reason: string }) =>
      setAccountBlocked(v.userId, v.blocked, v.reason),
    // El estado de la cuenta también viaja en los miembros (`accountStatus`).
    onSuccess: () => invalidate(keys.accounts, ...(organizationId ? [keys.members(organizationId)] : [])),
  });
}
