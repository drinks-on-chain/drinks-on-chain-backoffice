import { isTxInProgress } from "@drinks-on-chain/ui";
import {
  CHAIN_ALERT_LEVELS,
  CHAIN_SUBJECT_TYPES,
  CHAIN_TX_KINDS,
  CHAIN_TX_STATUSES,
  RECONCILIATION_STATUSES,
  type ChainAlertLevel,
  type ChainSubjectType,
  type ChainTransaction,
  type ChainTxKind,
  type ChainTxRef,
  type ChainTxStatus,
  type PlatformChainAccounts,
  type ReconciliationStatus,
  type WineryChainIdentity,
} from "@drinks-on-chain/mocks";
import { NON_ABANDONABLE_TX_KINDS } from "./chain-labels";

// Modelos puros de la sección «Cadena» (contrato de la Ola 3 §2.4, §3 y §8): filtros ↔ URL,
// acciones según el estado y los permisos, y avisos de saldo.

const oneOf = <T extends string>(values: readonly T[], raw: string | null) => values.find((v) => v === raw);
const isDay = (raw: string | null): raw is string => Boolean(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw));

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

export const TX_PARAMS = {
  status: "estado",
  kind: "tipo",
  winery: "bodega",
  subjectType: "sujeto",
  subjectId: "sujetoId",
  from: "desde",
  to: "hasta",
  /** Transacción abierta en el panel lateral. */
  open: "tx",
} as const;

export type TxFilters = {
  status?: ChainTxStatus;
  kind?: ChainTxKind;
  wineryId?: string;
  subjectType?: ChainSubjectType;
  subjectId?: string;
  from?: string;
  to?: string;
};

export function txFiltersFrom(get: (key: string) => string | null): TxFilters {
  const from = get(TX_PARAMS.from);
  const to = get(TX_PARAMS.to);
  return {
    status: oneOf(CHAIN_TX_STATUSES, get(TX_PARAMS.status)),
    kind: oneOf(CHAIN_TX_KINDS, get(TX_PARAMS.kind)),
    wineryId: get(TX_PARAMS.winery) || undefined,
    subjectType: oneOf(CHAIN_SUBJECT_TYPES, get(TX_PARAMS.subjectType)),
    subjectId: get(TX_PARAMS.subjectId) || undefined,
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
  };
}

/** Enlace a las transacciones filtradas o a una abierta en el panel. */
export function transactionsHref(filters: { status?: ChainTxStatus; wineryId?: string; open?: string } = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set(TX_PARAMS.status, filters.status);
  if (filters.wineryId) params.set(TX_PARAMS.winery, filters.wineryId);
  if (filters.open) params.set(TX_PARAMS.open, filters.open);
  const qs = params.toString();
  return qs ? `/cadena?${qs}` : "/cadena";
}

/** Alguna transacción sigue en curso (`PENDING`…`RETRYING`): se consulta cada 5 s mientras dure. */
export const anyTxInProgress = (txs: readonly Pick<ChainTxRef, "status">[] | undefined) =>
  Boolean(txs?.some((t) => isTxInProgress(t.status)));

export type TxActions = { retry: boolean; abandon: boolean; abandonBlocked: string | null };

/**
 * Reintentar: solo una `FAILED` sin abandonar (`chain.manage`). Abandonar: solo administración
 * (`chain.admin`) y nunca emisiones, anclajes ni identidad, que deben terminar.
 */
export function txActions(
  tx: Pick<ChainTransaction, "status" | "kind" | "abandoned">,
  perms: { manage: boolean; admin: boolean },
): TxActions {
  const failed = tx.status === "FAILED" && tx.abandoned === null;
  const abandonable = !NON_ABANDONABLE_TX_KINDS.includes(tx.kind);
  return {
    retry: failed && perms.manage,
    abandon: failed && perms.admin && abandonable,
    abandonBlocked:
      failed && perms.admin && !abandonable
        ? "No se puede abandonar: emisiones, anclajes e identidad deben terminar. Reinténtala."
        : null,
  };
}

// ---------------------------------------------------------------------------
// Eventos, conciliaciones y alertas
// ---------------------------------------------------------------------------

export const EVENT_PARAMS = {
  contract: "contrato",
  type: "tipo",
  txHash: "hash",
  unmatched: "sinOrigen",
  from: "desde",
  to: "hasta",
} as const;

export type EventFilters = {
  contract?: string;
  type?: string;
  txHash?: string;
  unmatched?: boolean;
  from?: string;
  to?: string;
};

export function eventFiltersFrom(get: (key: string) => string | null): EventFilters {
  const from = get(EVENT_PARAMS.from);
  const to = get(EVENT_PARAMS.to);
  return {
    contract: get(EVENT_PARAMS.contract)?.trim() || undefined,
    type: get(EVENT_PARAMS.type)?.trim() || undefined,
    txHash: get(EVENT_PARAMS.txHash)?.trim() || undefined,
    unmatched: get(EVENT_PARAMS.unmatched) === "1" ? true : undefined,
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
  };
}

/** Tipos de evento del contrato (primer *topic*, §8.1) para el filtro. */
export const EVENT_TYPES = [
  "consecutive_mint",
  "lot_minted",
  "transfer",
  "burn",
  "paused",
  "unpaused",
  "role_granted",
  "role_revoked",
  "base_uri_updated",
] as const;

export const ALERT_PARAMS = { status: "estado", level: "nivel", code: "codigo", winery: "bodega" } as const;

export type AlertStatus = "open" | "resolved";
export type AlertFilters = { status?: AlertStatus; level?: ChainAlertLevel; code?: string; wineryId?: string };

/** Por defecto, las abiertas (`?estado=todas` las muestra todas). */
export function alertFiltersFrom(get: (key: string) => string | null): AlertFilters {
  const raw = get(ALERT_PARAMS.status);
  return {
    status: raw === "todas" ? undefined : raw === "resolved" ? "resolved" : "open",
    level: oneOf(CHAIN_ALERT_LEVELS, get(ALERT_PARAMS.level)),
    code: get(ALERT_PARAMS.code)?.trim() || undefined,
    wineryId: get(ALERT_PARAMS.winery) || undefined,
  };
}

export const RUN_PARAMS = { status: "estado", open: "conciliacion" } as const;

export const runStatusFrom = (get: (key: string) => string | null): ReconciliationStatus | undefined =>
  oneOf(RECONCILIATION_STATUSES, get(RUN_PARAMS.status));

export function validateResolutionNote(note: string): string | undefined {
  const length = note.trim().length;
  if (length < 3) return "Explica qué se comprobó y cómo se resolvió (mínimo 3 caracteres).";
  if (length > 500) return "Como máximo 500 caracteres.";
  return undefined;
}

/** Sujeto de una alerta o transacción → pantalla donde mirarlo (`null` si no hay ninguna). */
export function subjectHref(subject: { type: string; id: string }, wineryId: string | null): string | null {
  switch (subject.type.toUpperCase()) {
    case "WINERY":
      return `/bodegas/${subject.id}?pestana=cadena`;
    case "COLLECTION":
      return `/colecciones/${subject.id}`;
    case "TRANSACTION":
    case "CHAIN_TRANSACTION":
      return transactionsHref({ open: subject.id });
    case "MINT":
      return `/cadena?${TX_PARAMS.subjectType}=MINT&${TX_PARAMS.subjectId}=${encodeURIComponent(subject.id)}`;
    case "EVENT":
      return "/cadena/eventos?sinOrigen=1";
    case "CODE":
      return "/cadena/cuentas";
    case "NETWORK":
      return "/cadena/conciliaciones";
    case "ACCOUNT":
    case "PLATFORM_ACCOUNT":
    case "PLATFORM":
      return "/cadena/cuentas";
    default:
      return wineryId ? `/bodegas/${wineryId}?pestana=cadena` : null;
  }
}

// ---------------------------------------------------------------------------
// Cuentas de la plataforma
// ---------------------------------------------------------------------------

/** Cuentas con saldo bajo o sin configurar: el aviso de la pantalla de cuentas. */
export function balanceWarnings(accounts: Pick<PlatformChainAccounts, "operations" | "anchor">) {
  const out: { account: "operations" | "anchor"; status: "LOW" | "MISSING" }[] = [];
  for (const account of ["operations", "anchor"] as const) {
    const status = accounts[account].status;
    if (status !== "OK") out.push({ account, status });
  }
  return out;
}

/** La cadena está configurada si el registro público publica la cuenta de operaciones (§3.2). */
export const chainConfigured = (registry: { platform: { operationsAccount: string | null } }) =>
  registry.platform.operationsAccount !== null;

/** Al código del contrato le quedan pocos días de vida en la red (la tarea diaria lo extiende, §8.3). */
export const CODE_TTL_WARNING_DAYS = 14;
export const codeTtlLow = (days: number | null) => days !== null && days < CODE_TTL_WARNING_DAYS;

// ---------------------------------------------------------------------------
// Identidad de la bodega (§3)
// ---------------------------------------------------------------------------

export type IdentityActions = { provision: boolean; pause: boolean; unpause: boolean };

/**
 * Reaprovisionar: identidad `FAILED` o `NOT_PROVISIONED` (`chain.manage`). Pausar o reanudar el
 * contrato en la red: solo administración (`chain.admin`), con el contrato desplegado.
 */
export function identityActions(
  identity: Pick<WineryChainIdentity, "status" | "contract">,
  perms: { manage: boolean; admin: boolean },
): IdentityActions {
  const paused = identity.contract?.paused ?? false;
  return {
    provision: perms.manage && (identity.status === "FAILED" || identity.status === "NOT_PROVISIONED"),
    pause: perms.admin && identity.contract !== null && !paused && identity.status === "ACTIVE",
    unpause: perms.admin && identity.contract !== null && paused,
  };
}

/** La identidad se está creando o tiene transacciones en vuelo: se consulta cada 5 s. */
export const identityInProgress = (identity: Pick<WineryChainIdentity, "status" | "pendingTransactions"> | undefined) =>
  Boolean(identity && (identity.status === "PROVISIONING" || anyTxInProgress(identity.pendingTransactions)));
