// Formato de cifras y fechas para Bolivia, en español. Cifras con separador de miles y
// tabulares en pantalla (01-erp §11).

const LOCALE = "es-BO";

export const fmtNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

export const fmtKg = (n: number) => `${fmtNumber(n)} kg`;
export const fmtLiters = (n: number, digits = 0) => `${fmtNumber(n, digits)} L`;

/** "4 mar 2026". Las fechas del backend son ISO en UTC; se muestran en UTC para no mover el día. */
export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(iso))
    .replace(".", "");

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // 24 h: evita el "p. m." de es-BO (y que el recorte del punto del mes lo deje en "p m.").
    hourCycle: "h23",
    timeZone: "UTC",
  })
    .format(new Date(iso))
    .replace(".", "");

/** "Faltan 18 días" / "Falta 1 día" / "Liberado". */
export const fmtDaysLeft = (days: number) =>
  days <= 0 ? "Liberado" : days === 1 ? "Falta 1 día" : `Faltan ${fmtNumber(days)} días`;

/** Dirección o hash abreviado: "GDQ4…7KXV". */
export const shortHash = (s: string, head = 4, tail = 4) =>
  s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

/**
 * Lee una cifra escrita a mano: "4,2" y "4.2" son 4,2; "2.350" y "18.400" (miles es-BO) son
 * 2350 y 18400. Con `grouping: false` el punto siempre es decimal (coordenadas).
 * Devuelve null si está vacía o no es un número.
 */
export function parseDecimal(
  input: string | number | null | undefined,
  { grouping = true }: { grouping?: boolean } = {},
): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = input.replace(/[\s ]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (grouping && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Cifra para un campo editable, con coma decimal y sin separador de miles ("4,2"). */
export const numberToInput = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/**
 * Tiempo relativo en español: "hace 12 min", "hace 3 h", "ayer", "hace 4 días"; a partir de una
 * semana, la fecha. `now` es inyectable para las pruebas.
 */
export function fmtRelative(iso: string, now: number = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return fmtDate(iso);
}

/** Fecha y hora en la zona horaria de quien mira (reuniones agendadas): "3 oct 2026, 10:30". */
export const fmtLocalDateTime = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(".", "");

/** Valor de un `<input type="datetime-local">` ("2026-10-03T10:30", hora local) → ISO en UTC. */
export function localInputToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Dinero y red (contrato de la Ola 3 §0): importes en centavos enteros de boliviano
// (`amountMinor`), saldos de la red como cadenas en XLM con 7 decimales.
// ---------------------------------------------------------------------------

/** Centavos → "Bs 1.250,50". */
export const fmtBob = (amountMinor: number) => `Bs ${fmtNumber(amountMinor / 100, 2)}`;

/** Centavos → texto de un campo editable ("1250,50"), sin separador de miles. */
export const minorToInput = (amountMinor: number | null | undefined) =>
  amountMinor == null ? "" : (amountMinor / 100).toFixed(2).replace(".", ",");

export type BobInput = { ok: true; amountMinor: number | null } | { ok: false; error: string };

/**
 * Importe en bolivianos escrito a mano → centavos enteros. Vacío es «sin precio» (`null`, A-32).
 * Usa el único `parseDecimal` ("1.250" = 1250; "180,5" = 180,50) y no admite más de dos decimales
 * ni importes menores que un centavo.
 */
export function parseBobToMinor(input: string): BobInput {
  if (!input.trim()) return { ok: true, amountMinor: null };
  const value = parseDecimal(input);
  if (value === null) return { ok: false, error: "Escribe un importe en bolivianos, p. ej. 180 o 180,50." };
  if (value <= 0) return { ok: false, error: "El precio debe ser mayor que cero (o déjalo vacío)." };
  const minor = Math.round(value * 100);
  if (Math.abs(value * 100 - minor) > 1e-6) return { ok: false, error: "Como máximo dos decimales (centavos)." };
  if (minor < 1) return { ok: false, error: "El precio debe ser mayor que cero (o déjalo vacío)." };
  return { ok: true, amountMinor: minor };
}

/** Saldo de la red: "9988.4321000" → "9.988,4321 XLM" (entre 2 y 7 decimales). */
export function fmtXlm(xlm: string | null | undefined): string {
  const n = Number(xlm);
  if (xlm == null || xlm === "" || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 7 }).format(n)} XLM`;
}

/** Antigüedad en horas → "menos de 1 h", "5 h", "1 día", "3 días". */
export function fmtAge(hours: number): string {
  if (!Number.isFinite(hours) || hours < 1) return "menos de 1 h";
  if (hours < 24) return `${Math.floor(hours)} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 día" : `${fmtNumber(days)} días`;
}

/** Horas transcurridas desde un instante (para la antigüedad de una solicitud). */
export const hoursSince = (iso: string, now: number = Date.now()) => Math.max(0, (now - Date.parse(iso)) / 3_600_000);
