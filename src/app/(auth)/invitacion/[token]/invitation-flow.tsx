"use client";

import { useEffect, useReducer, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InvitationPreview, LoginResponse } from "@drinks-on-chain/mocks";
import {
  Alert,
  AuthLayout,
  Button,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  SkeletonText,
  Spinner,
  toast,
} from "@drinks-on-chain/ui";
import { MfaSteps, mfaStepTitle } from "@/components/auth/mfa-steps";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { applySession, login } from "@/lib/auth/api";
import {
  useAcceptInvitation,
  useInvitation,
  useIsAuthenticated,
  useLogout,
  useMe,
  useStartSession,
} from "@/lib/auth/hooks";
import { initialLoginFlow, loginFlowReducer } from "@/lib/auth/login-flow";
import { fmtDateTime } from "@/lib/format";
import { es } from "@/lib/i18n/es";
import { links } from "@/lib/links";
import { roleLabel } from "@/lib/platform/labels";

/**
 * Aceptar la invitación de un usuario interno: cuenta nueva (nombre y contraseña) o existente
 * (entrar con su contraseña). Al aceptar, el personal de plataforma pasa por el segundo factor
 * (inscribirlo si es nuevo) y entra al back office.
 */
export function InvitationFlow({ token }: { token: string }) {
  const router = useRouter();
  const invitation = useInvitation(token);
  const startSession = useStartSession();
  const [state, dispatch] = useReducer(loginFlowReducer, initialLoginFlow);

  useEffect(() => {
    if (state.step !== "done") return;
    startSession(state.session);
    toast({ title: es.invitation.done, tone: "success" });
    router.replace("/");
  }, [state, startSession, router]);

  const title = mfaStepTitle(state) ?? es.invitation.title;

  let content;
  if (state.step !== "credentials") {
    content = <MfaSteps state={state} dispatch={dispatch} />;
  } else if (invitation.isPending) {
    content = <SkeletonText lines={4} />;
  } else if (invitation.isError) {
    const notFound = invitation.error instanceof ApiError && invitation.error.isNotFound;
    content = notFound ? (
      <div className="grid gap-4">
        <Alert tone="danger">{es.invitation.notFound}</Alert>
        <LoginLink />
      </div>
    ) : (
      <ErrorState
        bare
        description={errorMessage(invitation.error)}
        onRetry={() => invitation.refetch()}
        retrying={invitation.isFetching}
      />
    );
  } else {
    content = (
      <InvitationBody
        token={token}
        invitation={invitation.data}
        notice={state.notice}
        onResponse={(response) => dispatch({ type: "response", response })}
      />
    );
  }

  return (
    <AuthLayout variant="centered" eyebrow={es.auth.eyebrow} title={title}>
      {content}
    </AuthLayout>
  );
}

function LoginLink() {
  return (
    <Button asChild variant="secondary">
      <Link href="/login">{es.recovery.backToLogin}</Link>
    </Button>
  );
}

type Respond = (response: LoginResponse) => void;

function InvitationBody({
  token,
  invitation,
  notice,
  onResponse,
}: {
  token: string;
  invitation: InvitationPreview;
  notice: "expired" | "too-many-attempts" | null;
  onResponse: Respond;
}) {
  const authenticated = useIsAuthenticated();
  const me = useMe(authenticated === true);

  if (invitation.status !== "PENDING") {
    const message =
      invitation.status === "ACCEPTED"
        ? es.invitation.accepted
        : invitation.status === "EXPIRED"
          ? es.invitation.expired
          : es.invitation.revoked;
    return (
      <div className="grid gap-4">
        <Alert tone={invitation.status === "ACCEPTED" ? "info" : "warning"}>{message}</Alert>
        <LoginLink />
      </div>
    );
  }

  if (invitation.organizationType !== "PLATFORM") {
    const erp = links.erpInvitation(token);
    return (
      <div className="grid gap-4">
        <Alert tone="info">{es.invitation.forWinery}</Alert>
        {erp && (
          <Button asChild>
            <a href={erp}>{es.invitation.openInErp}</a>
          </Button>
        )}
      </div>
    );
  }

  if (authenticated === null || (authenticated && me.isPending)) {
    return (
      <div className="grid place-items-center py-6" aria-busy="true">
        <Spinner label={es.common.loading} />
      </div>
    );
  }

  const sameEmail = me.data?.user.email.toLowerCase() === invitation.email.toLowerCase();
  let action;
  if (authenticated && me.data && !sameEmail) {
    action = <OtherSession current={me.data.user.email} />;
  } else if (authenticated && sameEmail) {
    action = <AcceptWithSession token={token} onResponse={onResponse} />;
  } else if (invitation.accountExists) {
    action = <LoginAndAccept token={token} email={invitation.email} onResponse={onResponse} />;
  } else {
    action = <NewAccountForm token={token} onResponse={onResponse} />;
  }

  return (
    <div className="grid gap-5">
      <p className="text-fg-muted">{es.invitation.body(invitation.invitedByName, roleLabel(invitation.role))}</p>
      <KeyValueList
        items={[
          { term: es.invitation.email, value: invitation.email },
          { term: "Rol", value: roleLabel(invitation.role) },
          { term: es.invitation.expires, value: fmtDateTime(invitation.expiresAt) },
        ]}
      />
      {notice && <Alert tone="warning">{notice === "expired" ? es.mfa.expired : es.mfa.tooMany}</Alert>}
      {action}
    </div>
  );
}

function OtherSession({ current }: { current: string }) {
  const logout = useLogout();
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <Alert tone="warning">{es.invitation.otherSession(current)}</Alert>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await logout();
          } finally {
            setBusy(false);
          }
        }}
      >
        {es.invitation.logoutAndContinue}
      </Button>
    </div>
  );
}

function AcceptWithSession({ token, onResponse }: { token: string; onResponse: Respond }) {
  const accept = useAcceptInvitation(token);
  return (
    <div className="grid gap-3">
      {accept.error && <Alert tone="danger">{errorMessage(accept.error)}</Alert>}
      <Button
        size="lg"
        loading={accept.isPending}
        onClick={() => accept.mutate({ body: {}, withSession: true }, { onSuccess: onResponse })}
      >
        {es.invitation.accept}
      </Button>
    </div>
  );
}

/** Cuenta existente sin sesión: entrar con la contraseña y aceptar con esa sesión. */
function LoginAndAccept({ token, email, onResponse }: { token: string; email: string; onResponse: Respond }) {
  const accept = useAcceptInvitation(token);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login({ email, password });
      // Con sesión (aún sin la plataforma) se acepta; si ya pide el segundo factor, se sigue con él.
      if ("mfa" in res) {
        onResponse(res);
        return;
      }
      applySession(res);
      onResponse(await accept.mutateAsync({ body: {}, withSession: true }));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  const { fieldErrors } = fieldErrorsFrom(error, ["password"]);
  const message =
    error instanceof ApiError && error.isUnauthorized
      ? es.auth.invalid
      : error && !fieldErrors.password
        ? errorMessage(error)
        : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <p className="text-sm text-fg-muted">{es.invitation.existingAccount}</p>
      {message && <Alert tone="danger">{message}</Alert>}
      <Field label={es.auth.email}>
        <Input type="email" autoComplete="username" value={email} readOnly />
      </Field>
      <Field label={es.auth.password} required error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        {es.invitation.loginAndAccept}
      </Button>
    </form>
  );
}

function NewAccountForm({ token, onResponse }: { token: string; onResponse: Respond }) {
  const accept = useAcceptInvitation(token);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const { fieldErrors, formErrors } = fieldErrorsFrom(accept.error, ["fullName", "password"]);
  const other =
    accept.error && !fieldErrors.fullName && !fieldErrors.password && formErrors.length === 0
      ? errorMessage(accept.error)
      : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    accept.mutate({ body: { fullName, password }, withSession: false }, { onSuccess: onResponse });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {(other || formErrors.length > 0) && <Alert tone="danger">{other ?? formErrors.join(" ")}</Alert>}
      <Field label={es.invitation.fullName} required error={fieldErrors.fullName}>
        <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label={es.auth.password} help={es.recovery.passwordHelp} required error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label={es.recovery.confirmPassword} required error={mismatch ? es.recovery.mismatch : undefined}>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={accept.isPending}>
        {es.invitation.createAccount}
      </Button>
    </form>
  );
}
