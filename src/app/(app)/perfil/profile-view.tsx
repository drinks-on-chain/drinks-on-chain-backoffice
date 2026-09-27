"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  Select,
  SkeletonText,
  toast,
} from "@drinks-on-chain/ui";
import type { MeResponse } from "@drinks-on-chain/mocks";
import { PageHeader } from "@/components/page-header";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useChangePassword, useLogoutAll, useMe, useUpdateMe } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import { es } from "@/lib/i18n/es";
import { roleLabel } from "@/lib/platform/labels";

const LOCALES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

/** 4A · Perfil propio: nombre, idioma, contraseña y sesiones (contrato de la Ola 1 §1). */
export function ProfileView() {
  const me = useMe();
  return (
    <div className="grid gap-6">
      <PageHeader title="Mi perfil" description="Tus datos, tu contraseña y tus sesiones abiertas." />
      {me.isPending ? (
        <Card className="max-w-2xl p-6">
          <SkeletonText lines={4} />
        </Card>
      ) : me.isError ? (
        <Card className="max-w-2xl p-6">
          <ErrorState bare description={errorMessage(me.error)} onRetry={() => me.refetch()} retrying={me.isFetching} />
        </Card>
      ) : (
        <div className="grid max-w-2xl gap-6">
          <ProfileForm key={`${me.data.user.fullName}:${me.data.user.preferredLocale}`} me={me.data} />
          <PasswordForm />
          <Sessions />
        </div>
      )}
    </div>
  );
}

function ProfileForm({ me }: { me: MeResponse }) {
  const update = useUpdateMe();
  const [fullName, setFullName] = useState(me.user.fullName);
  const [locale, setLocale] = useState(me.user.preferredLocale || "es");
  const active = activeMembership(me);
  const { fieldErrors, formErrors } = fieldErrorsFrom(update.error, ["fullName", "preferredLocale"]);
  const other =
    update.error && Object.keys(fieldErrors).length === 0 && formErrors.length === 0 ? errorMessage(update.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { fullName: fullName.trim(), preferredLocale: locale },
      { onSuccess: () => toast({ title: es.common.saved, tone: "success" }) },
    );
  }

  return (
    <Card className="p-6">
      <CardHeader title="Datos personales" />
      <KeyValueList
        className="mt-4"
        items={[
          { term: "Correo", value: me.user.email },
          { term: "Rol", value: `${roleLabel(active?.role)} · ${active?.organizationName ?? "—"}` },
        ]}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-4" noValidate>
        {(other || formErrors.length > 0) && <Alert tone="danger">{other ?? formErrors.join(" ")}</Alert>}
        <Field label="Nombre completo" required error={fieldErrors.fullName}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </Field>
        <Field
          label="Idioma de los correos"
          help="El back office está en español; el idioma se usa en los correos que te enviamos."
          error={fieldErrors.preferredLocale}
        >
          <Select value={locale} onValueChange={setLocale} options={LOCALES} />
        </Field>
        <div>
          <Button type="submit" loading={update.isPending}>
            {es.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const { fieldErrors, formErrors } = fieldErrorsFrom(change.error, ["currentPassword", "newPassword"]);
  const other =
    change.error && Object.keys(fieldErrors).length === 0 && formErrors.length === 0 ? errorMessage(change.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrent("");
          setNew("");
          setConfirm("");
          toast({ title: "Contraseña cambiada. Cerramos tus otras sesiones.", tone: "success" });
        },
      },
    );
  }

  return (
    <Card className="p-6">
      <CardHeader title="Contraseña" description="Al cambiarla se cierran tus demás sesiones." />
      <form onSubmit={onSubmit} className="mt-4 grid gap-4" noValidate>
        {(other || formErrors.length > 0) && <Alert tone="danger">{other ?? formErrors.join(" ")}</Alert>}
        <Field label="Contraseña actual" required error={fieldErrors.currentPassword}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Contraseña nueva" help={es.recovery.passwordHelp} required error={fieldErrors.newPassword}>
          <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </Field>
        <Field label={es.recovery.confirmPassword} required error={mismatch ? es.recovery.mismatch : undefined}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div>
          <Button type="submit" variant="secondary" loading={change.isPending}>
            Cambiar la contraseña
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Sessions() {
  const router = useRouter();
  const logoutAll = useLogoutAll();
  return (
    <Card className="p-6" id="sesiones">
      <CardHeader
        title="Sesiones"
        description="Si usaste el back office en otro equipo o crees que alguien más entró, cierra todas tus sesiones: también esta."
      />
      <div className="mt-4">
        <ConfirmDialog
          trigger={<Button variant="secondary">{es.auth.logoutAll}</Button>}
          title="¿Cerrar todas tus sesiones?"
          description="Se cierran en todos los equipos y navegadores, incluido este. Tendrás que volver a entrar con tu segundo factor."
          confirmLabel={es.auth.logoutAll}
          destructive
          onConfirm={async () => {
            await logoutAll.mutateAsync();
            toast({ title: "Cerraste todas tus sesiones.", tone: "info" });
            router.replace("/login");
          }}
        />
      </div>
    </Card>
  );
}
