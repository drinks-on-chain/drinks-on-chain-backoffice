import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { generateTotp } from "@drinks-on-chain/mocks/fixtures";

// Utilidades de `backend-real.spec.ts` (contra el backend de desarrollo, no contra los mocks).
// Los secretos llegan solo por variables de entorno y nunca se imprimen ni se escriben.

export const REAL = {
  apiOrigin: (process.env.E2E_API_ORIGIN ?? "").replace(/\/+$/, ""),
  password: process.env.E2E_PASSWORD ?? "",
  totpSecret: process.env.E2E_TOTP_SECRET ?? "",
  /** UI/API de Mailpit (en el servidor solo en 127.0.0.1:8025: túnel SSH). Vacía = sin correos. */
  mailpit: (process.env.E2E_MAILPIT_URL ?? "").replace(/\/+$/, ""),
};

export const STAFF = {
  admin: "administracion@drinksonchain.test",
  operations: "operaciones@drinksonchain.test",
  support: "soporte@drinksonchain.test",
} as const;

/** Sufijo único de la ejecución: todo lo que crea la prueba lo lleva. */
export const RUN = `${new Date().toISOString().slice(2, 16).replace(/\D/g, "")}${randomBytes(2).toString("hex")}`;

/** Correo de prueba con el prefijo de la ejecución (`nombre+bo-<run>@example.test`). */
export const testEmail = (name: string) => `${name}+bo-${RUN}@example.test`;

/** Contraseña aleatoria de una cuenta creada en la prueba (no se imprime). */
export const randomPassword = () => `Bo-${randomBytes(9).toString("base64url")}`;

/** NIT de 10 dígitos único por ejecución. */
export const randomTaxId = () =>
  `9${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

// ---------------------------------------------------------------------------
// TOTP: el backend no acepta el mismo código dos veces; se espera al siguiente paso si hace falta.
// ---------------------------------------------------------------------------

const used = new Map<string, string>();

export async function totpFor(page: Page, secret: string = REAL.totpSecret): Promise<string> {
  for (;;) {
    const left = 30_000 - (Date.now() % 30_000);
    const code = generateTotp(secret);
    if (left >= 3_000 && used.get(secret) !== code) {
      used.set(secret, code);
      return code;
    }
    await page.waitForTimeout(left + 250);
  }
}

// ---------------------------------------------------------------------------
// Correos (Mailpit)
// ---------------------------------------------------------------------------

type MailSummary = { ID: string; Subject: string; Created: string };

/** Último correo a `to` (opcionalmente con el asunto que casa con `subject`), esperando a que llegue. */
export async function waitForMail(to: string, subject?: RegExp, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const query = encodeURIComponent(`to:"${to}"`);
  while (Date.now() < deadline) {
    const res = await fetch(`${REAL.mailpit}/api/v1/search?query=${query}&limit=20`);
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: MailSummary[] };
      const hit = messages.find((m) => !subject || subject.test(m.Subject));
      if (hit) {
        const full = (await (await fetch(`${REAL.mailpit}/api/v1/message/${hit.ID}`)).json()) as {
          Subject: string;
          Text: string;
          HTML: string;
        };
        return { subject: full.Subject, text: full.Text, html: full.HTML };
      }
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`No llegó ningún correo a ${to}${subject ? ` con el asunto ${subject}` : ""}`);
}

/** Primer enlace del correo cuya ruta casa con `path`, como ruta relativa (`/invitacion/…?…`). */
export function linkIn(mail: { subject?: string; text: string; html: string }, path: RegExp): string {
  const urls = `${mail.text}\n${mail.html}`.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  for (const raw of urls) {
    const url = new URL(raw.replace(/&amp;/g, "&"));
    if (path.test(url.pathname)) return `${url.pathname}${url.search}`;
  }
  throw new Error(`El correo «${mail.subject ?? ""}» no trae un enlace a ${path}`);
}

// ---------------------------------------------------------------------------
// API directa (lo que no es del back office: formulario público, aceptación del dueño en el ERP)
// ---------------------------------------------------------------------------

export async function api(method: string, path: string, body?: unknown, clientApp = "PUBLIC") {
  const res = await fetch(`${REAL.apiOrigin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Client-App": clientApp },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { data?: unknown; error?: { code: string } } | null;
  return { status: res.status, data: json?.data as Record<string, unknown> | undefined, code: json?.error?.code };
}

/** Solicitud pública de alta verificada (queda `RECEIVED`): la envía y abre el enlace del correo. */
export async function receivedApplication(tradeName: string, contactEmail: string) {
  const sent = await api("POST", "/v1/public/winery-applications", {
    legalName: `${tradeName} S.R.L.`,
    tradeName,
    taxId: randomTaxId(),
    category: "WINERY",
    region: "Valle Central de Tarija · Uriondo",
    contactName: `Contacto ${RUN}`,
    contactEmail,
    contactPhone: null,
    message: "Solicitud creada por la prueba del back office contra el backend real.",
    captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
    website: "",
  });
  expect(sent.status).toBe(202);
  // Pasado el límite del formulario público (10 por IP y hora, 3 por correo) el backend responde
  // 202 igualmente pero no crea nada (no filtra datos): sin correo, es eso.
  const mail = await waitForMail(contactEmail, undefined, 45_000).catch(() => {
    throw new Error(
      `No llegó la verificación de la solicitud a ${contactEmail}: ¿límite de 10 solicitudes públicas por IP y hora?`,
    );
  });
  const token = new URLSearchParams(linkIn(mail, /\/unirse\/verificar/).split("?")[1]).get("token");
  expect(token).toBeTruthy();
  const verified = await api("POST", "/v1/public/winery-applications/verify", { token });
  expect(verified.status).toBe(204);
}

/** Acepta una invitación con cuenta nueva sin sesión (lo que haría el ERP). */
export async function acceptAsNewAccount(invitationPath: string, fullName: string) {
  const token = decodeURIComponent(invitationPath.split("?")[0]!.split("/").pop()!);
  const res = await api(
    "POST",
    `/v1/invitations/${encodeURIComponent(token)}/accept`,
    {
      fullName,
      password: randomPassword(),
    },
    "ERP",
  );
  expect(res.status, `aceptar la invitación: ${res.code ?? ""}`).toBe(200);
}
