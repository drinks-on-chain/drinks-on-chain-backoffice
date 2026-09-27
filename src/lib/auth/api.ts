import { z } from "zod";
import {
  InvitationPreviewSchema,
  LoginResponseSchema,
  MeResponseSchema,
  MfaEnrollConfirmResponseSchema,
  MfaEnrollResponseSchema,
  SessionResponseSchema,
  UserProfileResponseSchema,
  type AcceptInvitationDto,
  type ChangePasswordDto,
  type LoginDto,
  type SessionResponse,
  type UpdateUserDto,
} from "@drinks-on-chain/mocks";
import { api, logoutSession } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/api/session";

// Sesión, segundo factor, recuperación, invitaciones y perfil (contratos de la Ola 0 §5 y de la
// Ola 1 §1–§2). Las pantallas usan los hooks de hooks.ts.

/** Guarda el acceso en memoria (la renovación llega en la cookie `doc_rt`). */
export function applySession(session: Pick<SessionResponse, "tokens">) {
  setSession(session.tokens);
}

/**
 * `POST /v1/auth/login`. El personal de plataforma recibe un reto de segundo factor
 * (`{ mfa: { required, enrolled, mfaToken } }`) sin tokens; el resto, la sesión. No se guarda
 * nada aquí: quien llama decide (el flujo de acceso la aplica al terminar).
 */
export function login(credentials: LoginDto) {
  return api("/v1/auth/login", { method: "POST", body: credentials, schema: LoginResponseSchema, auth: false });
}

/** `POST /v1/auth/mfa/verify`: código TOTP de 6 dígitos o código de recuperación → sesión. */
export function verifyMfa(body: { mfaToken: string; code: string }) {
  return api("/v1/auth/mfa/verify", { method: "POST", body, schema: SessionResponseSchema, auth: false });
}

/** `POST /v1/auth/mfa/enroll` → `{ otpauthUrl, secret }` para la app de autenticación. */
export function enrollMfa(mfaToken: string) {
  return api("/v1/auth/mfa/enroll", {
    method: "POST",
    body: { mfaToken },
    schema: MfaEnrollResponseSchema,
    auth: false,
  });
}

/** `POST /v1/auth/mfa/enroll/confirm` → sesión + 10 códigos de recuperación (se muestran una vez). */
export function confirmMfaEnrollment(body: { mfaToken: string; code: string }) {
  return api("/v1/auth/mfa/enroll/confirm", {
    method: "POST",
    body,
    schema: MfaEnrollConfirmResponseSchema,
    auth: false,
  });
}

/** `POST /v1/auth/forgot-password` → 202 siempre (no revela si el correo tiene cuenta). */
export async function forgotPassword(body: { email: string; captchaToken: string }) {
  await api("/v1/auth/forgot-password", { method: "POST", body, auth: false });
}

/** `POST /v1/auth/reset-password` → 204; revoca todas las sesiones de la persona. */
export async function resetPassword(body: { token: string; password: string }) {
  await api("/v1/auth/reset-password", { method: "POST", body, auth: false });
}

/** `POST /v1/auth/logout`: revoca la sesión en el backend y la cierra aquí. */
export function logout() {
  return logoutSession();
}

/** `POST /v1/auth/logout-all`: revoca todas las sesiones de la persona (también esta). */
export async function logoutAll() {
  try {
    await api("/v1/auth/logout-all", { method: "POST" });
  } finally {
    clearSession();
  }
}

/** `POST /v1/auth/switch-organization`: tokens nuevos de la misma sesión con otra organización activa. */
export async function switchOrganization(organizationId: string) {
  const res = await api("/v1/auth/switch-organization", {
    method: "POST",
    body: { organizationId },
    schema: SessionResponseSchema,
  });
  applySession(res);
  return res;
}

/** `GET /v1/users/me`: `{ user, memberships, activeOrganizationId }`. */
export function fetchMe(signal?: AbortSignal) {
  return api("/v1/users/me", { schema: MeResponseSchema, signal });
}

// `PATCH /v1/users/me` devuelve `{ user, memberships, activeOrganizationId }` según el contrato de
// la Ola 1 §1; los mocks 0.3.0-rc.1 aún devuelven el perfil suelto (11 bis). Se aceptan las dos.
const UpdateMeResponseSchema = z.union([MeResponseSchema, UserProfileResponseSchema]);

/** `PATCH /v1/users/me`: nombre, idioma y preferencias. */
export function updateMe(body: UpdateUserDto) {
  return api("/v1/users/me", { method: "PATCH", body, schema: UpdateMeResponseSchema });
}

/** `POST /v1/users/me/password` → 204; revoca las demás sesiones. */
export async function changePassword(body: ChangePasswordDto) {
  await api("/v1/users/me/password", { method: "POST", body });
}

/** `GET /v1/invitations/{token}` (público). */
export function fetchInvitation(token: string, signal?: AbortSignal) {
  return api(`/v1/invitations/${encodeURIComponent(token)}`, { schema: InvitationPreviewSchema, auth: false, signal });
}

/**
 * `POST /v1/invitations/{token}/accept`. Cuenta nueva: `{ fullName, password }` sin sesión;
 * cuenta existente: `{}` con la sesión de esa persona. Una invitación de plataforma responde con
 * el reto de segundo factor (forma del login del personal).
 */
export function acceptInvitation(token: string, body: AcceptInvitationDto, withSession: boolean) {
  return api(`/v1/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body,
    schema: LoginResponseSchema,
    auth: withSession,
  });
}
