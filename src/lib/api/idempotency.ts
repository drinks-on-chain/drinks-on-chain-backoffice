import { useState } from "react";
import { ApiError } from "./errors";

// `Idempotency-Key` (contrato de la Ola 0 §3 y de la Ola 3 §0). Una clave por INTENCIÓN: si la
// respuesta se pierde (fallo de red) y la persona repite la misma acción con el mismo cuerpo, viaja
// la misma clave y el servidor devuelve el resultado ya guardado en lugar de aprobar, publicar o
// emitir dos veces. Si el cuerpo cambia, la clave también (la misma clave con otro cuerpo es un 409
// `IDEMPOTENCY_KEY_REUSED`). Cuando el servidor responde (éxito o error), la intención termina y la
// siguiente acción estrena clave.

export type Idempotency = {
  /** Clave para este cuerpo: la misma mientras el cuerpo no cambie y nadie llame a `done()`. */
  keyFor: (body: unknown) => string;
  /** El servidor respondió: la próxima acción usa otra clave. */
  done: () => void;
};

export function createIdempotency(newKey: () => string = () => crypto.randomUUID()): Idempotency {
  let last: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(body) {
      const fingerprint = JSON.stringify(body ?? null);
      if (!last || last.fingerprint !== fingerprint) last = { fingerprint, key: newKey() };
      return last.key;
    },
    done() {
      last = null;
    },
  };
}

/**
 * Ejecuta una escritura idempotente: conserva la clave solo si no hubo respuesta del servidor
 * (error de red u otro fallo sin respuesta), que es cuando repetir podría duplicar la operación.
 */
export async function runIdempotent<T>(idem: Idempotency, body: unknown, send: (key: string) => Promise<T>) {
  try {
    const result = await send(idem.keyFor(body));
    idem.done();
    return result;
  } catch (error) {
    if (error instanceof ApiError) idem.done();
    throw error;
  }
}

/** Una intención por componente (diálogo o botón) que lanza la escritura. */
export const useIdempotency = () => useState(createIdempotency)[0];
