import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { explainRuleError, formField, isStaleStateError, ruleDetails, ruleErrorMessage } from "./rule-errors";
import { COMMERCIAL_FIELDS } from "./tokenization-utils";

const apiError = (status: number, code: string, details: unknown = null, message = code) =>
  new ApiError({ status, code, message, details });

describe("errores TOK_… y CHN_… explicados", () => {
  it("reparte `TOK_COMMERCIAL_DATA_INCOMPLETE` campo a campo", () => {
    const error = apiError(422, "TOK_COMMERCIAL_DATA_INCOMPLETE", [
      { field: "commercial.name", message: "Falta el nombre de la colección", code: "TOK_COMMERCIAL_DATA_INCOMPLETE" },
      { field: "commercial.description", message: "Falta la descripción de la colección" },
      { field: "commercial.imageKeys", message: "Falta la imagen de portada" },
    ]);
    const explained = explainRuleError(error, COMMERCIAL_FIELDS);
    expect(explained.code).toBe("TOK_COMMERCIAL_DATA_INCOMPLETE");
    expect(explained.message).toMatch(/nombre, descripción y una imagen de portada/);
    expect(explained.fieldErrors).toEqual({
      name: "Falta el nombre de la colección",
      description: "Falta la descripción de la colección",
      images: "Falta la imagen de portada",
    });
    expect(explained.notes).toEqual([]);
  });

  it("traduce el campo del backend al del formulario", () => {
    expect(formField("commercial.tastingNotes")).toBe("tastingNotes");
    expect(formField("commercial.imageKeys.0.alt")).toBe("images");
    expect(formField("price.amountMinor")).toBe("price");
    expect(formField("price")).toBe("price");
    expect(formField("reason")).toBe("reason");
    expect(formField("fields.2")).toBe("fields");
  });

  it("usa `expected`, `actual` y `meta` del detalle", () => {
    const quota = explainRuleError(
      apiError(422, "TOK_QUOTA_EXCEEDS_ESTIMATE", [
        {
          field: "quantity",
          message: "x",
          code: "TOK_QUOTA_EXCEEDS_ESTIMATE",
          expected: 3000,
          actual: 3200,
          meta: { maxQuantity: 2900 },
        },
      ]),
    );
    expect(quota.message).toBe(
      "La cuota resultante (3.200) supera la estimación de botellas del lote (3.000). Pide a la bodega que reduzca la cantidad (máximo 2.900) o que actualice la estimación.",
    );
    const identity = explainRuleError(
      apiError(409, "TOK_WINERY_CHAIN_NOT_READY", [
        { field: null, message: "Identidad en la red: PROVISIONING", meta: { status: "PROVISIONING" } },
      ]),
    );
    expect(identity.message).toMatch(/identidad «Preparándose»/);
    expect(identity.message).toMatch(/pestaña «Cadena» de la bodega/);
    const abandon = explainRuleError(
      apiError(409, "CHN_TX_NOT_ABANDONABLE", [{ message: "x", meta: { kind: "MINT_BATCH" } }]),
    );
    expect(abandon.message).toMatch(/«Emisión de NFT» no se puede abandonar/);
    const transition = explainRuleError(
      apiError(409, "TOK_COLLECTION_INVALID_TRANSITION", [{ message: "x", meta: { from: "CLOSED", to: "PUBLISHED" } }]),
    );
    expect(transition.message).toMatch(/está «Cerrada» y no admite esta acción/);
  });

  it("marca el nombre repetido (409) en su campo", () => {
    const explained = explainRuleError(
      apiError(409, "TOK_SLUG_TAKEN", [
        { field: "commercial.name", message: "Elige otro nombre", code: "TOK_SLUG_TAKEN" },
      ]),
      COMMERCIAL_FIELDS,
    );
    expect(explained.fieldErrors).toEqual({ name: "Elige otro nombre" });
    expect(explained.message).toMatch(/Ya existe una colección con ese nombre/);
  });

  it("explica el 403: soporte no puede aprobar, publicar ni pausar", () => {
    const explained = explainRuleError(apiError(403, "AUTH_INSUFFICIENT_PERMISSIONS", null, "No tiene permisos"));
    expect(explained.message).toMatch(/Tu rol no permite esta acción/);
    expect(explained.fieldErrors).toEqual({});
  });

  it("explica las reglas de publicar, cerrar y de la red", () => {
    const text = (code: string) => explainRuleError(apiError(409, code)).message;
    expect(text("TOK_MINT_NOT_CONFIRMED")).toMatch(/aún no está confirmada en la red/);
    expect(text("TOK_CLOSURE_PENDING")).toMatch(/antes de cerrar la colección/);
    expect(text("CHN_CONTRACT_PAUSED")).toMatch(/pausado en la red/);
    expect(text("TOK_PRICE_LOCKED")).toMatch(/ya tiene ventas/);
    expect(text("CHN_RECONCILIATION_RUNNING")).toMatch(/Ya hay una conciliación en curso/);
    expect(text("CHN_ALERT_ALREADY_RESOLVED")).toMatch(/ya estaba resuelta/);
    expect(text("TOK_WINERY_NOT_ACTIVE")).toMatch(/suspendida o revocada/);
    expect(text("CHN_DISABLED")).toMatch(/La cadena no está configurada en este entorno/);
    // Decidir dos veces o resolver un ítem ya resuelto (backend desplegado).
    expect(text("CONFLICT")).toMatch(/Ya estaba hecho/);
  });

  it("un 422 genérico marca sus campos y lo demás va a las notas", () => {
    const explained = explainRuleError(
      apiError(422, "VALIDATION_ERROR", [
        { field: "reason", message: "reason debe tener al menos 3 caracteres" },
        { field: "otro", message: "otro no debería existir" },
      ]),
      ["reason"],
    );
    expect(explained.message).toBe("Revisa los campos marcados.");
    expect(explained.fieldErrors).toEqual({ reason: "reason debe tener al menos 3 caracteres" });
    expect(explained.notes).toEqual(["otro no debería existir"]);
  });

  it("un código desconocido conserva el mensaje del servidor; sin respuesta, el de red", () => {
    expect(explainRuleError(apiError(409, "TOK_NUEVO", null, "Regla nueva del backend")).message).toBe(
      "Regla nueva del backend",
    );
    expect(explainRuleError(new NetworkError("x")).message).toBe("No se pudo conectar con el servidor.");
    expect(explainRuleError(apiError(500, "INTERNAL")).message).toMatch(/El servidor tuvo un problema/);
  });

  it("los diálogos de motivo muestran la explicación solo si el código es de la Ola 3", () => {
    expect(ruleErrorMessage(apiError(409, "CHN_TX_NOT_RETRYABLE"))).toMatch(
      /Solo se reintenta una transacción fallida/,
    );
    expect(ruleErrorMessage(apiError(403, "AUTH_INSUFFICIENT_PERMISSIONS"))).toBe(
      "No tienes permiso para esta acción.",
    );
    expect(ruleErrorMessage(apiError(409, "ORG_NOT_ACTIVE", null, "La bodega no está activa"))).toBe(
      "La bodega no está activa",
    );
  });

  it("reconoce los errores de estado obsoleto e ignora detalles con otra forma", () => {
    expect(isStaleStateError(apiError(409, "TOK_REQUEST_INVALID_TRANSITION"))).toBe(true);
    expect(isStaleStateError(apiError(409, "TOK_SLUG_TAKEN"))).toBe(false);
    expect(isStaleStateError(new Error("x"))).toBe(false);
    expect(ruleDetails("texto")).toEqual([]);
    expect(ruleDetails([null, 3, { field: "a" }, { message: "ok", meta: [1] }])).toEqual([
      { field: null, message: "ok", code: null, expected: null, actual: null, meta: {} },
    ]);
  });
});
