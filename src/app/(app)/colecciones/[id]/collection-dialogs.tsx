"use client";

import { useState, type FormEvent } from "react";
import type { ChainTxRef, Collection } from "@drinks-on-chain/mocks";
import { Button, ConfirmDialog, Field, SlideOver, Textarea, toast } from "@drinks-on-chain/ui";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { CommercialEditor } from "@/components/tokenization/commercial-editor";
import { fmtNumber } from "@/lib/format";
import { useRetryChainTransaction } from "@/lib/platform/chain";
import { txKindLabel } from "@/lib/platform/chain-labels";
import { useCollectionAction, useUpdateCollection } from "@/lib/platform/collections";
import { reasonRequired, type CollectionAction } from "@/lib/platform/collections-utils";
import { reasonProblem } from "@/lib/platform/forms";
import { explainRuleError, type ExplainedError } from "@/lib/platform/rule-errors";
import {
  COMMERCIAL_FIELDS,
  commercialBody,
  commercialChanged,
  commercialFormFrom,
  priceBody,
  validateCommercial,
  type CommercialField,
  type CommercialForm,
} from "@/lib/platform/tokenization-utils";

const COPY: Record<
  CollectionAction,
  { title: string; description: (c: Collection) => string; confirm: string; done: string }
> = {
  publish: {
    title: "Publicar la colección",
    description: (c) =>
      `«${c.name}» sale a la venta en el Marketplace con ${fmtNumber(c.counts.available)} NFT disponibles${c.price ? "" : " y «Precio por anunciar» (la compra exige un precio)"}.`,
    confirm: "Publicar",
    done: "Colección publicada.",
  },
  resume: {
    title: "Reanudar la venta",
    description: (c) => `«${c.name}» vuelve a estar a la venta en el Marketplace.`,
    confirm: "Reanudar",
    done: "Venta reanudada.",
  },
  pause: {
    title: "Pausar la venta",
    description: (c) =>
      `«${c.name}» deja de venderse hasta que se reanude. Es una pausa comercial: no toca la red ni los NFT ya vendidos.`,
    confirm: "Pausar",
    done: "Colección pausada.",
  },
  close: {
    title: "Cerrar la colección",
    description: (c) =>
      `«${c.name}» deja de venderse de forma definitiva. Los NFT ya vendidos siguen siendo de sus dueños. No se puede deshacer.`,
    confirm: "Cerrar la colección",
    done: "Colección cerrada.",
  },
};

/**
 * Publicar, pausar, reanudar o cerrar (§6.4). Pausar y cerrar exigen motivo (`ReasonDialog`);
 * publicar y reanudar lo admiten vacío. Los 409 y 422 (`TOK_MINT_NOT_CONFIRMED`,
 * `TOK_COMMERCIAL_DATA_INCOMPLETE`, `CHN_CONTRACT_PAUSED`, `TOK_CLOSURE_PENDING`…) se explican.
 */
export function CollectionActionDialog({
  collection: c,
  action,
  onClose,
}: {
  collection: Collection;
  action: CollectionAction;
  onClose: () => void;
}) {
  const run = useCollectionAction(c.id);
  const copy = COPY[action];
  const [note, setNote] = useState("");

  if (reasonRequired(action)) {
    return (
      <ReasonActionDialog
        copy={{
          title: copy.title,
          description: copy.description(c),
          confirm: copy.confirm,
          done: copy.done,
          destructive: action === "close",
        }}
        run={(reason) => run.mutateAsync({ action, reason })}
        onClose={onClose}
        onDone={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy.title}
      description={copy.description(c)}
      confirmLabel={copy.confirm}
      onConfirm={async () => {
        const reason = note.trim();
        const invalid = reason ? reasonProblem(reason) : undefined;
        if (invalid) throw new Error(invalid);
        try {
          await run.mutateAsync({ action, reason: reason || null });
        } catch (error) {
          const explained = explainRuleError(error, COMMERCIAL_FIELDS);
          const fields = Object.values(explained.fieldErrors);
          throw new Error([explained.message, ...fields, ...explained.notes].join(" "));
        }
        toast({ title: copy.done, tone: "success" });
        onClose();
      }}
    >
      <Field label="Nota para la bitácora" help="Opcional. Entre 3 y 500 caracteres.">
        <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

/** Reintentar una transacción fallida de la colección (emisión o quema), con motivo. */
export function RetryTransactionDialog({ tx, onClose }: { tx: ChainTxRef; onClose: () => void }) {
  const retry = useRetryChainTransaction();
  return (
    <ReasonActionDialog
      copy={{
        title: "Reintentar la transacción",
        description: `«${txKindLabel(tx.kind)}» vuelve a la cola y el firmante la envía de nuevo a la red. No se emite dos veces: antes de reconstruirla se comprueba que la anterior no entró.`,
        confirm: "Reintentar",
        done: "Transacción en cola: se envía de nuevo a la red.",
      }}
      run={(reason) => retry.mutateAsync({ id: tx.id, reason })}
      onClose={onClose}
      onDone={onClose}
    />
  );
}

const formOf = (c: Collection): CommercialForm =>
  commercialFormFrom(
    c.commercial,
    c.commercial.images.map((i) => ({ key: i.key, alt: i.alt, isCover: i.isCover, url: i.url })),
    c.price,
  );

/**
 * Editar los datos comerciales, la fecha de canje y el precio de una colección (`PATCH`, motivo
 * obligatorio). El nombre fija la dirección pública solo hasta la primera publicación.
 */
export function EditCollectionPanel({ collection: c, onClose }: { collection: Collection; onClose: () => void }) {
  const update = useUpdateCollection(c.id);
  const [initial] = useState(() => formOf(c));
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<CommercialField | "reason", string>>>({});
  const [failure, setFailure] = useState<ExplainedError | null>(null);
  const priceLocked = c.counts.sold + c.counts.reserved > 0;
  const dirty = commercialChanged(form, initial);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems: typeof errors = validateCommercial(form, {
      strict: c.status !== "MINTING" && c.status !== "READY",
    });
    const invalidReason = reasonProblem(reason);
    if (invalidReason) problems.reason = invalidReason;
    setErrors(problems);
    setFailure(null);
    if (Object.keys(problems).length) return;
    const price = priceBody(form);
    const priceChanged = price?.amountMinor !== (c.price?.amountMinor ?? undefined);
    update.mutate(
      {
        commercial: commercialBody(form),
        // El precio solo viaja si cambió (con ventas no se puede tocar: 409 `TOK_PRICE_LOCKED`).
        ...(priceChanged ? { price } : {}),
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast({ title: "Colección actualizada.", tone: "success" });
          onClose();
        },
        onError: (error) => {
          const explained = explainRuleError(error, [...COMMERCIAL_FIELDS, "reason"]);
          setErrors(explained.fieldErrors);
          setFailure(explained);
        },
      },
    );
  }

  return (
    <SlideOver
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title="Editar datos y precio"
      description={`«${c.name}» · ${c.winery.tradeName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="editar-coleccion" disabled={!dirty} loading={update.isPending}>
            Guardar los cambios
          </Button>
        </>
      }
    >
      <form id="editar-coleccion" onSubmit={onSubmit} className="grid gap-5" noValidate>
        {failure && Object.keys(failure.fieldErrors).length === 0 && <RuleErrorAlert error={failure} />}
        {failure && Object.keys(failure.fieldErrors).length > 0 && (
          <p role="alert" className="text-sm text-danger">
            {failure.message}
          </p>
        )}
        <CommercialEditor
          form={form}
          onChange={setForm}
          errors={errors}
          priceLocked={priceLocked}
          disabled={update.isPending}
        />
        <Field
          label="Motivo del cambio"
          required
          error={errors.reason}
          help="Queda en la bitácora y en el historial de precio. Entre 3 y 500 caracteres."
        >
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </SlideOver>
  );
}
