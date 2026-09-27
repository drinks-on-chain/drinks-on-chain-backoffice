// Antes y después de un evento de la bitácora, en filas legibles (detalle de la bitácora).

export type DiffRow = { key: string; before: unknown; after: unknown; changed: boolean };

/**
 * Antes y después de un evento en filas (campos de los dos lados, en orden estable: primero los
 * que cambian). Un lado `null` (creación o borrado) muestra solo el otro.
 */
export function auditDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffRow[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const rows = keys.map((key) => {
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    return { key, before: b, after: a, changed: JSON.stringify(b) !== JSON.stringify(a) };
  });
  return rows.sort((x, y) => Number(y.changed) - Number(x.changed));
}

/** Valor de la bitácora legible: textos tal cual, sí/no, listas separadas por comas y JSON. */
export function formatAuditValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number"))
    return value.join(", ");
  return JSON.stringify(value);
}
