import {
  TOKENIZATION_REQUEST_KINDS,
  TOKENIZATION_REQUEST_STATUSES,
  type CollectionCommercialInput,
  type CollectionPriceInput,
  type TokenizationLimits,
  type TokenizationRequestKind,
  type TokenizationRequestStatus,
} from "@drinks-on-chain/mocks";
import { fmtNumber, minorToInput, parseBobToMinor } from "@/lib/format";

// Modelos puros de la bandeja de tokenización (contrato de la Ola 3 §5): filtros ↔ URL, acciones
// según el estado, formulario de datos comerciales y precio, y campos de «pedir cambios».

// ---------------------------------------------------------------------------
// Filtros de la bandeja
// ---------------------------------------------------------------------------

/** Parámetros de la URL de `/tokenizacion`. */
export const TOKENIZATION_PARAMS = {
  status: "estado",
  winery: "bodega",
  kind: "tipo",
  assignee: "asignada",
  q: "q",
} as const;

export const MINE = "me";

export type TokenizationFilters = {
  /** Sin estado, el backend devuelve las abiertas, de la más antigua a la más reciente. */
  status?: TokenizationRequestStatus;
  kind?: TokenizationRequestKind;
  wineryId?: string;
  assigneeId?: string;
  q?: string;
};

const oneOf = <T extends string>(values: readonly T[], raw: string | null) => values.find((v) => v === raw);

/** URL → filtros: un valor desconocido se ignora (no debe provocar un 422). */
export function tokenizationFiltersFrom(get: (key: string) => string | null, userId?: string): TokenizationFilters {
  const q = get(TOKENIZATION_PARAMS.q)?.trim();
  return {
    status: oneOf(TOKENIZATION_REQUEST_STATUSES, get(TOKENIZATION_PARAMS.status)),
    kind: oneOf(TOKENIZATION_REQUEST_KINDS, get(TOKENIZATION_PARAMS.kind)),
    wineryId: get(TOKENIZATION_PARAMS.winery) || undefined,
    assigneeId: get(TOKENIZATION_PARAMS.assignee) === MINE ? userId : undefined,
    q: q || undefined,
  };
}

/** Enlace a la bandeja con filtros (tablero, ficha de bodega). */
export function tokenizationHref(filters: { status?: TokenizationRequestStatus; wineryId?: string } = {}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set(TOKENIZATION_PARAMS.status, filters.status);
  if (filters.wineryId) params.set(TOKENIZATION_PARAMS.winery, filters.wineryId);
  const qs = params.toString();
  return qs ? `/tokenizacion?${qs}` : "/tokenizacion";
}

// ---------------------------------------------------------------------------
// Estados y acciones
// ---------------------------------------------------------------------------

export const OPEN_REQUEST_STATUSES: readonly TokenizationRequestStatus[] = [
  "SUBMITTED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
];

export const isOpenRequest = (status: TokenizationRequestStatus) => OPEN_REQUEST_STATUSES.includes(status);

export type RequestActions = {
  take: boolean;
  /** Notas internas: mientras la solicitud siga abierta. */
  note: boolean;
  /** Completar datos comerciales y precio, pedir cambios, aprobar y rechazar: solo `IN_REVIEW`. */
  review: boolean;
};

/**
 * Qué puede hacer operaciones según el estado (§5.4): `SUBMITTED` → tomar; `IN_REVIEW` → editar,
 * pedir cambios, aprobar o rechazar. Soporte (`manage = false`) no tiene ninguna acción.
 */
export function requestActions(status: TokenizationRequestStatus, manage: boolean): RequestActions {
  return {
    take: manage && status === "SUBMITTED",
    note: manage && isOpenRequest(status),
    review: manage && status === "IN_REVIEW",
  };
}

/** Qué espera una solicitud abierta (texto bajo el estado). */
export function requestHint(status: TokenizationRequestStatus): string | null {
  switch (status) {
    case "SUBMITTED":
      return "Sin tomar: tómala para revisarla.";
    case "IN_REVIEW":
      return "En revisión: completa los datos y decide.";
    case "CHANGES_REQUESTED":
      return "Espera a que la bodega la corrija y la reenvíe desde el ERP.";
    default:
      return null;
  }
}

/** «Puede pedir hasta 2.900: límite 3.000 (estimación), 100 autorizadas, 0 en otra solicitud». */
export function limitsSummary(l: TokenizationLimits): string {
  const limit = l.basis === "BOTTLES" ? l.bottles : l.estimatedBottles;
  const basis = l.basis === "BOTTLES" ? "botellas con código activo" : "estimación del lote";
  return (
    `Aún se pueden autorizar ${fmtNumber(l.maxQuantity)} botellas: el límite es ${limit === null ? "—" : fmtNumber(limit)} (${basis}), ` +
    `hay ${fmtNumber(l.authorizedQuota)} autorizadas y ${fmtNumber(l.pendingQuantity)} pedidas en solicitudes abiertas.`
  );
}

/** La cuota que resultaría ya no cabe en el límite recalculado (se revalida al aprobar, §5.2). */
export function exceedsLimits(resultingQuota: number, l: TokenizationLimits): boolean {
  const limit = l.basis === "BOTTLES" ? l.bottles : l.estimatedBottles;
  return limit !== null && resultingQuota > limit;
}

// ---------------------------------------------------------------------------
// Datos comerciales y precio (§5.5)
// ---------------------------------------------------------------------------

export const MAX_IMAGES = 8;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageDraft = {
  key: string;
  alt: string;
  isCover: boolean;
  /** Vista previa: URL pública (colección) o local (recién subida); si falta, se pide una firmada. */
  url?: string | null;
};

export type CommercialForm = {
  name: string;
  description: string;
  tastingNotes: string;
  pairing: string;
  estimatedRedeemDate: string;
  images: ImageDraft[];
  /** Importe en bolivianos tal como se escribe ("180", "180,50"); vacío = sin precio. */
  price: string;
};

export const COMMERCIAL_FIELDS = [
  "name",
  "description",
  "tastingNotes",
  "pairing",
  "estimatedRedeemDate",
  "images",
  "price",
] as const;
export type CommercialField = (typeof COMMERCIAL_FIELDS)[number];

type CommercialSource = {
  name?: string | null;
  description?: string | null;
  tastingNotes?: string | null;
  pairing?: string | null;
  estimatedRedeemDate?: string | null;
};

/** Formulario a partir del borrador de la solicitud o de los datos de la colección. */
export function commercialFormFrom(
  source: CommercialSource,
  images: ImageDraft[],
  price: { amountMinor: number } | null,
): CommercialForm {
  return {
    name: source.name ?? "",
    description: source.description ?? "",
    tastingNotes: source.tastingNotes ?? "",
    pairing: source.pairing ?? "",
    estimatedRedeemDate: source.estimatedRedeemDate ?? "",
    images: normalizeCover(images),
    price: price ? minorToInput(price.amountMinor) : "",
  };
}

/** Una sola portada: si ninguna lo es, la primera; si hay varias, la primera marcada. */
export function normalizeCover(images: ImageDraft[]): ImageDraft[] {
  if (images.length === 0) return images;
  const cover = images.find((i) => i.isCover)?.key ?? images[0]!.key;
  return images.map((i) => ({ ...i, isCover: i.key === cover }));
}

export const setCover = (images: ImageDraft[], key: string) => images.map((i) => ({ ...i, isCover: i.key === key }));

export const removeImage = (images: ImageDraft[], key: string) => normalizeCover(images.filter((i) => i.key !== key));

export const addImage = (images: ImageDraft[], image: Omit<ImageDraft, "isCover">) =>
  normalizeCover([...images, { ...image, isCover: false }]);

export const setImageAlt = (images: ImageDraft[], key: string, alt: string) =>
  images.map((i) => (i.key === key ? { ...i, alt } : i));

/**
 * Valida el formulario en el cliente (el servidor vuelve a validar). `strict` exige además lo
 * obligatorio para aprobar o publicar: nombre, descripción y una imagen de portada (S-10); el
 * precio nunca es obligatorio (A-32).
 */
export function validateCommercial(f: CommercialForm, { strict }: { strict: boolean }) {
  const errors: Partial<Record<CommercialField, string>> = {};
  const name = f.name.trim();
  const description = f.description.trim();
  if (name ? name.length < 3 || name.length > 120 : strict) errors.name = "El nombre tiene entre 3 y 120 caracteres.";
  if (description ? description.length < 20 || description.length > 4000 : strict) {
    errors.description = "La descripción tiene entre 20 y 4.000 caracteres.";
  }
  if (f.tastingNotes.trim().length > 2000) errors.tastingNotes = "Como máximo 2.000 caracteres.";
  if (f.pairing.trim().length > 1000) errors.pairing = "Como máximo 1.000 caracteres.";
  if (f.estimatedRedeemDate && !/^\d{4}-\d{2}-\d{2}$/.test(f.estimatedRedeemDate)) {
    errors.estimatedRedeemDate = "Fecha no válida.";
  }
  if (f.images.length > MAX_IMAGES) errors.images = `Como máximo ${MAX_IMAGES} imágenes.`;
  else if (f.images.some((i) => !i.alt.trim())) errors.images = "Describe cada imagen (texto alternativo).";
  else if (strict && f.images.length === 0) errors.images = "Hace falta al menos una imagen: será la portada.";
  const price = parseBobToMinor(f.price);
  if (!price.ok) errors.price = price.error;
  return errors;
}

const orNull = (text: string) => text.trim() || null;

/** `CollectionCommercialInput`: nombre y descripción solo si están escritos (no se borran). */
export function commercialBody(f: CommercialForm): CollectionCommercialInput {
  return {
    ...(f.name.trim() ? { name: f.name.trim() } : {}),
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
    tastingNotes: orNull(f.tastingNotes),
    pairing: orNull(f.pairing),
    imageKeys: f.images.map((i) => ({ key: i.key, alt: i.alt.trim(), isCover: i.isCover })),
    estimatedRedeemDate: f.estimatedRedeemDate || null,
  };
}

/** Precio en centavos enteros de boliviano, o `null` (sin precio). Formulario ya validado. */
export function priceBody(f: Pick<CommercialForm, "price">): CollectionPriceInput | null {
  const price = parseBobToMinor(f.price);
  return price.ok && price.amountMinor !== null ? { amountMinor: price.amountMinor, currency: "BOB" } : null;
}

/** Precio para comparar: los centavos si se entiende ("180" = "180,00"); si no, lo escrito. */
function priceKey(f: Pick<CommercialForm, "price">): number | string | null {
  const price = parseBobToMinor(f.price);
  return price.ok ? price.amountMinor : f.price.trim();
}

/** ¿Cambió algo respecto al formulario de partida? (para no guardar ni pedir motivo en vano). */
export const commercialChanged = (a: CommercialForm, b: CommercialForm) =>
  JSON.stringify({ ...commercialBody(a), price: priceKey(a) }) !==
  JSON.stringify({ ...commercialBody(b), price: priceKey(b) });

// ---------------------------------------------------------------------------
// Pedir cambios
// ---------------------------------------------------------------------------

/** Campos que se pueden señalar a la bodega al pedir cambios (`fields`). */
export const CHANGE_FIELDS = [
  { value: "quantity", label: "Cantidad de botellas" },
  { value: "commercial.name", label: "Nombre" },
  { value: "commercial.description", label: "Descripción" },
  { value: "commercial.tastingNotes", label: "Nota de cata" },
  { value: "commercial.pairing", label: "Maridaje" },
  { value: "commercial.imageKeys", label: "Imágenes" },
  { value: "commercial.estimatedRedeemDate", label: "Fecha estimada de canje" },
  { value: "notes", label: "Notas de la bodega" },
] as const;

export const changeFieldLabel = (field: string) =>
  CHANGE_FIELDS.find((f) => f.value === field)?.label ?? field.replace(/^commercial\./, "");

export function validateChangeRequest(message: string): string | undefined {
  const length = message.trim().length;
  if (length < 3) return "Explica qué debe cambiar la bodega (mínimo 3 caracteres).";
  if (length > 2000) return "Como máximo 2.000 caracteres.";
  return undefined;
}
