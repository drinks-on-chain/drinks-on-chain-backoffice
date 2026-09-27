"use client";

import type { ReactNode } from "react";
import { WINERY_CATEGORIES } from "@drinks-on-chain/mocks";
import { Card, Field, Input, Select, Textarea } from "@drinks-on-chain/ui";
import { SectionHeader } from "@/components/section-header";
import type { FormErrors, WineryForm } from "@/lib/platform/forms";
import { categoryLabel } from "@/lib/platform/labels";

type Props<F extends WineryForm> = {
  form: F;
  errors: FormErrors<keyof F & string>;
  onChange: (field: keyof F & string, value: string) => void;
};

/** Sección de formulario con encabezado real (h2) y rejilla de campos. */
export function FormBlock({
  id,
  title,
  description,
  children,
  bare = false,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) {
  const body = (
    <section aria-labelledby={id} className="grid gap-4">
      <SectionHeader id={id} title={title} description={description} />
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
  return bare ? body : <Card className="p-5">{body}</Card>;
}

/**
 * Campos del perfil de una bodega (alta directa y edición desde el back office): datos legales,
 * contacto y perfil público. El NIT y la razón social solo los edita la plataforma.
 */
export function WineryProfileFields<F extends WineryForm>({
  form,
  errors,
  onChange,
  bare = false,
}: Props<F> & { bare?: boolean }) {
  const input = (field: keyof WineryForm & keyof F & string) => ({
    value: form[field] as string,
    onChange: (e: { target: { value: string } }) => onChange(field, e.target.value),
  });
  const err = (field: keyof WineryForm & keyof F & string) => errors[field];

  return (
    <>
      <FormBlock id="datos-legales" title="Datos legales" description="Como figuran en el NIT." bare={bare}>
        <Field label="Razón social" required error={err("legalName")} className="md:col-span-2">
          <Input {...input("legalName")} maxLength={200} autoComplete="organization" />
        </Field>
        <Field label="Nombre comercial" required error={err("tradeName")} help="El que ve el público.">
          <Input {...input("tradeName")} maxLength={120} />
        </Field>
        <Field label="NIT" required error={err("taxId")} help="Solo dígitos (5 a 15).">
          <Input {...input("taxId")} inputMode="numeric" maxLength={15} />
        </Field>
        <Field label="Categoría" required error={err("category")}>
          <Select
            value={form.category}
            onValueChange={(v) => onChange("category", v)}
            options={WINERY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
          />
        </Field>
        <Field
          label="Región"
          required
          error={err("region")}
          help="Valle y municipio, p. ej. «Valle de Cinti · Camargo»."
        >
          <Input {...input("region")} maxLength={120} />
        </Field>
        <Field label="Dirección" error={err("address")} className="md:col-span-2">
          <Input {...input("address")} maxLength={300} autoComplete="street-address" />
        </Field>
        <Field label="Registro sanitario SENASAG" error={err("senasagRegistration")}>
          <Input {...input("senasagRegistration")} maxLength={60} />
        </Field>
      </FormBlock>

      <FormBlock id="contacto" title="Contacto y perfil público" bare={bare}>
        <Field label="Correo de contacto" required error={err("contactEmail")}>
          <Input type="email" {...input("contactEmail")} autoComplete="off" />
        </Field>
        <Field label="Teléfono de contacto" error={err("contactPhone")}>
          <Input type="tel" {...input("contactPhone")} maxLength={30} autoComplete="off" />
        </Field>
        <Field label="Sitio web" error={err("website")} help="Dirección completa (https://…).">
          <Input type="url" {...input("website")} autoComplete="off" />
        </Field>
        <Field label="Logo (URL)" error={err("logoUrl")}>
          <Input type="url" {...input("logoUrl")} maxLength={500} autoComplete="off" />
        </Field>
        <Field
          label="Historia pública"
          error={err("publicStory")}
          className="md:col-span-2"
          help="Se muestra en el perfil público de la bodega."
        >
          <Textarea rows={4} maxLength={4000} {...input("publicStory")} />
        </Field>
      </FormBlock>
    </>
  );
}
