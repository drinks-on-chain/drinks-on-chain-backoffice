// Textos y tonos de los códigos de la Ola 3 (contrato `o3-tokenizacion.md` §2.3, §3.1, §6 y §8).
// Un código desconocido se muestra tal cual: el backend puede añadir valores en cualquier momento.

export type BadgeTone = "info" | "success" | "warning" | "danger" | "neutral" | "accent";

type Def = { label: string; tone: BadgeTone };

const lookup =
  (map: Record<string, Def>) =>
  (code: string | null | undefined): Def =>
    (code ? map[code] : undefined) ?? { label: code ?? "—", tone: "neutral" };

const labelOf = (map: Record<string, string>) => (code: string | null | undefined) =>
  code ? (map[code] ?? code) : "—";

/** `CollectionStatus` (§6.2). */
export const collectionStatus = lookup({
  MINTING: { label: "Emitiendo", tone: "info" },
  READY: { label: "Lista para publicar", tone: "accent" },
  PUBLISHED: { label: "Publicada", tone: "success" },
  PAUSED: { label: "Pausada", tone: "warning" },
  CLOSED: { label: "Cerrada", tone: "neutral" },
});

/** `MintStatus`: estado de una emisión (§6.1). */
export const mintStatus = lookup({
  PENDING: { label: "En cola", tone: "info" },
  IN_PROGRESS: { label: "En curso", tone: "info" },
  CONFIRMED: { label: "Confirmada", tone: "success" },
  FAILED: { label: "Fallida", tone: "danger" },
});

/** `SaleState`: derivado, solo con la colección publicada. */
export const saleStateLabel = labelOf({ PRESALE: "Preventa", ON_SALE: "A la venta", SOLD_OUT: "Agotada" });

/** `TokenStatus` (§6.3). */
export const tokenStatus = lookup({
  MINTED: { label: "Emitido", tone: "info" },
  RESERVED: { label: "Reservado", tone: "warning" },
  SOLD: { label: "Vendido", tone: "accent" },
  REDEEMABLE: { label: "Canjeable", tone: "success" },
  PASS_ACTIVE: { label: "Con pase de canje", tone: "success" },
  REDEEMED: { label: "Canjeado", tone: "neutral" },
  BURNED: { label: "Quemado", tone: "neutral" },
  EXPIRED: { label: "Vencido", tone: "danger" },
});

export const burnReasonLabel = labelOf({
  REDEMPTION: "Canje",
  SHORTFALL: "Faltante de botellas",
  WINDOW_EXPIRED: "Ventana de canje vencida",
});

/** `TokenizationRequestKind`. */
export const requestKindLabel = labelOf({ INITIAL: "Inicial", QUOTA_INCREASE: "Ampliación de cuota" });

/** `ChainTxKind` (§2.2). */
export const txKindLabel = labelOf({
  CREATE_WINERY_ACCOUNT: "Cuenta de la bodega",
  DEPLOY_WINERY_CONTRACT: "Despliegue del contrato",
  SET_TOKEN_URI_BASE: "URI base de los metadatos",
  MINT_BATCH: "Emisión de NFT",
  ANCHOR_DOSSIER: "Anclaje del expediente",
  PAUSE_CONTRACT: "Pausa del contrato",
  UNPAUSE_CONTRACT: "Reanudación del contrato",
  BURN_UNSOLD: "Quema de NFT sin vender",
  EXTEND_TTL: "Extensión de vida (TTL)",
  RESTORE_ENTRIES: "Restauración de entradas",
  FUND_ACCOUNT: "Fondeo de una cuenta",
  OPERATOR_TRANSFER: "Entrega al comprador",
  REDEEM_BURN: "Quema por canje",
});

/** Emisiones, anclajes e identidad deben terminar: no se abandonan (409 `CHN_TX_NOT_ABANDONABLE`). */
export const NON_ABANDONABLE_TX_KINDS: readonly string[] = [
  "MINT_BATCH",
  "ANCHOR_DOSSIER",
  "CREATE_WINERY_ACCOUNT",
  "DEPLOY_WINERY_CONTRACT",
];

export const subjectTypeLabel = labelOf({
  WINERY: "Bodega",
  CONTRACT: "Contrato",
  MINT: "Emisión",
  LOT: "Lote",
  TOKEN: "NFT",
  PLATFORM: "Plataforma",
  COLLECTION: "Colección",
  TRANSACTION: "Transacción",
  ACCOUNT: "Cuenta",
  PLATFORM_ACCOUNT: "Cuenta de la plataforma",
  CHAIN_EVENT: "Evento de un contrato",
});

export const signerRoleLabel = labelOf({ OPERATIONS: "Operaciones", ANCHOR: "Anclaje", WINERY: "Bodega" });

export const networkLabel = labelOf({ TESTNET: "Testnet", PUBLIC: "Red pública", LOCAL: "Red local" });

/** `ChainIdentityStatus` (§3.1). */
export const identityStatus = lookup({
  NOT_PROVISIONED: { label: "Sin aprovisionar", tone: "neutral" },
  PROVISIONING: { label: "Preparándose", tone: "info" },
  ACTIVE: { label: "Activa", tone: "success" },
  FAILED: { label: "Fallida", tone: "danger" },
  PAUSED: { label: "Pausada en la red", tone: "warning" },
});

/** `LotClosure.status` (§8.4). */
export const closureStatus = lookup({
  NO_SHORTFALL: { label: "Sin faltante", tone: "success" },
  SHORTFALL_OPEN: { label: "Faltante sin decidir", tone: "danger" },
  DECIDED: { label: "Decidido, en curso", tone: "warning" },
  RESOLVED: { label: "Resuelto", tone: "success" },
});

export const closureOutcome = lookup({
  BURN_UNSOLD: { label: "Quema (sin vender)", tone: "neutral" },
  MANUAL_REFUND: { label: "Devolución", tone: "info" },
  MANUAL_SUBSTITUTE: { label: "Sustitución", tone: "info" },
  PENDING: { label: "Pendiente", tone: "warning" },
});

export const unsoldPolicyLabel = labelOf({ KEEP_ON_SALE: "Siguen a la venta", BURN: "Se queman" });

/** Saldo de una cuenta de la plataforma (§2.4). */
export const accountBalanceStatus = lookup({
  OK: { label: "Saldo suficiente", tone: "success" },
  LOW: { label: "Saldo bajo", tone: "warning" },
  MISSING: { label: "Sin configurar", tone: "danger" },
});

/** `ReconciliationRun` (§8.2). */
export const reconciliationStatus = lookup({
  RUNNING: { label: "En curso", tone: "info" },
  OK: { label: "Sin diferencias", tone: "success" },
  DIFFERENCES: { label: "Con diferencias", tone: "warning" },
  ERROR: { label: "Error", tone: "danger" },
});
export const reconciliationScopeLabel = labelOf({ ALL: "Todo", CONTRACT: "Un contrato", COLLECTION: "Una colección" });
export const reconciliationDepthLabel = labelOf({ LIGHT: "Ligera", FULL: "Completa" });
export const reconciliationTriggerLabel = labelOf({
  SCHEDULED: "Programada",
  MANUAL: "Manual",
  INDEXER_GAP: "Hueco del indexador",
});

/** Códigos de `ChainAlert.code` (§8.2). */
const ALERT_CODES: Record<string, string> = {
  TOTAL_MINTED_MISMATCH: "Total emitido distinto al de la red",
  BALANCE_MISMATCH: "Saldo de NFT de la bodega distinto",
  OWNER_MISMATCH: "Dueño de un NFT distinto",
  BURN_MISMATCH: "Quema no reflejada",
  PAUSE_MISMATCH: "Pausa del contrato distinta",
  ROLE_MISMATCH: "Roles del contrato distintos",
  QUOTA_EXCEEDED: "Cuota superada",
  BOTTLES_SHORTFALL: "Más NFT que botellas",
  ANCHOR_MISMATCH: "Anclaje que no cuadra con el expediente",
  MINT_RANGE_MISMATCH: "Emisión confirmada con un rango que no cuadra",
  TX_STUCK: "Transacción atascada",
  LOW_BALANCE: "Saldo bajo",
  TTL_EXPIRING: "Almacenamiento por caducar",
  UNEXPECTED_EVENT: "Evento no originado por el sistema",
  INDEXER_GAP: "Hueco del indexador",
  NETWORK_RESET: "Reinicio de la red",
  CHN_INTENT_REJECTED: "Intención rechazada por el firmante",
  TX_FAILED: "Transacción fallida",
};
export const alertCodeLabel = labelOf(ALERT_CODES);
export const ALERT_CODE_OPTIONS = Object.entries(ALERT_CODES).map(([value, label]) => ({ value, label }));

/** Qué hacer con cada alerta que exige una revisión a mano (las demás se explican con su mensaje). */
const ALERT_HELP: Record<string, string> = {
  MINT_RANGE_MISMATCH:
    "La red confirmó la emisión, pero el rango de NFT que devolvió no coincide con el evento del contrato: la emisión queda fallida, no se crearon NFT y la colección no se publica. Revisa la transacción antes de reintentar.",
  ANCHOR_MISMATCH:
    "La transacción de anclaje se confirmó con un memo o una cuenta de origen inesperados: el anclaje no se da por bueno y el lote sigue certificado. Revisa la transacción y reinténtala.",
  LOW_BALANCE: "Recarga la cuenta: con el saldo bajo el mínimo las transacciones empiezan a fallar.",
  TX_FAILED: "Abre la transacción para ver el error de cada intento y reinténtala cuando esté resuelto.",
  UNEXPECTED_EVENT: "Alguien operó sobre el contrato fuera del sistema: comprueba quién y revierte lo que proceda.",
};
export const alertHelp = (code: string | null | undefined) => (code ? (ALERT_HELP[code] ?? null) : null);

/** La emisión no falló: espera en cola hasta que cambie una condición (no hay nada que reintentar). */
export const TX_HOLD_CODES: readonly string[] = ["CHN_MINT_DISABLED", "CHN_WINERY_NOT_ACTIVE"];

/** Códigos internos de `ChainTransaction.lastError` (§2.3): qué significan y qué hacer. */
const TX_ERRORS: Record<string, string> = {
  CHN_RPC_UNAVAILABLE: "El RPC de la red no respondió. Se reintenta solo.",
  CHN_TX_TIMEOUT: "La red no confirmó a tiempo. Se reintenta solo.",
  CHN_BAD_SEQUENCE: "Secuencia de la cuenta en conflicto. Se reintenta solo con la secuencia nueva.",
  CHN_INSUFFICIENT_FEE: "Comisión insuficiente. Se reintenta solo con una comisión recalculada.",
  CHN_TRY_AGAIN_LATER: "La red pidió reintentar más tarde. Se reintenta solo.",
  CHN_ARCHIVED_ENTRY: "Una entrada del contrato estaba archivada: se restaura y se reintenta.",
  CHN_CONTRACT_ERROR: "El contrato rechazó la operación. Revisa el detalle antes de reintentar.",
  CHN_AUTH_FAILED: "La firma de autorización no es válida. Revisa la custodia y reintenta a mano.",
  CHN_INSUFFICIENT_BALANCE: "Saldo insuficiente en la cuenta que paga. Recarga y reintenta a mano.",
  CHN_INTENT_REJECTED: "El firmante rechazó la intención: no cuadra con la base de datos. Nunca se firmó.",
  CHN_MINT_DISABLED: "La emisión está desactivada en este entorno: espera en cola hasta que se active.",
  CHN_NETWORK_RESET: "La red se reinició: hay que reaprovisionar las identidades.",
  CHN_WINERY_NOT_ACTIVE:
    "La bodega está suspendida o revocada: la emisión espera en cola y continúa sola cuando se reactive.",
};
export const txErrorHelp = (code: string | null | undefined) => (code ? (TX_ERRORS[code] ?? null) : null);
