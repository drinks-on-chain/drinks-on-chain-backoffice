"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { AuditEventSchema, AuditVerifyResultSchema } from "@drinks-on-chain/mocks";
import { api, apiFile } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { keys } from "./query";

// Bitácora (contrato de la Ola 1 §7): lista con filtros (orden descendente por `seq`),
// exportación CSV con los mismos filtros (máx. 50 000 filas) y verificación de la cadena (ADMIN).

export type AuditFilters = {
  /** `AAAA-MM-DD` (día completo) o ISO. */
  from?: string;
  to?: string;
  actorId?: string;
  organizationId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
};

export async function fetchAudit(params: AuditFilters & PageParams, signal?: AbortSignal) {
  const data = await api("/v1/platform/audit", { query: params, signal });
  return toPage(data, AuditEventSchema, params);
}

export const exportAudit = (filters: AuditFilters) =>
  apiFile("/v1/platform/audit/export", { query: filters, accept: "text/csv" });

export const verifyAudit = (range: Pick<AuditFilters, "from" | "to">) =>
  api("/v1/platform/audit/verify", { query: range, schema: AuditVerifyResultSchema });

export function useAudit(params: AuditFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.audit, "list", params],
    queryFn: ({ signal }) => fetchAudit(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const useExportAudit = () => useMutation({ mutationFn: exportAudit });
export const useVerifyAudit = () => useMutation({ mutationFn: verifyAudit });

/** Nombre del archivo de la exportación: `bitacora-2026-09-27-1430.csv`. */
export function exportFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `bitacora-${day}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
}

/** Guarda un archivo en el equipo (enlace temporal con `download`). */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después: algunos navegadores leen la URL tras el clic.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
