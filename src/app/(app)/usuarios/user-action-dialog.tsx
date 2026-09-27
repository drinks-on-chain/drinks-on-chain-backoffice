"use client";

import { useState } from "react";
import type { InternalRole, PlatformUser } from "@drinks-on-chain/mocks";
import { Field, ReasonDialog, Select, toast } from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { roleLabel } from "@/lib/platform/labels";
import {
  useChangePlatformUserRole,
  useManageInvitation,
  useResetPlatformUserMfa,
  useSendPasswordReset,
  useSetPlatformUserBlocked,
} from "@/lib/platform/hooks";

export type UserDialog = {
  kind: "role" | "block" | "unblock" | "reset-mfa" | "password" | "resend" | "revoke";
  user: PlatformUser;
};

const INTERNAL_ROLES: InternalRole[] = ["ADMIN", "OPERATIONS", "SUPPORT"];

type Copy = { title: string; description: string; confirm: string; destructive?: boolean; done: string };

function copyFor({ kind, user }: UserDialog): Copy {
  const who = user.fullName;
  switch (kind) {
    case "role":
      return {
        title: `Cambiar el rol de ${who}`,
        description: "El cambio se aplica en su próxima petición y queda en la bitácora con el motivo.",
        confirm: "Cambiar el rol",
        done: `Rol de ${who} cambiado.`,
      };
    case "block":
      return {
        title: `Bloquear a ${who}`,
        description: "Sus sesiones se cierran al instante y no podrá entrar al back office hasta que se desbloquee.",
        confirm: "Bloquear",
        destructive: true,
        done: `${who} quedó bloqueado.`,
      };
    case "unblock":
      return {
        title: `Desbloquear a ${who}`,
        description: "Podrá volver a entrar al back office con su contraseña y su segundo factor.",
        confirm: "Desbloquear",
        done: `${who} ya puede entrar.`,
      };
    case "reset-mfa":
      return {
        title: `Restablecer el segundo factor de ${who}`,
        description:
          "Se cierran sus sesiones y tendrá que inscribir de nuevo su app de autenticación al entrar. Le avisamos por correo.",
        confirm: "Restablecer",
        destructive: true,
        done: `Segundo factor de ${who} restablecido.`,
      };
    case "password":
      return {
        title: `Enviar a ${who} un enlace de contraseña`,
        description: `Le llegará a ${user.email} un enlace para crear una contraseña nueva (caduca en 60 minutos).`,
        confirm: "Enviar el enlace",
        done: `Enlace enviado a ${user.email}.`,
      };
    case "resend":
      return {
        title: `Reenviar la invitación a ${user.email}`,
        description: "Se envía un enlace nuevo con otra caducidad; el anterior deja de valer.",
        confirm: "Reenviar",
        done: `Invitación reenviada a ${user.email}.`,
      };
    case "revoke":
      return {
        title: `Anular la invitación a ${user.email}`,
        description: "El enlace deja de valer. Podrás invitar de nuevo a este correo más adelante.",
        confirm: "Anular la invitación",
        destructive: true,
        done: `Invitación a ${user.email} anulada.`,
      };
  }
}

/**
 * Acciones sobre otra persona interna: todas piden motivo (AUD-05), que va a la bitácora. Un 422
 * con `details[{ field: 'reason' }]` se marca en el campo; un 403 se avisa dentro del diálogo.
 */
export function UserActionDialog({ dialog, onClose }: { dialog: UserDialog | null; onClose: () => void }) {
  // Se vuelve a montar con cada diálogo: el rol elegido y los errores empiezan limpios.
  return dialog ? (
    <ActionDialog key={`${dialog.kind}:${dialog.user.email}`} dialog={dialog} onClose={onClose} />
  ) : null;
}

function ActionDialog({ dialog, onClose }: { dialog: UserDialog; onClose: () => void }) {
  const { kind, user } = dialog;
  const copy = copyFor(dialog);
  const initialRole = INTERNAL_ROLES.find((r) => r !== user.role) ?? "SUPPORT";
  const [role, setRole] = useState<InternalRole>(initialRole);
  const [reasonError, setReasonError] = useState<string | undefined>();

  const changeRole = useChangePlatformUserRole();
  const setBlocked = useSetPlatformUserBlocked();
  const resetMfa = useResetPlatformUserMfa();
  const sendReset = useSendPasswordReset();
  const manageInvitation = useManageInvitation();

  async function run(reason: string) {
    const membershipId = user.membershipId ?? "";
    switch (kind) {
      case "role":
        return changeRole.mutateAsync({ membershipId, role, reason });
      case "block":
      case "unblock":
        return setBlocked.mutateAsync({ membershipId, blocked: kind === "block", reason });
      case "reset-mfa":
        return resetMfa.mutateAsync({ membershipId, reason });
      case "password":
        return sendReset.mutateAsync({ userId: user.userId ?? "", reason });
      case "resend":
      case "revoke":
        return manageInvitation.mutateAsync({ invitationId: user.invitationId ?? "", action: kind, reason });
    }
  }

  async function onConfirm(reason: string) {
    setReasonError(undefined);
    try {
      await run(reason);
      toast({ title: copy.done, tone: "success" });
    } catch (error) {
      const { fieldErrors } = fieldErrorsFrom(error, ["reason"]);
      if (fieldErrors.reason) {
        setReasonError(fieldErrors.reason);
        throw new Error("Revisa el motivo.");
      }
      // El backend manda: un 403 (rol insuficiente, superusuario protegido) se avisa aquí.
      throw new Error(error instanceof ApiError ? errorMessage(error) : "No se pudo completar la acción.");
    }
  }

  return (
    <ReasonDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirm}
      destructive={copy.destructive}
      reasonError={reasonError}
      onConfirm={onConfirm}
      placeholder="Por qué lo haces (queda en la bitácora)"
    >
      {kind === "role" && (
        <Field label="Rol nuevo" required help={`Rol actual: ${roleLabel(user.role)}.`}>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as InternalRole)}
            options={INTERNAL_ROLES.map((r) => ({ value: r, label: roleLabel(r), disabled: r === user.role }))}
          />
        </Field>
      )}
    </ReasonDialog>
  );
}
