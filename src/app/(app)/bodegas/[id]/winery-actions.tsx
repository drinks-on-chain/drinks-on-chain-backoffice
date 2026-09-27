"use client";

import { useState, type FormEvent } from "react";
import type { WineryDetail } from "@drinks-on-chain/mocks";
import { Alert, Button, Field, Input, Modal, RadioGroup, SlideOver, Textarea, toast } from "@drinks-on-chain/ui";
import { ReasonActionDialog, type ReasonActionCopy } from "@/components/reason-action-dialog";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { fmtDateTime } from "@/lib/format";
import {
  changedFields,
  reasonProblem,
  validateTransferEmail,
  validateWineryProfile,
  wineryBody,
  type FormErrors,
  type WineryForm,
} from "@/lib/platform/forms";
import { PREVIOUS_OWNER_LABELS } from "@/lib/platform/labels";
import {
  useChangeWineryStatus,
  useTransferOwnership,
  useUpdateWinery,
  type WineryStatusAction,
} from "@/lib/platform/wineries";
import { WineryProfileFields } from "../winery-fields";

export type WineryDialog = "edit" | "transfer" | WineryStatusAction;

// ---------------------------------------------------------------------------
// Suspender, reactivar, revocar
// ---------------------------------------------------------------------------

function statusCopy(w: WineryDetail, action: WineryStatusAction): ReasonActionCopy {
  switch (action) {
    case "suspend":
      return {
        title: `Suspender ${w.tradeName}`,
        description:
          "Nadie de la bodega podrá operar el ERP y sus sesiones se cierran al instante; los datos siguen visibles. El dueño recibe un correo con el motivo.",
        confirm: "Suspender",
        destructive: true,
        done: `${w.tradeName} quedó suspendida.`,
      };
    case "reactivate":
      return {
        title: `Reactivar ${w.tradeName}`,
        description: "La bodega vuelve a operar el ERP. El dueño recibe un correo con el motivo.",
        confirm: "Reactivar",
        done: `${w.tradeName} está activa de nuevo.`,
      };
    case "revoke":
      return {
        title: `Revocar ${w.tradeName}`,
        description:
          "Baja definitiva: se cierran sus sesiones, se anulan las invitaciones pendientes y no se puede deshacer. El dueño recibe un correo con el motivo.",
        confirm: "Revocar definitivamente",
        destructive: true,
        done: `${w.tradeName} quedó revocada.`,
      };
  }
}

export function StatusActionDialog({
  winery,
  action,
  onClose,
}: {
  winery: WineryDetail;
  action: WineryStatusAction;
  onClose: () => void;
}) {
  const change = useChangeWineryStatus(winery.id);
  return (
    <ReasonActionDialog
      copy={statusCopy(winery, action)}
      run={(reason) => change.mutateAsync({ action, reason })}
      onClose={onClose}
    />
  );
}

// ---------------------------------------------------------------------------
// Editar el perfil
// ---------------------------------------------------------------------------

const profileForm = (w: WineryDetail): WineryForm => ({
  legalName: w.legalName,
  tradeName: w.tradeName,
  taxId: w.taxId,
  category: w.category,
  region: w.region,
  address: w.address ?? "",
  senasagRegistration: w.senasagRegistration ?? "",
  contactEmail: w.contactEmail,
  contactPhone: w.contactPhone ?? "",
  website: w.website ?? "",
  logoUrl: w.logoUrl ?? "",
  publicStory: w.publicStory ?? "",
});

const PROFILE_FIELDS = [
  "legalName",
  "tradeName",
  "taxId",
  "category",
  "region",
  "address",
  "senasagRegistration",
  "contactEmail",
  "contactPhone",
  "website",
  "logoUrl",
  "publicStory",
  "reason",
] as const;

/** Edición del perfil desde el back office (`PATCH` con motivo): solo se envía lo que cambia. */
export function EditProfilePanel({ winery, onClose }: { winery: WineryDetail; onClose: () => void }) {
  const update = useUpdateWinery(winery.id);
  const [form, setForm] = useState<WineryForm>(() => profileForm(winery));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FormErrors<keyof WineryForm | "reason">>({});
  const [notice, setNotice] = useState<string | null>(null);

  const server = fieldErrorsFrom(update.error, PROFILE_FIELDS);
  const taxConflict =
    update.error instanceof ApiError && update.error.code === "ORG_TAX_ID_TAKEN" ? update.error.message : undefined;
  const all: FormErrors<keyof WineryForm | "reason"> = {
    ...server.fieldErrors,
    ...(taxConflict ? { taxId: taxConflict } : {}),
    ...errors,
  };
  const general =
    update.error && !taxConflict && Object.keys(server.fieldErrors).length === 0 ? errorMessage(update.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    update.reset();
    setNotice(null);
    const problems: FormErrors<keyof WineryForm | "reason"> = { ...validateWineryProfile(form) };
    const r = reasonProblem(reason);
    if (r) problems.reason = r;
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const changes = changedFields(wineryBody(form), wineryBody(profileForm(winery)));
    if (Object.keys(changes).length === 0) {
      setNotice("No hay cambios que guardar.");
      return;
    }
    update.mutate(
      { ...changes, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ title: "Perfil de la bodega guardado.", tone: "success" });
          onClose();
        },
      },
    );
  }

  return (
    <SlideOver
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Editar el perfil de ${winery.tradeName}`}
      description="Los cambios quedan en la bitácora con el antes, el después y el motivo."
      size="xl"
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {general && <Alert tone="danger">{general}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}
        <WineryProfileFields
          bare
          form={form}
          errors={all}
          onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        />
        <Field label="Motivo" required error={all.reason} help="Obligatorio: queda en la bitácora.">
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={update.isPending}>
            Guardar los cambios
          </Button>
        </div>
      </form>
    </SlideOver>
  );
}

// ---------------------------------------------------------------------------
// Transferir la titularidad
// ---------------------------------------------------------------------------

/**
 * Transferencia de titularidad (solo administración): invita al nuevo dueño; al aceptar, el
 * anterior queda bloqueado o sigue como enólogo, según se elija aquí.
 */
export function TransferOwnershipDialog({ winery, onClose }: { winery: WineryDetail; onClose: () => void }) {
  const transfer = useTransferOwnership(winery.id);
  const [email, setEmail] = useState("");
  const [keep, setKeep] = useState<"BLOCKED" | "ENOLOGIST">("BLOCKED");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ newOwnerEmail?: string; reason?: string }>({});

  const server = fieldErrorsFrom(transfer.error, ["newOwnerEmail", "reason", "keepPreviousOwnerAs"]);
  const emailConflict =
    transfer.error instanceof ApiError &&
    ["ORG_ALREADY_MEMBER", "INVITATION_ALREADY_PENDING"].includes(transfer.error.code)
      ? transfer.error.message
      : undefined;
  const general =
    transfer.error && !emailConflict && Object.keys(server.fieldErrors).length === 0
      ? errorMessage(transfer.error)
      : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    transfer.reset();
    const problems = {
      newOwnerEmail: validateTransferEmail(email, winery.owner?.email),
      reason: reasonProblem(reason),
    };
    setErrors(problems);
    if (problems.newOwnerEmail || problems.reason) return;
    transfer.mutate(
      { newOwnerEmail: email.trim(), keepPreviousOwnerAs: keep, reason: reason.trim() },
      {
        onSuccess: ({ invitation }) => {
          toast({
            title: `Invitación de titularidad enviada a ${invitation.email} (caduca el ${fmtDateTime(invitation.expiresAt)}).`,
            tone: "success",
          });
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Transferir la titularidad de ${winery.tradeName}`}
      description={`Dueño actual: ${winery.owner?.fullName ?? "—"} (${winery.owner?.email ?? "—"}). El cambio se hace cuando la nueva persona acepta la invitación.`}
      size="md"
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {general && <Alert tone="danger">{general}</Alert>}
        <Field
          label="Correo del nuevo dueño"
          required
          error={errors.newOwnerEmail ?? server.fieldErrors.newOwnerEmail ?? emailConflict}
        >
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Qué pasa con el dueño actual al aceptar" required error={server.fieldErrors.keepPreviousOwnerAs}>
          <RadioGroup
            value={keep}
            onValueChange={(v) => setKeep(v as typeof keep)}
            options={[
              {
                value: "BLOCKED",
                label: PREVIOUS_OWNER_LABELS.BLOCKED,
                description: "Pierde el acceso a la bodega (bloqueado por la plataforma).",
              },
              {
                value: "ENOLOGIST",
                label: PREVIOUS_OWNER_LABELS.ENOLOGIST,
                description: "Conserva el acceso con el rol de enología.",
              },
            ]}
          />
        </Field>
        <Field
          label="Motivo"
          required
          error={errors.reason ?? server.fieldErrors.reason}
          help="Obligatorio: queda en la bitácora."
        >
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={transfer.isPending}>
            Invitar al nuevo dueño
          </Button>
        </div>
      </form>
    </Modal>
  );
}
