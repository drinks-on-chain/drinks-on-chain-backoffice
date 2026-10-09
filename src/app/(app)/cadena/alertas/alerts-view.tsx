"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CHAIN_ALERT_LEVELS, type ChainAlert } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  KeyValueList,
  Select,
  SlideOver,
  StatusBadge,
  TextLink,
  Textarea,
  getStatusBadge,
  toast,
} from "@drinks-on-chain/ui";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { SectionHeader } from "@/components/section-header";
import { WineryFilter } from "@/components/winery-filter";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber, fmtRelative } from "@/lib/format";
import { useChainAlerts, useResolveChainAlert } from "@/lib/platform/chain";
import { ALERT_CODE_OPTIONS, alertCodeLabel, alertHelp } from "@/lib/platform/chain-labels";
import { ALERT_PARAMS as P, RUN_PARAMS, alertFiltersFrom, validateResolutionNote } from "@/lib/platform/chain-utils";
import { can } from "@/lib/platform/permissions";
import { explainRuleError } from "@/lib/platform/rule-errors";
import { useAllWineries } from "@/lib/platform/wineries";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";
import { AlertSubject, AlertValue } from "../alert-list";

const PAGE_SIZE = 20;
const ALL = "ALL";
const STATUS_LABELS = { open: "Abiertas", resolved: "Resueltas", todas: "Todas" } as const;

const levelLabel = (level: string) => getStatusBadge("alert", level).label;

/**
 * Cadena · Alertas (§8.2): diferencias entre la base y la red, transacciones fallidas o atascadas,
 * saldos bajos y eventos no originados por el sistema. Por defecto, las abiertas. Se resuelven a
 * mano con una nota de qué se comprobó; nunca se corrige nada automáticamente.
 */
export function AlertsView() {
  const me = useMe();
  const url = useUrlParams();
  const filters = alertFiltersFrom(url.get);
  const statusKey = filters.status ?? "todas";
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const alerts = useChainAlerts({ ...filters, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const wineries = useAllWineries(Boolean(me.data));
  const [openId, setOpenId] = useState<string | null>(null);
  const page = alerts.data;
  const open = page?.items.find((a) => a.id === openId) ?? null;
  const manage = can(me.data, "chain.manage");
  const wineryName = (id: string | null) => (id ? (wineries.data?.find((w) => w.id === id)?.tradeName ?? null) : null);
  const clear = () =>
    url.set({ [P.status]: undefined, [P.level]: undefined, [P.code]: undefined, [P.winery]: undefined });

  const chips = [
    ...(statusKey !== "open" ? [{ id: P.status, label: "Estado", value: STATUS_LABELS[statusKey] }] : []),
    ...(filters.level ? [{ id: P.level, label: "Nivel", value: levelLabel(filters.level) }] : []),
    ...(filters.code ? [{ id: P.code, label: "Código", value: alertCodeLabel(filters.code) }] : []),
    ...(filters.wineryId ? [{ id: P.winery, label: "Bodega", value: wineryName(filters.wineryId) ?? "…" }] : []),
  ];

  return (
    <section aria-labelledby="alertas" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="alertas" className="m-0 font-ui text-md font-semibold text-fg">
          Alertas de la cadena
        </h2>
        {me.data && !manage && (
          <p className="text-fg-muted" role="note">
            Consulta en modo lectura: las alertas las resuelven operaciones y administración.
          </p>
        )}
      </div>

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={chips.length ? clear : undefined}
        resultCount={page ? `${fmtNumber(page.total)} ${page.total === 1 ? "alerta" : "alertas"}` : undefined}
      >
        <Field label="Estado" className="w-40">
          <Select
            size="sm"
            value={statusKey}
            onValueChange={(v) => url.set({ [P.status]: v === "open" ? undefined : v })}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Nivel" className="w-40">
          <Select
            size="sm"
            value={filters.level ?? ALL}
            onValueChange={(v) => url.set({ [P.level]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...CHAIN_ALERT_LEVELS.map((l) => ({ value: l, label: levelLabel(l) })),
            ]}
          />
        </Field>
        <Field label="Código" className="w-72">
          <Select
            size="sm"
            value={filters.code ?? ALL}
            onValueChange={(v) => url.set({ [P.code]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...ALERT_CODE_OPTIONS,
              // Un código nuevo del backend que llegó por la URL se conserva.
              ...(filters.code && !ALERT_CODE_OPTIONS.some((o) => o.value === filters.code)
                ? [{ value: filters.code, label: filters.code }]
                : []),
            ]}
          />
        </Field>
        <WineryFilter value={filters.wineryId} onChange={(id) => url.set({ [P.winery]: id })} />
      </FilterBar>

      <DataTable
        caption="Alertas de la cadena"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(a) => a.id}
        loading={alerts.isPending}
        activeRowId={openId ?? undefined}
        onRowClick={(a) => setOpenId(a.id)}
        error={
          alerts.isError ? { description: errorMessage(alerts.error), onRetry: () => void alerts.refetch() } : undefined
        }
        empty={
          <EmptyState
            bare
            title={chips.length ? "Ninguna alerta coincide" : "Sin alertas abiertas"}
            description={
              chips.length
                ? "Prueba con otro estado, nivel o código."
                : "La base de datos y la red coinciden: todo en orden."
            }
            action={
              chips.length ? (
                <Button variant="secondary" onClick={clear}>
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
        rowActions={(a) => (
          <Button
            size="sm"
            variant={manage && !a.resolvedAt ? "secondary" : "tertiary"}
            onClick={(e) => {
              e.stopPropagation();
              setOpenId(a.id);
            }}
          >
            {manage && !a.resolvedAt ? "Resolver" : "Ver"}
            <span className="sr-only">: {alertCodeLabel(a.code)}</span>
          </Button>
        )}
        columns={[
          {
            id: "level",
            header: "Nivel",
            accessor: "level",
            cell: (a) => <StatusBadge kind="alert" status={a.level} />,
          },
          {
            id: "code",
            header: "Alerta",
            accessor: "code",
            cell: (a) => (
              <div className="grid">
                <span className="font-medium">{alertCodeLabel(a.code)}</span>
                <span className="text-xs text-fg-muted">{a.message}</span>
              </div>
            ),
          },
          {
            id: "subject",
            header: "Sobre",
            accessor: (a) => a.subject.type,
            hideBelow: "md",
            cell: (a) => (
              <span className="grid">
                <AlertSubject alert={a} />
                {a.wineryId && <span className="text-xs text-fg-muted">{wineryName(a.wineryId)}</span>}
              </span>
            ),
          },
          {
            id: "detected",
            header: "Detectada",
            accessor: "detectedAt",
            cell: (a) => (
              <time dateTime={a.detectedAt} title={fmtDateTime(a.detectedAt)} className="whitespace-nowrap">
                {fmtRelative(a.detectedAt)}
              </time>
            ),
          },
          {
            id: "state",
            header: "Estado",
            accessor: (a) => a.resolvedAt ?? "",
            hideBelow: "lg",
            cell: (a) =>
              a.resolvedAt ? (
                <span className="grid">
                  <span>{a.resolution?.auto ? "Cerrada sola" : "Resuelta"}</span>
                  <span className="text-xs text-fg-muted">{a.resolution?.by}</span>
                </span>
              ) : (
                "Abierta"
              ),
          },
        ]}
      />

      <AlertPanel alert={open} manage={manage} wineryName={wineryName} onClose={() => setOpenId(null)} />
    </section>
  );
}

/** Detalle de una alerta: lo que dice la base frente a la red, y su resolución con nota. */
function AlertPanel({
  alert: a,
  manage,
  wineryName,
  onClose,
}: {
  alert: ChainAlert | null;
  manage: boolean;
  wineryName: (id: string | null) => string | null;
  onClose: () => void;
}) {
  return (
    <SlideOver
      open={a !== null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={a ? alertCodeLabel(a.code) : "Alerta"}
      description={a ? `Detectada el ${fmtDateTime(a.detectedAt)}` : undefined}
    >
      {a && (
        <div className="grid gap-6">
          <div className="grid gap-2">
            <StatusBadge kind="alert" status={a.level} />
            <p>{a.message}</p>
            {alertHelp(a.code) && <p className="text-fg-muted">{alertHelp(a.code)}</p>}
          </div>
          <KeyValueList
            items={[
              { term: "Código", value: <span className="font-mono text-xs">{a.code}</span> },
              { term: "Sobre", value: <AlertSubject alert={a} /> },
              {
                term: "Bodega",
                value: a.wineryId ? (
                  <TextLink asChild variant="inline">
                    <Link href={`/bodegas/${a.wineryId}?pestana=cadena`}>
                      {wineryName(a.wineryId) ?? "Ver la bodega"}
                    </Link>
                  </TextLink>
                ) : (
                  <span className="text-fg-subtle">Plataforma</span>
                ),
              },
              { term: "Lo que dice la base", value: <AlertValue value={a.expected} label="Lo que dice la base" /> },
              { term: "Lo que dice la red", value: <AlertValue value={a.actual} label="Lo que dice la red" /> },
              {
                term: "Conciliación",
                value: a.runId ? (
                  <TextLink asChild variant="inline">
                    <Link href={`/cadena/conciliaciones?${RUN_PARAMS.open}=${a.runId}`}>Ver la conciliación</Link>
                  </TextLink>
                ) : (
                  <span className="text-fg-subtle">No viene de una conciliación</span>
                ),
              },
            ]}
          />
          {a.resolvedAt && a.resolution ? (
            <section className="grid gap-3">
              <SectionHeader title={a.resolution.auto ? "Cerrada sola" : "Resuelta"} level={3} />
              <KeyValueList
                items={[
                  { term: "Por", value: a.resolution.by },
                  { term: "Cuándo", value: <time dateTime={a.resolvedAt}>{fmtDateTime(a.resolvedAt)}</time> },
                  { term: "Nota", value: <span className="whitespace-pre-line">{a.resolution.note}</span> },
                ]}
              />
            </section>
          ) : manage ? (
            <ResolveForm key={a.id} alert={a} onDone={onClose} />
          ) : (
            <Alert tone="info">Consulta en modo lectura: las alertas las resuelven operaciones y administración.</Alert>
          )}
        </div>
      )}
    </SlideOver>
  );
}

function ResolveForm({ alert: a, onDone }: { alert: ChainAlert; onDone: () => void }) {
  const resolve = useResolveChainAlert();
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const error = resolve.error ? explainRuleError(resolve.error, ["note"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateResolutionNote(note);
    setProblem(invalid);
    if (invalid) return;
    resolve.mutate(
      { id: a.id, note: note.trim() },
      {
        onSuccess: () => {
          toast({ title: "Alerta resuelta.", tone: "success" });
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <SectionHeader
        title="Resolver la alerta"
        level={3}
        description="Resolverla no cambia ningún dato: deja constancia de qué se comprobó y cómo se arregló."
      />
      {error && !error.fieldErrors.note && <RuleErrorAlert error={error} />}
      <Field
        label="Nota de resolución"
        required
        error={problem ?? error?.fieldErrors.note}
        help="Entre 3 y 500 caracteres. Queda en la bitácora."
      >
        <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={resolve.isPending}>
          Resolver la alerta
        </Button>
      </div>
    </form>
  );
}
