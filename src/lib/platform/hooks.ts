"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InternalRole } from "@drinks-on-chain/mocks";
import type { PageParams } from "@/lib/api/envelope";
import {
  fetchDashboard,
  fetchPermissions,
  fetchPlatformUsers,
  invitePlatformUser,
  manageInvitation,
  resetPlatformUserMfa,
  sendPasswordReset,
  setPlatformUserBlocked,
  updatePlatformUser,
  type PlatformUserFilters,
} from "./api";

export const platformKeys = {
  dashboard: ["platform", "dashboard"] as const,
  permissions: ["platform", "permissions"] as const,
  users: ["platform", "users"] as const,
};

export function useDashboard(enabled = true) {
  return useQuery({ queryKey: platformKeys.dashboard, queryFn: ({ signal }) => fetchDashboard(signal), enabled });
}

export function usePermissionMatrix() {
  return useQuery({
    queryKey: platformKeys.permissions,
    queryFn: ({ signal }) => fetchPermissions(signal),
    staleTime: 5 * 60_000,
  });
}

export function usePlatformUsers(params: PlatformUserFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...platformKeys.users, params],
    queryFn: ({ signal }) => fetchPlatformUsers(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Tras una acción sobre usuarios internos: la lista y el tablero (bitácora, bloqueados) cambian. */
function useInvalidateUsers() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: platformKeys.users }),
      client.invalidateQueries({ queryKey: platformKeys.dashboard }),
    ]);
}

export function useInvitePlatformUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: invitePlatformUser, onSuccess: invalidate });
}

export function useChangePlatformUserRole() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (v: { membershipId: string; role: InternalRole; reason: string }) =>
      updatePlatformUser(v.membershipId, { role: v.role, reason: v.reason }),
    onSuccess: invalidate,
  });
}

export function useSetPlatformUserBlocked() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (v: { membershipId: string; blocked: boolean; reason: string }) =>
      setPlatformUserBlocked(v.membershipId, v.blocked, v.reason),
    onSuccess: invalidate,
  });
}

export function useResetPlatformUserMfa() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (v: { membershipId: string; reason: string }) => resetPlatformUserMfa(v.membershipId, v.reason),
    onSuccess: invalidate,
  });
}

export function useSendPasswordReset() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (v: { userId: string; reason: string }) => sendPasswordReset(v.userId, v.reason),
    onSuccess: invalidate,
  });
}

export function useManageInvitation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (v: { invitationId: string; action: "resend" | "revoke"; reason: string }) =>
      manageInvitation(v.invitationId, v.action, v.reason),
    onSuccess: invalidate,
  });
}
