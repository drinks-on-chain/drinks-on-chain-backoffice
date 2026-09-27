import { describe, expect, it } from "vitest";
import {
  draftFrom,
  formatSettingValue,
  groupSettings,
  isBelowLegalMinimum,
  legalMinimumLabel,
  parseDraft,
  type SettingShape,
} from "./setting-value";

// Editor de parámetros: del valor del backend al borrador y de vuelta, con la validación del
// contrato de la Ola 1 §6 (tipo, min/max, enumValues) y el aviso del mínimo legal (A-31).

const altitude: SettingShape = {
  key: "trazabilidad.singani.altitudMinimaMsnm",
  description: "Altitud mínima de la parcela para D.O. Singani",
  type: "NUMBER",
  unit: "msnm",
  min: 0,
  max: 5000,
  legalMinimum: 1600,
};
const varieties: SettingShape = {
  key: "trazabilidad.singani.variedadesExigidas",
  description: "Cepas admitidas para D.O. Singani",
  type: "LIST",
  legalMinimum: ["Moscatel de Alejandría"],
};
const maxBottles: SettingShape = {
  key: "compra.maxBotellasPorCompra",
  description: "Máximo por pedido; vacío = ilimitado",
  type: "NUMBER_OR_UNLIMITED",
  unit: "botellas",
  min: 1,
  max: 1000,
};
const reminder: SettingShape = {
  key: "campanas.recordatorioResena.dias",
  description: "Días tras el canje para recordar la reseña; vacío = desactivado",
  type: "NUMBER_OR_UNLIMITED",
  unit: "días",
  min: 1,
  max: 90,
};
const action: SettingShape = {
  key: "canje.ventanaVencida.accion",
  description: "Qué pasa con un NFT cuando vence su ventana",
  type: "ENUM",
  enumValues: ["BURN", "EXTEND", "COMPENSATE"],
};
const flag: SettingShape = { key: "tokenizacion.requiereAprobacion", description: "Aprobación", type: "BOOLEAN" };
const limits: SettingShape = { key: "trazabilidad.laboratorio.limites", description: "Límites", type: "OBJECT" };

describe("número con unidad", () => {
  it("lee cifras es-BO (coma decimal, punto de miles) y valida el rango", () => {
    expect(parseDraft(altitude, { kind: "number", text: "1.800" })).toEqual({ ok: true, value: 1800 });
    expect(parseDraft(altitude, { kind: "number", text: "1650,5" })).toEqual({ ok: true, value: 1650.5 });
    expect(parseDraft(altitude, { kind: "number", text: "" })).toEqual({ ok: false, error: "Escribe un número." });
    expect(parseDraft(altitude, { kind: "number", text: "alto" })).toEqual({
      ok: false,
      error: "No es un número válido.",
    });
    const tooHigh = parseDraft(altitude, { kind: "number", text: "6000" });
    expect(tooHigh.ok).toBe(false);
    expect(!tooHigh.ok && tooHigh.error).toMatch(/menor o igual que 5\.000 msnm/);
  });

  it("el borrador muestra la coma decimal", () => {
    expect(draftFrom(altitude, 1600.5)).toEqual({ kind: "number", text: "1600,5" });
  });
});

describe("número o ilimitado", () => {
  it("vacío (null) es ilimitado o desactivado según el parámetro", () => {
    expect(draftFrom(maxBottles, null)).toEqual({ kind: "numberOrUnlimited", unlimited: true, text: "" });
    expect(parseDraft(maxBottles, { kind: "numberOrUnlimited", unlimited: true, text: "5" })).toEqual({
      ok: true,
      value: null,
    });
    expect(formatSettingValue(maxBottles, null)).toBe("Ilimitado");
    expect(formatSettingValue(reminder, null)).toBe("Desactivado");
  });

  it("con número, aplica el mínimo", () => {
    expect(parseDraft(maxBottles, { kind: "numberOrUnlimited", unlimited: false, text: "0" }).ok).toBe(false);
    expect(parseDraft(maxBottles, { kind: "numberOrUnlimited", unlimited: false, text: "12" })).toEqual({
      ok: true,
      value: 12,
    });
  });
});

describe("lista, enumeración, sí/no y objeto", () => {
  it("lista: uno por línea, sin vacíos ni repetidos; vacía no vale", () => {
    expect(
      parseDraft(varieties, { kind: "list", text: " Moscatel de Alejandría \n\nMoscatel de Alejandría\nTorrontés" }),
    ).toEqual({
      ok: true,
      value: ["Moscatel de Alejandría", "Torrontés"],
    });
    expect(parseDraft(varieties, { kind: "list", text: "  \n " }).ok).toBe(false);
    expect(draftFrom(varieties, ["A", "B"])).toEqual({ kind: "list", text: "A\nB" });
  });

  it("enumeración: solo los valores del catálogo, con su etiqueta", () => {
    expect(parseDraft(action, { kind: "enum", value: "EXTEND" })).toEqual({ ok: true, value: "EXTEND" });
    expect(parseDraft(action, { kind: "enum", value: "DELETE" }).ok).toBe(false);
    expect(formatSettingValue(action, "BURN")).toBe("Quemar");
  });

  it("sí/no", () => {
    expect(draftFrom(flag, true)).toEqual({ kind: "boolean", value: true });
    expect(parseDraft(flag, { kind: "boolean", value: false })).toEqual({ ok: true, value: false });
    expect(formatSettingValue(flag, true)).toBe("Sí");
  });

  it("objeto: JSON válido y objeto (no lista ni texto); vacío = sin definir", () => {
    const value = { metanol: { max: 300, unidad: "mg/100 ml a.a." } };
    expect(parseDraft(limits, draftFrom(limits, value))).toEqual({ ok: true, value });
    expect(parseDraft(limits, { kind: "object", text: "" })).toEqual({ ok: true, value: null });
    const broken = parseDraft(limits, { kind: "object", text: "{ metanol: 300 " });
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.error).toMatch(/^El JSON no es válido/);
    expect(parseDraft(limits, { kind: "object", text: "[1, 2]" })).toEqual({
      ok: false,
      error: "Debe ser un objeto JSON ({ … }) o quedar vacío.",
    });
  });
});

describe("mínimo legal (A-31)", () => {
  it("un número menor o una cepa fuera de la lista es más laxo", () => {
    expect(isBelowLegalMinimum(altitude, 1500)).toBe(true);
    expect(isBelowLegalMinimum(altitude, 1600)).toBe(false);
    expect(isBelowLegalMinimum(varieties, ["Moscatel de Alejandría", "Torrontés"])).toBe(true);
    expect(isBelowLegalMinimum(varieties, ["Moscatel de Alejandría"])).toBe(false);
    expect(isBelowLegalMinimum(flag, false)).toBe(false);
    expect(legalMinimumLabel(altitude)).toBe("1.600 msnm");
    expect(legalMinimumLabel(flag)).toBeNull();
  });
});

describe("agrupación por prefijo", () => {
  it("sigue el orden del catálogo y deja al final los prefijos desconocidos", () => {
    const groups = groupSettings([
      { key: "precio.politica" },
      { key: "zeta.algo" },
      { key: "compra.minutosReserva" },
      { key: "trazabilidad.x" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Trazabilidad", "Compra", "Precio", "Zeta"]);
  });
});
