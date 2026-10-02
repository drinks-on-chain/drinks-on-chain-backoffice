import type { AuditEvent } from "@drinks-on-chain/mocks";
import { es } from "@/lib/i18n/es";

// Textos de los códigos estables del backend (bitácora, roles). Un código desconocido se muestra
// legible en lugar de fallar: el backend puede añadir acciones nuevas en cualquier ola.

const AUDIT_ACTIONS: Record<string, string> = {
  AUTH_LOGIN_SUCCEEDED: "Inicio de sesión",
  AUTH_LOGIN_FAILED: "Inicio de sesión fallido",
  AUTH_MFA_CHALLENGED: "Segundo factor pedido",
  MFA_LOCKED: "Segundo factor bloqueado por intentos",
  USER_EMAIL_VERIFICATION_SENT: "Verificación de correo enviada",
  USER_CREATED: "Cuenta creada",
  USER_PROFILE_UPDATED: "Perfil actualizado",
  USER_PASSWORD_CHANGED: "Contraseña cambiada",
  USER_PASSWORD_RESET: "Contraseña restablecida",
  USER_PASSWORD_RESET_REQUESTED: "Recuperación de contraseña pedida",
  USER_PASSWORD_RESET_SENT: "Enlace de contraseña enviado",
  USER_EMAIL_VERIFIED: "Correo verificado",
  USER_BLOCKED: "Cuenta bloqueada",
  USER_UNBLOCKED: "Cuenta desbloqueada",
  MFA_ENROLLED: "Segundo factor activado",
  MFA_RESET: "Segundo factor restablecido",
  MFA_FAILED: "Código de segundo factor incorrecto",
  MFA_RECOVERY_CODE_USED: "Código de recuperación usado",
  PLATFORM_USER_INVITED: "Usuario interno invitado",
  PLATFORM_USER_ROLE_CHANGED: "Rol de usuario interno cambiado",
  PLATFORM_USER_BLOCKED: "Usuario interno bloqueado",
  PLATFORM_USER_UNBLOCKED: "Usuario interno desbloqueado",
  INVITATION_CREATED: "Invitación creada",
  INVITATION_RESENT: "Invitación reenviada",
  INVITATION_REVOKED: "Invitación anulada",
  INVITATION_ACCEPTED: "Invitación aceptada",
  MEMBER_JOINED: "Alta en el equipo",
  MEMBER_ROLE_CHANGED: "Rol cambiado",
  MEMBER_BLOCKED: "Miembro bloqueado",
  MEMBER_UNBLOCKED: "Miembro desbloqueado",
  INVITATION_EXPIRED: "Invitación caducada",
  PLATFORM_SUPERADMIN_SEEDED: "Superusuario inicial creado",
  WINERY_APPLICATION_SUBMITTED: "Solicitud de alta recibida",
  WINERY_APPLICATION_VERIFIED: "Solicitud verificada por correo",
  WINERY_APPLICATION_DUPLICATE_TAX_ID: "Solicitud con NIT repetido",
  WINERY_APPLICATION_TAKEN: "Solicitud tomada",
  WINERY_APPLICATION_NOTE_ADDED: "Nota en una solicitud",
  WINERY_APPLICATION_MEETING_SCHEDULED: "Reunión agendada",
  WINERY_APPLICATION_MEETING_DONE: "Reunión hecha",
  WINERY_APPLICATION_APPROVED: "Solicitud aprobada",
  WINERY_APPLICATION_REJECTED: "Solicitud rechazada",
  WINERY_CREATED: "Bodega dada de alta",
  WINERY_ACTIVATED: "Bodega activada",
  WINERY_UPDATED: "Bodega editada",
  WINERY_SUSPENDED: "Bodega suspendida",
  WINERY_REACTIVATED: "Bodega reactivada",
  WINERY_REVOKED: "Bodega revocada",
  WINERY_OWNERSHIP_TRANSFER_STARTED: "Transferencia de titularidad iniciada",
  WINERY_OWNERSHIP_TRANSFERRED: "Titularidad transferida",
  SETTING_CHANGED: "Ajuste cambiado",
  SETTING_OVERRIDE_SET: "Ajuste por bodega cambiado",
  SETTING_OVERRIDE_RESET: "Ajuste por bodega restablecido",
  // Lista de espera (contrato O1b).
  WAITLIST_JOINED: "Inscripción en la lista de espera",
  WAITLIST_STATUS_CHANGED: "Inscripción de la lista de espera actualizada",
  WAITLIST_EXPORTED: "Lista de espera exportada",
  // Trazabilidad de la Ola 2 (escrituras del ERP sobre el lote).
  LOT_CREATED: "Lote creado",
  LOT_UPDATED: "Lote editado",
  LOT_DISCARDED: "Lote descartado",
  PHYTO_DECIDED: "Dictamen fitosanitario",
  MATURITY_ANALYZED: "Análisis de madurez registrado",
  TANK_TRANSITION: "Cambio de estado de un tanque",
  DISTILLATION_CLOSED: "Destilación cerrada",
  BOTTLED: "Lote embotellado",
  LAB_REGISTERED: "Análisis de laboratorio registrado",
  BOTTLE_CODE_VOIDED: "Código de botella anulado",
  BOTTLE_CODES_EXPORTED: "Códigos de botella exportados",
  CORRECTION_REGISTERED: "Corrección registrada",
  ATTACHMENT_ADDED: "Archivo adjuntado al lote",
  ATTACHMENT_VISIBILITY_CHANGED: "Visibilidad de un adjunto cambiada",
  DOSSIER_CLOSED: "Expediente del lote cerrado",
  // Aprobación y rechazo del flujo anterior a la Ola 1 (`/v1/wineries/:id/approve|reject`).
  WINERY_APPROVED: "Bodega aprobada",
  WINERY_REJECTED: "Bodega rechazada",
  // Escrituras del ERP que también quedan en la bitácora.
  TERROIR_CREATED: "Parcela registrada",
  TERROIR_UPDATED: "Parcela editada",
  HARVEST_BATCH_CREATED: "Vendimia registrada",
  FERMENTATION_TANK_CREATED: "Tanque de fermentación creado",
  HARVEST_BATCH_PHYTO_STATUS_CHANGED: "Dictamen fitosanitario",
  FERMENTATION_LOG_ADDED: "Lectura de fermentación",
  ENOLOGICAL_TREATMENT_ADDED: "Tratamiento enológico registrado",
  WINE_AGING_BATCH_CREATED: "Crianza iniciada",
  PRODUCTION_BATCH_CREATED: "Destilación registrada",
  BOTTLING_BATCH_CREATED: "Embotellado registrado",
  LAB_ANALYSIS_CREATED: "Análisis de laboratorio registrado",
  FILE_UPLOADED: "Archivo subido",
  SYSTEM_TASK_DONE: "Tarea del sistema",
};

/** "PLATFORM_USER_BLOCKED" → "Usuario interno bloqueado"; desconocido → "Lot certified". */
export function auditActionLabel(action: string): string {
  const known = AUDIT_ACTIONS[action];
  if (known) return known;
  const words = action.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const roleLabel = (role: string | null | undefined) => (role ? (es.roles[role] ?? role) : "—");

/** Quién hizo algo: persona (con "vía plataforma") o el sistema. */
export function auditActorLabel(actor: AuditEvent["actor"]): string {
  if (!actor.fullName) return "Sistema";
  return actor.viaPlatform && actor.role ? `${actor.fullName} · ${roleLabel(actor.role)}` : actor.fullName;
}

/** Códigos de la bitácora conocidos (para el filtro de acción), ordenados por su texto. */
export const auditActionOptions = () =>
  Object.entries(AUDIT_ACTIONS)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

export const CATEGORY_LABELS: Record<string, string> = {
  WINERY: "Bodega de vino",
  DISTILLERY: "Destilería",
  BREWERY: "Cervecería",
  OTHER: "Otra",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

export const MEETING_CHANNEL_LABELS: Record<string, string> = {
  CALL: "Llamada",
  VIDEO: "Videollamada",
  IN_PERSON: "En persona",
};
export const meetingChannelLabel = (c: string) => MEETING_CHANNEL_LABELS[c] ?? c;

/** Tipos de recurso de la bitácora (`snake_case`, como el backend). */
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  winery: "Bodega",
  winery_application: "Solicitud",
  membership: "Membresía",
  invitation: "Invitación",
  user: "Persona",
  setting: "Parámetro",
  lot: "Lote",
  lot_attachment: "Adjunto del lote",
  correction: "Corrección",
  bottle_code_export: "Exportación de códigos de botella",
  waitlist_entry: "Inscripción en la lista de espera",
  terroir: "Parcela",
  harvest_batch: "Vendimia",
  fermentation_tank: "Cuba",
  fermentation_log: "Lectura de fermentación",
  enological_treatment: "Tratamiento enológico",
  wine_aging_batch: "Crianza",
  production_batch: "Destilación",
  bottling_batch: "Embotellado",
  lab_analysis: "Análisis de laboratorio",
  file: "Archivo",
};
export const resourceTypeLabel = (t: string) => RESOURCE_TYPE_LABELS[t] ?? auditActionLabel(t);

export const CLIENT_APP_LABELS: Record<string, string> = {
  ERP: "ERP",
  MARKETPLACE: "Marketplace",
  BACKOFFICE: "Back office",
  POS: "POS",
  PUBLIC: "Público",
  API: "API",
  WORKER: "Sistema",
};
export const clientAppLabel = (a: string) => CLIENT_APP_LABELS[a] ?? a;

/** Qué pasa con el dueño anterior al transferir la titularidad. */
export const PREVIOUS_OWNER_LABELS = {
  BLOCKED: "Queda bloqueado en la bodega",
  ENOLOGIST: "Sigue en el equipo como enólogo",
} as const;

// Lista de espera (contrato O1b): estado de una inscripción, qué interesa o qué produce, idioma.
export const WAITLIST_STATUS_LABELS: Record<string, string> = {
  NEW: "Nueva",
  CONTACTED: "Contactada",
  DISCARDED: "Descartada",
};
export const waitlistStatusLabel = (s: string) => WAITLIST_STATUS_LABELS[s] ?? s;

export const WAITLIST_STATUS_TONES: Record<string, "info" | "success" | "neutral"> = {
  NEW: "info",
  CONTACTED: "success",
  DISCARDED: "neutral",
};

/** `interest` (consumidor) y `produces` (bodega). */
export const WAITLIST_DRINK_LABELS: Record<string, string> = {
  WINE: "Vino",
  SINGANI: "Singani",
  BOTH: "Vino y singani",
  OTHER: "Otra bebida",
};
export const waitlistDrinkLabel = (v: string | null | undefined) => (v ? (WAITLIST_DRINK_LABELS[v] ?? v) : "—");

export const LOCALE_LABELS: Record<string, string> = { es: "Español", en: "Inglés" };
export const localeLabel = (l: string) => LOCALE_LABELS[l] ?? l;

// Lotes (contrato de la Ola 2 §2): etapa calculada por el servidor, tipo y laboratorio.
type BadgeTone = "info" | "success" | "warning" | "danger" | "neutral" | "accent";

export const LOT_STAGE_LABELS: Record<string, string> = {
  ORIGIN: "Origen",
  HARVEST: "Vendimia",
  FERMENTING: "Fermentación",
  AGING: "Crianza",
  DISTILLING: "Destilación",
  RESTING: "Reposo",
  BOTTLED: "Embotellado",
  CERTIFIED: "Certificado",
  ANCHORED: "Anclado",
  REJECTED: "Rechazado",
  DISCARDED: "Descartado",
};
export const lotStageLabel = (s: string) => LOT_STAGE_LABELS[s] ?? auditActionLabel(s);

export const LOT_STAGE_TONES: Record<string, BadgeTone> = {
  ORIGIN: "neutral",
  HARVEST: "info",
  FERMENTING: "info",
  AGING: "warning",
  DISTILLING: "info",
  RESTING: "warning",
  BOTTLED: "accent",
  CERTIFIED: "success",
  ANCHORED: "success",
  REJECTED: "danger",
  DISCARDED: "neutral",
};

/** `null`: el lote aún no decidió su destino (se fija en la bifurcación). */
export const lotProductLabel = (t: string | null) =>
  t === null ? "Sin decidir" : ({ WINE: "Vino", SINGANI: "Singani" }[t] ?? t);

export const LAB_STATUS_LABELS: Record<string, string> = {
  NOT_RECORDED: "Sin análisis",
  CONFORMING: "Conforme",
  NON_CONFORMING: "No conforme",
  INCOMPLETE: "Incompleto",
};
export const labStatusLabel = (s: string) => LAB_STATUS_LABELS[s] ?? s;

export const LAB_STATUS_TONES: Record<string, BadgeTone> = {
  NOT_RECORDED: "neutral",
  CONFORMING: "success",
  NON_CONFORMING: "danger",
  INCOMPLETE: "warning",
};
