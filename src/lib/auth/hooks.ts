"use client";

import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSessionEndReason,
  getSessionStatus,
  subscribeSession,
  type SessionEndReason,
  type SessionStatus,
} from "@/lib/api/session";
import {
  acceptInvitation,
  applySession,
  changePassword,
  confirmMfaEnrollment,
  enrollMfa,
  fetchInvitation,
  fetchMe,
  forgotPassword,
  login,
  logout,
  logoutAll,
  resetPassword,
  switchOrganization,
  updateMe,
  verifyMfa,
} from "./api";
import type { MeResponse, SessionResponse } from "./schemas";

/** Estado de la sesión; `null` durante el render del servidor (desconocido). */
export function useSessionStatus(): SessionStatus | null {
  return useSyncExternalStore(subscribeSession, getSessionStatus, () => null);
}

/** Por qué terminó la última sesión sin querer (el login lo avisa); `null` si no aplica. */
export function useSessionEndReason(): SessionEndReason | null {
  return useSyncExternalStore(subscribeSession, getSessionEndReason, () => null);
}

/** true / false en el cliente; null mientras se desconoce (servidor o renovando al arrancar). */
export function useIsAuthenticated(): boolean | null {
  const status = useSessionStatus();
  return status === null || status === "unknown" ? null : status === "authenticated";
}

export const meQueryKey = ["users", "me"] as const;

/** `GET /v1/users/me` con membresías y organización activa. */
export function useMe(enabled = true) {
  return useQuery({ queryKey: meQueryKey, queryFn: ({ signal }) => fetchMe(signal), enabled });
}

/** `POST /v1/auth/login`: devuelve la sesión o el reto de segundo factor (no guarda nada). */
export function useLogin() {
  return useMutation({ mutationFn: login });
}

export function useVerifyMfa() {
  return useMutation({ mutationFn: verifyMfa });
}

export function useEnrollMfa() {
  return useMutation({ mutationFn: enrollMfa });
}

export function useConfirmMfaEnrollment() {
  return useMutation({ mutationFn: confirmMfaEnrollment });
}

/**
 * Abre la sesión ya obtenida (login, segundo factor o invitación): acceso en memoria y caché
 * vacía, para no mostrar ni un instante datos de otra persona.
 */
export function useStartSession() {
  const client = useQueryClient();
  return (session: SessionResponse) => {
    client.removeQueries();
    applySession(session);
  };
}

/** Cierra la sesión (revocación en el backend y después local) y vacía la caché. */
export function useLogout() {
  const client = useQueryClient();
  return async () => {
    await logout();
    client.clear();
  };
}

/** Cierra todas las sesiones de la persona (`POST /v1/auth/logout-all`). */
export function useLogoutAll() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: logoutAll,
    onSettled: () => client.clear(),
  });
}

const isMeQuery = (key: readonly unknown[]) => key[0] === meQueryKey[0] && key[1] === meQueryKey[1];

/**
 * Cambia la organización activa. Los datos de la anterior no deben verse ni un instante: se
 * descartan las consultas inactivas y se reinician las activas (vuelven a cargar con el token
 * nuevo). `me` se actualiza al momento con la respuesta.
 */
export function useSwitchOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: switchOrganization,
    onSuccess: async (session) => {
      const me = client.getQueryData<MeResponse>(meQueryKey);
      if (me) {
        client.setQueryData<MeResponse>(meQueryKey, {
          ...me,
          memberships: session.memberships,
          activeOrganizationId: session.activeOrganizationId,
        });
      }
      client.removeQueries({ type: "inactive", predicate: (q) => !isMeQuery(q.queryKey) });
      await client.resetQueries({ predicate: (q) => !isMeQuery(q.queryKey) });
      void client.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

/** `PATCH /v1/users/me`: guarda el perfil y pone en caché el `me` que devuelve. */
export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (me) => client.setQueryData<MeResponse>(meQueryKey, me),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: forgotPassword });
}

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}

/** Vista previa pública de una invitación. */
export function useInvitation(token: string) {
  return useQuery({
    queryKey: ["invitations", token],
    queryFn: ({ signal }) => fetchInvitation(token, signal),
    staleTime: 0,
  });
}

export function useAcceptInvitation(token: string) {
  return useMutation({
    mutationFn: ({ body, withSession }: { body: { fullName?: string; password?: string }; withSession: boolean }) =>
      acceptInvitation(token, body, withSession),
  });
}
