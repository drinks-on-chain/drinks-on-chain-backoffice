"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  SettingDefinitionSchema,
  SettingHistoryEntrySchema,
  SettingOverrideSchema,
  SettingOverridesUpdatedSchema,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/envelope";
import { fetchAllPages } from "@/lib/api/pagination";
import { keys, useInvalidate } from "./query";

// Configuración en dos niveles (contrato de la Ola 1 §6): estándar general, ajustes por bodega
// (a una selección o a todas), excepción al mínimo legal (solo administración), "volver al
// estándar" e historial. Todas las escrituras son de administración y llevan `reason`.

const settingPath = (key: string) => `/v1/platform/settings/${encodeURIComponent(key)}`;

export const fetchSettings = (signal?: AbortSignal) =>
  api("/v1/platform/settings", { schema: z.array(SettingDefinitionSchema), signal });

export const fetchOverrides = (key: string, signal?: AbortSignal) =>
  fetchAllPages(async (p) =>
    toPage(await api(`${settingPath(key)}/overrides`, { query: p, signal }), SettingOverrideSchema, p),
  ).then((page) => page.items);

export const fetchSettingHistory = (key: string, signal?: AbortSignal) =>
  fetchAllPages(
    async (p) => toPage(await api(`${settingPath(key)}/history`, { query: p, signal }), SettingHistoryEntrySchema, p),
    { maxItems: 500 },
  ).then((page) => page.items);

export const updateSetting = (key: string, body: { value: unknown; reason: string }) =>
  api(settingPath(key), { method: "PUT", body, schema: SettingDefinitionSchema });

export type WineryIds = string[] | "ALL";

export const setOverrides = (
  key: string,
  body: { wineryIds: WineryIds; value: unknown; reason: string; legalException?: boolean },
) => api(`${settingPath(key)}/overrides`, { method: "PUT", body, schema: SettingOverridesUpdatedSchema });

export const resetOverrides = (key: string, body: { wineryIds: WineryIds; reason: string }) =>
  api(`${settingPath(key)}/overrides/reset`, {
    method: "POST",
    body,
    schema: z.object({ reset: z.number().int().min(0) }),
  });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: ({ signal }) => fetchSettings(signal) });
}

export function useSettingOverrides(key: string, enabled = true) {
  return useQuery({
    queryKey: [...keys.setting(key), "overrides"],
    queryFn: ({ signal }) => fetchOverrides(key, signal),
    enabled,
  });
}

export function useSettingHistory(key: string) {
  return useQuery({
    queryKey: [...keys.setting(key), "history"],
    queryFn: ({ signal }) => fetchSettingHistory(key, signal),
  });
}

export function useUpdateSetting(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { value: unknown; reason: string }) => updateSetting(key, body),
    onSuccess: () => invalidate(keys.settings),
  });
}

export function useSetOverrides(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Parameters<typeof setOverrides>[1]) => setOverrides(key, body),
    onSuccess: () => invalidate(keys.settings),
  });
}

export function useResetOverrides(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { wineryIds: WineryIds; reason: string }) => resetOverrides(key, body),
    onSuccess: () => invalidate(keys.settings),
  });
}
