"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  WaitlistEntrySchema,
  WaitlistSourcesSchema,
  type UpdateWaitlistEntryDto,
  type WaitlistType,
} from "@drinks-on-chain/mocks";
import { api, apiFile } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { keys, useInvalidate } from "./query";
import { exportedRows, type WaitlistFilters } from "./waitlist-utils";

// Lista de espera (contrato O1b §2, backend v0.1.1). Leen los cuatro roles de plataforma
// (capacidad `waitlist`: FULL o READ); el PATCH y la exportación, solo FULL (soporte → 403).

const base = "/v1/platform/waitlist";

/** Más filas que el máximo de una exportación (50.000). */
export const WAITLIST_EXPORT_TOO_LARGE = "WAITLIST_EXPORT_TOO_LARGE";

export const isExportTooLarge = (error: unknown) =>
  error instanceof ApiError && error.code === WAITLIST_EXPORT_TOO_LARGE;

/** `GET /v1/platform/waitlist`: página de inscripciones, la más reciente primero. */
export async function fetchWaitlist(params: WaitlistFilters & PageParams, signal?: AbortSignal) {
  const data = await api(base, { query: params, signal });
  return toPage(data, WaitlistEntrySchema, params);
}

/** `GET /v1/platform/waitlist/sources?type=`: orígenes con su recuento (`null` = sin origen). */
export const fetchWaitlistSources = (type: WaitlistType, signal?: AbortSignal) =>
  api(`${base}/sources`, { query: { type }, schema: WaitlistSourcesSchema, signal });

/** `PATCH /v1/platform/waitlist/{id}`: estado y notas (`notes: null` las borra). */
export const updateWaitlistEntry = (id: string, body: UpdateWaitlistEntryDto) =>
  api(`${base}/${encodeURIComponent(id)}`, { method: "PATCH", body, schema: WaitlistEntrySchema });

/**
 * `GET /v1/platform/waitlist/export`: CSV con los mismos filtros que la lista. Devuelve el archivo,
 * su nombre (`Content-Disposition`) y cuántas filas lleva (`X-Export-Rows`).
 */
export async function exportWaitlist(filters: WaitlistFilters) {
  const file = await apiFile(`${base}/export`, { query: filters, accept: "text/csv" });
  return {
    blob: file.blob,
    filename: file.filename,
    rows: await exportedRows(file.headers.get("X-Export-Rows"), file.blob),
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useWaitlist(params: WaitlistFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.waitlist, "list", params],
    queryFn: ({ signal }) => fetchWaitlist(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Orígenes de un tipo: opciones del filtro y, sumados, el total de la pestaña. */
export function useWaitlistSources(type: WaitlistType, enabled = true) {
  return useQuery({
    queryKey: [...keys.waitlist, "sources", type],
    queryFn: ({ signal }) => fetchWaitlistSources(type, signal),
    enabled,
  });
}

/** Cambia el estado o las notas; la lista, el tablero y la bitácora se releen. */
export function useUpdateWaitlistEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateWaitlistEntryDto }) => updateWaitlistEntry(v.id, v.body),
    onSuccess: () => invalidate(keys.waitlist),
  });
}

/** La exportación deja un evento en la bitácora. */
export function useExportWaitlist() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: exportWaitlist, onSuccess: () => invalidate() });
}
