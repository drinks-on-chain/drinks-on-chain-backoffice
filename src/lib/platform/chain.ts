"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChainAlertSchema,
  ChainEventSchema,
  ChainTransactionSchema,
  PlatformChainAccountsSchema,
  ReconciliationRunDetailSchema,
  ReconciliationRunSchema,
  WineryChainAccountViewSchema,
  WineryChainIdentitySchema,
  type ReconciliationStatus,
  type StartReconciliation,
  type WineryChainAccountView,
} from "@drinks-on-chain/mocks";
import { isTxInProgress } from "@drinks-on-chain/ui";
import { api } from "@/lib/api/client";
import { toPage, type PageParams } from "@/lib/api/envelope";
import { runIdempotent, useIdempotency } from "@/lib/api/idempotency";
import { pollWhile } from "./collections-utils";
import {
  anyTxInProgress,
  identityInProgress,
  type AlertFilters,
  type EventFilters,
  type TxFilters,
} from "./chain-utils";
import { keys, useInvalidate } from "./query";

// Cadena (contrato de la Ola 3 §2.4, §3 y §8.2): transacciones, cuentas de la plataforma, eventos
// del indexador, conciliaciones, alertas e identidad de cada bodega. Leen los cuatro roles;
// reintentar, conciliar, resolver alertas y reaprovisionar, administración y operaciones (`chain`);
// abandonar una transacción y pausar o reanudar un contrato en la red, solo administración
// (`chain.admin`). Ninguna ruta espera a la red: responden con el estado de la transacción.

const base = "/v1/platform/chain";
const id = encodeURIComponent;

/** `GET /v1/platform/chain/transactions?status=&kind=&wineryId=&subjectType=&subjectId=&from=&to=`. */
export async function fetchChainTransactions(params: TxFilters & PageParams, signal?: AbortSignal) {
  const data = await api(`${base}/transactions`, { query: params, signal });
  return toPage(data, ChainTransactionSchema, params);
}

/** `GET /v1/platform/chain/transactions/{id}`: con intentos e historial. */
export const fetchChainTransaction = (txId: string, signal?: AbortSignal) =>
  api(`${base}/transactions/${id(txId)}`, { schema: ChainTransactionSchema, signal });

/** `POST …/transactions/{id}/retry` (`Idempotency-Key`): `FAILED → PENDING`. */
export const retryChainTransaction = (txId: string, reason: string, idempotencyKey: string) =>
  api(`${base}/transactions/${id(txId)}/retry`, {
    method: "POST",
    body: { reason },
    schema: ChainTransactionSchema,
    idempotencyKey,
  });

/** `POST …/transactions/{id}/abandon`: solo administración; nunca emisiones, anclajes ni identidad. */
export const abandonChainTransaction = (txId: string, reason: string) =>
  api(`${base}/transactions/${id(txId)}/abandon`, { method: "POST", body: { reason }, schema: ChainTransactionSchema });

/** `GET /v1/platform/chain/accounts`: cuentas de operaciones y anclaje con su saldo. */
export const fetchChainAccounts = (signal?: AbortSignal) =>
  api(`${base}/accounts`, { schema: PlatformChainAccountsSchema, signal });

/** `GET /v1/platform/chain/events?contract=&type=&txHash=&unmatched=&from=&to=`. */
export async function fetchChainEvents(params: EventFilters & PageParams, signal?: AbortSignal) {
  const data = await api(`${base}/events`, { query: params, signal });
  return toPage(data, ChainEventSchema, params);
}

/** `GET /v1/platform/chain/reconciliation/runs?status=`. */
export async function fetchReconciliationRuns(
  params: { status?: ReconciliationStatus } & PageParams,
  signal?: AbortSignal,
) {
  const data = await api(`${base}/reconciliation/runs`, { query: params, signal });
  return toPage(data, ReconciliationRunSchema, params);
}

/** `GET /v1/platform/chain/reconciliation/runs/{id}`: con sus alertas. */
export const fetchReconciliationRun = (runId: string, signal?: AbortSignal) =>
  api(`${base}/reconciliation/runs/${id(runId)}`, { schema: ReconciliationRunDetailSchema, signal });

/** `POST /v1/platform/chain/reconciliation/runs` → 202. */
export const startReconciliation = (body: StartReconciliation) =>
  api(`${base}/reconciliation/runs`, { method: "POST", body, schema: ReconciliationRunSchema });

/** `GET /v1/platform/chain/alerts?status=open|resolved&level=&code=&wineryId=`. */
export async function fetchChainAlerts(params: AlertFilters & PageParams, signal?: AbortSignal) {
  const data = await api(`${base}/alerts`, { query: params, signal });
  return toPage(data, ChainAlertSchema, params);
}

/** `POST /v1/platform/chain/alerts/{id}/resolve`: con la nota de qué se comprobó. */
export const resolveChainAlert = (alertId: string, note: string) =>
  api(`${base}/alerts/${id(alertId)}/resolve`, { method: "POST", body: { note }, schema: ChainAlertSchema });

/** `GET /v1/platform/wineries/{id}/chain-account`: identidad, NFT por lote y últimas transacciones. */
export const fetchWineryChainAccount = (wineryId: string, signal?: AbortSignal) =>
  api(`/v1/platform/wineries/${id(wineryId)}/chain-account`, { schema: WineryChainAccountViewSchema, signal });

/** `POST /v1/platform/wineries/{id}/chain/provision` → 202 con la identidad. */
export const provisionWineryChain = (wineryId: string, reason: string) =>
  api(`/v1/platform/wineries/${id(wineryId)}/chain/provision`, {
    method: "POST",
    body: { reason },
    schema: WineryChainIdentitySchema,
  });

/** `POST /v1/platform/wineries/{id}/chain/pause|unpause` (`Idempotency-Key`) → 202 con la identidad. */
export const setWineryContractPaused = (wineryId: string, paused: boolean, reason: string, idempotencyKey: string) =>
  api(`/v1/platform/wineries/${id(wineryId)}/chain/${paused ? "pause" : "unpause"}`, {
    method: "POST",
    body: { reason },
    schema: WineryChainIdentitySchema,
    idempotencyKey,
  });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Lista de transacciones: cada 5 s solo mientras alguna de la página siga en curso. */
export function useChainTransactions(params: TxFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.chainTransactions, "list", params],
    queryFn: ({ signal }) => fetchChainTransactions(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => pollWhile(anyTxInProgress(query.state.data?.items)),
    enabled,
  });
}

export function useChainTransaction(txId: string | null) {
  return useQuery({
    queryKey: keys.chainTransaction(txId ?? ""),
    queryFn: ({ signal }) => fetchChainTransaction(txId!, signal),
    refetchInterval: (query) => pollWhile(Boolean(query.state.data && isTxInProgress(query.state.data.status))),
    enabled: txId !== null,
  });
}

export function useChainAccounts(enabled = true) {
  return useQuery({ queryKey: keys.chainAccounts, queryFn: ({ signal }) => fetchChainAccounts(signal), enabled });
}

export function useChainEvents(params: EventFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.chainEvents, params],
    queryFn: ({ signal }) => fetchChainEvents(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Conciliaciones: cada 5 s mientras alguna siga `RUNNING`. */
export function useReconciliationRuns(params: { status?: ReconciliationStatus } & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.chainRuns, "list", params],
    queryFn: ({ signal }) => fetchReconciliationRuns(params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => pollWhile(Boolean(query.state.data?.items.some((r) => r.status === "RUNNING"))),
    enabled,
  });
}

export function useReconciliationRun(runId: string | null) {
  return useQuery({
    queryKey: keys.chainRun(runId ?? ""),
    queryFn: ({ signal }) => fetchReconciliationRun(runId!, signal),
    refetchInterval: (query) => pollWhile(query.state.data?.status === "RUNNING"),
    enabled: runId !== null,
  });
}

export function useChainAlerts(params: AlertFilters & PageParams, enabled = true) {
  return useQuery({
    queryKey: [...keys.chainAlerts, params],
    queryFn: ({ signal }) => fetchChainAlerts(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Cuenta de la bodega en la red: cada 5 s mientras su identidad o sus transacciones sigan en curso. */
export function useWineryChainAccount(wineryId: string, enabled = true) {
  return useQuery({
    queryKey: keys.wineryChain(wineryId),
    queryFn: ({ signal }) => fetchWineryChainAccount(wineryId, signal),
    refetchInterval: (query) =>
      pollWhile(
        identityInProgress(query.state.data?.identity) || anyTxInProgress(query.state.data?.recentTransactions),
      ),
    enabled,
  });
}

/** Toda escritura de la cadena cambia sus listas, el tablero (alertas, saldos) y la bitácora. */
function useChainWrite<V, R>(fn: (vars: V) => Promise<R>, after?: (result: R) => void) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      after?.(result);
      return invalidate(keys.chain, keys.collections);
    },
  });
}

export function useRetryChainTransaction() {
  const client = useQueryClient();
  const idem = useIdempotency();
  return useChainWrite(
    (v: { id: string; reason: string }) => runIdempotent(idem, v, (key) => retryChainTransaction(v.id, v.reason, key)),
    (tx) => client.setQueryData(keys.chainTransaction(tx.id), tx),
  );
}

export function useAbandonChainTransaction() {
  const client = useQueryClient();
  return useChainWrite(
    (v: { id: string; reason: string }) => abandonChainTransaction(v.id, v.reason),
    (tx) => client.setQueryData(keys.chainTransaction(tx.id), tx),
  );
}

export const useStartReconciliation = () => useChainWrite(startReconciliation);

export const useResolveChainAlert = () =>
  useChainWrite((v: { id: string; note: string }) => resolveChainAlert(v.id, v.note));

/** Reaprovisionar, pausar o reanudar: la identidad devuelta sustituye a la de la ficha. */
function useIdentityWrite<V>(wineryId: string, fn: (vars: V) => ReturnType<typeof provisionWineryChain>) {
  const client = useQueryClient();
  return useChainWrite(fn, (identity) =>
    client.setQueryData<WineryChainAccountView>(keys.wineryChain(wineryId), (old) =>
      old ? { ...old, identity } : old,
    ),
  );
}

export const useProvisionWineryChain = (wineryId: string) =>
  useIdentityWrite(wineryId, (reason: string) => provisionWineryChain(wineryId, reason));

export function useSetWineryContractPaused(wineryId: string) {
  const idem = useIdempotency();
  return useIdentityWrite(wineryId, (v: { paused: boolean; reason: string }) =>
    runIdempotent(idem, v, (key) => setWineryContractPaused(wineryId, v.paused, v.reason, key)),
  );
}
