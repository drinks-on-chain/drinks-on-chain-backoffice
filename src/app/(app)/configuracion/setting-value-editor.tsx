"use client";

import { Checkbox, Field, Input, RadioGroup, Select, Textarea } from "@drinks-on-chain/ui";
import { enumLabel, unlimitedLabel, type SettingDraft, type SettingShape } from "@/lib/platform/setting-value";

/**
 * Editor del valor de un parámetro según su tipo (contrato de la Ola 1 §6): número con unidad,
 * sí/no, lista (uno por línea), enumeración, número o ilimitado y objeto con un editor JSON.
 * El error (del cliente o del servidor: `details[{ field: 'value' }]`,
 * `SETTING_BELOW_LEGAL_MINIMUM`, `SETTING_LEVEL_NOT_ALLOWED`) se marca en el campo.
 */
export function SettingValueEditor({
  setting,
  draft,
  onChange,
  error,
  label = "Valor",
  help,
}: {
  setting: SettingShape;
  draft: SettingDraft;
  onChange: (draft: SettingDraft) => void;
  error?: string;
  label?: string;
  help?: string;
}) {
  const range =
    setting.min !== undefined || setting.max !== undefined
      ? `Entre ${setting.min ?? "—"} y ${setting.max ?? "—"}${setting.unit ? ` ${setting.unit}` : ""}.`
      : undefined;

  switch (draft.kind) {
    case "number":
      return (
        <Field label={label} required error={error} help={help ?? range}>
          <Input
            numeric
            value={draft.text}
            onChange={(e) => onChange({ kind: "number", text: e.target.value })}
            suffix={setting.unit}
            className="max-w-48"
          />
        </Field>
      );
    case "numberOrUnlimited": {
      const none = unlimitedLabel(setting);
      return (
        <div className="grid gap-2">
          <Checkbox
            label={`${none} (sin valor)`}
            checked={draft.unlimited}
            onCheckedChange={(checked) => onChange({ ...draft, unlimited: checked === true })}
          />
          <Field
            label={label}
            required={!draft.unlimited}
            disabled={draft.unlimited}
            error={error}
            help={help ?? range}
          >
            <Input
              numeric
              value={draft.unlimited ? "" : draft.text}
              disabled={draft.unlimited}
              onChange={(e) => onChange({ ...draft, text: e.target.value })}
              suffix={setting.unit}
              className="max-w-48"
            />
          </Field>
        </div>
      );
    }
    case "boolean":
      return (
        <Field label={label} required error={error} help={help}>
          <RadioGroup
            orientation="horizontal"
            value={draft.value ? "true" : "false"}
            onValueChange={(v) => onChange({ kind: "boolean", value: v === "true" })}
            options={[
              { value: "true", label: "Sí" },
              { value: "false", label: "No" },
            ]}
          />
        </Field>
      );
    case "list":
      return (
        <Field label={label} required error={error} help={help ?? "Un elemento por línea."}>
          <Textarea rows={4} value={draft.text} onChange={(e) => onChange({ kind: "list", text: e.target.value })} />
        </Field>
      );
    case "enum":
      return (
        <Field label={label} required error={error} help={help}>
          <Select
            value={draft.value}
            onValueChange={(v) => onChange({ kind: "enum", value: v })}
            options={(setting.enumValues ?? []).map((v) => ({ value: v, label: `${enumLabel(v)} (${v})` }))}
          />
        </Field>
      );
    case "object":
      return (
        <Field
          label={label}
          required
          error={error}
          help={help ?? 'Objeto JSON ({ "clave": valor }). Vacío = sin definir.'}
        >
          <Textarea
            rows={8}
            spellCheck={false}
            className="font-mono text-xs"
            value={draft.text}
            onChange={(e) => onChange({ kind: "object", text: e.target.value })}
          />
        </Field>
      );
    case "string":
      return (
        <Field label={label} required error={error} help={help}>
          <Input value={draft.text} onChange={(e) => onChange({ kind: "string", text: e.target.value })} />
        </Field>
      );
  }
}
