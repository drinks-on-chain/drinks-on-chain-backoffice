import type { Metadata } from "next";
import { AuthLayout } from "@drinks-on-chain/ui";
import { es } from "@/lib/i18n/es";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar la contraseña" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      variant="centered"
      eyebrow={es.auth.eyebrow}
      title={es.recovery.forgotTitle}
      description={es.recovery.forgotBody}
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
