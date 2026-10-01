import { describe, expect, it } from "vitest";
import type { MfaEnrollConfirmResponse, SessionResponse } from "./schemas";
import { ApiError } from "@/lib/api/errors";
import {
  initialLoginFlow,
  loginFlowReducer,
  mfaRestartNotice,
  normalizeRecoveryCode,
  type LoginFlowState,
} from "./login-flow";

const session = {
  user: { id: "u1", email: "gestor@drinksonchain.test", fullName: "Ana Gutiérrez" },
  memberships: [],
  activeOrganizationId: "platform",
  tokens: { accessToken: "a", tokenType: "Bearer", expiresIn: 900 },
} as unknown as SessionResponse;

const challenge = (enrolled: boolean) => ({ mfa: { required: true as const, enrolled, mfaToken: "mfa_1" } });
const codes = Array.from({ length: 10 }, (_, i) => `AAAA-000${i}`);

describe("flujo de acceso con segundo factor", () => {
  it("sin reto (persona sin membresía de plataforma) entra directamente", () => {
    expect(loginFlowReducer(initialLoginFlow, { type: "response", response: session })).toEqual({
      step: "done",
      session,
    });
  });

  it("con TOTP inscrito pide el código y entra al verificarlo", () => {
    const verify = loginFlowReducer(initialLoginFlow, { type: "response", response: challenge(true) });
    expect(verify).toEqual({ step: "verify", mfaToken: "mfa_1" });
    expect(loginFlowReducer(verify, { type: "verified", session })).toEqual({ step: "done", session });
  });

  it("sin inscribir: inscribe, muestra los 10 códigos una vez y solo entra tras aceptarlos", () => {
    const enroll = loginFlowReducer(initialLoginFlow, { type: "response", response: challenge(false) });
    expect(enroll).toEqual({ step: "enroll", mfaToken: "mfa_1" });

    const confirm = { ...session, recoveryCodes: codes } as MfaEnrollConfirmResponse;
    const shown = loginFlowReducer(enroll, { type: "enrolled", response: confirm });
    expect(shown.step).toBe("recovery-codes");
    if (shown.step !== "recovery-codes") throw new Error("paso inesperado");
    expect(shown.codes).toHaveLength(10);
    // La sesión guardada no arrastra los códigos.
    expect(shown.session).not.toHaveProperty("recoveryCodes");

    expect(loginFlowReducer(shown, { type: "acknowledged" })).toEqual({ step: "done", session: shown.session });
  });

  it("ignora eventos fuera de su paso", () => {
    const creds: LoginFlowState = initialLoginFlow;
    expect(loginFlowReducer(creds, { type: "verified", session })).toBe(creds);
    expect(loginFlowReducer(creds, { type: "acknowledged" })).toBe(creds);
    const verify: LoginFlowState = { step: "verify", mfaToken: "t" };
    expect(loginFlowReducer(verify, { type: "enrolled", response: { ...session, recoveryCodes: codes } })).toBe(verify);
  });

  it("un reto caducado o demasiados fallos vuelven a las credenciales con aviso", () => {
    const verify: LoginFlowState = { step: "verify", mfaToken: "t" };
    const expired = new ApiError({ status: 401, code: "AUTH_MFA_TOKEN_INVALID", message: "caducó" });
    const tooMany = new ApiError({ status: 429, code: "AUTH_TOO_MANY_ATTEMPTS", message: "demasiados" });
    expect(loginFlowReducer(verify, { type: "mfa-error", error: expired })).toEqual({
      step: "credentials",
      notice: "expired",
    });
    expect(loginFlowReducer({ step: "enroll", mfaToken: "t" }, { type: "mfa-error", error: tooMany })).toEqual({
      step: "credentials",
      notice: "too-many-attempts",
    });
  });

  it("un código incorrecto no cambia de paso (se marca en el campo)", () => {
    const verify: LoginFlowState = { step: "verify", mfaToken: "t" };
    const invalid = new ApiError({ status: 401, code: "AUTH_MFA_INVALID_CODE", message: "no válido" });
    expect(mfaRestartNotice(invalid)).toBeNull();
    expect(loginFlowReducer(verify, { type: "mfa-error", error: invalid })).toBe(verify);
  });

  it("normaliza los códigos de recuperación tecleados", () => {
    expect(normalizeRecoveryCode("ab12 cd34")).toBe("AB12-CD34");
    expect(normalizeRecoveryCode("AB12-CD34")).toBe("AB12-CD34");
    expect(normalizeRecoveryCode("ab1")).toBe("AB1");
  });
});
