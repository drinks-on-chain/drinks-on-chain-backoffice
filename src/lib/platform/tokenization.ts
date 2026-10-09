"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PlatformTokenizationRequestSchema,
  SignedUrlResponseSchema,
  TokenizationApprovalSchema,
  TokenizationRequestSummarySchema,
  UploadResponseSchema,
  type ApproveTokenizationRequest,
  type PlatformTokenizationRequest,
  type RequestTokenizationChanges,
  type ReviewTokenizationRequest,
} from "@drinks-on-chain/mocks";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { runIdempotent, useIdempotency } from "@/lib/api/idempotency";
import { keys, useInvalidate } from "./query";
import type { TokenizationFilters } from "./tokenization-utils";

// Bandeja de solicitudes de tokenización (contrato de la Ola 3 §5.4, con las precisiones de
// `drinks-on-chain-mocks/docs/CONTRATO.md` §13.2). Leen los cuatro roles de plataforma; escriben
// administración y operaciones (soporte → 403). La cuota la autoriza la bodega desde el ERP: aquí se
// revisa, se completan los datos comerciales y el precio, y se decide. Todas las escrituras
// devuelven la solicitud con `internalNotes`, `priceSuggestion` y `review`.

const base = "/v1/platform/tokenization-requests";
const path = (id: string, action = "") => `${base}/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

/** `GET /v1/platform/tokenization-requests?status=&kind=&wineryId=&assigneeId=&q=` (sin `status`: abiertas). */
export async function fetchTokenizationRequests(params: TokenizationFilters & PageParams, signal?: AbortSignal) {
  const data = await api(base, { query: params, signal });
  return toPage(data, TokenizationRequestSummarySchema, params);
}

/** `GET /v1/platform/tokenization-requests/{id}`: la solicitud con su revisión. */
export const fetchTokenizationRequest = (id: string, signal?: AbortSignal) =>
  api(path(id), { schema: PlatformTokenizationRequestSchema, signal });

const post = (id: string, action: string, body: unknown = {}) =>
  api(path(id, action), { method: "POST", body, schema: PlatformTokenizationRequestSchema });

/** `POST …/{id}/take`: `SUBMITTED → IN_REVIEW`, asignada a quien la toma. */
export const takeTokenizationRequest = (id: string) => post(id, "take");

/** `POST …/{id}/notes` → 201: nota interna. */
export const addTokenizationNote = (id: string, text: string) => post(id, "notes", { text });

/** `PATCH …/{id}`: datos comerciales y precio antes de aprobar (solo `IN_REVIEW`). */
export const reviewTokenizationRequest = (id: string, body: ReviewTokenizationRequest) =>
  api(path(id), { method: "PATCH", body, schema: PlatformTokenizationRequestSchema });

/** `POST …/{id}/request-changes`: `IN_REVIEW → CHANGES_REQUESTED` (correo al dueño con el mensaje). */
export const requestTokenizationChanges = (id: string, body: RequestTokenizationChanges) =>
  post(id, "request-changes", body);

/** `POST …/{id}/reject`: `→ REJECTED` (correo al dueño con el motivo). */
export const rejectTokenizationRequest = (id: string, reason: string) => post(id, "reject", { reason });

/**
 * `POST …/{id}/approve` → 201 `{ request, collection, mint }`. `Idempotency-Key` obligatoria: crea
 * la colección (o amplía la cuota) y la emisión.
 */
export const approveTokenizationRequest = (id: string, body: ApproveTokenizationRequest, idempotencyKey: string) =>
  api(path(id, "approve"), { method: "POST", body, schema: TokenizationApprovalSchema, idempotencyKey });

/** `POST /v1/uploads?folder=colecciones` (multipart, campo `file`): imagen de una colección. */
export function uploadCollectionImage(file: File) {
  const body = new FormData();
  body.append("file", file);
  return api("/v1/uploads", { method: "POST", query: { folder: "colecciones" }, body, schema: UploadResponseSchema });
}

/** `GET /v1/uploads/url?key=`: URL firmada de corta vida de un archivo subido. */
export const fetchUploadUrl = (key: string, signal?: AbortSignal) =>
  api("/v1/uploads/url", { query: { key }, schema: SignedUrlResponseSchema, signal });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useTokenizationRequests(params: TokenizationFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.tokenizationRequests, "list", params],
    queryFn: ({ signal }) => fetchTokenizationRequests(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTokenizationRequest(id: string) {
  return useQuery({
    queryKey: keys.tokenizationRequest(id),
    queryFn: ({ signal }) => fetchTokenizationRequest(id, signal),
  });
}

/** Mutación sobre una solicitud: guarda el detalle devuelto e invalida la bandeja y el tablero. */
function useRequestMutation<V>(id: string, fn: (vars: V) => Promise<PlatformTokenizationRequest>) {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      client.setQueryData(keys.tokenizationRequest(id), detail);
      return invalidate(keys.tokenizationRequests);
    },
    // Transición inválida (otra persona se adelantó) o regla incumplida: se recarga el detalle.
    onError: () => client.invalidateQueries({ queryKey: keys.tokenizationRequest(id) }),
  });
}

export const useTakeTokenizationRequest = (id: string) => useRequestMutation(id, () => takeTokenizationRequest(id));
export const useAddTokenizationNote = (id: string) =>
  useRequestMutation(id, (text: string) => addTokenizationNote(id, text));
export const useReviewTokenizationRequest = (id: string) =>
  useRequestMutation(id, (body: ReviewTokenizationRequest) => reviewTokenizationRequest(id, body));
export const useRequestTokenizationChanges = (id: string) =>
  useRequestMutation(id, (body: RequestTokenizationChanges) => requestTokenizationChanges(id, body));
export const useRejectTokenizationRequest = (id: string) =>
  useRequestMutation(id, (reason: string) => rejectTokenizationRequest(id, reason));

/** Aprobar: una sola colección y una sola emisión aunque la respuesta se pierda y se repita. */
export function useApproveTokenizationRequest(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  const idem = useIdempotency();
  return useMutation({
    mutationFn: (body: ApproveTokenizationRequest) =>
      runIdempotent(idem, body, (key) => approveTokenizationRequest(id, body, key)),
    onSuccess: (result) => {
      client.setQueryData(keys.tokenizationRequest(id), result.request);
      client.setQueryData(keys.collection(result.collection.id), result.collection);
      return invalidate(keys.tokenizationRequests, keys.collections, keys.chain);
    },
    onError: () => client.invalidateQueries({ queryKey: keys.tokenizationRequest(id) }),
  });
}

export const useUploadCollectionImage = () => useMutation({ mutationFn: uploadCollectionImage });

/** URL firmada para previsualizar una imagen del borrador (caduca: se pide de nuevo a los 4 min). */
export function useUploadUrl(key: string, enabled = true) {
  return useQuery({
    queryKey: keys.uploadUrl(key),
    queryFn: ({ signal }) => fetchUploadUrl(key, signal),
    staleTime: 4 * 60_000,
    enabled,
  });
}
