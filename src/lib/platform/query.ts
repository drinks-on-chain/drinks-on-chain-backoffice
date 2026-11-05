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
  lots: (wineryId: string) => ["platform", "lots", wineryId] as const,
  users: ["platform", "users"] as const,
  // Ola 3: tokenización, colecciones y cadena.
  tokenizationRequests: ["platform", "tokenization-requests"] as const,
  tokenizationRequest: (id: string) => ["platform", "tokenization-requests", "detail", id] as const,
  collections: ["platform", "collections"] as const,
  collection: (id: string) => ["platform", "collections", "detail", id] as const,
  collectionParts: (id: string) => ["platform", "collections", "parts", id] as const,
  chain: ["platform", "chain"] as const,
  chainTransactions: ["platform", "chain", "transactions"] as const,
  chainTransaction: (id: string) => ["platform", "chain", "transactions", "detail", id] as const,
  chainAccounts: ["platform", "chain", "accounts"] as const,
  chainEvents: ["platform", "chain", "events"] as const,
  chainRuns: ["platform", "chain", "runs"] as const,
  chainRun: (id: string) => ["platform", "chain", "runs", "detail", id] as const,
  chainAlerts: ["platform", "chain", "alerts"] as const,
  wineryChain: (wineryId: string) => ["platform", "chain", "winery", wineryId] as const,
  uploadUrl: (key: string) => ["platform", "upload-url", key] as const,
};

/** Invalida las claves dadas, el tablero y la bitácora (tras cualquier escritura). */
export function useInvalidate() {
  const client = useQueryClient();
  return (...extra: QueryKey[]) =>
    Promise.all([keys.dashboard, keys.audit, ...extra].map((queryKey) => client.invalidateQueries({ queryKey }))).then(
      () => undefined,
    );
}
