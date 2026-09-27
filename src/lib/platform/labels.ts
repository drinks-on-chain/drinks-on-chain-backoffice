import type { AuditEvent } from "@drinks-on-chain/mocks";
import { es } from "@/lib/i18n/es";

// Textos de los códigos estables del backend (bitácora, roles). Un código desconocido se muestra
// legible en lugar de fallar: el backend puede añadir acciones nuevas en cualquier ola.

const AUDIT_ACTIONS: Record<string, string> = {
  USER_LOGGED_IN: "Inicio de sesión",
  USER_LOGIN_FAILED: "Inicio de sesión fallido",
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
  // Escrituras del ERP que también quedan en la bitácora.
  TERROIR_CREATED: "Parcela registrada",
  HARVEST_BATCH_CREATED: "Vendimia registrada",
  FERMENTATION_TANK_CREATED: "Tanque de fermentación creado",
  ENOLOGICAL_TREATMENT_RECORDED: "Tratamiento enológico registrado",
  WINE_AGING_STARTED: "Crianza iniciada",
  DISTILLATION_RECORDED: "Destilación registrada",
  BOTTLING_RECORDED: "Embotellado registrado",
  LAB_ANALYSIS_RECORDED: "Análisis de laboratorio registrado",
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

/** Tipos de recurso de la bitácora. */
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  WINERY: "Bodega",
  WINERY_APPLICATION: "Solicitud",
  MEMBERSHIP: "Membresía",
  INVITATION: "Invitación",
  USER: "Persona",
  SETTING: "Parámetro",
  TERROIR: "Parcela",
  HARVEST_BATCH: "Vendimia",
  FERMENTATION_TANK: "Cuba",
  ENOLOGICAL_TREATMENT: "Tratamiento enológico",
  WINE_AGING: "Crianza",
  PRODUCTION_BATCH: "Destilación",
  BOTTLING_BATCH: "Embotellado",
  LAB_ANALYSIS: "Análisis de laboratorio",
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
