"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WineryDetailSchema,
  WinerySummarySchema,
  WineryWithInvitationSchema,
  type WineryCategory,
  type WineryDetail,
  type WineryStatus,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { fetchAllPages } from "@/lib/api/pagination";
import { keys, useInvalidate } from "./query";

// Bodegas en el back office (contrato de la Ola 1 §4): directorio, alta directa, ficha, perfil,
// suspender / reactivar / revocar y transferencia de titularidad. Toda acción lleva `reason`.

export type WineryFilters = { status?: WineryStatus; region?: string; category?: WineryCategory; q?: string };

/** Campos editables del perfil (alta directa y `PATCH`). */
export type WineryProfileInput = {
  legalName: string;
  tradeName: string;
  taxId: string;
  category: WineryCategory;
  region: string;
  address?: string | null;
  senasagRegistration?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  logoUrl?: string | null;
  publicStory?: string | null;
  website?: string | null;
};

export type CreateWineryBody = WineryProfileInput & {
  ownerEmail: string;
  ownerFullName: string;
  reason?: string | null;
};

export type WineryStatusAction = "suspend" | "reactivate" | "revoke";

const base = "/v1/platform/wineries";
const path = (id: string) => `${base}/${encodeURIComponent(id)}`;

export async function fetchWineries(params: WineryFilters & PageParams, signal?: AbortSignal) {
  const data = await api(base, { query: params, signal });
  return toPage(data, WinerySummarySchema, params);
}

export const fetchWinery = (id: string, signal?: AbortSignal) => api(path(id), { schema: WineryDetailSchema, signal });

export const createWinery = (body: CreateWineryBody) =>
  api(base, { method: "POST", body, schema: WineryWithInvitationSchema });

export const updateWinery = (id: string, body: Partial<WineryProfileInput> & { reason: string }) =>
  api(path(id), { method: "PATCH", body, schema: WineryDetailSchema });

export const changeWineryStatus = (id: string, action: WineryStatusAction, reason: string) =>
  api(`${path(id)}/${action}`, { method: "POST", body: { reason }, schema: WineryDetailSchema });

export type TransferBody = { newOwnerEmail: string; reason: string; keepPreviousOwnerAs: "ENOLOGIST" | "BLOCKED" };

export const transferOwnership = (id: string, body: TransferBody) =>
  api(`${path(id)}/transfer-ownership`, { method: "POST", body, schema: WineryWithInvitationSchema });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useWineries(params: WineryFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.wineries, "list", params],
    queryFn: ({ signal }) => fetchWineries(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Todas las bodegas (en páginas de 100) para los selectores: ajustes por bodega, filtros de la
 * bitácora y la paleta. Son decenas; cambian poco.
 */
export function useAllWineries(enabled = true) {
  return useQuery({
    queryKey: [...keys.wineries, "all"],
    queryFn: ({ signal }) => fetchAllPages((p) => fetchWineries(p, signal)).then((page) => page.items),
    staleTime: 60_000,
    enabled,
  });
}

export function useWinery(id: string, enabled = true) {
  return useQuery({ queryKey: keys.winery(id), queryFn: ({ signal }) => fetchWinery(id, signal), enabled });
}

function useSetWinery() {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return (winery: WineryDetail) => {
    client.setQueryData(keys.winery(winery.id), winery);
    return invalidate(keys.wineries);
  };
}

export function useCreateWinery() {
  const setWinery = useSetWinery();
  return useMutation({ mutationFn: createWinery, onSuccess: (r) => setWinery(r.winery) });
}

export function useUpdateWinery(id: string) {
  const setWinery = useSetWinery();
  return useMutation({
    mutationFn: (body: Partial<WineryProfileInput> & { reason: string }) => updateWinery(id, body),
    onSuccess: setWinery,
  });
}

export function useChangeWineryStatus(id: string) {
  const setWinery = useSetWinery();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: WineryStatusAction; reason: string }) => changeWineryStatus(id, v.action, v.reason),
    onSuccess: (w) => {
      // Revocar anula las invitaciones pendientes: el equipo cambia.
      void client.invalidateQueries({ queryKey: keys.members(id) });
      return setWinery(w);
    },
  });
}

export function useTransferOwnership(id: string) {
  const setWinery = useSetWinery();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TransferBody) => transferOwnership(id, body),
    onSuccess: (r) => {
      void client.invalidateQueries({ queryKey: keys.members(id) });
      return setWinery(r.winery);
    },
  });
}
