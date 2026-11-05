"use client";

import { useState, type ReactNode } from "react";
import { ReasonDialog, toast } from "@drinks-on-chain/ui";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { ruleErrorMessage } from "@/lib/platform/rule-errors";

export type ReasonActionCopy = {
  title: string;
  description: ReactNode;
  confirm: string;
  /** Aviso al terminar (toast). */
  done: string;
  destructive?: boolean;
};

/**
 * Acción del back office sobre terceros con motivo obligatorio (AUD-05) que va a la bitácora.
 * Un 422 con `details[{ field: 'reason' }]` se marca en el campo; cualquier otro error (403,
 * 409 de una transición, conflicto…) se avisa dentro del diálogo, que queda abierto; los códigos
 * `TOK_…` y `CHN_…` de la Ola 3, con su explicación.
 * `fieldErrors` permite marcar también los campos propios (`children`).
 */
export function ReasonActionDialog({
  copy,
  run,
  onClose,
  onDone,
  fields = [],
  onFieldErrors,
  children,
}: {
  copy: ReasonActionCopy;
  run: (reason: string) => Promise<unknown>;
  onClose: () => void;
  onDone?: () => void;
  fields?: string[];
  onFieldErrors?: (errors: Partial<Record<string, string>>) => void;
  children?: ReactNode;
}) {
  const [reasonError, setReasonError] = useState<string | undefined>();

  async function onConfirm(reason: string) {
    setReasonError(undefined);
    onFieldErrors?.({});
    try {
      await run(reason);
    } catch (error) {
      const { fieldErrors, formErrors } = fieldErrorsFrom(error, ["reason", ...fields]);
      const { reason: reasonMessage, ...rest } = fieldErrors;
      if (reasonMessage) setReasonError(reasonMessage);
      if (Object.keys(rest).length) onFieldErrors?.(rest);
      if (reasonMessage || Object.keys(rest).length) {
        throw new Error(formErrors[0] ?? "Revisa los campos marcados.");
      }
      throw new Error(ruleErrorMessage(error));
    }
    toast({ title: copy.done, tone: "success" });
    onDone?.();
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
      {children}
    </ReasonDialog>
  );
}
