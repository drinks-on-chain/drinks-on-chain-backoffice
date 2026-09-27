"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Breadcrumbs, Button, Card, Checkbox, Field, Input, Textarea, toast } from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import {
  emptyWineryForm,
  validateNewWinery,
  wineryBody,
  type FormErrors,
  type NewWineryForm as Form,
} from "@/lib/platform/forms";
import { can } from "@/lib/platform/permissions";
import { useCreateWinery } from "@/lib/platform/wineries";
import { FormBlock, WineryProfileFields } from "../winery-fields";

const FIELDS = Object.keys(emptyWineryForm) as (keyof Form)[];

/** Conflictos sin `details` que corresponden a un campo. */
const CONFLICT_FIELD: Record<string, keyof Form> = {
  ORG_TAX_ID_TAKEN: "taxId",
  ORG_ALREADY_MEMBER: "ownerEmail",
  INVITATION_ALREADY_PENDING: "ownerEmail",
};

/** Enfoca el primer campo con error (tras pintar los mensajes). */
function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

/**
 * 4B · Alta directa de bodega (camino B de docs-back/07 §1.1): datos completos y dueño. Se crea
 * la bodega «Invitada» y el dueño recibe la invitación; se activa cuando la acepta.
 */
export function NewWineryForm() {
  const me = useMe();
  const router = useRouter();
  const create = useCreateWinery();
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<Form>(emptyWineryForm);
  const [ownerIsContact, setOwnerIsContact] = useState(false);
  const [errors, setErrors] = useState<FormErrors<keyof Form>>({});

  const server = fieldErrorsFrom(create.error, FIELDS);
  const conflict =
    create.error instanceof ApiError && CONFLICT_FIELD[create.error.code]
      ? { [CONFLICT_FIELD[create.error.code]!]: create.error.message }
      : {};
  const allErrors: FormErrors<keyof Form> = { ...server.fieldErrors, ...conflict, ...errors };
  const general =
    create.error && Object.keys(server.fieldErrors).length === 0 && Object.keys(conflict).length === 0
      ? errorMessage(create.error)
      : server.formErrors.length
        ? server.formErrors.join(" ")
        : null;

  function change(field: keyof Form, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (ownerIsContact && field === "contactEmail") next.ownerEmail = value;
      return next;
    });
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.reset();
    const problems = validateNewWinery(form);
    setErrors(problems);
    if (Object.keys(problems).length) {
      focusFirstInvalid(formRef.current);
      return;
    }
    create.mutate(
      {
        ...wineryBody(form),
        ownerFullName: form.ownerFullName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        reason: form.reason.trim() || null,
      },
      {
        onSuccess: ({ winery, invitation }) => {
          toast({
            title: `${winery.tradeName} dada de alta. Invitación enviada a ${invitation.email}.`,
            tone: "success",
          });
          router.push(`/bodegas/${winery.id}?pestana=equipo`);
        },
        onError: () => focusFirstInvalid(formRef.current),
      },
    );
  }

  if (me.data && !can(me.data, "wineries.create")) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Nueva bodega" />
        <Alert tone="info">Solo operaciones y administración dan de alta bodegas.</Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Breadcrumbs
          linkComponent={Link}
          label="Ruta"
          items={[{ label: "Bodegas", href: "/bodegas" }, { label: "Nueva bodega" }]}
        />
        <PageHeader
          eyebrow="Alta directa"
          title="Nueva bodega"
          description="Para bodegas con las que el equipo ya habló. Queda «Invitada» hasta que su dueño acepte la invitación; entonces se activa y recibe su prefijo de lote."
        />
      </div>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="grid max-w-4xl gap-5">
        {general && <Alert tone="danger">{general}</Alert>}
        <WineryProfileFields form={form} errors={allErrors} onChange={change} />

        <FormBlock
          id="dueno"
          title="Dueño"
          description="Recibe la invitación por correo (caduca en 72 horas) y crea su contraseña al aceptarla en el ERP."
        >
          <Field label="Nombre del dueño" required error={allErrors.ownerFullName}>
            <Input
              value={form.ownerFullName}
              onChange={(e) => change("ownerFullName", e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
          <Field label="Correo del dueño" required error={allErrors.ownerEmail}>
            <Input
              type="email"
              value={form.ownerEmail}
              disabled={ownerIsContact}
              onChange={(e) => change("ownerEmail", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Checkbox
            className="md:col-span-2"
            label="El dueño usa el correo de contacto"
            checked={ownerIsContact}
            onCheckedChange={(checked) => {
              setOwnerIsContact(checked === true);
              if (checked === true) setForm((f) => ({ ...f, ownerEmail: f.contactEmail }));
            }}
          />
        </FormBlock>

        <Card className="grid gap-4 p-5">
          <Field label="Motivo" help="Opcional. Queda en la bitácora con el alta." error={allErrors.reason}>
            <Textarea rows={2} maxLength={500} value={form.reason} onChange={(e) => change("reason", e.target.value)} />
          </Field>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="secondary">
            <Link href="/bodegas">Cancelar</Link>
          </Button>
          <Button type="submit" loading={create.isPending}>
            Dar de alta e invitar al dueño
          </Button>
        </div>
      </form>
    </div>
  );
}
