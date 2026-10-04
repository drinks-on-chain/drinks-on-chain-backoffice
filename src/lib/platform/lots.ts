"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LOT_STAGE_CODES, LotSummarySchema, type LotLockInfo, type LotStageCode } from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { fmtDate, fmtDaysLeft } from "@/lib/format";
import { keys } from "./query";

// Lotes de una bodega vistos desde la plataforma (contrato de la Ola 2 §2.5, §14 y §20): solo
// lectura. `GET /v1/lots?wineryId=` responde la lista de `LotSummary` (más reciente primero);
// cualquier escritura de la plataforma sobre la trazabilidad es un 403 `TRC_PLATFORM_READ_ONLY`,
// así que aquí no hay ninguna.

/** Parámetros de la URL de la pestaña «Lotes» de la ficha de bodega. */
export const LOT_PARAMS = { stage: "etapa", q: "q" } as const;

/** `q` busca en el nombre, la referencia y el código de lote. */
export type LotFilters = { stage?: LotStageCode; q?: string };

/** URL → filtros: una etapa desconocida se ignora (no debe provocar un 422). */
export function lotFiltersFrom(get: (key: string) => string | null): LotFilters {
  const q = get(LOT_PARAMS.q)?.trim();
  return { stage: LOT_STAGE_CODES.find((s) => s === get(LOT_PARAMS.stage)), q: q || undefined };
}

export const hasLotFilters = (f: LotFilters) => Boolean(f.stage || f.q);

/** `GET /v1/lots?wineryId=&stage=&q=`: lotes de una bodega (la plataforma lee con `wineryId`). */
export async function fetchWineryLots(wineryId: string, params: LotFilters & PageParams, signal?: AbortSignal) {
  const data = await api("/v1/lots", { query: { wineryId, ...params }, signal });
  return toPage(data, LotSummarySchema, params);
}

export function useWineryLots(wineryId: string, params: LotFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.lots(wineryId), params],
    queryFn: ({ signal }) => fetchWineryLots(wineryId, params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Candado siguiente del lote en una línea: «Reposo hasta el 13 oct 2026 · Faltan 18 días» o
 * «Crianza · Liberado»; `null` si el lote no tiene ninguno.
 */
export function lockLabel(lock: LotLockInfo | null): string | null {
  if (!lock) return null;
  const kind = lock.kind === "AGING" ? "Crianza" : "Reposo";
  if (lock.released || lock.daysRemaining <= 0) return `${kind} · ${fmtDaysLeft(0)}`;
  return `${kind} hasta el ${fmtDate(lock.unlockDate)} · ${fmtDaysLeft(lock.daysRemaining)}`;
}
