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
  APPLICATION_SUBMITTED: "Solicitud recibida",
  APPLICATION_VERIFIED: "Solicitud verificada",
  APPLICATION_TAKEN: "Solicitud tomada",
  APPLICATION_NOTE_ADDED: "Nota en una solicitud",
  APPLICATION_MEETING_SCHEDULED: "Reunión agendada",
  APPLICATION_MEETING_DONE: "Reunión hecha",
  APPLICATION_APPROVED: "Solicitud aprobada",
  APPLICATION_REJECTED: "Solicitud rechazada",
  WINERY_CREATED: "Bodega dada de alta",
  WINERY_APPROVED: "Bodega aprobada",
  WINERY_ACTIVATED: "Bodega activada",
  WINERY_UPDATED: "Bodega editada",
  WINERY_SUSPENDED: "Bodega suspendida",
  WINERY_REACTIVATED: "Bodega reactivada",
  WINERY_REVOKED: "Bodega revocada",
  WINERY_OWNERSHIP_TRANSFERRED: "Titularidad transferida",
  SETTING_CHANGED: "Ajuste cambiado",
  SETTING_OVERRIDE_CHANGED: "Ajuste por bodega cambiado",
  SETTING_OVERRIDE_RESET: "Ajuste por bodega restablecido",
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
