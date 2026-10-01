"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";

// Claves de las consultas del back office. Toda escritura deja una entrada en la bitácora y
// puede cambiar el tablero: se invalidan siempre, además de las listas del recurso.

export const keys = {
  dashboard: ["platform", "dashboard"] as const,
  applications: ["platform", "applications"] as const,
  application: (id: string) => ["platform", "applications", "detail", id] as const,
  wineries: ["platform", "wineries"] as const,
  winery: (id: string) => ["platform", "wineries", "detail", id] as const,
  members: (organizationId: string) => ["platform", "members", organizationId] as const,
  accounts: ["platform", "accounts"] as const,
  settings: ["platform", "settings"] as const,
  setting: (key: string) => ["platform", "settings", key] as const,
  audit: ["platform", "audit"] as const,
  waitlist: ["platform", "waitlist"] as const,
  users: ["platform", "users"] as const,
};

/** Invalida las claves dadas, el tablero y la bitácora (tras cualquier escritura). */
export function useInvalidate() {
  const client = useQueryClient();
  return (...extra: QueryKey[]) =>
    Promise.all([keys.dashboard, keys.audit, ...extra].map((queryKey) => client.invalidateQueries({ queryKey }))).then(
      () => undefined,
    );
}
