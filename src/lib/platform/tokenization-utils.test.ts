import { describe, expect, it } from "vitest";
import type { TokenizationLimits } from "@drinks-on-chain/mocks";
import { fmtAge, fmtBob, fmtXlm, hoursSince, minorToInput, parseBobToMinor } from "@/lib/format";
import {
  MAX_IMAGES,
  addImage,
  changeFieldLabel,
  commercialBody,
  commercialChanged,
  commercialFormFrom,
  exceedsLimits,
  limitsSummary,
  normalizeCover,
  priceBody,
  removeImage,
  requestActions,
  requestHint,
  setCover,
  setImageAlt,
  tokenizationFiltersFrom,
  tokenizationHref,
  validateChangeRequest,
  validateCommercial,
  type CommercialForm,
  type ImageDraft,
} from "./tokenization-utils";

const params = (query: string) => {
  const p = new URLSearchParams(query);
  return (key: string) => p.get(key);
};

const img = (key: string, isCover = false, alt = `Imagen ${key}`): ImageDraft => ({ key, alt, isCover });

const form = (over: Partial<CommercialForm> = {}): CommercialForm => ({
  name: "Singani Preventa 2026",
  description: "Singani de altura de Moscatel de Alejandría, destilado en alambique de cobre.",
  tastingNotes: "",
  pairing: "",
  estimatedRedeemDate: "",
  images: [img("org/a/portada.jpg", true)],
  price: "",
  ...over,
});

describe("dinero en bolivianos (centavos enteros) y saldos de la red", () => {
  it("lee el importe con el único parseDecimal y lo envía en centavos", () => {
    expect(parseBobToMinor("180")).toEqual({ ok: true, amountMinor: 18000 });
    expect(parseBobToMinor("180,5")).toEqual({ ok: true, amountMinor: 18050 });
    expect(parseBobToMinor("180.50")).toEqual({ ok: true, amountMinor: 18050 });
    // es-BO: el punto con tres cifras separa miles.
    expect(parseBobToMinor("1.250")).toEqual({ ok: true, amountMinor: 125000 });
    expect(parseBobToMinor("1.250,75")).toEqual({ ok: true, amountMinor: 125075 });
    expect(parseBobToMinor(" 0,01 ")).toEqual({ ok: true, amountMinor: 1 });
  });

  it("vacío es «sin precio»; cero, negativos, letras y más de dos decimales se rechazan", () => {
    expect(parseBobToMinor("")).toEqual({ ok: true, amountMinor: null });
    expect(parseBobToMinor("   ")).toEqual({ ok: true, amountMinor: null });
    for (const bad of ["0", "-5", "abc", "12,345", "0,001", "1,2,3"]) {
      expect(parseBobToMinor(bad).ok, bad).toBe(false);
    }
  });

  it("muestra y devuelve al campo el importe", () => {
    expect(fmtBob(18050)).toBe("Bs 180,50");
    expect(fmtBob(125000)).toBe("Bs 1.250,00");
    expect(minorToInput(18050)).toBe("180,50");
    expect(minorToInput(null)).toBe("");
    // Ida y vuelta: lo que se muestra en el campo se vuelve a leer igual.
    expect(parseBobToMinor(minorToInput(125075))).toEqual({ ok: true, amountMinor: 125075 });
  });

  it("formatea los XLM de la red y la antigüedad", () => {
    expect(fmtXlm("9988.4321000")).toBe("9.988,4321 XLM");
    expect(fmtXlm("0.0000000")).toBe("0,00 XLM");
    expect(fmtXlm("0.1389000")).toBe("0,1389 XLM");
    expect(fmtXlm(null)).toBe("—");
    expect(fmtAge(0.4)).toBe("menos de 1 h");
    expect(fmtAge(5.9)).toBe("5 h");
    expect(fmtAge(24)).toBe("1 día");
    expect(fmtAge(80)).toBe("3 días");
    expect(hoursSince("2026-10-09T10:00:00Z", Date.parse("2026-10-09T13:30:00Z"))).toBe(3.5);
  });
});

describe("filtros de la bandeja ↔ URL", () => {
  it("lee estado, bodega, tipo, asignada y búsqueda", () => {
    expect(
      tokenizationFiltersFrom(params("estado=IN_REVIEW&bodega=w1&tipo=QUOTA_INCREASE&asignada=me&q=+molino+"), "u-1"),
    ).toEqual({ status: "IN_REVIEW", kind: "QUOTA_INCREASE", wineryId: "w1", assigneeId: "u-1", q: "molino" });
  });

  it("sin filtros no envía nada (el backend devuelve las abiertas) e ignora valores desconocidos", () => {
    expect(tokenizationFiltersFrom(params(""), "u-1")).toEqual({
      status: undefined,
      kind: undefined,
      wineryId: undefined,
      assigneeId: undefined,
      q: undefined,
    });
    const odd = tokenizationFiltersFrom(params("estado=PUBLISHED&tipo=x&asignada=otra"), "u-1");
    expect(odd.status).toBeUndefined();
    expect(odd.kind).toBeUndefined();
    expect(odd.assigneeId).toBeUndefined();
  });

  it("construye los enlaces del tablero y de la ficha de bodega", () => {
    expect(tokenizationHref()).toBe("/tokenizacion");
    expect(tokenizationHref({ status: "SUBMITTED" })).toBe("/tokenizacion?estado=SUBMITTED");
    expect(tokenizationHref({ wineryId: "w1" })).toBe("/tokenizacion?bodega=w1");
  });
});

describe("acciones según el estado y los permisos", () => {
  it("operaciones toma una enviada y decide una en revisión", () => {
    expect(requestActions("SUBMITTED", true)).toEqual({ take: true, note: true, review: false });
    expect(requestActions("IN_REVIEW", true)).toEqual({ take: false, note: true, review: true });
    expect(requestActions("CHANGES_REQUESTED", true)).toEqual({ take: false, note: true, review: false });
    for (const closed of ["APPROVED", "REJECTED", "WITHDRAWN"] as const) {
      expect(requestActions(closed, true)).toEqual({ take: false, note: false, review: false });
    }
  });

  it("soporte no tiene ninguna acción en ningún estado", () => {
    for (const status of ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"] as const) {
      expect(requestActions(status, false)).toEqual({ take: false, note: false, review: false });
    }
  });

  it("explica qué espera cada estado abierto", () => {
    expect(requestHint("SUBMITTED")).toMatch(/tómala/);
    expect(requestHint("CHANGES_REQUESTED")).toMatch(/reenvíe desde el ERP/);
    expect(requestHint("APPROVED")).toBeNull();
  });
});

describe("límites de la cuota", () => {
  const limits: TokenizationLimits = {
    basis: "ESTIMATE",
    estimatedBottles: 3000,
    bottles: null,
    authorizedQuota: 100,
    pendingQuantity: 50,
    maxQuantity: 2850,
  };

  it("resume el límite recalculado", () => {
    expect(limitsSummary(limits)).toBe(
      "Aún se pueden autorizar 2.850 botellas: el límite es 3.000 (estimación del lote), hay 100 autorizadas y 50 pedidas en solicitudes abiertas.",
    );
    expect(limitsSummary({ ...limits, basis: "BOTTLES", bottles: 1040 })).toMatch(
      /el límite es 1\.040 \(botellas con código activo\)/,
    );
  });

  it("avisa si la cuota resultante ya no cabe (se revalida al aprobar)", () => {
    expect(exceedsLimits(3000, limits)).toBe(false);
    expect(exceedsLimits(3001, limits)).toBe(true);
    expect(exceedsLimits(1100, { ...limits, basis: "BOTTLES", bottles: 1040 })).toBe(true);
    expect(exceedsLimits(99999, { ...limits, estimatedBottles: null })).toBe(false);
  });
});

describe("datos comerciales y precio", () => {
  it("parte del borrador de la bodega con una sola portada", () => {
    const f = commercialFormFrom(
      { name: "Tannat", description: null, tastingNotes: null, pairing: undefined, estimatedRedeemDate: "2027-03-01" },
      [img("a"), img("b")],
      { amountMinor: 28000 },
    );
    expect(f).toMatchObject({ name: "Tannat", description: "", tastingNotes: "", price: "280,00" });
    expect(f.images.map((i) => i.isCover)).toEqual([true, false]);
    expect(commercialFormFrom({}, [], null)).toMatchObject({ name: "", images: [], price: "" });
  });

  it("mantiene exactamente una portada al añadir, marcar y quitar imágenes", () => {
    let images = addImage([], { key: "a", alt: "" });
    expect(images).toEqual([{ key: "a", alt: "", isCover: true }]);
    images = addImage(images, { key: "b", alt: "" });
    images = setCover(images, "b");
    expect(images.map((i) => i.isCover)).toEqual([false, true]);
    images = setImageAlt(images, "a", "Parrales");
    expect(images[0]!.alt).toBe("Parrales");
    // Al quitar la portada, la primera que queda pasa a serlo.
    images = removeImage(images, "b");
    expect(images).toEqual([{ key: "a", alt: "Parrales", isCover: true }]);
    expect(normalizeCover([img("x", true), img("y", true)]).map((i) => i.isCover)).toEqual([true, false]);
  });

  it("para aprobar exige nombre, descripción y portada; el precio nunca", () => {
    expect(validateCommercial(form(), { strict: true })).toEqual({});
    const empty = form({ name: "", description: "", images: [] });
    expect(Object.keys(validateCommercial(empty, { strict: true })).sort()).toEqual(["description", "images", "name"]);
    // Guardar un borrador incompleto sí se puede.
    expect(validateCommercial(empty, { strict: false })).toEqual({});
  });

  it("valida longitudes, texto alternativo, número de imágenes, fecha y precio", () => {
    const many = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => img(`k${i}`, i === 0));
    const errors = validateCommercial(
      form({
        name: "ab",
        description: "corta",
        tastingNotes: "x".repeat(2001),
        pairing: "y".repeat(1001),
        estimatedRedeemDate: "01/03/2027",
        images: many,
        price: "abc",
      }),
      { strict: false },
    );
    expect(Object.keys(errors).sort()).toEqual([
      "description",
      "estimatedRedeemDate",
      "images",
      "name",
      "pairing",
      "price",
      "tastingNotes",
    ]);
    expect(validateCommercial(form({ images: [img("a", true, "  ")] }), { strict: false }).images).toMatch(
      /texto alternativo/,
    );
  });

  it("arma el cuerpo: textos recortados, vacíos a null, imágenes con portada y precio en centavos", () => {
    const f = form({
      name: "  Singani Preventa 2026 ",
      tastingNotes: " Floral ",
      estimatedRedeemDate: "2027-03-01",
      images: [img("a", false, " Botella "), img("b", true)],
      price: "1.250,5",
    });
    expect(commercialBody(f)).toEqual({
      name: "Singani Preventa 2026",
      description: f.description,
      tastingNotes: "Floral",
      pairing: null,
      imageKeys: [
        { key: "a", alt: "Botella", isCover: false },
        { key: "b", alt: "Imagen b", isCover: true },
      ],
      estimatedRedeemDate: "2027-03-01",
    });
    expect(priceBody(f)).toEqual({ amountMinor: 125050, currency: "BOB" });
    expect(priceBody(form())).toBeNull();
    // Un nombre vacío no viaja (no borra el del borrador).
    expect(commercialBody(form({ name: " " }))).not.toHaveProperty("name");
  });

  it("detecta cambios sin contar espacios ni el formato del precio", () => {
    const base = form({ price: "180" });
    expect(commercialChanged(base, form({ price: "180,00", name: "Singani Preventa 2026 " }))).toBe(false);
    expect(commercialChanged(base, form({ price: "181" }))).toBe(true);
    // Un precio mal escrito es un cambio: al guardar se valida y se explica.
    expect(commercialChanged(form(), form({ price: "abc" }))).toBe(true);
    expect(commercialChanged(base, form({ price: "180", tastingNotes: "Floral" }))).toBe(true);
  });
});

describe("pedir cambios", () => {
  it("exige un mensaje de 3 a 2.000 caracteres y nombra los campos", () => {
    expect(validateChangeRequest(" a ")).toMatch(/mínimo 3/);
    expect(validateChangeRequest("x".repeat(2001))).toMatch(/2\.000/);
    expect(validateChangeRequest("Falta la nota de cata.")).toBeUndefined();
    expect(changeFieldLabel("commercial.tastingNotes")).toBe("Nota de cata");
    expect(changeFieldLabel("commercial.imageKeys")).toBe("Imágenes");
    expect(changeFieldLabel("commercial.otro")).toBe("otro");
  });
});
