"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, RotateCcw } from "lucide-react";
import type { SettingDefinition, SettingOverride } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  KeyValueList,
  SkeletonText,
  TextLink,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime } from "@/lib/format";
import { reasonProblem } from "@/lib/platform/forms";
import { can } from "@/lib/platform/permissions";
import {
  APPLIES_AT_LABELS,
  LEVEL_LABELS,
  draftFrom,
  formatSettingValue,
  isBelowLegalMinimum,
  legalMinimumLabel,
  parseDraft,
  type SettingDraft,
} from "@/lib/platform/setting-value";
import {
  useResetOverrides,
  useSettingHistory,
  useSettingOverrides,
  useSettings,
  useUpdateSetting,
  type WineryIds,
} from "@/lib/platform/settings";
import { useAllWineries } from "@/lib/platform/wineries";
import { SettingValueEditor } from "../setting-value-editor";
import { valueErrorFrom } from "../value-error";
import { OverrideDialog } from "./override-dialog";

/** 4B · Un parámetro: estándar general, ajustes por bodega (masivos, excepción legal) e historial. */
export function SettingDetail({ settingKey }: { settingKey: string }) {
  const settings = useSettings();
  const setting = settings.data?.find((s) => s.key === settingKey);

  if (settings.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Parámetro" />
        <ErrorState
          title="No se pudo cargar la configuración"
          description={errorMessage(settings.error)}
          onRetry={() => void settings.refetch()}
        />
      </div>
    );
  }
  if (!setting) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Parámetro" />
        <EmptyState
          title="El parámetro no existe"
          description={`No hay ningún parámetro «${settingKey}».`}
          action={
            <Button asChild variant="secondary">
              <Link href="/configuracion">Volver a la configuración</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <SettingScreen setting={setting} />;
}

function SettingScreen({ setting: s }: { setting: SettingDefinition }) {
  const legal = legalMinimumLabel(s);
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Breadcrumbs
          linkComponent={Link}
          label="Ruta"
          items={[{ label: "Configuración", href: "/configuracion" }, { label: s.description }]}
        />
        <PageHeader
          eyebrow={<span className="font-mono normal-case tracking-normal">{s.key}</span>}
          title={s.description}
          actions={
            <Button asChild variant="tertiary">
              <Link href={`/bitacora?recurso=setting&recursoId=${encodeURIComponent(s.key)}`}>Ver en la bitácora</Link>
            </Button>
          }
        />
      </div>

      <Card className="p-5">
        <KeyValueList
          items={[
            { term: "Nivel", value: LEVEL_LABELS[s.levels] },
            { term: "Cuándo aplica", value: APPLIES_AT_LABELS[s.appliesAt] },
            { term: "Valor por defecto", value: formatSettingValue(s, s.default) },
            {
              term: "Mínimo legal",
              value: legal ? (
                <span>
                  {legal}{" "}
                  <span className="text-fg-muted">· un valor más laxo exige una excepción de administración</span>
                </span>
              ) : (
                <span className="text-fg-subtle">No tiene</span>
              ),
            },
            {
              term: "Último cambio",
              value: `${fmtDateTime(s.updatedAt)} · ${s.updatedBy ?? "Instalación"}`,
            },
          ]}
        />
      </Card>

      <GlobalValueCard setting={s} />
      {s.levels !== "GLOBAL" ? (
        <OverridesCard setting={s} />
      ) : (
        <Card className="p-5">
          <SectionHeader title="Ajustes por bodega" />
          <p className="mt-2 text-fg-muted">
            Este parámetro solo tiene estándar general: no admite ajustes por bodega.
          </p>
        </Card>
      )}
      <HistoryCard setting={s} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estándar general
// ---------------------------------------------------------------------------

function GlobalValueCard({ setting: s }: { setting: SettingDefinition }) {
  const me = useMe();
  const canWrite = can(me.data, "settings.write");
  const update = useUpdateSetting(s.key);
  const [draft, setDraft] = useState<SettingDraft>(() => draftFrom(s, s.globalValue));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ value?: string; reason?: string }>({});

  const parsed = parseDraft(s, draft);
  const belowLegal = parsed.ok && isBelowLegalMinimum(s, parsed.value);
  const serverReason = fieldErrorsFrom(update.error, ["reason"]).fieldErrors.reason;
  const valueError = errors.value ?? valueErrorFrom(update.error);
  const general = update.error && !valueError && !serverReason ? errorMessage(update.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    update.reset();
    const next = { value: parsed.ok ? undefined : parsed.error, reason: reasonProblem(reason) };
    setErrors(next);
    if (next.value || next.reason || !parsed.ok) return;
    update.mutate(
      { value: parsed.value, reason: reason.trim() },
      {
        onSuccess: (def) => {
          toast({ title: `Estándar general: ${formatSettingValue(def, def.globalValue)}.`, tone: "success" });
          setReason("");
          setDraft(draftFrom(def, def.globalValue));
        },
      },
    );
  }

  if (s.levels === "WINERY") {
    return (
      <Card className="grid gap-2 p-5">
        <SectionHeader title="Estándar general" />
        <p className="text-fg-muted">
          Este parámetro solo se ajusta por bodega. Sin ajuste, cada bodega usa el valor por defecto:{" "}
          <strong>{formatSettingValue(s, s.default)}</strong>.
        </p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader title="Estándar general" description="El valor que usan todas las bodegas sin un ajuste propio." />
      <p>
        Valor actual: <strong>{formatSettingValue(s, s.globalValue)}</strong>
      </p>
      {canWrite ? (
        <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
          {general && <Alert tone="danger">{general}</Alert>}
          <SettingValueEditor
            setting={s}
            draft={draft}
            onChange={(d) => {
              setDraft(d);
              if (errors.value) setErrors((x) => ({ ...x, value: undefined }));
            }}
            error={valueError}
            label="Nuevo valor"
          />
          {belowLegal && (
            <Alert tone="warning">
              Es más laxo que el mínimo legal ({legalMinimumLabel(s)}). El estándar general no admite excepciones: solo
              se autorizan por bodega.
            </Alert>
          )}
          <Field
            label="Motivo"
            required
            error={errors.reason ?? serverReason}
            help="Obligatorio: queda en la bitácora y en el historial."
          >
            <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" loading={update.isPending}>
              Guardar el estándar
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-fg-muted">Solo administración cambia el estándar general.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ajustes por bodega
// ---------------------------------------------------------------------------

function OverridesCard({ setting: s }: { setting: SettingDefinition }) {
  const me = useMe();
  const canWrite = can(me.data, "settings.write");
  const overrides = useSettingOverrides(s.key);
  const reset = useResetOverrides(s.key);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<{ ids: WineryIds; names: string[]; clear?: () => void } | null>(null);

  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Ajustes por bodega"
        description="Sustituyen al estándar en esas bodegas. «Volver al estándar» borra el ajuste."
        action={
          canWrite ? (
            <Button
              variant="secondary"
              size="sm"
              iconStart={<Plus aria-hidden="true" className="size-4" />}
              onClick={() => setAdding(true)}
            >
              Añadir ajuste
            </Button>
          ) : null
        }
      />
      <DataTable<SettingOverride>
        caption={`Ajustes por bodega de ${s.key}`}
        captionHidden
        density="compact"
        data={overrides.data ?? []}
        getRowId={(o) => o.wineryId}
        loading={overrides.isPending}
        selectable={canWrite}
        error={
          overrides.isError
            ? { description: "No se pudieron cargar los ajustes.", onRetry: () => void overrides.refetch() }
            : undefined
        }
        empty={<p className="p-4 text-fg-muted">Ninguna bodega tiene un ajuste: todas usan el estándar.</p>}
        bulkActions={
          canWrite
            ? (ids, clear) => (
                <Button
                  size="sm"
                  variant="secondary"
                  iconStart={<RotateCcw aria-hidden="true" className="size-4" />}
                  onClick={() =>
                    setResetting({
                      ids,
                      names: (overrides.data ?? []).filter((o) => ids.includes(o.wineryId)).map((o) => o.wineryName),
                      clear,
                    })
                  }
                >
                  Volver al estándar
                </Button>
              )
            : undefined
        }
        columns={[
          {
            id: "winery",
            header: "Bodega",
            accessor: "wineryName",
            sortable: true,
            cell: (o) => (
              <TextLink asChild variant="inline">
                <Link href={`/bodegas/${o.wineryId}`}>{o.wineryName}</Link>
              </TextLink>
            ),
          },
          {
            id: "value",
            header: "Valor",
            accessor: (o) => formatSettingValue(s, o.value),
            cell: (o) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                {formatSettingValue(s, o.value)}
                {o.legalException && (
                  <Badge tone="warning" title="Por debajo del mínimo legal, autorizado por administración">
                    Excepción legal
                  </Badge>
                )}
              </span>
            ),
          },
          { id: "reason", header: "Motivo", accessor: "reason", hideBelow: "lg" },
          {
            id: "updated",
            header: "Cambiado",
            accessor: "updatedAt",
            sortable: true,
            hideBelow: "md",
            cell: (o) => (
              <span className="grid">
                <time dateTime={o.updatedAt}>{fmtDateTime(o.updatedAt)}</time>
                <span className="text-xs text-fg-muted">{o.updatedBy}</span>
              </span>
            ),
          },
        ]}
        rowActions={
          canWrite
            ? (o) => (
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`Volver al estándar en ${o.wineryName}`}
                  onClick={() => setResetting({ ids: [o.wineryId], names: [o.wineryName] })}
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                </IconButton>
              )
            : undefined
        }
      />

      {adding && <OverrideDialog setting={s} onClose={() => setAdding(false)} />}
      {resetting && (
        <ReasonActionDialog
          copy={{
            title:
              resetting.names.length === 1
                ? `Volver al estándar en ${resetting.names[0]}`
                : `Volver al estándar en ${resetting.names.length} bodegas`,
            description: `Se borra el ajuste y ${resetting.names.length === 1 ? "la bodega usa" : "las bodegas usan"} el estándar general (${formatSettingValue(s, s.globalValue)}).`,
            confirm: "Volver al estándar",
            done:
              resetting.names.length === 1
                ? `${resetting.names[0]} vuelve al estándar.`
                : `${resetting.names.length} bodegas vuelven al estándar.`,
          }}
          run={(reason) => reset.mutateAsync({ wineryIds: resetting.ids, reason })}
          onDone={() => resetting.clear?.()}
          onClose={() => setResetting(null)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

function HistoryCard({ setting: s }: { setting: SettingDefinition }) {
  const history = useSettingHistory(s.key);
  const wineries = useAllWineries();
  const names = new Map((wineries.data ?? []).map((w) => [w.id, w.tradeName]));
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader title="Historial" description="Cada versión con quién, cuándo, el ámbito y el motivo." />
      <DataTable
        caption={`Historial de ${s.key}`}
        captionHidden
        density="compact"
        data={history.data ?? []}
        getRowId={(h, i) => `${h.at}-${h.scope}-${i}`}
        loading={history.isPending}
        error={
          history.isError
            ? { description: "No se pudo cargar el historial.", onRetry: () => void history.refetch() }
            : undefined
        }
        empty={<p className="p-4 text-fg-muted">Sin cambios desde la instalación.</p>}
        columns={[
          { id: "at", header: "Cuándo", accessor: "at", cell: (h) => <time dateTime={h.at}>{fmtDateTime(h.at)}</time> },
          { id: "by", header: "Quién", accessor: "by" },
          {
            id: "scope",
            header: "Ámbito",
            accessor: "scope",
            cell: (h) =>
              h.scope === "GLOBAL" ? (
                "Estándar general"
              ) : (
                <TextLink asChild variant="inline">
                  <Link href={`/bodegas/${h.scope}`}>{names.get(h.scope) ?? "Bodega"}</Link>
                </TextLink>
              ),
          },
          {
            id: "change",
            header: "Cambio",
            accessor: (h) => formatSettingValue(s, h.after),
            cell: (h) => (
              <span>
                <span className="text-fg-muted line-through decoration-fg-subtle">
                  {formatSettingValue(s, h.before)}
                </span>
                {" → "}
                <strong className="font-medium">{formatSettingValue(s, h.after)}</strong>
              </span>
            ),
          },
          { id: "reason", header: "Motivo", accessor: "reason", hideBelow: "md" },
        ]}
      />
    </Card>
  );
}
