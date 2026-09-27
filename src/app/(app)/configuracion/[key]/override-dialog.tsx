"use client";

import { useState, type FormEvent } from "react";
import type { SettingDefinition } from "@drinks-on-chain/mocks";
import { Alert, Button, Checkbox, Combobox, Field, Modal, RadioGroup, Textarea, toast } from "@drinks-on-chain/ui";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import { reasonProblem } from "@/lib/platform/forms";
import { can } from "@/lib/platform/permissions";
import {
  draftFrom,
  formatSettingValue,
  isBelowLegalMinimum,
  legalMinimumLabel,
  parseDraft,
  type SettingDraft,
} from "@/lib/platform/setting-value";
import { useSetOverrides } from "@/lib/platform/settings";
import { useAllWineries } from "@/lib/platform/wineries";
import { SettingValueEditor } from "../setting-value-editor";
import { valueErrorFrom } from "../value-error";

type Target = "SELECTION" | "ALL";

/**
 * Añadir o cambiar ajustes por bodega (`PUT …/overrides`): a una selección o a todas las
 * bodegas no revocadas. Un valor más laxo que el mínimo legal exige marcar la excepción, que solo
 * autoriza administración y queda señalada en el ajuste, la bitácora y el pasaporte del lote.
 */
export function OverrideDialog({ setting: s, onClose }: { setting: SettingDefinition; onClose: () => void }) {
  const me = useMe();
  const wineries = useAllWineries();
  const save = useSetOverrides(s.key);
  const [target, setTarget] = useState<Target>("SELECTION");
  const [ids, setIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<SettingDraft>(() => draftFrom(s, s.globalValue));
  const [exception, setException] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ wineryIds?: string; value?: string; reason?: string }>({});

  const legal = legalMinimumLabel(s);
  const canException = legal !== null && can(me.data, "settings.write");
  const parsed = parseDraft(s, draft);
  const belowLegal = parsed.ok && isBelowLegalMinimum(s, parsed.value);

  const server = fieldErrorsFrom(save.error, (field) =>
    field === "reason"
      ? "reason"
      : field.startsWith("wineryIds")
        ? "wineryIds"
        : field === "value"
          ? "value"
          : undefined,
  );
  const valueError = errors.value ?? valueErrorFrom(save.error);
  const wineryError = errors.wineryIds ?? server.fieldErrors.wineryIds;
  const reasonError = errors.reason ?? server.fieldErrors.reason;
  const general = save.error && !valueError && !wineryError && !reasonError ? errorMessage(save.error) : null;

  const options = (wineries.data ?? [])
    .filter((w) => w.status !== "REVOKED")
    .map((w) => ({ value: w.id, label: w.tradeName, description: w.region, keywords: [w.legalName, w.taxId] }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.reset();
    const next = {
      wineryIds: target === "SELECTION" && ids.length === 0 ? "Elige al menos una bodega." : undefined,
      value: parsed.ok ? undefined : parsed.error,
      reason: reasonProblem(reason),
    };
    setErrors(next);
    if (next.wineryIds || next.value || next.reason || !parsed.ok) return;
    save.mutate(
      {
        wineryIds: target === "ALL" ? "ALL" : ids,
        value: parsed.value,
        reason: reason.trim(),
        ...(exception ? { legalException: true } : {}),
      },
      {
        onSuccess: ({ updated }) => {
          toast({
            title: `${formatSettingValue(s, parsed.value)} en ${updated} ${updated === 1 ? "bodega" : "bodegas"}.`,
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
      title="Ajuste por bodega"
      description={`${s.description} · estándar general: ${formatSettingValue(s, s.globalValue)}.`}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {general && <Alert tone="danger">{general}</Alert>}
        <Field label="A qué bodegas" required>
          <RadioGroup
            orientation="horizontal"
            value={target}
            onValueChange={(v) => setTarget(v as Target)}
            options={[
              { value: "SELECTION", label: "A una selección" },
              { value: "ALL", label: "A todas (no revocadas)" },
            ]}
          />
        </Field>
        {target === "SELECTION" ? (
          <Field label="Bodegas" required error={wineryError} help="Escribe para buscar por nombre, NIT o región.">
            <Combobox
              multiple
              value={ids}
              onValueChange={(v) => setIds(v)}
              options={options}
              loading={wineries.isPending}
              placeholder="Buscar bodega…"
              labels={{ empty: "Ninguna bodega coincide", remove: (label) => `Quitar ${label}` }}
            />
          </Field>
        ) : (
          wineryError && <Alert tone="danger">{wineryError}</Alert>
        )}

        <SettingValueEditor
          setting={s}
          draft={draft}
          onChange={(d) => {
            setDraft(d);
            if (errors.value) setErrors((x) => ({ ...x, value: undefined }));
          }}
          error={valueError}
        />

        {canException && (
          <div className="grid gap-2">
            {belowLegal && !exception && (
              <Alert tone="warning">
                El valor es más laxo que el mínimo legal ({legal}). Sin excepción, el servidor lo rechaza.
              </Alert>
            )}
            <Checkbox
              label="Autorizar una excepción al mínimo legal"
              description={`Solo administración. Permite un valor más laxo que ${legal} en estas bodegas; queda marcado en el ajuste, en la bitácora y en el pasaporte de sus lotes.`}
              checked={exception}
              onCheckedChange={(checked) => setException(checked === true)}
            />
            {exception && (
              <Alert tone="danger" title="Excepción al mínimo legal">
                Vas a autorizar reglas por debajo de la norma ({legal}). Explica en el motivo la base legal o el acuerdo
                que lo justifica.
              </Alert>
            )}
          </div>
        )}

        <Field label="Motivo" required error={reasonError} help="Obligatorio: queda en la bitácora y en el historial.">
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar el ajuste
          </Button>
        </div>
      </form>
    </Modal>
  );
}
