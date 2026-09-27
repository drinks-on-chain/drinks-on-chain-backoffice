"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, toast } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useResetPassword } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

/** `POST /v1/auth/reset-password` con el token del enlace (60 min, un solo uso). */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const invalidToken = reset.error instanceof ApiError && reset.error.code === "AUTH_RESET_TOKEN_INVALID";
  const { fieldErrors, formErrors } = fieldErrorsFrom(reset.error, ["password", "token"]);
  const other =
    reset.error && !invalidToken && !fieldErrors.password && formErrors.length === 0 ? errorMessage(reset.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    reset.mutate(
      { token, password },
      {
        onSuccess: () => {
          toast({ title: es.recovery.resetDone, tone: "success" });
          router.replace("/login");
        },
      },
    );
  }

  if (!token || invalidToken) {
    return (
      <div className="grid gap-4">
        <Alert tone="danger">{token ? es.recovery.resetInvalid : es.recovery.missingToken}</Alert>
        <Button asChild variant="secondary">
          <Link href="/recuperar-contrasena">{es.recovery.resetRequestNew}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {(other || formErrors.length > 0) && <Alert tone="danger">{other ?? formErrors.join(" ")}</Alert>}
      <Field label={es.recovery.newPassword} help={es.recovery.passwordHelp} required error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label={es.recovery.confirmPassword} required error={mismatch ? es.recovery.mismatch : undefined}>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" loading={reset.isPending}>
        {es.recovery.resetSubmit}
      </Button>
    </form>
  );
}
