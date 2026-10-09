import { z } from "zod";

// Variables públicas. Next las inyecta en tiempo de build, así que cada una se lee
// por su nombre literal (no con process.env[clave]).
const schema = z.object({
  mocks: z.boolean(),
  urlLanding: z.string().url().or(z.literal("")),
  urlBodegas: z.string().url().or(z.literal("")),
  urlApp: z.string().url().or(z.literal("")),
  urlErp: z.string().url().or(z.literal("")),
  urlWhatsapp: z.string().url(),
  turnstileSiteKey: z.string(),
  flags: z.object({
    pickupPoints: z.boolean(),
    support: z.boolean(),
    orders: z.boolean(),
  }),
});

export const env = schema.parse({
  mocks: process.env.NEXT_PUBLIC_MOCKS === "1",
  urlLanding: process.env.NEXT_PUBLIC_URL_LANDING ?? "",
  urlBodegas: process.env.NEXT_PUBLIC_URL_BODEGAS ?? "",
  urlApp: process.env.NEXT_PUBLIC_URL_APP ?? "",
  urlErp: process.env.NEXT_PUBLIC_URL_ERP ?? "",
  // Enlaces «Escribir por WhatsApp» de la lista de espera (por defecto el servicio de enlaces).
  urlWhatsapp: process.env.NEXT_PUBLIC_URL_WHATSAPP || "https://wa.me",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
  // Módulos de otras olas (4D, 4F): ocultos en el menú hasta que existan (plan/03 §1).
  flags: {
    pickupPoints: process.env.NEXT_PUBLIC_FLAG_PICKUP_POINTS === "1",
    support: process.env.NEXT_PUBLIC_FLAG_SUPPORT === "1",
    orders: process.env.NEXT_PUBLIC_FLAG_ORDERS === "1",
  },
});

/** Las herramientas de desarrollo (/__mocks) existen en local y en demos con mocks. */
export const devToolsEnabled = process.env.NODE_ENV !== "production" || env.mocks;

/**
 * Prefijo de la API en el origen de la propia app (P-1, contrato de la Ola 0 §7). El cliente
 * llama a `/api/v1/*`; `src/proxy.ts` lo reescribe a `${API_ORIGIN}/v1/*` y la cookie de
 * renovación queda de primera parte. Con mocks, MSW intercepta `/api/v1/*` en el navegador.
 */
export const API_BASE = "/api";

const apiOriginSchema = z
  .string()
  .trim()
  .url("API_ORIGIN debe ser una URL, p. ej. https://api.ejemplo.bo")
  .refine((v) => /^https?:\/\//i.test(v), "API_ORIGIN debe empezar por http:// o https://")
  // Se toleran la barra final y un `/v1` final.
  .transform((v) => v.replace(/\/+$/, "").replace(/\/v1$/i, ""));

type ServerVars = { API_ORIGIN?: string; NEXT_PUBLIC_MOCKS?: string };

/**
 * Origen del backend para la reescritura de `src/proxy.ts` (variable de servidor
 * `API_ORIGIN`, nunca pública; `next.config.ts` la valida también al construir). Obligatoria salvo con `NEXT_PUBLIC_MOCKS=1`, donde no hay
 * reescritura y devuelve `null`. Solo se evalúa en el servidor (build y `next start`).
 */
export function resolveApiOrigin(
  vars: ServerVars = { API_ORIGIN: process.env.API_ORIGIN, NEXT_PUBLIC_MOCKS: process.env.NEXT_PUBLIC_MOCKS },
): string | null {
  const raw = vars.API_ORIGIN?.trim();
  if (!raw) {
    if (vars.NEXT_PUBLIC_MOCKS === "1") return null;
    throw new Error(
      "Falta API_ORIGIN (origen del backend, p. ej. https://136.243.223.39.sslip.io). " +
        "Defínela o arranca con NEXT_PUBLIC_MOCKS=1 para usar los datos de prueba.",
    );
  }
  const parsed = apiOriginSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}
