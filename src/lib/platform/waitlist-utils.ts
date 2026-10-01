import {
  WAITLIST_STATUSES,
  type UpdateWaitlistEntryDto,
  type WaitlistEntry,
  type WaitlistStatus,
  type WaitlistType,
} from "@drinks-on-chain/mocks";

// Lógica pura de la lista de espera (contrato O1b §2 con las precisiones del backend v0.1.1):
// filtros ↔ URL, cuerpo del PATCH, enlace de WhatsApp y recuento de una exportación.

/** Ruta de la pantalla. */
export const WAITLIST_PATH = "/lista-de-espera";

/** Pestañas: el valor es el de `?tipo=` (la primera es la de por defecto y no se escribe en la URL). */
export const WAITLIST_TABS = [
  { value: "consumidores", type: "CONSUMER", label: "Consumidores" },
  { value: "bodegas", type: "WINERY", label: "Bodegas" },
] as const satisfies readonly { value: string; type: WaitlistType; label: string }[];

export type WaitlistTab = (typeof WAITLIST_TABS)[number]["value"];

/** Parámetros de la URL de la pantalla (en español, como el resto de las listas). */
export const WAITLIST_PARAMS = {
  type: "tipo",
  status: "estado",
  source: "origen",
  q: "q",
  from: "desde",
  to: "hasta",
} as const;

/** Máximos del backend: `q` ≤ 200, `source` ≤ 40 `[a-z0-9-]`, notas ≤ 1000. */
export const WAITLIST_Q_MAX = 200;
export const WAITLIST_NOTES_MAX = 1000;
const SOURCE = /^[a-z0-9-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros de `GET /v1/platform/waitlist` y de su exportación. */
export type WaitlistFilters = {
  type: WaitlistType;
  status?: WaitlistStatus;
  /** Origen exacto en minúsculas. La API no permite pedir «sin origen». */
  source?: string;
  q?: string;
  /** `AAAA-MM-DD` (día completo, UTC). */
  from?: string;
  to?: string;
};

export const tabOf = (type: WaitlistType): WaitlistTab => WAITLIST_TABS.find((t) => t.type === type)!.value;

export const typeOfTab = (tab: string | null): WaitlistType =>
  WAITLIST_TABS.find((t) => t.value === tab)?.type ?? WAITLIST_TABS[0].type;

/**
 * URL → filtros de la API. Lo que no es válido se ignora (una URL escrita a mano no debe provocar
 * un 422): estado desconocido, origen con caracteres raros, fechas mal formadas; `q` se recorta.
 */
export function waitlistFiltersFrom(get: (key: string) => string | null): WaitlistFilters {
  const date = (value: string | null) => (value && DATE.test(value) ? value : undefined);
  const source = get(WAITLIST_PARAMS.source)?.trim().toLowerCase();
  const q = get(WAITLIST_PARAMS.q)?.trim().slice(0, WAITLIST_Q_MAX);
  return {
    type: typeOfTab(get(WAITLIST_PARAMS.type)),
    status: WAITLIST_STATUSES.find((s) => s === get(WAITLIST_PARAMS.status)),
    source: source && SOURCE.test(source) ? source : undefined,
    q: q || undefined,
    from: date(get(WAITLIST_PARAMS.from)),
    to: date(get(WAITLIST_PARAMS.to)),
  };
}

/** Filtros → enlace a la pantalla (tablero, pestañas): solo se escribe lo que no es por defecto. */
export function waitlistHref(filters: Partial<WaitlistFilters> = {}): string {
  const params = new URLSearchParams();
  if (filters.type && filters.type !== WAITLIST_TABS[0].type) params.set(WAITLIST_PARAMS.type, tabOf(filters.type));
  if (filters.status) params.set(WAITLIST_PARAMS.status, filters.status);
  if (filters.source) params.set(WAITLIST_PARAMS.source, filters.source);
  if (filters.q) params.set(WAITLIST_PARAMS.q, filters.q);
  if (filters.from) params.set(WAITLIST_PARAMS.from, filters.from);
  if (filters.to) params.set(WAITLIST_PARAMS.to, filters.to);
  const qs = params.toString();
  return qs ? `${WAITLIST_PATH}?${qs}` : WAITLIST_PATH;
}

/** ¿Hay algún filtro además de la pestaña? */
export const hasWaitlistFilters = (f: WaitlistFilters) => Boolean(f.status || f.source || f.q || f.from || f.to);

/** Orden de las acciones del detalle: la principal (contactar) al final. */
const ACTION_ORDER: readonly WaitlistStatus[] = ["NEW", "DISCARDED", "CONTACTED"];

/** Estados a los que se puede pasar desde el actual (el backend acepta cualquier cambio). */
export function nextStatuses(status: WaitlistStatus): WaitlistStatus[] {
  return ACTION_ORDER.filter((s) => s !== status);
}

/** Notas como las guarda el backend: recortadas; vacías → `null`. */
export const normalizeNotes = (text: string | null | undefined): string | null => text?.trim() || null;

/**
 * Cuerpo de `PATCH /v1/platform/waitlist/{id}`: solo lo que cambia. Las notas viajan si el
 * borrador difiere de las guardadas (`null` las borra); `null` si no hay nada que enviar.
 */
export function waitlistUpdateBody(
  entry: Pick<WaitlistEntry, "status" | "notes">,
  change: { status?: WaitlistStatus; notes?: string | null },
): UpdateWaitlistEntryDto | null {
  const body: UpdateWaitlistEntryDto = {};
  if (change.status && change.status !== entry.status) body.status = change.status;
  if (change.notes !== undefined) {
    const notes = normalizeNotes(change.notes);
    if (notes !== normalizeNotes(entry.notes)) body.notes = notes;
  }
  return Object.keys(body).length ? body : null;
}

/**
 * Número para el enlace de WhatsApp (solo dígitos, con prefijo de país y sin `+`). Un celular
 * boliviano escrito sin prefijo (8 dígitos que empiezan por 6 o 7) recibe el 591. `null` si no
 * parece un teléfono completo.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^[67]\d{7}$/.test(digits)) digits = `591${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Filas de datos de un CSV (sin la cabecera), contando los saltos de línea fuera de comillas. */
export function csvRowCount(csv: string): number {
  let records = 0;
  let quoted = false;
  let pending = false;
  for (const char of csv.replace(/^﻿/, "")) {
    if (char === '"') quoted = !quoted;
    if (char === "\n" && !quoted) {
      if (pending) records += 1;
      pending = false;
    } else if (char !== "\r") {
      pending = true;
    }
  }
  if (pending) records += 1;
  return Math.max(0, records - 1);
}

/** Filas exportadas: la cabecera `X-Export-Rows` del backend o, si falta, las del propio CSV. */
export async function exportedRows(header: string | null, blob: Blob): Promise<number> {
  const rows = header === null || header.trim() === "" ? NaN : Number(header);
  return Number.isInteger(rows) && rows >= 0 ? rows : csvRowCount(await blob.text());
}

/** Nombre por defecto de la exportación (`lista-de-espera-AAAAMMDD-HHMM.csv`, UTC como el backend). */
export function waitlistExportFilename(now: Date = new Date()): string {
  const iso = now.toISOString();
  return `lista-de-espera-${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 13)}${iso.slice(14, 16)}.csv`;
}
