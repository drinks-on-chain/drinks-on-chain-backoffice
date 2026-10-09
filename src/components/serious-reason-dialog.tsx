"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Field, Input, Modal, ModalClose, Textarea, toast } from "@drinks-on-chain/ui";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { reasonProblem } from "@/lib/platform/forms";
import { explainRuleError, type ExplainedError } from "@/lib/platform/rule-errors";

/**
 * Confirmación seria de una acción que llega a la red y afecta a toda una bodega (pausar o reanudar
 * su contrato): aviso de la consecuencia, motivo obligatorio (3–500, va a la bitácora) y escribir el
 * identificador del recurso para activar el botón (03-backoffice «Reglas»). Los errores se explican
 * dentro del diálogo, que queda abierto.
 */
export function SeriousReasonDialog({
  title,
  description,
  consequence,
  confirmText,
  confirmLabel,
  done,
  destructive = true,
  run,
  onClose,
}: {
  title: string;
  description: ReactNode;
  /** Qué pasa al confirmar (se muestra como aviso). */
  consequence: ReactNode;
  /** Texto exacto que hay que escribir para confirmar (p. ej. el símbolo del contrato). */
  confirmText: string;
  confirmLabel: string;
  /** Aviso al terminar (toast). */
  done: string;
  destructive?: boolean;
  run: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const [failure, setFailure] = useState<ExplainedError | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === confirmText;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = reasonProblem(reason);
    setProblem(invalid);
    setFailure(null);
    if (invalid || !matches) return;
    setBusy(true);
    try {
      await run(reason.trim());
      toast({ title: done, tone: "success" });
      onClose();
    } catch (error) {
      setFailure(explainRuleError(error, ["reason"]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      size="md"
      title={title}
      description={description}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary" disabled={busy}>
              Cancelar
            </Button>
          </ModalClose>
          <Button
            type="submit"
            form="confirmacion-seria"
            variant={destructive ? "destructive" : "primary"}
            disabled={!matches}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="confirmacion-seria" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {failure && !failure.fieldErrors.reason && <RuleErrorAlert error={failure} />}
        <Alert tone={destructive ? "danger" : "warning"}>{consequence}</Alert>
        <Field
          label="Motivo"
          required
          error={problem ?? failure?.fieldErrors.reason}
          help="Queda en la bitácora. Entre 3 y 500 caracteres."
        >
          <Textarea
            rows={3}
            maxLength={500}
            value={reason}
            placeholder="Por qué lo haces (queda en la bitácora)"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field label={`Escribe ${confirmText} para confirmar`} required>
          <Input autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
