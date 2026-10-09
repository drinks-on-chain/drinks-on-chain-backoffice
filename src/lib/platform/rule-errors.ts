import { ApiError, errorMessage } from "@/lib/api/errors";
import { fmtNumber } from "@/lib/format";
import { collectionStatus, identityStatus, txKindLabel } from "./chain-labels";
import { lotStageLabel } from "./labels";

// Errores de la Ola 3 explicados (contrato `o3-tokenizacion.md` §9): 409 por estado y 422 por regla
// de negocio, con `details: [{ field, message, code, expected, actual, meta }]`. La API responde el
// código y aquí se dice en español qué pasó y qué hacer, campo a campo cuando el detalle trae
// `field`. Un código desconocido conserva el mensaje del servidor.

export type RuleDetail = {
  field: string | null;
  message: string;
  code: string | null;
  expected: unknown;
  actual: unknown;
  meta: Record<string, unknown>;
};

export type ExplainedError = {
  /** Código del error (`TOK_…`, `CHN_…`) o `null` si no es un error de la API. */
  code: string | null;
  /** Qué pasó y qué hacer. */
  message: string;
  /** Primer mensaje de cada campo del formulario (nombres del formulario, no del backend). */
  fieldErrors: Record<string, string>;
  /** Detalles que no son de ningún campo del formulario. */
  notes: string[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lee los `details` ampliados de la Ola 2 (`ErrorDetail`); lo que no tenga esa forma se ignora. */
export function ruleDetails(details: unknown): RuleDetail[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d): RuleDetail[] => {
    if (!isRecord(d) || typeof d.message !== "string") return [];
    return [
      {
        field: typeof d.field === "string" && d.field ? d.field : null,
        message: d.message,
        code: typeof d.code === "string" ? d.code : null,
        expected: d.expected ?? null,
        actual: d.actual ?? null,
        meta: isRecord(d.meta) ? d.meta : {},
      },
    ];
  });
}

/**
 * Campo del backend → campo del formulario: `commercial.name` → `name`, `commercial.imageKeys.0.alt`
 * → `images`, `price.amountMinor` → `price`. El resto se queda igual (`reason`, `message`, `note`…).
 */
export function formField(field: string): string {
  const name = field.replace(/^commercial\./, "");
  if (name.startsWith("imageKeys")) return "images";
  if (name === "price" || name.startsWith("price.")) return "price";
  return name.split(".")[0]!;
}

const num = (v: unknown) => (typeof v === "number" ? fmtNumber(v) : String(v ?? "—"));
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Texto por código; recibe el primer detalle (con `expected`, `actual` y `meta`). */
const EXPLANATIONS: Record<string, (d: RuleDetail | undefined) => string> = {
  TOK_REQUEST_NOT_FOUND: () => "La solicitud no existe o ya no está disponible.",
  TOK_COLLECTION_NOT_FOUND: () => "La colección no existe o ya no está disponible.",
  TOK_REQUEST_INVALID_TRANSITION: () =>
    "La solicitud cambió de estado mientras la revisabas y ya no admite esta acción. Se recargó con su estado actual.",
  TOK_COLLECTION_INVALID_TRANSITION: (d) => {
    const from = str(d?.meta.from);
    return `La colección ${from ? `está «${collectionStatus(from).label}» y ` : ""}no admite esta acción. Se recargó con su estado actual.`;
  },
  TOK_LOT_NOT_TOKENIZABLE: (d) =>
    `El lote ya no se puede tokenizar${d?.meta.stage ? `: está en «${lotStageLabel(str(d.meta.stage))}»` : ""}. Rechaza la solicitud con el motivo.`,
  TOK_LOT_PRODUCT_UNDEFINED: () => "El lote aún no decidió si es vino o singani: la bodega debe definirlo en el ERP.",
  TOK_LOT_ESTIMATE_MISSING: () => "El lote no tiene estimación de botellas: la bodega debe declararla en el ERP.",
  TOK_QUOTA_INVALID: () => "La cantidad debe ser un número entero de botellas, al menos 1.",
  TOK_QUOTA_EXCEEDS_ESTIMATE: (d) =>
    `La cuota resultante (${num(d?.actual)}) supera la estimación de botellas del lote (${num(d?.expected)}). ` +
    `Pide a la bodega que reduzca la cantidad${d?.meta.maxQuantity != null ? ` (máximo ${num(d.meta.maxQuantity)})` : ""} o que actualice la estimación.`,
  TOK_QUOTA_EXCEEDS_BOTTLES: (d) =>
    `La cuota resultante (${num(d?.actual)}) supera las botellas con código activo del lote (${num(d?.expected)}). ` +
    `Pide a la bodega que reduzca la cantidad${d?.meta.maxQuantity != null ? ` (máximo ${num(d.meta.maxQuantity)})` : ""}.`,
  TOK_REQUEST_ALREADY_OPEN: () => "El lote ya tiene otra solicitud abierta.",
  TOK_WINERY_NOT_ACTIVE: () =>
    "La bodega está suspendida o revocada: no se aprueban sus solicitudes ni se publican sus colecciones hasta que vuelva a estar activa.",
  TOK_WINERY_CHAIN_NOT_READY: (d) =>
    `La bodega aún no tiene lista su cuenta y su contrato en la red${d?.meta.status ? ` (identidad «${identityStatus(str(d.meta.status)).label}»)` : ""}. ` +
    "Revisa su identidad en la pestaña «Cadena» de la bodega y vuelve a aprobar cuando esté activa.",
  TOK_COMMERCIAL_DATA_INCOMPLETE: () =>
    "Faltan datos comerciales obligatorios: nombre, descripción y una imagen de portada. Complétalos en los campos marcados.",
  TOK_PRICE_INVALID: () =>
    "El precio no es válido: un importe en bolivianos mayor que cero, con dos decimales como máximo.",
  TOK_PRICE_LOCKED: () => "La colección ya tiene ventas: el precio no se puede cambiar.",
  TOK_SLUG_TAKEN: () =>
    "Ya existe una colección con ese nombre. Elige otro: de él sale la dirección pública de la colección.",
  TOK_MINT_NOT_CONFIRMED: () =>
    "La emisión de los NFT aún no está confirmada en la red: la colección se podrá publicar cuando termine.",
  TOK_CLOSURE_PENDING: () =>
    "El cierre del lote con faltante aún no está resuelto: decide y resuelve sus NFT antes de cerrar la colección.",
  TOK_CLOSURE_NOT_APPLICABLE: () => "El cierre solo aplica cuando el lote ya está embotellado o se descartó.",
  CHN_TX_NOT_FOUND: () => "La transacción no existe.",
  CHN_TX_NOT_RETRYABLE: () =>
    "Solo se reintenta una transacción fallida: esta cambió de estado. Se recargó con su estado actual.",
  CHN_TX_NOT_ABANDONABLE: (d) =>
    `${d?.meta.kind ? `«${txKindLabel(str(d.meta.kind))}»` : "Esta transacción"} no se puede abandonar: emisiones, anclajes e identidad deben terminar. Reinténtala.`,
  CHN_CONTRACT_PAUSED: () =>
    "El contrato de la bodega está pausado en la red: mientras dure la pausa no se publica ni se emite. Reanúdalo desde la ficha de la bodega.",
  CHN_CONTRACT_ALREADY_PAUSED: () => "El contrato ya está pausado en la red.",
  CHN_CONTRACT_NOT_PAUSED: () => "El contrato no está pausado en la red.",
  CHN_IDENTITY_ALREADY_ACTIVE: () => "La identidad de la bodega ya está activa: no hay nada que reaprovisionar.",
  CHN_RECONCILIATION_RUNNING: () => "Ya hay una conciliación en curso para ese alcance. Espera a que termine.",
  CHN_ALERT_ALREADY_RESOLVED: () => "La alerta ya estaba resuelta.",
  IDEMPOTENCY_KEY_REQUIRED: () => "Falta la clave de idempotencia de la operación. Vuelve a intentarlo.",
  IDEMPOTENCY_KEY_REUSED: () => "La operación ya se envió con otros datos. Cierra el diálogo y vuelve a intentarlo.",
  TRC_PLATFORM_READ_ONLY: () => "La plataforma solo lee la trazabilidad y la cuota la autoriza la bodega desde el ERP.",
};

const FORBIDDEN =
  "Tu rol no permite esta acción. Si crees que es un error, pide a administración que revise tus permisos.";

/**
 * Explica un error de una escritura de la Ola 3. `fields` son los campos del formulario: un detalle
 * con `field` conocido va junto a su campo; el resto, a `notes`.
 */
export function explainRuleError(error: unknown, fields: readonly string[] = []): ExplainedError {
  if (!(error instanceof ApiError)) {
    return { code: null, message: errorMessage(error), fieldErrors: {}, notes: [] };
  }
  const details = ruleDetails(error.details);
  const fieldErrors: Record<string, string> = {};
  const notes: string[] = [];
  for (const d of details) {
    const key = d.field ? formField(d.field) : null;
    if (key && fields.includes(key)) fieldErrors[key] ??= d.message;
    else if (d.message && d.message !== error.message) notes.push(d.message);
  }
  const known = Object.hasOwn(EXPLANATIONS, error.code);
  let message: string;
  if (known) message = EXPLANATIONS[error.code]!(details.find((d) => d.code === error.code) ?? details[0]);
  else if (error.isForbidden) message = FORBIDDEN;
  else if (error.isValidation && Object.keys(fieldErrors).length) message = "Revisa los campos marcados.";
  else message = errorMessage(error);
  // Con explicación propia, los detalles sin campo ya están dichos: solo se añaden los de campos ajenos.
  return { code: error.code, message, fieldErrors, notes: known ? [] : notes };
}

/** `true` si el error dice que el recurso cambió de estado (hay que recargarlo). */
export const isStaleStateError = (error: unknown) =>
  error instanceof ApiError &&
  ["TOK_REQUEST_INVALID_TRANSITION", "TOK_COLLECTION_INVALID_TRANSITION", "CHN_TX_NOT_RETRYABLE"].includes(error.code);

/**
 * Mensaje de un error para un diálogo de motivo: la explicación del código si es de la Ola 3
 * (`TOK_…`, `CHN_…`); si no, el mensaje habitual (`errorMessage`).
 */
export const ruleErrorMessage = (error: unknown) =>
  error instanceof ApiError && Object.hasOwn(EXPLANATIONS, error.code)
    ? explainRuleError(error).message
    : errorMessage(error);
