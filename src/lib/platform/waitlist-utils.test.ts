import { describe, expect, it } from "vitest";
import {
  csvRowCount,
  exportedRows,
  hasWaitlistFilters,
  nextStatuses,
  tabOf,
  typeOfTab,
  waitlistExportFilename,
  waitlistFiltersFrom,
  waitlistHref,
  waitlistUpdateBody,
  whatsappNumber,
} from "./waitlist-utils";

const from = (qs: string) => {
  const params = new URLSearchParams(qs);
  return waitlistFiltersFrom((key) => params.get(key));
};

describe("filtros de la lista de espera ↔ URL", () => {
  it("sin parámetros: consumidores y ningún filtro", () => {
    const filters = from("");
    expect(filters).toEqual({
      type: "CONSUMER",
      status: undefined,
      source: undefined,
      q: undefined,
      from: undefined,
      to: undefined,
    });
    expect(hasWaitlistFilters(filters)).toBe(false);
  });

  it("lee la pestaña, el estado, el origen, la búsqueda y las fechas", () => {
    const filters = from(
      "tipo=bodegas&estado=CONTACTED&origen=tarija-2026&q=%20cinti%20&desde=2026-09-19&hasta=2026-09-21",
    );
    expect(filters).toEqual({
      type: "WINERY",
      status: "CONTACTED",
      source: "tarija-2026",
      q: "cinti",
      from: "2026-09-19",
      to: "2026-09-21",
    });
    expect(hasWaitlistFilters(filters)).toBe(true);
  });

  it("ignora lo que provocaría un 422: estado u origen inválidos, fechas mal formadas, pestaña desconocida", () => {
    expect(from("tipo=otros&estado=ARCHIVED&origen=con%20espacios&desde=19-09-2026&hasta=ayer")).toEqual({
      type: "CONSUMER",
      status: undefined,
      source: undefined,
      q: undefined,
      from: undefined,
      to: undefined,
    });
    // El origen se compara en minúsculas (así lo guarda el backend) y admite 40 caracteres.
    expect(from("origen=Tarija-2026").source).toBe("tarija-2026");
    expect(from(`origen=${"a".repeat(41)}`).source).toBeUndefined();
  });

  it("recorta la búsqueda a los 200 caracteres que acepta la API", () => {
    expect(from(`q=${"x".repeat(250)}`).q).toHaveLength(200);
  });

  it("pestaña ↔ tipo", () => {
    expect(tabOf("CONSUMER")).toBe("consumidores");
    expect(tabOf("WINERY")).toBe("bodegas");
    expect(typeOfTab("bodegas")).toBe("WINERY");
    expect(typeOfTab(null)).toBe("CONSUMER");
  });

  it("construye el enlace solo con lo que no es por defecto y la URL se vuelve a leer igual", () => {
    expect(waitlistHref()).toBe("/lista-de-espera");
    expect(waitlistHref({ type: "CONSUMER" })).toBe("/lista-de-espera");
    expect(waitlistHref({ type: "WINERY" })).toBe("/lista-de-espera?tipo=bodegas");
    const filters = { type: "WINERY", status: "NEW", source: "qr-cata", q: "valle alto", from: "2026-09-01" } as const;
    const href = waitlistHref(filters);
    expect(href).toBe("/lista-de-espera?tipo=bodegas&estado=NEW&origen=qr-cata&q=valle+alto&desde=2026-09-01");
    expect(from(href.split("?")[1]!)).toEqual({ ...filters, to: undefined });
  });
});

describe("cuerpo del PATCH", () => {
  const entry = { status: "NEW", notes: "Llamar por la tarde" } as const;

  it("solo envía lo que cambia", () => {
    expect(waitlistUpdateBody(entry, { status: "CONTACTED" })).toEqual({ status: "CONTACTED" });
    expect(waitlistUpdateBody(entry, { status: "CONTACTED", notes: "Llamar por la tarde" })).toEqual({
      status: "CONTACTED",
    });
    expect(waitlistUpdateBody(entry, { status: "CONTACTED", notes: " Ya respondió " })).toEqual({
      status: "CONTACTED",
      notes: "Ya respondió",
    });
    expect(waitlistUpdateBody(entry, { notes: "Otra nota" })).toEqual({ notes: "Otra nota" });
  });

  it("unas notas vacías las borran (`null`) y sin cambios no hay petición", () => {
    expect(waitlistUpdateBody(entry, { notes: "   " })).toEqual({ notes: null });
    expect(waitlistUpdateBody(entry, { status: "NEW", notes: "Llamar por la tarde " })).toBeNull();
    expect(waitlistUpdateBody({ status: "NEW", notes: null }, { notes: "" })).toBeNull();
  });

  it("acciones según el estado, con contactar al final", () => {
    expect(nextStatuses("NEW")).toEqual(["DISCARDED", "CONTACTED"]);
    expect(nextStatuses("CONTACTED")).toEqual(["NEW", "DISCARDED"]);
    expect(nextStatuses("DISCARDED")).toEqual(["NEW", "CONTACTED"]);
  });
});

describe("número para el enlace de WhatsApp", () => {
  it("deja solo los dígitos de un número internacional", () => {
    expect(whatsappNumber("+591 71234567")).toBe("59171234567");
    expect(whatsappNumber("00 54 (11) 5555-1234")).toBe("541155551234");
  });

  it("añade el 591 a un celular boliviano sin prefijo", () => {
    expect(whatsappNumber("71234567")).toBe("59171234567");
    expect(whatsappNumber("6 123 4567")).toBe("59161234567");
  });

  it("sin teléfono o con uno incompleto no hay enlace", () => {
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("4-664-1234")).toBeNull();
    expect(whatsappNumber("1234567890123456")).toBeNull();
  });
});

describe("exportación", () => {
  const csv = '﻿position,fullName,message\r\n1,Ana,"Hola,\r\nvuelvo ""luego"""\r\n2,Luis,\r\n';

  it("cuenta las filas del CSV sin la cabecera ni los saltos dentro de comillas", () => {
    expect(csvRowCount(csv)).toBe(2);
    expect(csvRowCount("﻿position,fullName\r\n")).toBe(0);
    expect(csvRowCount("")).toBe(0);
    expect(csvRowCount("a,b\n1,2")).toBe(1);
  });

  it("usa `X-Export-Rows` y, si falta o no es un número, cuenta el CSV", async () => {
    const blob = new Blob([csv], { type: "text/csv" });
    await expect(exportedRows("38", blob)).resolves.toBe(38);
    await expect(exportedRows("0", blob)).resolves.toBe(0);
    await expect(exportedRows(null, blob)).resolves.toBe(2);
    await expect(exportedRows("", blob)).resolves.toBe(2);
    await expect(exportedRows("muchas", blob)).resolves.toBe(2);
  });

  it("nombre por defecto como el del backend (UTC)", () => {
    expect(waitlistExportFilename(new Date("2026-10-01T09:05:00Z"))).toBe("lista-de-espera-20261001-0905.csv");
  });
});
