"use client";

import { useState, type FormEvent } from "react";
import type {
  ApproveTokenizationRequest,
  PlatformTokenizationRequest,
  TokenizationApproval,
} from "@drinks-on-chain/mocks";
import { Button, Checkbox, Field, KeyValueList, Modal, ModalClose, Textarea, toast } from "@drinks-on-chain/ui";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { fmtBob, fmtNumber } from "@/lib/format";
import { networkLabel, requestKindLabel } from "@/lib/platform/chain-labels";
import { reasonProblem } from "@/lib/platform/forms";
import { explainRuleError, type ExplainedError } from "@/lib/platform/rule-errors";
import {
  useApproveTokenizationRequest,
  useRejectTokenizationRequest,
  useRequestTokenizationChanges,
} from "@/lib/platform/tokenization";
import {
  CHANGE_FIELDS,
  COMMERCIAL_FIELDS,
  commercialBody,
  priceBody,
  validateChangeRequest,
  type CommercialForm,
} from "@/lib/platform/tokenization-utils";

export type RequestDialog = "changes" | "approve" | "reject";

/**
 * Pedir cambios a la bodega (`IN_REVIEW → CHANGES_REQUESTED`): el mensaje llega por correo al dueño
 * y los campos señalados se marcan en el ERP.
 */
export function RequestChangesDialog({
  request: r,
  onClose,
}: {
  request: PlatformTokenizationRequest;
  onClose: () => void;
}) {
  const send = useRequestTokenizationChanges(r.id);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | undefined>();
  const error = send.error ? explainRuleError(send.error, ["message", "fields"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateChangeRequest(message);
    setProblem(invalid);
    if (invalid) return;
    send.mutate(
      { message: message.trim(), ...(fields.length ? { fields } : {}) },
      {
        onSuccess: () => {
          toast({ title: "Cambios pedidos: la bodega recibe el mensaje por correo.", tone: "success" });
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title="Pedir cambios a la bodega"
      description={`${r.winery.tradeName} · ${r.lot.name}. La solicitud queda a la espera hasta que la bodega la corrija y la reenvíe desde el ERP.`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </ModalClose>
          <Button type="submit" form="pedir-cambios" loading={send.isPending}>
            Pedir cambios
          </Button>
        </>
      }
    >
      <form id="pedir-cambios" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && Object.keys(error.fieldErrors).length === 0 && <RuleErrorAlert error={error} />}
        <Field
          label="Mensaje para la bodega"
          required
          error={problem ?? error?.fieldErrors.message}
          help="Qué falta o qué debe corregir. Lo lee el dueño de la bodega."
        >
          <Textarea rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">
            Campos a revisar <span className="font-normal text-fg-subtle">· opcional</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANGE_FIELDS.map((f) => (
              <Checkbox
                key={f.value}
                label={f.label}
                checked={fields.includes(f.value)}
                onCheckedChange={(checked) =>
                  setFields((current) =>
                    checked === true ? [...current, f.value] : current.filter((v) => v !== f.value),
                  )
                }
              />
            ))}
          </div>
          {error?.fieldErrors.fields && (
            <p role="alert" className="text-sm text-danger">
              {error.fieldErrors.fields}
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

/**
 * Aprobar (`IN_REVIEW → APPROVED`): crea la colección (o amplía la cuota) y la emisión de los NFT a
 * nombre de la bodega. Envía los datos comerciales y el precio tal como están en el editor. Los
 * errores de regla (`TOK_…`) se explican aquí y, si son de un campo, se marcan en el editor.
 */
export function ApproveDialog({
  request: r,
  form,
  onFieldErrors,
  onApproved,
  onClose,
}: {
  request: PlatformTokenizationRequest;
  form: CommercialForm;
  onFieldErrors: (errors: ExplainedError["fieldErrors"]) => void;
  onApproved: (result: TokenizationApproval) => void;
  onClose: () => void;
}) {
  const approve = useApproveTokenizationRequest(r.id);
  const [publishOnMint, setPublishOnMint] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const price = priceBody(form);
  const initial = r.kind === "INITIAL";
  const error = approve.error ? explainRuleError(approve.error, [...COMMERCIAL_FIELDS, "reason"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const note = reason.trim();
    const invalid = note ? reasonProblem(note) : undefined;
    setReasonError(invalid);
    if (invalid) return;
    // Una ampliación no toca los datos comerciales ni el precio: son los de la colección.
    const body: ApproveTokenizationRequest = {
      ...(initial ? { commercial: commercialBody(form), price, publishOnMint } : {}),
      ...(note ? { reason: note } : {}),
    };
    onFieldErrors({});
    approve.mutate(body, {
      onSuccess: (result) => {
        toast({ title: "Solicitud aprobada: la emisión de los NFT está en curso.", tone: "success" });
        onApproved(result);
      },
      onError: (failure) => {
        const { fieldErrors } = explainRuleError(failure, COMMERCIAL_FIELDS);
        onFieldErrors(fieldErrors);
      },
    });
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title={initial ? "Aprobar y emitir los NFT" : "Aprobar la ampliación de cuota"}
      description={
        initial
          ? "Se crea la colección y se emiten los NFT a nombre de la bodega. La emisión no se puede deshacer."
          : "Se amplía la cuota de la colección y se emiten los NFT adicionales. La emisión no se puede deshacer."
      }
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </ModalClose>
          <Button type="submit" form="aprobar-tokenizacion" loading={approve.isPending}>
            {initial ? "Aprobar y emitir" : "Aprobar la ampliación"}
          </Button>
        </>
      }
    >
      <form id="aprobar-tokenizacion" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && (
          <RuleErrorAlert
            error={
              Object.keys(error.fieldErrors).some((f) => f !== "reason")
                ? { ...error, notes: Object.values(error.fieldErrors) }
                : error
            }
          />
        )}
        <KeyValueList
          items={[
            { term: "Bodega", value: r.winery.tradeName },
            { term: "Lote", value: `${r.lot.name} · ${r.lot.reference}` },
            { term: "Tipo", value: requestKindLabel(r.kind) },
            {
              term: "NFT a emitir",
              value: (
                <span className="tabular-nums">
                  {fmtNumber(r.quantity)} · cuota resultante {fmtNumber(r.resultingQuota)}
                </span>
              ),
            },
            { term: "Red", value: networkLabel(r.review.chainIdentity.network) },
            ...(initial
              ? [
                  { term: "Colección", value: form.name.trim() || "Sin nombre" },
                  {
                    term: "Precio por botella",
                    value: price ? fmtBob(price.amountMinor) : "Sin precio («Precio por anunciar»)",
                  },
                ]
              : []),
          ]}
        />
        {initial && (
          <Checkbox
            label="Publicar al emitir"
            description="La colección sale a la venta sola en cuanto la red confirme la emisión. Sin marcar, queda «Lista para publicar»."
            checked={publishOnMint}
            onCheckedChange={(checked) => setPublishOnMint(checked === true)}
          />
        )}
        <Field
          label="Nota para la bitácora"
          error={reasonError ?? error?.fieldErrors.reason}
          help="Opcional. Entre 3 y 500 caracteres."
        >
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/** Rechazar con motivo (`→ REJECTED`): el dueño de la bodega recibe el motivo por correo. */
export function RejectDialog({ request: r, onClose }: { request: PlatformTokenizationRequest; onClose: () => void }) {
  const reject = useRejectTokenizationRequest(r.id);
  return (
    <ReasonActionDialog
      copy={{
        title: "Rechazar la solicitud",
        description: `${r.winery.tradeName} · ${r.lot.name} (${fmtNumber(r.quantity)} botellas). El dueño de la bodega recibe el motivo por correo; la bodega puede enviar otra solicitud más adelante.`,
        confirm: "Rechazar",
        done: "Solicitud rechazada.",
        destructive: true,
      }}
      run={(reason) => reject.mutateAsync(reason)}
      onClose={onClose}
      onDone={onClose}
    />
  );
}
