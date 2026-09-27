import { validateReason } from "@drinks-on-chain/ui";
import { localInputToIso } from "@/lib/format";

// Validación en el cliente de los formularios del back office, con los mismos límites que el
// contrato (y los esquemas de los mocks). El backend valida igual: sus `details` por campo se
// muestran en el mismo sitio (`fieldErrorsFrom`).

export type FormErrors<F extends string> = Partial<Record<F, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL.test(value.trim());
const TAX_ID = /^\d{5,15}$/;

type Limits = { min?: number; max: number; label?: string };

function checkText(errors: Record<string, string>, field: string, value: string, { min = 0, max, label }: Limits) {
  const v = value.trim();
  if (min > 0 && v.length === 0) errors[field] = "Campo obligatorio.";
  else if (v.length < min) errors[field] = `Escribe al menos ${min} caracteres.`;
  else if (v.length > max) errors[field] = `${label ?? "El texto"} admite como mucho ${max} caracteres.`;
}

function checkEmail(errors: Record<string, string>, field: string, value: string) {
  if (!value.trim()) errors[field] = "Campo obligatorio.";
  else if (!isEmail(value)) errors[field] = "El correo no es válido.";
}

/** Motivo opcional: vacío vale; si se escribe, 3–500 caracteres. */
function checkOptionalReason(errors: Record<string, string>, reason: string) {
  if (!reason.trim()) return;
  const problem = validateReason(reason);
  if (problem === "too-short") errors.reason = "El motivo necesita al menos 3 caracteres.";
  if (problem === "too-long") errors.reason = "El motivo admite como mucho 500 caracteres.";
}

function checkUrl(errors: Record<string, string>, field: string, value: string) {
  const v = value.trim();
  if (!v) return;
  try {
    const parsed = new URL(v);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("protocolo");
  } catch {
    errors[field] = "Escribe una dirección completa (https://…).";
  }
}

// ---------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------

export type ApproveForm = { ownerFullName: string; ownerEmail: string; reason: string };

export function validateApprove(f: ApproveForm): FormErrors<keyof ApproveForm> {
  const errors: Record<string, string> = {};
  checkText(errors, "ownerFullName", f.ownerFullName, { min: 1, max: 120 });
  checkEmail(errors, "ownerEmail", f.ownerEmail);
  checkOptionalReason(errors, f.reason);
  return errors;
}

export type MeetingForm = { scheduledAt: string; channel: string; notes: string };

export function validateMeeting(f: MeetingForm): FormErrors<keyof MeetingForm> {
  const errors: Record<string, string> = {};
  if (!f.scheduledAt) errors.scheduledAt = "Elige la fecha y la hora.";
  else if (!localInputToIso(f.scheduledAt)) errors.scheduledAt = "La fecha no es válida.";
  if (!["CALL", "VIDEO", "IN_PERSON"].includes(f.channel)) errors.channel = "Elige cómo será la reunión.";
  checkText(errors, "notes", f.notes, { max: 2000, label: "La nota" });
  return errors;
}

export function validateNote(value: string): string | undefined {
  const errors: Record<string, string> = {};
  checkText(errors, "text", value, { min: 1, max: 2000, label: "La nota" });
  return errors.text;
}

// ---------------------------------------------------------------------------
// Bodegas
// ---------------------------------------------------------------------------

export type WineryForm = {
  legalName: string;
  tradeName: string;
  taxId: string;
  category: string;
  region: string;
  address: string;
  senasagRegistration: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  logoUrl: string;
  publicStory: string;
};

export type NewWineryForm = WineryForm & { ownerFullName: string; ownerEmail: string; reason: string };

export const emptyWineryForm: NewWineryForm = {
  legalName: "",
  tradeName: "",
  taxId: "",
  category: "WINERY",
  region: "",
  address: "",
  senasagRegistration: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
  logoUrl: "",
  publicStory: "",
  ownerFullName: "",
  ownerEmail: "",
  reason: "",
};

export function validateWineryProfile(f: WineryForm): FormErrors<keyof WineryForm> {
  const errors: Record<string, string> = {};
  checkText(errors, "legalName", f.legalName, { min: 2, max: 200 });
  checkText(errors, "tradeName", f.tradeName, { min: 2, max: 120 });
  if (!f.taxId.trim()) errors.taxId = "Campo obligatorio.";
  else if (!TAX_ID.test(f.taxId.trim())) errors.taxId = "El NIT debe tener entre 5 y 15 dígitos.";
  if (!["WINERY", "DISTILLERY", "BREWERY", "OTHER"].includes(f.category)) errors.category = "Elige la categoría.";
  checkText(errors, "region", f.region, { min: 2, max: 120 });
  checkText(errors, "address", f.address, { max: 300, label: "La dirección" });
  checkText(errors, "senasagRegistration", f.senasagRegistration, { max: 60, label: "El registro" });
  checkEmail(errors, "contactEmail", f.contactEmail);
  checkText(errors, "contactPhone", f.contactPhone, { max: 30, label: "El teléfono" });
  checkUrl(errors, "website", f.website);
  checkText(errors, "logoUrl", f.logoUrl, { max: 500, label: "La dirección del logo" });
  checkText(errors, "publicStory", f.publicStory, { max: 4000, label: "La historia" });
  return errors;
}

export function validateNewWinery(f: NewWineryForm): FormErrors<keyof NewWineryForm> {
  const errors: Record<string, string> = { ...validateWineryProfile(f) };
  checkText(errors, "ownerFullName", f.ownerFullName, { min: 1, max: 120 });
  checkEmail(errors, "ownerEmail", f.ownerEmail);
  checkOptionalReason(errors, f.reason);
  return errors;
}

type Category = "WINERY" | "DISTILLERY" | "BREWERY" | "OTHER";

/** Cuerpo de la API: textos recortados y los opcionales vacíos como `null`. */
export function wineryBody(f: WineryForm) {
  const opt = (v: string) => (v.trim() ? v.trim() : null);
  return {
    legalName: f.legalName.trim(),
    tradeName: f.tradeName.trim(),
    taxId: f.taxId.trim(),
    category: f.category as Category,
    region: f.region.trim(),
    address: opt(f.address),
    senasagRegistration: opt(f.senasagRegistration),
    contactEmail: f.contactEmail.trim(),
    contactPhone: opt(f.contactPhone),
    website: opt(f.website),
    logoUrl: opt(f.logoUrl),
    publicStory: opt(f.publicStory),
  };
}

/** Solo los campos que cambian respecto al perfil guardado (para el `PATCH`). */
export function changedFields<T extends Record<string, unknown>>(
  next: T,
  current: Partial<Record<keyof T, unknown>>,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if ((next[key] ?? null) !== (current[key] ?? null)) out[key] = next[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

export type InviteForm = { email: string; role: string; reason: string };

export function validateInvite(f: InviteForm): FormErrors<keyof InviteForm> {
  const errors: Record<string, string> = {};
  checkEmail(errors, "email", f.email);
  if (!f.role) errors.role = "Elige el rol.";
  else if (f.role === "OWNER")
    errors.role = "El rol de dueño solo se asigna en el alta o al transferir la titularidad.";
  checkOptionalReason(errors, f.reason);
  return errors;
}

export function validateTransferEmail(email: string, currentOwnerEmail: string | null | undefined): string | undefined {
  const errors: Record<string, string> = {};
  checkEmail(errors, "email", email);
  if (errors.email) return errors.email;
  if (currentOwnerEmail && email.trim().toLowerCase() === currentOwnerEmail.toLowerCase()) {
    return "Esa persona ya es la dueña de la bodega.";
  }
  return undefined;
}

/** Motivo obligatorio (3–500 caracteres) de las acciones sobre terceros. */
export function reasonProblem(reason: string): string | undefined {
  const problem = validateReason(reason);
  if (problem === "too-short") return "Escribe el motivo (mínimo 3 caracteres).";
  if (problem === "too-long") return "El motivo admite como mucho 500 caracteres.";
  return undefined;
}
