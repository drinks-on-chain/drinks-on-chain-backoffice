import { ApiError } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";

/** Reglas de negocio de la configuración que corresponden al valor (contrato de la Ola 1 §6). */
export const VALUE_CODES = ["SETTING_BELOW_LEGAL_MINIMUM", "SETTING_LEVEL_NOT_ALLOWED"];

/** Error del servidor para el campo del valor (`details[{ field: 'value' }]` o regla sin `details`). */
export function valueErrorFrom(error: unknown): string | undefined {
  const { fieldErrors } = fieldErrorsFrom(error, ["value"]);
  if (fieldErrors.value) return fieldErrors.value;
  if (error instanceof ApiError && VALUE_CODES.includes(error.code)) return error.message;
  return undefined;
}
