import { isTxInProgress } from "@drinks-on-chain/ui";
import {
  MINT_STATUSES,
  SALE_STATES,
  TOKENIZATION_COLLECTION_STATUSES,
  TOKEN_STATUSES,
  type ChainTxRef,
  type Collection,
  type CollectionStatus,
  type CollectionSummary,
  type LotClosure,
  type Mint,
  type MintStatus,
  type SaleState,
  type TokenStatus,
  type UnsoldPolicy,
} from "@drinks-on-chain/mocks";
import { fmtNumber } from "@/lib/format";

// Modelos puros de las colecciones (contrato de la Ola 3 §6 y §8.4): filtros ↔ URL, acciones según
// el estado y los permisos, emisión en curso (refresco cada 5 s) y cierre con faltante.

// ---------------------------------------------------------------------------
// Filtros de la lista
// ---------------------------------------------------------------------------

export const COLLECTION_PARAMS = {
  status: "estado",
  saleState: "venta",
  mintStatus: "emision",
  winery: "bodega",
  q: "q",
  view: "vista",
} as const;

export type CollectionFilters = {
  status?: CollectionStatus;
  saleState?: SaleState;
  mintStatus?: MintStatus;
  wineryId?: string;
  q?: string;
};

export type CollectionsView = "tarjetas" | "tabla";

const oneOf = <T extends string>(values: readonly T[], raw: string | null) => values.find((v) => v === raw);

export function collectionFiltersFrom(get: (key: string) => string | null): CollectionFilters {
  const q = get(COLLECTION_PARAMS.q)?.trim();
  return {
    status: oneOf(TOKENIZATION_COLLECTION_STATUSES, get(COLLECTION_PARAMS.status)),
    saleState: oneOf(SALE_STATES, get(COLLECTION_PARAMS.saleState)),
    mintStatus: oneOf(MINT_STATUSES, get(COLLECTION_PARAMS.mintStatus)),
    wineryId: get(COLLECTION_PARAMS.winery) || undefined,
    q: q || undefined,
  };
}

export const collectionsViewFrom = (get: (key: string) => string | null): CollectionsView =>
  get(COLLECTION_PARAMS.view) === "tabla" ? "tabla" : "tarjetas";

/** Enlace a la lista con filtros (tablero, ficha de bodega). */
export function collectionsHref(filters: Pick<CollectionFilters, "status" | "mintStatus" | "wineryId"> = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set(COLLECTION_PARAMS.status, filters.status);
  if (filters.mintStatus) params.set(COLLECTION_PARAMS.mintStatus, filters.mintStatus);
  if (filters.wineryId) params.set(COLLECTION_PARAMS.winery, filters.wineryId);
  const qs = params.toString();
  return qs ? `/colecciones?${qs}` : "/colecciones";
}

// ---------------------------------------------------------------------------
// NFT de una colección
// ---------------------------------------------------------------------------

export const TOKEN_PARAMS = { status: "nft", from: "desde", to: "hasta", page: "paginaNft" } as const;

export type TokenFilters = { status?: TokenStatus; fromNumber?: number; toNumber?: number };

const positiveInt = (raw: string | null) => {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 1 ? n : undefined;
};

export function tokenFiltersFrom(get: (key: string) => string | null): TokenFilters {
  return {
    status: oneOf(TOKEN_STATUSES, get(TOKEN_PARAMS.status)),
    fromNumber: positiveInt(get(TOKEN_PARAMS.from)),
    toNumber: positiveInt(get(TOKEN_PARAMS.to)),
  };
}

// ---------------------------------------------------------------------------
// Emisión y transacciones
// ---------------------------------------------------------------------------

const txActive = (tx: ChainTxRef | null | undefined) => Boolean(tx && isTxInProgress(tx.status));

/** Hay una emisión sin terminar (en cola o en curso): la lista se refresca mientras dure. */
export const mintInProgress = (c: Pick<CollectionSummary, "mintStatus">) =>
  c.mintStatus === "PENDING" || c.mintStatus === "IN_PROGRESS";

/**
 * Algo de la colección sigue viajando por la red (emisiones o quemas del cierre): el detalle se
 * consulta cada 5 s solo mientras sea así (§2.4). Una emisión `FAILED` no está en curso.
 */
export function collectionInProgress(c: Collection | undefined): boolean {
  if (!c) return false;
  return (
    mintInProgress(c) ||
    c.mints.some((m) => m.transactions.some(txActive)) ||
    Boolean(c.closure?.items.some((i) => txActive(i.burnTx)))
  );
}

/** Intervalo de `refetchInterval`: 5 s mientras haya algo en curso; si no, sin consulta periódica. */
export const POLL_MS = 5_000;
export const pollWhile = (active: boolean): number | false => (active ? POLL_MS : false);

/** «Botellas 101–150 · ids 100–149» de una emisión confirmada; `null` si aún no hay rango. */
export function mintRangeLabel(mint: Pick<Mint, "ranges">): string | null {
  if (mint.ranges.length === 0) return null;
  const first = mint.ranges[0]!;
  const last = mint.ranges[mint.ranges.length - 1]!;
  return `Botellas ${fmtNumber(first.firstBottleNumber)}–${fmtNumber(last.lastBottleNumber)} · ids ${first.firstTokenId}–${last.lastTokenId}`;
}

export const failedMintTx = (c: Pick<Collection, "mints">) =>
  c.mints.flatMap((m) => m.transactions).find((t) => t.status === "FAILED") ?? null;

// ---------------------------------------------------------------------------
// Acciones de la colección (§6.4)
// ---------------------------------------------------------------------------

export type CollectionAction = "publish" | "pause" | "resume" | "close";

/**
 * Acciones posibles según el estado: `READY → publish`, `PUBLISHED → pause`, `PAUSED → resume` y
 * `close` desde los tres. Editar datos y precio, mientras no esté cerrada. Sin `tokenization.manage`
 * (soporte) no hay ninguna.
 */
export function collectionActions(status: CollectionStatus, manage: boolean) {
  if (!manage) return { actions: [] as CollectionAction[], edit: false };
  const actions: CollectionAction[] = [];
  if (status === "READY") actions.push("publish");
  if (status === "PUBLISHED") actions.push("pause");
  if (status === "PAUSED") actions.push("resume");
  if (status === "READY" || status === "PUBLISHED" || status === "PAUSED") actions.push("close");
  return { actions, edit: status !== "CLOSED" };
}

/** Publicar y reanudar admiten el motivo vacío; pausar y cerrar lo exigen. */
export const reasonRequired = (action: CollectionAction) => action === "pause" || action === "close";

/** Publicar, pausar y reanudar llevan `Idempotency-Key` obligatoria; cerrar, no (CONTRATO §13.2). */
export const needsIdempotencyKey = (action: CollectionAction) => action !== "close";

/** Porcentaje emitido sobre la cuota (0–100). */
export const mintedPercent = (c: Pick<CollectionSummary, "quota" | "counts">) =>
  c.quota > 0 ? Math.min(100, Math.round((c.counts.minted / c.quota) * 100)) : 0;

// ---------------------------------------------------------------------------
// Cierre con faltante (§8.4)
// ---------------------------------------------------------------------------

type ClosureLike = Pick<LotClosure, "status" | "shortfall" | "decision">;

/** El cierre espera una decisión: con faltante abierto, o sin faltante y sin decidir todavía. */
export const closureNeedsDecision = (c: ClosureLike) =>
  c.status === "SHORTFALL_OPEN" || (c.status === "NO_SHORTFALL" && c.decision === null);

/**
 * Qué políticas puede decidir cada rol (§10): toda decisión con faltante y toda quema (`BURN`) es
 * de administración (`chain.admin`); operaciones solo decide «siguen a la venta» sin faltante.
 */
export function closurePolicies(c: ClosureLike, perms: { manage: boolean; admin: boolean }): UnsoldPolicy[] {
  if (!closureNeedsDecision(c)) return [];
  if (perms.admin) return ["KEEP_ON_SALE", "BURN"];
  if (perms.manage && c.shortfall === 0) return ["KEEP_ON_SALE"];
  return [];
}

/** Por qué alguien que tramita colecciones no puede decidir este cierre (`null` si puede). */
export function closureBlockedReason(c: ClosureLike, perms: { manage: boolean; admin: boolean }): string | null {
  if (!closureNeedsDecision(c) || perms.admin) return null;
  if (!perms.manage) return "Consulta en modo lectura: el cierre lo decide administración.";
  if (c.shortfall > 0) return "Hay faltante: la decisión implica quemas y solo la toma administración.";
  return null;
}

/** Ítems que operaciones resuelve a mano: NFT vendidos sin botella aún pendientes (A-30). */
export const pendingClosureItems = (c: Pick<LotClosure, "items">) => c.items.filter((i) => i.outcome === "PENDING");

/** «Faltan 20 botellas: 20 NFT sin vender se queman y 0 vendidos quedan sin botella». */
export function shortfallSummary(c: Pick<LotClosure, "shortfall" | "unsoldToBurn" | "soldWithoutBottle">): string {
  if (c.shortfall === 0) return "Hay botella para cada NFT emitido: no hay faltante.";
  return (
    `Faltan ${fmtNumber(c.shortfall)} botellas: ${fmtNumber(c.unsoldToBurn)} NFT sin vender se queman ` +
    `y ${fmtNumber(c.soldWithoutBottle)} vendidos quedan sin botella (devolución o sustitución a mano).`
  );
}
