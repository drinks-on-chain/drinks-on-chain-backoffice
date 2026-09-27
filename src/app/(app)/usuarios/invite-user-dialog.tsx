"use client";

import { useState, type FormEvent } from "react";
import type { InternalRole } from "@drinks-on-chain/mocks";
import { Alert, Button, Field, Input, Modal, Select, Textarea, toast } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { roleLabel } from "@/lib/platform/labels";
import { useInvitePlatformUser } from "@/lib/platform/hooks";

const ROLES: InternalRole[] = ["ADMIN", "OPERATIONS", "SUPPORT"];
const ROLE_HELP: Record<InternalRole, string> = {
  ADMIN: "Todo el back office, incluidos usuarios internos y configuración.",
  OPERATIONS: "Solicitudes, alta y estado de bodegas, equipos y bitácora.",
  SUPPORT: "Lectura de solicitudes y bodegas, equipos de las bodegas y bitácora.",
};

// Conflictos sin `details` que corresponden al correo.
const EMAIL_CONFLICTS = ["ORG_ALREADY_MEMBER", "INVITATION_ALREADY_PENDING"];

/** `POST /v1/platform/users`: invitación por correo con rol (el superusuario no se asigna). */
export function InviteUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Invitar a un usuario interno"
      description="Le llegará un correo con un enlace de un solo uso (caduca en 72 horas). Al aceptarlo creará su contraseña y activará el segundo factor."
      size="md"
    >
      {open && <InviteForm onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const invite = useInvitePlatformUser();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InternalRole>("OPERATIONS");
  const [reason, setReason] = useState("");

  const error = invite.error;
  const { fieldErrors, formErrors } = fieldErrorsFrom(error, ["email", "role", "reason"]);
  const conflict = error instanceof ApiError && EMAIL_CONFLICTS.includes(error.code) ? error.message : undefined;
  const other =
    error && !conflict && Object.keys(fieldErrors).length === 0 && formErrors.length === 0 ? errorMessage(error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    invite.mutate(
      { email: email.trim(), role, reason: reason.trim() || undefined },
      {
        onSuccess: (inv) => {
          toast({ title: `Invitación enviada a ${inv.email}.`, tone: "success" });
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {(other || formErrors.length > 0) && <Alert tone="danger">{other ?? formErrors.join(" ")}</Alert>}
      <Field label="Correo electrónico" required error={fieldErrors.email ?? conflict}>
        <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Field label="Rol" required error={fieldErrors.role} help={ROLE_HELP[role]}>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as InternalRole)}
          options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
        />
      </Field>
      <Field label="Motivo" help="Opcional. Queda en la bitácora." error={fieldErrors.reason}>
        <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={invite.isPending}>
          Enviar la invitación
        </Button>
      </div>
    </form>
  );
}
