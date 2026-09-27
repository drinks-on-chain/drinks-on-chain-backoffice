"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, ShieldCheck } from "lucide-react";
import type { AuditEvent, AuditVerifyResult } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  Combobox,
  DataTable,
  DateRangePicker,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  Select,
  lastDaysRange,
  toast,
  type DateRange,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import {
  exportFilename,
  saveFile,
  useAudit,
  useExportAudit,
  useVerifyAudit,
  type AuditFilters,
} from "@/lib/platform/audit";
import {
  RESOURCE_TYPE_LABELS,
  auditActionLabel,
  auditActionOptions,
  auditActorLabel,
  clientAppLabel,
  resourceTypeLabel,
} from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { useAllWineries } from "@/lib/platform/wineries";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";
import { AuditEventPanel } from "./audit-event-panel";

const PAGE_SIZE = 50;
const ALL = "ALL";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parámetros de la URL ↔ filtros de la API. */
function filtersFrom(get: (k: string) => string | null): AuditFilters {
  const date = (v: string | null) => (v && DATE.test(v) ? v : undefined);
  return {
    from: date(get("desde")),
    to: date(get("hasta")),
    actorId: get("persona") ?? undefined,
    organizationId: get("organizacion") ?? undefined,
    action: get("accion") ?? undefined,
    resourceType: get("recurso") ?? undefined,
    resourceId: get("recursoId") ?? undefined,
  };
}

/**
 * 4B · Bitácora (contrato de la Ola 1 §7): tabla densa con filtros en la URL, detalle con el antes
 * y el después, exportación CSV con los mismos filtros y verificación de la cadena (ADMIN).
 */
export function AuditView() {
  const me = useMe();
  const url = useUrlParams();
  const filters = filtersFrom(url.get);
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const audit = useAudit({ ...filters, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const wineries = useAllWineries(Boolean(me.data));
  const exporter = useExportAudit();
  const verifier = useVerifyAudit();
  const [verified, setVerified] = useState<(AuditVerifyResult & { range: string }) | null>(null);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const page = audit.data;

  const platform = activeMembership(me.data);
  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    if (platform?.organizationType === "PLATFORM")
      map.set(platform.organizationId, `${platform.organizationName} (plataforma)`);
    for (const w of wineries.data ?? []) map.set(w.id, w.tradeName);
    return map;
  }, [platform, wineries.data]);

  // Personas: las que aparecen en la página (el filtro también llega desde la ficha de una persona).
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of page?.items ?? [])
      if (e.actor.userId && e.actor.fullName) map.set(e.actor.userId, e.actor.fullName);
    return map;
  }, [page]);

  const range: DateRange = { from: filters.from ?? null, to: filters.to ?? null };
  const rangeLabel =
    filters.from || filters.to ? `${filters.from ?? "el inicio"} – ${filters.to ?? "hoy"}` : "toda la bitácora";

  const chips = [
    ...(filters.from || filters.to ? [{ id: "fechas", label: "Fechas", value: rangeLabel }] : []),
    ...(filters.actorId
      ? [{ id: "persona", label: "Persona", value: people.get(filters.actorId) ?? "Seleccionada" }]
      : []),
    ...(filters.organizationId
      ? [
          {
            id: "organizacion",
            label: "Organización",
            value: organizations.get(filters.organizationId) ?? "Seleccionada",
          },
        ]
      : []),
    ...(filters.action ? [{ id: "accion", label: "Acción", value: auditActionLabel(filters.action) }] : []),
    ...(filters.resourceType
      ? [{ id: "recurso", label: "Recurso", value: resourceTypeLabel(filters.resourceType) }]
      : []),
    ...(filters.resourceId ? [{ id: "recursoId", label: "Id del recurso", value: filters.resourceId }] : []),
  ];

  async function onExport() {
    try {
      const file = await exporter.mutateAsync(filters);
      const rows = Math.max(0, (await file.blob.text()).split(/\r?\n/).filter(Boolean).length - 1);
      saveFile(file.blob, file.filename ?? exportFilename());
      toast({
        title: `Bitácora exportada: ${fmtNumber(rows)} ${rows === 1 ? "entrada" : "entradas"} en CSV.`,
        tone: "success",
      });
    } catch (error) {
      toast({ title: `No se pudo exportar: ${errorMessage(error)}`, tone: "danger" });
    }
  }

  function onVerify() {
    setVerified(null);
    verifier.mutate(
      { from: filters.from, to: filters.to },
      { onSuccess: (result) => setVerified({ ...result, range: rangeLabel }) },
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Plataforma"
        title="Bitácora"
        description="Registro inmutable y encadenado de todo lo que se crea, cambia, aprueba o bloquea en cualquier sistema. Se consulta para auditar algo concreto."
        actions={
          <>
            <Button
              variant="secondary"
              iconStart={<Download aria-hidden="true" className="size-4" />}
              loading={exporter.isPending}
              onClick={() => void onExport()}
            >
              Exportar CSV
            </Button>
            {can(me.data, "audit.verify") && (
              <Button
                variant="secondary"
                iconStart={<ShieldCheck aria-hidden="true" className="size-4" />}
                loading={verifier.isPending}
                onClick={onVerify}
              >
                Verificar la cadena
              </Button>
            )}
          </>
        }
      />

      {verifier.isError && <Alert tone="danger">No se pudo verificar la cadena: {errorMessage(verifier.error)}</Alert>}
      {verified &&
        (verified.valid ? (
          <Alert tone="success" title="Cadena íntegra">
            Se comprobaron {fmtNumber(verified.checked)} eventos ({verified.range}): cada uno enlaza con el anterior y
            ninguno se modificó.
          </Alert>
        ) : (
          <Alert
            tone="danger"
            title="La cadena está rota"
            action={
              verified.firstBrokenSeq !== null ? (
                <Button asChild size="sm" variant="secondary">
                  <Link
                    href={`/bitacora?${new URLSearchParams(pageParamFor(verified.firstBrokenSeq, page?.total ?? 0)).toString()}`}
                  >
                    Ir al evento
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {verified.firstBrokenSeq !== null
              ? `El primer evento que no cuadra es el nº ${verified.firstBrokenSeq}: su contenido o su enlace con el anterior no coinciden con el hash guardado. `
              : ""}
            Se comprobaron {fmtNumber(verified.checked)} eventos ({verified.range}). Avisa al equipo técnico: la
            bitácora no debería poder alterarse.
          </Alert>
        ))}

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set(id === "fechas" ? { desde: undefined, hasta: undefined } : { [id]: undefined })}
        onClearAll={chips.length ? () => url.clear() : undefined}
        resultCount={page ? `${fmtNumber(page.total)} ${page.total === 1 ? "evento" : "eventos"}` : undefined}
      >
        <DateRangePicker
          label="Fechas"
          size="sm"
          value={range}
          onValueChange={(next, error) => {
            if (!error) url.set({ desde: next.from ?? undefined, hasta: next.to ?? undefined });
          }}
          presets={[
            { label: "7 días", range: lastDaysRange(7) },
            { label: "30 días", range: lastDaysRange(30) },
          ]}
        />
        <Field label="Persona" className="w-52">
          <Combobox
            size="sm"
            clearable
            value={filters.actorId ?? null}
            onValueChange={(v) => url.set({ persona: v ?? undefined })}
            options={[...people].map(([value, label]) => ({ value, label }))}
            selectedOptions={
              filters.actorId && !people.has(filters.actorId)
                ? [{ value: filters.actorId, label: "Persona seleccionada" }]
                : undefined
            }
            placeholder="Cualquiera"
            labels={{ empty: "Nadie en esta página" }}
          />
        </Field>
        <Field label="Organización" className="w-56">
          <Combobox
            size="sm"
            clearable
            value={filters.organizationId ?? null}
            onValueChange={(v) => url.set({ organizacion: v ?? undefined })}
            options={[...organizations].map(([value, label]) => ({ value, label }))}
            loading={wineries.isPending}
            placeholder="Cualquiera"
            labels={{ empty: "Ninguna coincide" }}
          />
        </Field>
        <Field label="Acción" className="w-60">
          <Combobox
            size="sm"
            clearable
            value={filters.action ?? null}
            onValueChange={(v) => url.set({ accion: v ?? undefined })}
            options={auditActionOptions().map((o) => ({ ...o, keywords: [o.value] }))}
            selectedOptions={
              filters.action ? [{ value: filters.action, label: auditActionLabel(filters.action) }] : undefined
            }
            placeholder="Cualquiera"
            labels={{ empty: "Ninguna acción coincide" }}
          />
        </Field>
        <Field label="Recurso" className="w-44">
          <Select
            size="sm"
            value={filters.resourceType ?? ALL}
            onValueChange={(v) => url.set({ recurso: v === ALL ? undefined : v, recursoId: undefined })}
            options={[
              { value: ALL, label: "Cualquiera" },
              ...Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption="Eventos de la bitácora"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(e) => e.id}
        loading={audit.isPending}
        activeRowId={selected?.id}
        onRowClick={setSelected}
        error={
          audit.isError ? { description: errorMessage(audit.error), onRetry: () => void audit.refetch() } : undefined
        }
        empty={
          <EmptyState
            bare
            title="Ningún evento coincide"
            description={chips.length ? "Prueba con otros filtros o amplía las fechas." : "Aún no hay actividad."}
            action={
              chips.length ? (
                <Button variant="secondary" onClick={() => url.clear()}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        }
        pagination={
          page && page.total > PAGE_SIZE
            ? {
                total: page.total,
                limit: PAGE_SIZE,
                offset,
                onOffsetChange: (o) => url.set({ [PAGE_PARAM]: String(o / PAGE_SIZE + 1) }, { keepPage: true }),
              }
            : undefined
        }
        columns={[
          {
            id: "seq",
            header: "Nº",
            accessor: "seq",
            numeric: true,
            width: "64px",
            cell: (e) => <span className="text-fg-subtle tabular-nums">{e.seq}</span>,
          },
          {
            id: "at",
            header: "Cuándo",
            accessor: "occurredAt",
            cell: (e) => (
              <time dateTime={e.occurredAt} className="whitespace-nowrap tabular-nums">
                {fmtDateTime(e.occurredAt)}
              </time>
            ),
          },
          {
            id: "actor",
            header: "Quién",
            accessor: (e) => e.actor.fullName ?? "",
            cell: (e) => (
              <span className="grid max-w-56">
                <span className="truncate">{auditActorLabel(e.actor)}</span>
                <span className="text-xs text-fg-muted">{clientAppLabel(e.source.app)}</span>
              </span>
            ),
          },
          {
            id: "action",
            header: "Acción",
            accessor: "action",
            cell: (e) => <span className="font-medium whitespace-nowrap">{auditActionLabel(e.action)}</span>,
          },
          {
            id: "resource",
            header: "Recurso",
            accessor: (e) => e.resource.type,
            hideBelow: "lg",
            cell: (e) => resourceTypeLabel(e.resource.type),
          },
          {
            id: "organization",
            header: "Organización",
            accessor: (e) => e.organizationId ?? "",
            hideBelow: "md",
            cell: (e) =>
              e.organizationId ? (
                <span className="block max-w-44 truncate" title={organizations.get(e.organizationId)}>
                  {organizations.get(e.organizationId) ?? "—"}
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          },
          {
            id: "reason",
            header: "Motivo",
            accessor: (e) => e.reason ?? "",
            hideBelow: "xl",
            cell: (e) =>
              e.reason ? (
                <span className="block max-w-48 truncate" title={e.reason}>
                  {e.reason}
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          },
        ]}
        rowActions={(e) => (
          <IconButton size="sm" variant="ghost" label={`Ver el evento nº ${e.seq}`} onClick={() => setSelected(e)}>
            <Eye aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      />

      <AuditEventPanel event={selected} organizations={organizations} onClose={() => setSelected(null)} />
    </div>
  );
}

/**
 * Página de la lista (sin filtros, orden descendente por `seq`) donde está un evento: con `total`
 * eventos, el nº `seq` ocupa la posición `total - seq`.
 */
function pageParamFor(seq: number, total: number): Record<string, string> {
  const index = Math.max(0, total - seq);
  const page = Math.floor(index / PAGE_SIZE) + 1;
  return page > 1 ? { [PAGE_PARAM]: String(page) } : {};
}
