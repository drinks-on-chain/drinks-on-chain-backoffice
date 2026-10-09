"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChainTxRefSchema,
  CollectionSchema,
  CollectionSummarySchema,
  LotClosureSchema,
  LotClosureSummarySchema,
  TokenSchema,
  type Collection,
  type DecideLotClosure,
  type LotClosure,
  type LotClosureStatus,
  type ResolveLotClosureItem,
  type UpdateCollection,
} from "@drinks-on-chain/mocks";
import { isTxInProgress } from "@drinks-on-chain/ui";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { runIdempotent, useIdempotency } from "@/lib/api/idempotency";
import {
  collectionInProgress,
  mintInProgress,
  needsIdempotencyKey,
  pollWhile,
  type CollectionAction,
  type CollectionFilters,
  type TokenFilters,
} from "./collections-utils";
import { keys, useInvalidate } from "./query";

// Colecciones (contrato de la Ola 3 §6.4 y §8.4). Leen los cuatro roles de plataforma; publicar,
// pausar, reanudar, cerrar y editar, administración y operaciones. La pausa de una colección es
// comercial y nunca toca la red (la del contrato está en `chain.ts`). Ampliar la cuota no es una
// acción de aquí: la pide la bodega y se aprueba en la bandeja (S-14).

const base = "/v1/platform/collections";
const path = (id: string, rest = "") => `${base}/${encodeURIComponent(id)}${rest}`;

/** `GET /v1/platform/collections?status=&saleState=&wineryId=&mintStatus=&q=`. */
export async function fetchCollections(params: CollectionFilters & PageParams, signal?: AbortSignal) {
  const data = await api(base, { query: params, signal });
  return toPage(data, CollectionSummarySchema, params);
}

/** `GET /v1/platform/collections/{id}`: con emisiones, historiales, cierre y métricas. */
export const fetchCollection = (id: string, signal?: AbortSignal) =>
  api(path(id), { schema: CollectionSchema, signal });

/** `PATCH /v1/platform/collections/{id}`: datos comerciales, precio y fecha de canje (motivo obligatorio). */
export const updateCollection = (id: string, body: UpdateCollection) =>
  api(path(id), { method: "PATCH", body, schema: CollectionSchema });

/** `POST …/{id}/publish|pause|resume|close`; las tres primeras con `Idempotency-Key`. */
export const runCollectionAction = (
  id: string,
  action: CollectionAction,
  body: { reason: string | null },
  idempotencyKey?: string,
) => api(path(id, `/${action}`), { method: "POST", body, schema: CollectionSchema, idempotencyKey });

/** `GET …/{id}/tokens?status=&fromNumber=&toNumber=`: NFT por botella, paginados. */
export async function fetchCollectionTokens(id: string, params: TokenFilters & PageParams, signal?: AbortSignal) {
  const data = await api(path(id, "/tokens"), { query: params, signal });
  return toPage(data, TokenSchema, params);
}

/** `GET …/{id}/transactions`: emisiones y quemas de la colección. */
export async function fetchCollectionTransactions(id: string, params: PageParams, signal?: AbortSignal) {
  const data = await api(path(id, "/transactions"), { query: params, signal });
  return toPage(data, ChainTxRefSchema, params);
}

/** `GET /v1/platform/lot-closures?status=&wineryId=`: cierres de lote, sin sus ítems. */
export async function fetchLotClosures(
  params: { status?: LotClosureStatus; wineryId?: string } & PageParams,
  signal?: AbortSignal,
) {
  const data = await api("/v1/platform/lot-closures", { query: params, signal });
  return toPage(data, LotClosureSummarySchema, params);
}

/**
 * `GET …/{id}/closure`: cierre calculado del lote. Con el lote sin embotellar ni descartar responde
 * 409 `TOK_CLOSURE_NOT_APPLICABLE`: aquí es `null` (todavía no hay cierre que mirar).
 */
export async function fetchClosure(id: string, signal?: AbortSignal): Promise<LotClosure | null> {
  try {
    return await api(path(id, "/closure"), { schema: LotClosureSchema, signal });
  } catch (error) {
    if (error instanceof ApiError && error.code === "TOK_CLOSURE_NOT_APPLICABLE") return null;
    throw error;
  }
}

/** `POST …/{id}/closure/decide` (`Idempotency-Key`): encola las quemas. Quemas y faltante, solo ADMIN. */
export const decideClosure = (id: string, body: DecideLotClosure, idempotencyKey: string) =>
  api(path(id, "/closure/decide"), { method: "POST", body, schema: LotClosureSchema, idempotencyKey });

/** `POST …/{id}/closure/items/{tokenId}/resolve`: devolución o sustitución de un NFT vendido sin botella. */
export const resolveClosureItem = (id: string, tokenId: number, body: ResolveLotClosureItem) =>
  api(path(id, `/closure/items/${tokenId}/resolve`), { method: "POST", body, schema: LotClosureSchema });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Lista: se refresca cada 5 s solo mientras alguna colección de la página esté emitiendo. */
export function useCollections(params: CollectionFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.collections, "list", params],
    queryFn: ({ signal }) => fetchCollections(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => pollWhile(Boolean(query.state.data?.items.some(mintInProgress))),
    enabled,
  });
}

/** Detalle: se refresca cada 5 s solo mientras haya una transacción suya en curso (§2.4). */
export function useCollection(id: string) {
  return useQuery({
    queryKey: keys.collection(id),
    queryFn: ({ signal }) => fetchCollection(id, signal),
    refetchInterval: (query) => pollWhile(collectionInProgress(query.state.data)),
  });
}

export function useCollectionTokens(id: string, params: TokenFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.collectionParts(id), "tokens", params],
    queryFn: ({ signal }) => fetchCollectionTokens(id, params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCollectionTransactions(id: string, params: PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.collectionParts(id), "transactions", params],
    queryFn: ({ signal }) => fetchCollectionTransactions(id, params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => pollWhile(Boolean(query.state.data?.items.some((t) => isTxInProgress(t.status)))),
    enabled,
  });
}

/** Cierre del lote; con quemas en curso se refresca cada 5 s. */
export function useClosure(id: string, enabled = true) {
  return useQuery({
    queryKey: [...keys.collectionParts(id), "closure"],
    queryFn: ({ signal }) => fetchClosure(id, signal),
    refetchInterval: (query) =>
      pollWhile(Boolean(query.state.data?.items.some((i) => i.burnTx && isTxInProgress(i.burnTx.status)))),
    enabled,
  });
}

/** Cierres con faltante sin decidir (aviso de la lista de colecciones). */
export function useOpenShortfalls(enabled = true) {
  return useQuery({
    queryKey: [...keys.collections, "shortfalls"],
    queryFn: ({ signal }) => fetchLotClosures({ status: "SHORTFALL_OPEN", limit: 100 }, signal),
    enabled,
  });
}

/** Tras una escritura: el detalle, sus partes (NFT, transacciones, cierre), la lista y la cadena. */
function useCollectionWrite<V>(id: string, fn: (vars: V) => Promise<Collection>) {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      client.setQueryData(keys.collection(id), detail);
      return invalidate(keys.collections, keys.collectionParts(id), keys.chain);
    },
    onError: () => client.invalidateQueries({ queryKey: keys.collection(id) }),
  });
}

export const useUpdateCollection = (id: string) =>
  useCollectionWrite(id, (body: UpdateCollection) => updateCollection(id, body));

/** Publicar, pausar, reanudar o cerrar; la clave de idempotencia sobrevive a un fallo de red. */
export function useCollectionAction(id: string) {
  const idem = useIdempotency();
  return useCollectionWrite(id, (v: { action: CollectionAction; reason: string | null }) => {
    const body = { reason: v.reason };
    return needsIdempotencyKey(v.action)
      ? runIdempotent(idem, v, (key) => runCollectionAction(id, v.action, body, key))
      : runCollectionAction(id, v.action, body);
  });
}

/** Tras decidir o resolver: el cierre devuelto, la colección (recuentos, quemas) y la cadena. */
function useClosureWrite<V>(id: string, fn: (vars: V) => Promise<LotClosure>) {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (closure) => {
      client.setQueryData([...keys.collectionParts(id), "closure"], closure);
      return invalidate(keys.collections, keys.chain);
    },
    onError: () => client.invalidateQueries({ queryKey: keys.collectionParts(id) }),
  });
}

export function useDecideClosure(id: string) {
  const idem = useIdempotency();
  return useClosureWrite(id, (body: DecideLotClosure) =>
    runIdempotent(idem, body, (key) => decideClosure(id, body, key)),
  );
}

export const useResolveClosureItem = (id: string) =>
  useClosureWrite(id, (v: { tokenId: number; body: ResolveLotClosureItem }) =>
    resolveClosureItem(id, v.tokenId, v.body),
  );
