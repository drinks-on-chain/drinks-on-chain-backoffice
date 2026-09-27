"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input, TextLink } from "@drinks-on-chain/ui";
import { Captcha } from "@/components/auth/captcha";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useForgotPassword } from "@/lib/auth/hooks";
import { es } from "@/lib/i18n/es";

/** `POST /v1/auth/forgot-password`: siempre 202; el enlace llega al buzón (Mailpit o el simulado). */
export function ForgotPasswordForm() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  const { fieldErrors, formErrors } = fieldErrorsFrom(forgot.error, ["email", "captchaToken"]);
  const other = forgot.error && !fieldErrors.email && formErrors.length === 0 ? errorMessage(forgot.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    forgot.mutate({ email, captchaToken });
  }

  if (forgot.isSuccess) {
    return (
      <div className="grid gap-4">
        <Alert tone="success" role="status">
          {es.recovery.forgotSent}
        </Alert>
        <Button asChild variant="secondary">
          <Link href="/login">{es.recovery.backToLogin}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {(other || formErrors.length > 0) && <Alert tone="danger">{other ?? formErrors.join(" ")}</Alert>}
      <Field label={es.auth.email} required error={fieldErrors.email}>
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Captcha onToken={setCaptchaToken} />
      {fieldErrors.captchaToken && <Alert tone="danger">{fieldErrors.captchaToken}</Alert>}
      <Button type="submit" size="lg" loading={forgot.isPending} disabled={!captchaToken}>
        {es.recovery.forgotSubmit}
      </Button>
      <p className="text-center text-sm">
        <TextLink asChild>
          <Link href="/login">{es.recovery.backToLogin}</Link>
        </TextLink>
      </p>
    </form>
  );
}
