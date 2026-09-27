import { describe, expect, it } from "vitest";
import {
  changedFields,
  emptyWineryForm,
  reasonProblem,
  validateApprove,
  validateInvite,
  validateMeeting,
  validateNewWinery,
  validateTransferEmail,
  wineryBody,
} from "./forms";

// Validación en el cliente con los límites del contrato de la Ola 1 (y de los esquemas de los mocks).

const winery = {
  ...emptyWineryForm,
  legalName: "Bodega La Cañada S.R.L.",
  tradeName: "La Cañada",
  taxId: "7012345678",
  category: "WINERY",
  region: "Valle Central de Tarija · Uriondo",
  contactEmail: "contacto@lacanada.test",
  ownerFullName: "Rosa Mamani",
  ownerEmail: "rosa@lacanada.test",
};

describe("alta directa de bodega", () => {
  it("un formulario completo no tiene errores y el cuerpo manda null en lo opcional", () => {
    expect(validateNewWinery(winery)).toEqual({});
    expect(wineryBody({ ...winery, address: "  ", website: " https://lacanada.test " })).toMatchObject({
      address: null,
      website: "https://lacanada.test",
      contactPhone: null,
    });
  });

  it("marca los obligatorios, el NIT, los correos, la web y el motivo corto", () => {
    const errors = validateNewWinery({
      ...emptyWineryForm,
      taxId: "12-34",
      contactEmail: "no-es-correo",
      website: "lacanada.test",
      reason: "ok",
    });
    expect(errors).toMatchObject({
      legalName: "Campo obligatorio.",
      tradeName: "Campo obligatorio.",
      taxId: "El NIT debe tener entre 5 y 15 dígitos.",
      region: "Campo obligatorio.",
      contactEmail: "El correo no es válido.",
      website: "Escribe una dirección completa (https://…).",
      ownerFullName: "Campo obligatorio.",
      ownerEmail: "Campo obligatorio.",
      reason: "El motivo necesita al menos 3 caracteres.",
    });
  });

  it("para el PATCH solo cuenta lo que cambia", () => {
    const current = wineryBody(winery);
    expect(changedFields(wineryBody({ ...winery, tradeName: "Cañada" }), current)).toEqual({ tradeName: "Cañada" });
    expect(changedFields(current, current)).toEqual({});
  });
});

describe("solicitudes", () => {
  it("aprobar: dueño con nombre y correo; motivo opcional", () => {
    expect(validateApprove({ ownerFullName: "Ana", ownerEmail: "ana@x.test", reason: "" })).toEqual({});
    expect(validateApprove({ ownerFullName: " ", ownerEmail: "ana", reason: "" })).toEqual({
      ownerFullName: "Campo obligatorio.",
      ownerEmail: "El correo no es válido.",
    });
  });

  it("reunión: fecha y canal", () => {
    expect(validateMeeting({ scheduledAt: "2026-10-03T10:30", channel: "VIDEO", notes: "" })).toEqual({});
    expect(validateMeeting({ scheduledAt: "", channel: "FAX", notes: "" })).toEqual({
      scheduledAt: "Elige la fecha y la hora.",
      channel: "Elige cómo será la reunión.",
    });
  });
});

describe("equipo y motivos", () => {
  it("invitar: nunca con el rol de dueño", () => {
    expect(validateInvite({ email: "x@y.test", role: "ENOLOGIST", reason: "" })).toEqual({});
    expect(validateInvite({ email: "x@y.test", role: "OWNER", reason: "" }).role).toMatch(/solo se asigna/);
  });

  it("transferir: otro correo que el del dueño actual", () => {
    expect(validateTransferEmail("dueno@x.test", "Dueno@X.test")).toBe("Esa persona ya es la dueña de la bodega.");
    expect(validateTransferEmail("nuevo@x.test", "dueno@x.test")).toBeUndefined();
  });

  it("motivo obligatorio de 3 a 500 caracteres", () => {
    expect(reasonProblem("  ")).toMatch(/mínimo 3/);
    expect(reasonProblem("x".repeat(501))).toMatch(/500/);
    expect(reasonProblem("Cierre temporal")).toBeUndefined();
  });
});
