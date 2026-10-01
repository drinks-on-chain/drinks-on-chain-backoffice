import { isMfaChallenge, type LoginResponse, type MfaEnrollConfirmResponse, type SessionResponse } from "./schemas";
import { ApiError } from "@/lib/api/errors";

// Flujo de acceso con segundo factor (contrato de la Ola 1 §1), como máquina de estados pura:
//
//   credenciales ──login──▶ sesión (sin plataforma)                       → dentro
//                      └──▶ reto { enrolled: true }  → verificar (TOTP o código de recuperación) → dentro
//                      └──▶ reto { enrolled: false } → inscribir (QR + secreto) → confirmar
//                                                    → códigos de recuperación (una vez) → aceptar → dentro
//
// El reto (`mfaToken`) dura 5 min y es de un solo uso: si caduca o hay demasiados fallos se
// vuelve a las credenciales con un aviso. Lo usan el login y la aceptación de invitaciones.

export type MfaNotice = "expired" | "too-many-attempts";

export type LoginFlowState =
  | { step: "credentials"; notice: MfaNotice | null }
  | { step: "verify"; mfaToken: string }
  | { step: "enroll"; mfaToken: string }
  | { step: "recovery-codes"; codes: string[]; session: SessionResponse }
  | { step: "done"; session: SessionResponse };

export type LoginFlowEvent =
  /** Respuesta del login o de aceptar una invitación. */
  | { type: "response"; response: LoginResponse }
  /** Verificación correcta del TOTP o de un código de recuperación. */
  | { type: "verified"; session: SessionResponse }
  /** Inscripción confirmada: hay que enseñar los códigos de recuperación. */
  | { type: "enrolled"; response: MfaEnrollConfirmResponse }
  /** La persona confirmó que guardó los códigos. */
  | { type: "acknowledged" }
  /** Error del segundo factor (reto caducado, demasiados intentos…). */
  | { type: "mfa-error"; error: unknown }
  | { type: "restart" };

export const initialLoginFlow: LoginFlowState = { step: "credentials", notice: null };

/** Quita `recoveryCodes` de la respuesta de la inscripción: el resto es la forma del login. */
function sessionOf(response: MfaEnrollConfirmResponse): SessionResponse {
  const { recoveryCodes: _codes, ...session } = response;
  void _codes;
  return session;
}

/** ¿El error del segundo factor obliga a empezar de nuevo? (y con qué aviso). */
export function mfaRestartNotice(error: unknown): MfaNotice | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "AUTH_MFA_TOKEN_INVALID") return "expired";
  if (error.status === 429 || error.code === "AUTH_TOO_MANY_ATTEMPTS") return "too-many-attempts";
  return null;
}

export function loginFlowReducer(state: LoginFlowState, event: LoginFlowEvent): LoginFlowState {
  switch (event.type) {
    case "response":
      if (isMfaChallenge(event.response)) {
        const { enrolled, mfaToken } = event.response.mfa;
        return enrolled ? { step: "verify", mfaToken } : { step: "enroll", mfaToken };
      }
      return { step: "done", session: event.response };
    case "verified":
      return state.step === "verify" ? { step: "done", session: event.session } : state;
    case "enrolled":
      return state.step === "enroll"
        ? { step: "recovery-codes", codes: event.response.recoveryCodes, session: sessionOf(event.response) }
        : state;
    case "acknowledged":
      return state.step === "recovery-codes" ? { step: "done", session: state.session } : state;
    case "mfa-error": {
      const notice = mfaRestartNotice(event.error);
      return notice && (state.step === "verify" || state.step === "enroll") ? { step: "credentials", notice } : state;
    }
    case "restart":
      return initialLoginFlow;
  }
}

/** Código de recuperación `XXXX-XXXX` (se aceptan minúsculas y sin guion al teclearlo). */
export function normalizeRecoveryCode(input: string): string {
  const compact = input.replace(/[\s-]/g, "").toUpperCase();
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}
