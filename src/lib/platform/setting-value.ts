import type { SettingDefinition } from "@drinks-on-chain/mocks";
import { parseDecimal } from "@/lib/format";

// Editor de parámetros (contrato de la Ola 1 §6): del valor del backend a un borrador editable
// según el tipo, y de vuelta, con la misma validación que el servidor (tipo, `min`/`max`,
// `enumValues`). El mínimo legal solo se avisa aquí: lo decide el backend
// (`SETTING_BELOW_LEGAL_MINIMUM`, salvo excepción de administración).

export type SettingShape = Pick<
  SettingDefinition,
  "key" | "description" | "type" | "enumValues" | "unit" | "min" | "max" | "legalMinimum"
>;

export type SettingDraft =
  | { kind: "number"; text: string }
  | { kind: "numberOrUnlimited"; unlimited: boolean; text: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "list"; text: string }
  | { kind: "enum"; value: string }
  | { kind: "object"; text: string }
  | { kind: "string"; text: string };

export type ParsedSetting = { ok: true; value: unknown } | { ok: false; error: string };

const NUMBER_FORMAT = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 });
/** Cifra para un campo editable: coma decimal, sin separador de miles. */
const numberText = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v).replace(".", ",") : "");

export const ENUM_LABELS: Record<string, string> = {
  BURN: "Quemar",
  EXTEND: "Extender",
  COMPENSATE: "Compensar",
  DISABLED: "Desactivado",
  OPTIONAL: "Opcional",
  REQUIRED: "Obligatorio",
};
export const enumLabel = (v: string) => ENUM_LABELS[v] ?? v;

/** "Ilimitado" o, si el parámetro lo describe así ("vacío = desactivado"), "Desactivado". */
export const unlimitedLabel = (s: Pick<SettingShape, "description">) =>
  /desactivad/i.test(s.description) ? "Desactivado" : "Ilimitado";

/** Borrador inicial del editor a partir del valor guardado. */
export function draftFrom(s: SettingShape, value: unknown): SettingDraft {
  switch (s.type) {
    case "NUMBER":
      return { kind: "number", text: numberText(value) };
    case "NUMBER_OR_UNLIMITED":
      return { kind: "numberOrUnlimited", unlimited: value === null || value === undefined, text: numberText(value) };
    case "BOOLEAN":
      return { kind: "boolean", value: value === true };
    case "LIST":
      return { kind: "list", text: Array.isArray(value) ? value.map(String).join("\n") : "" };
    case "ENUM":
      return { kind: "enum", value: typeof value === "string" ? value : (s.enumValues?.[0] ?? "") };
    case "OBJECT":
      return { kind: "object", text: value === null || value === undefined ? "" : JSON.stringify(value, null, 2) };
    case "STRING":
      return { kind: "string", text: typeof value === "string" ? value : "" };
  }
}

function checkRange(s: SettingShape, n: number): string | null {
  const unit = s.unit ? ` ${s.unit}` : "";
  if (s.min !== undefined && n < s.min) return `Debe ser mayor o igual que ${NUMBER_FORMAT.format(s.min)}${unit}.`;
  if (s.max !== undefined && n > s.max) return `Debe ser menor o igual que ${NUMBER_FORMAT.format(s.max)}${unit}.`;
  return null;
}

function parseNumber(s: SettingShape, text: string): ParsedSetting {
  if (!text.trim()) return { ok: false, error: "Escribe un número." };
  const n = parseDecimal(text);
  if (n === null) return { ok: false, error: "No es un número válido." };
  const range = checkRange(s, n);
  return range ? { ok: false, error: range } : { ok: true, value: n };
}

/** Valor que se envía al backend, o el error para el campo. */
export function parseDraft(s: SettingShape, draft: SettingDraft): ParsedSetting {
  switch (draft.kind) {
    case "number":
      return parseNumber(s, draft.text);
    case "numberOrUnlimited":
      return draft.unlimited ? { ok: true, value: null } : parseNumber(s, draft.text);
    case "boolean":
      return { ok: true, value: draft.value };
    case "list": {
      const items = draft.text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (items.length === 0) return { ok: false, error: "Añade al menos un elemento (uno por línea)." };
      return { ok: true, value: [...new Set(items)] };
    }
    case "enum":
      return (s.enumValues ?? []).includes(draft.value)
        ? { ok: true, value: draft.value }
        : { ok: false, error: "Elige una de las opciones." };
    case "object": {
      if (!draft.text.trim()) return { ok: true, value: null };
      let parsed: unknown;
      try {
        parsed = JSON.parse(draft.text);
      } catch (error) {
        const detail = error instanceof SyntaxError ? ` (${error.message})` : "";
        return { ok: false, error: `El JSON no es válido${detail}.` };
      }
      if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
        return { ok: false, error: "Debe ser un objeto JSON ({ … }) o quedar vacío." };
      }
      return { ok: true, value: parsed };
    }
    case "string":
      return { ok: true, value: draft.text };
  }
}

/** ¿El valor es más laxo que el mínimo legal (A-31)? Mismo criterio que el backend. */
export function isBelowLegalMinimum(s: Pick<SettingShape, "legalMinimum">, value: unknown): boolean {
  const floor = s.legalMinimum;
  if (floor === undefined || floor === null) return false;
  if (typeof floor === "number") return typeof value === "number" && value < floor;
  return Array.isArray(value) && value.some((v) => !floor.includes(String(v)));
}

/** Valor legible: "1600 msnm", "Sí", "Ilimitado", "Quemar", "Moscatel de Alejandría", JSON. */
export function formatSettingValue(s: SettingShape, value: unknown): string {
  if (value === null || value === undefined) {
    if (s.type === "NUMBER_OR_UNLIMITED") return unlimitedLabel(s);
    return "Sin definir";
  }
  if (typeof value === "number") return `${NUMBER_FORMAT.format(value)}${s.unit ? ` ${s.unit}` : ""}`;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") return s.type === "ENUM" ? enumLabel(value) : value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return JSON.stringify(value);
}

/** Mínimo legal legible ("1.600 msnm", "Moscatel de Alejandría") o `null` si no hay. */
export function legalMinimumLabel(s: SettingShape): string | null {
  if (s.legalMinimum === undefined || s.legalMinimum === null) return null;
  return formatSettingValue(s, s.legalMinimum);
}

// ---------------------------------------------------------------------------
// Agrupación y etiquetas
// ---------------------------------------------------------------------------

/** Grupos por prefijo de la clave, en el orden del catálogo (docs-back/05 §4). */
export const SETTING_GROUPS: { prefix: string; label: string }[] = [
  { prefix: "trazabilidad", label: "Trazabilidad" },
  { prefix: "compra", label: "Compra" },
  { prefix: "canje", label: "Canje" },
  { prefix: "puntos", label: "Puntos de canje" },
  { prefix: "equipo", label: "Equipo" },
  { prefix: "tokenizacion", label: "Tokenización" },
  { prefix: "invitacion", label: "Invitaciones" },
  { prefix: "campanas", label: "Campañas" },
  { prefix: "precio", label: "Precio" },
];

export const settingPrefix = (key: string) => key.split(".")[0] ?? key;

/** Parámetros agrupados por prefijo; los de un prefijo desconocido van al final con su nombre. */
export function groupSettings<T extends { key: string }>(
  settings: readonly T[],
): { prefix: string; label: string; items: T[] }[] {
  const known = SETTING_GROUPS.map((g) => ({ ...g, items: settings.filter((s) => settingPrefix(s.key) === g.prefix) }));
  const others = [...new Set(settings.map((s) => settingPrefix(s.key)))]
    .filter((p) => !SETTING_GROUPS.some((g) => g.prefix === p))
    .map((prefix) => ({
      prefix,
      label: prefix.charAt(0).toUpperCase() + prefix.slice(1),
      items: settings.filter((s) => settingPrefix(s.key) === prefix),
    }));
  return [...known, ...others].filter((g) => g.items.length > 0);
}

export const LEVEL_LABELS: Record<SettingDefinition["levels"], string> = {
  GLOBAL: "Solo general",
  GLOBAL_AND_WINERY: "General y por bodega",
  WINERY: "Solo por bodega",
};

export const APPLIES_AT_LABELS: Record<SettingDefinition["appliesAt"], string> = {
  LOT: "Al crear el lote",
  COLLECTION: "Al aprobar la colección",
  IMMEDIATE: "De inmediato",
};

/**
 * Reglas de lote (CFG-06, contrato de la Ola 2 §2.3): el lote copia estos parámetros al crearse
 * (su instantánea de reglas), así que un cambio no alcanza a los lotes que ya existen.
 */
export const appliesToNewLotsOnly = (setting: Pick<SettingDefinition, "appliesAt">) => setting.appliesAt === "LOT";

export const LOT_RULES_NOTICE = {
  title: "Solo afecta a los lotes nuevos",
  /** Sobre el grupo de parámetros. */
  group:
    "Un cambio en estas reglas solo afecta a los lotes que se creen después: los lotes existentes conservan la instantánea de reglas con la que nacieron.",
  /** Sobre un parámetro (estándar general y ajustes por bodega). */
  setting:
    "Un cambio en esta regla, en el estándar general o en un ajuste por bodega, solo afecta a los lotes que se creen después: los lotes existentes conservan la instantánea de reglas con la que nacieron.",
} as const;
