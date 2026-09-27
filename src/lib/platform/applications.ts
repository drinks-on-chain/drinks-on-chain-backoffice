"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApproveApplicationResponseSchema,
  WineryApplicationSchema,
  WineryApplicationSummarySchema,
  type ApplicationStatus,
  type MeetingChannel,
  type WineryApplication,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { keys, useInvalidate } from "./query";

// Solicitudes de alta (contrato de la Ola 1 §3). Transiciones del backend: RECEIVED → IN_REVIEW
// (tomar) → MEETING_SCHEDULED ⇄ IN_REVIEW → APPROVED | REJECTED; otra → 409.

export type ApplicationFilters = { status?: ApplicationStatus; q?: string; assigneeId?: string };

const base = "/v1/platform/winery-applications";

export async function fetchApplications(params: ApplicationFilters & PageParams, signal?: AbortSignal) {
  const data = await api(base, { query: params, signal });
  return toPage(data, WineryApplicationSummarySchema, params);
}

export const fetchApplication = (id: string, signal?: AbortSignal) =>
  api(`${base}/${encodeURIComponent(id)}`, { schema: WineryApplicationSchema, signal });

const post = (id: string, action: string, body: unknown = {}) =>
  api(`${base}/${encodeURIComponent(id)}/${action}`, { method: "POST", body, schema: WineryApplicationSchema });

export const takeApplication = (id: string) => post(id, "take");
export const addApplicationNote = (id: string, text: string) => post(id, "notes", { text });
export const scheduleMeeting = (
  id: string,
  body: { scheduledAt: string; channel: MeetingChannel; notes?: string | null },
) => post(id, "schedule-meeting", body);
export const markMeetingDone = (id: string, notes: string) => post(id, "meeting-done", { notes });
export const rejectApplication = (id: string, reason: string) => post(id, "reject", { reason });

export type ApproveBody = { ownerEmail?: string | null; ownerFullName?: string | null; reason?: string | null };

export const approveApplication = (id: string, body: ApproveBody) =>
  api(`${base}/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body,
    schema: ApproveApplicationResponseSchema,
  });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useApplications(params: ApplicationFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.applications, "list", params],
    queryFn: ({ signal }) => fetchApplications(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useApplication(id: string) {
  return useQuery({ queryKey: keys.application(id), queryFn: ({ signal }) => fetchApplication(id, signal) });
}

/** Mutación sobre una solicitud: guarda el detalle devuelto e invalida la bandeja y la bitácora. */
function useApplicationMutation<V>(id: string, fn: (vars: V) => Promise<WineryApplication>) {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      client.setQueryData(keys.application(id), detail);
      return invalidate(keys.applications);
    },
    // Transición inválida (otra persona se adelantó): se recarga el detalle.
    onError: () => client.invalidateQueries({ queryKey: keys.application(id) }),
  });
}

export const useTakeApplication = (id: string) => useApplicationMutation(id, () => takeApplication(id));
export const useAddApplicationNote = (id: string) =>
  useApplicationMutation(id, (text: string) => addApplicationNote(id, text));
export const useScheduleMeeting = (id: string) =>
  useApplicationMutation(id, (body: Parameters<typeof scheduleMeeting>[1]) => scheduleMeeting(id, body));
export const useMarkMeetingDone = (id: string) =>
  useApplicationMutation(id, (notes: string) => markMeetingDone(id, notes));
export const useRejectApplication = (id: string) =>
  useApplicationMutation(id, (reason: string) => rejectApplication(id, reason));

export function useApproveApplication(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ApproveBody) => approveApplication(id, body),
    onSuccess: (result) => {
      client.setQueryData(keys.application(id), result.application);
      client.setQueryData(keys.winery(result.winery.id), result.winery);
      return invalidate(keys.applications, keys.wineries);
    },
    onError: () => client.invalidateQueries({ queryKey: keys.application(id) }),
  });
}
