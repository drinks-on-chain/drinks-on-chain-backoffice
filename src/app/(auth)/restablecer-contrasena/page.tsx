import type { Metadata } from "next";
import { AuthLayout } from "@drinks-on-chain/ui";
import { es } from "@/lib/i18n/es";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Contraseña nueva" };

// El enlace del correo lleva `?token=` (contrato de la Ola 1 §1).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/restablecer-contrasena">) {
  const { token } = await searchParams;
  return (
    <AuthLayout variant="centered" eyebrow={es.auth.eyebrow} title={es.recovery.resetTitle}>
      <ResetPasswordForm token={typeof token === "string" ? token : ""} />
    </AuthLayout>
  );
}
