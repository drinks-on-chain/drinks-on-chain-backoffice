"use client";

import { useEffect, useRef, useState, type Dispatch, type FormEvent } from "react";
import { Alert, Button, ErrorState, Field, Input, OtpInput, SecretReveal, SkeletonText } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useConfirmMfaEnrollment, useEnrollMfa, useVerifyMfa } from "@/lib/auth/hooks";
import {
  mfaRestartNotice,
  normalizeRecoveryCode,
  type LoginFlowEvent,
  type LoginFlowState,
} from "@/lib/auth/login-flow";
import { es } from "@/lib/i18n/es";

// Pasos del segundo factor (contrato de la Ola 1 §1): verificar, inscribir y mostrar los códigos
// de recuperación. Los comparten el login y la aceptación de invitaciones.

type Props = { state: LoginFlowState; dispatch: Dispatch<LoginFlowEvent> };

/** Pinta el paso de segundo factor en curso (nada en `credentials` y `done`). */
export function MfaSteps({ state, dispatch }: Props) {
  switch (state.step) {
    case "verify":
      return <VerifyStep key={state.mfaToken} mfaToken={state.mfaToken} dispatch={dispatch} />;
    case "enroll":
      return <EnrollStep key={state.mfaToken} mfaToken={state.mfaToken} dispatch={dispatch} />;
    case "recovery-codes":
      return <RecoveryCodesStep codes={state.codes} dispatch={dispatch} />;
    default:
      return null;
  }
}

/** Título del paso para el AuthLayout. */
export function mfaStepTitle(state: LoginFlowState): string | null {
  if (state.step === "verify") return es.mfa.verifyTitle;
  if (state.step === "enroll") return es.mfa.enrollTitle;
  if (state.step === "recovery-codes") return es.mfa.codesTitle;
  return null;
}

/** Error de un código: en el campo si es "no válido"; si obliga a empezar de nuevo, se avisa arriba. */
function codeError(error: unknown): { field: string | null; form: string | null } {
  if (!error) return { field: null, form: null };
  if (error instanceof ApiError && (error.code === "AUTH_MFA_INVALID_CODE" || error.isValidation)) {
    return { field: es.mfa.invalidCode, form: null };
  }
  if (mfaRestartNotice(error)) return { field: null, form: null };
  return { field: null, form: errorMessage(error) };
}

function VerifyStep({ mfaToken, dispatch }: { mfaToken: string; dispatch: Dispatch<LoginFlowEvent> }) {
  const verify = useVerifyMfa();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const { field, form } = codeError(verify.error);

  function submit(value: string) {
    if (verify.isPending) return;
    const normalized = recovery ? normalizeRecoveryCode(value) : value;
    if (!normalized) return;
    verify.mutate(
      { mfaToken, code: normalized },
      {
        onSuccess: (session) => dispatch({ type: "verified", session }),
        onError: (error) => {
          setCode("");
          dispatch({ type: "mfa-error", error });
        },
      },
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(code);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <p className="text-fg-muted">{recovery ? es.mfa.recoveryHelp : es.mfa.verifyBody}</p>
      {form && <Alert tone="danger">{form}</Alert>}
      {recovery ? (
        <Field label={es.mfa.recoveryCode} required error={field ?? undefined}>
          <Input
            key="recovery"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono tracking-wider"
            autoFocus
          />
        </Field>
      ) : (
        <Field label={es.mfa.code} required error={field ?? undefined}>
          <OtpInput
            key="totp"
            value={code}
            onValueChange={setCode}
            onComplete={submit}
            invalid={Boolean(field)}
            disabled={verify.isPending}
            autoFocus
          />
        </Field>
      )}
      <Button type="submit" size="lg" loading={verify.isPending}>
        {verify.isPending ? es.mfa.verifying : es.mfa.verify}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => {
            setRecovery((r) => !r);
            setCode("");
            verify.reset();
          }}
        >
          {recovery ? es.mfa.useTotp : es.mfa.useRecovery}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={() => dispatch({ type: "restart" })}>
          {es.mfa.restart}
        </Button>
      </div>
    </form>
  );
}

function EnrollStep({ mfaToken, dispatch }: { mfaToken: string; dispatch: Dispatch<LoginFlowEvent> }) {
  const enroll = useEnrollMfa();
  const confirm = useConfirmMfaEnrollment();
  const [code, setCode] = useState("");
  const started = useRef(false);
  const { mutate: startEnroll } = enroll;

  // Pide el secreto una sola vez por reto (el doble efecto de desarrollo no lo repite).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startEnroll(mfaToken, { onError: (error) => dispatch({ type: "mfa-error", error }) });
  }, [mfaToken, startEnroll, dispatch]);

  const { field, form } = codeError(confirm.error);

  function submit(value: string) {
    if (confirm.isPending || value.length !== 6) return;
    confirm.mutate(
      { mfaToken, code: value },
      {
        onSuccess: (response) => dispatch({ type: "enrolled", response }),
        onError: (error) => {
          setCode("");
          dispatch({ type: "mfa-error", error });
        },
      },
    );
  }

  if (enroll.isPending || enroll.isIdle) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <p className="text-fg-muted">{es.mfa.enrollLoading}</p>
        <SkeletonText lines={5} />
      </div>
    );
  }
  if (enroll.isError) {
    return (
      <ErrorState
        bare
        description={errorMessage(enroll.error)}
        onRetry={() => dispatch({ type: "restart" })}
        retryLabel={es.mfa.restart}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
      className="grid gap-5"
      noValidate
    >
      <p className="text-fg-muted">{es.mfa.enrollBody}</p>
      <SecretReveal
        secret={enroll.data.secret}
        otpauthUrl={enroll.data.otpauthUrl}
        hideAcknowledge
        // En la tarjeta estrecha del acceso, la clave agrupada cabe entera a 14 px.
        className="[&_input]:text-sm"
        labels={{ qr: "Código QR para tu app de autenticación", secret: "Clave para escribirla a mano" }}
      />
      {form && <Alert tone="danger">{form}</Alert>}
      <Field label={es.mfa.code} help={es.mfa.enrollConfirm} required error={field ?? undefined}>
        <OtpInput
          value={code}
          onValueChange={setCode}
          onComplete={submit}
          invalid={Boolean(field)}
          disabled={confirm.isPending}
        />
      </Field>
      <Button type="submit" size="lg" loading={confirm.isPending}>
        {es.mfa.enrollSubmit}
      </Button>
      <Button type="button" variant="tertiary" size="sm" onClick={() => dispatch({ type: "restart" })}>
        {es.mfa.restart}
      </Button>
    </form>
  );
}

function RecoveryCodesStep({ codes, dispatch }: { codes: string[]; dispatch: Dispatch<LoginFlowEvent> }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div className="grid gap-5">
      <p className="text-fg-muted">{es.mfa.codesBody}</p>
      <SecretReveal
        codes={codes}
        downloadFileName="drinks-on-chain-codigos-de-recuperacion.txt"
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        labels={{ acknowledge: es.mfa.codesAcknowledge, codes: "Códigos de recuperación" }}
      />
      <Button size="lg" disabled={!acknowledged} onClick={() => dispatch({ type: "acknowledged" })}>
        {es.mfa.codesContinue}
      </Button>
    </div>
  );
}
