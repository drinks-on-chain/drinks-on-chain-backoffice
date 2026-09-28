"use client";

import { useEffect, useReducer, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AuthLayout, Button, Field, Input, TextLink } from "@drinks-on-chain/ui";
import { MfaSteps, mfaStepTitle } from "@/components/auth/mfa-steps";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useIsAuthenticated, useLogin, useSessionEndReason, useStartSession } from "@/lib/auth/hooks";
import { initialLoginFlow, loginFlowReducer, type LoginFlowState, type MfaNotice } from "@/lib/auth/login-flow";
import type { LoginResponse } from "@/lib/auth/schemas";
import { es } from "@/lib/i18n/es";

const NOTICES: Record<MfaNotice, string> = { expired: es.mfa.expired, "too-many-attempts": es.mfa.tooMany };

/** Acceso: correo y contraseña → segundo factor (verificar o inscribir) → back office. */
export function LoginFlow() {
  const router = useRouter();
  const authenticated = useIsAuthenticated();
  const startSession = useStartSession();
  const [state, dispatch] = useReducer(loginFlowReducer, initialLoginFlow);

  // Con una sesión recuperada al arrancar (cookie de renovación) no hace falta entrar; durante el
  // segundo factor todavía no hay sesión, así que no interfiere.
  useEffect(() => {
    if (authenticated && state.step === "credentials") router.replace("/");
  }, [authenticated, state.step, router]);

  useEffect(() => {
    if (state.step !== "done") return;
    startSession(state.session);
    router.replace("/");
  }, [state, startSession, router]);

  return (
    <AuthLayout variant="centered" eyebrow={es.auth.eyebrow} title={mfaStepTitle(state) ?? es.auth.title}>
      {state.step === "credentials" ? (
        <CredentialsForm state={state} onResponse={(response) => dispatch({ type: "response", response })} />
      ) : (
        <MfaSteps state={state} dispatch={dispatch} />
      )}
    </AuthLayout>
  );
}

type CredentialsProps = {
  state: Extract<LoginFlowState, { step: "credentials" }>;
  onResponse: (response: LoginResponse) => void;
};

function CredentialsForm({ state, onResponse }: CredentialsProps) {
  const login = useLogin();
  // Sesión cerrada sin querer (revocada o caducada), también al recargar: se avisa hasta que se intente entrar.
  const endReason = useSessionEndReason();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: onResponse });
  }

  const error = login.error;
  // 422 del backend: cada mensaje junto a su campo (details[].field).
  const { fieldErrors, formErrors } = fieldErrorsFrom(error, ["email", "password"]);
  const message =
    error instanceof ApiError && error.isUnauthorized
      ? es.auth.invalid
      : error instanceof ApiError && error.isValidation
        ? formErrors.join(" ")
        : error
          ? errorMessage(error)
          : state.notice
            ? NOTICES[state.notice]
            : endReason && login.isIdle
              ? endReason === "revoked"
                ? es.auth.revoked
                : es.auth.expired
              : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {message && <Alert tone={error ? "danger" : "warning"}>{message}</Alert>}
      <Field label={es.auth.email} required error={fieldErrors.email}>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={es.auth.password} required error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={login.isPending}>
        {login.isPending ? es.auth.submitting : es.auth.submit}
      </Button>
      <p className="text-center text-sm">
        <TextLink asChild>
          <Link href="/recuperar-contrasena">{es.auth.forgot}</Link>
        </TextLink>
      </p>
    </form>
  );
}
