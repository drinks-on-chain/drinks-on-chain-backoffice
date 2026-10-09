"use client";

import { useState, type FormEvent } from "react";
import { Play } from "lucide-react";
import {
  RECONCILIATION_DEPTHS,
  RECONCILIATION_SCOPES,
  RECONCILIATION_STATUSES,
  type ReconciliationDepth,
  type ReconciliationScope,
} from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Input,
  KeyValueList,
  Modal,
  ModalClose,
  Select,
  SkeletonText,
  SlideOver,
  toast,
} from "@drinks-on-chain/ui";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { useReconciliationRun, useReconciliationRuns, useStartReconciliation } from "@/lib/platform/chain";
import {
  reconciliationDepthLabel,
  reconciliationScopeLabel,
  reconciliationStatus,
  reconciliationTriggerLabel,
} from "@/lib/platform/chain-labels";
import { RUN_PARAMS as P, runStatusFrom } from "@/lib/platform/chain-utils";
import { can } from "@/lib/platform/permissions";
import { explainRuleError } from "@/lib/platform/rule-errors";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";
import { AlertList } from "../alert-list";

const PAGE_SIZE = 20;
const ALL = "ALL";

/**
 * Cadena · Conciliaciones (§8.2): comparan la base de datos con la red (total emitido, saldos,
 * dueños, quemas, pausas, cuotas, anclajes). Una diferencia nunca se corrige sola: abre una alerta.
 */
export function ReconciliationsView() {
  const me = useMe();
  const url = useUrlParams();
  const status = runStatusFrom(url.get);
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const runs = useReconciliationRuns({ status, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const [starting, setStarting] = useState(false);
  const page = runs.data;
  const openId = url.get(P.open);
  const manage = can(me.data, "chain.manage");
  const chips = status ? [{ id: P.status, label: "Estado", value: reconciliationStatus(status).label }] : [];

  return (
    <section aria-labelledby="conciliaciones" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="conciliaciones" className="m-0 font-ui text-md font-semibold text-fg">
            Conciliaciones con la red
          </h2>
          <p className="max-w-2xl text-fg-muted">
            Una ligera cada hora y una completa cada noche; también se lanzan a mano. Nunca corrigen datos: las
            diferencias se resuelven en «Alertas».
          </p>
        </div>
        {manage && (
          <Button iconStart={<Play aria-hidden="true" className="size-4" />} onClick={() => setStarting(true)}>
            Lanzar una conciliación
          </Button>
        )}
      </div>

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        resultCount={
          page ? `${fmtNumber(page.total)} ${page.total === 1 ? "conciliación" : "conciliaciones"}` : undefined
        }
      >
        <Field label="Estado" className="w-48">
          <Select
            size="sm"
            value={status ?? ALL}
            onValueChange={(v) => url.set({ [P.status]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...RECONCILIATION_STATUSES.map((s) => ({ value: s, label: reconciliationStatus(s).label })),
            ]}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption="Conciliaciones con la red"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(r) => r.id}
        loading={runs.isPending}
        activeRowId={openId ?? undefined}
        onRowClick={(r) => url.set({ [P.open]: r.id }, { keepPage: true })}
        error={runs.isError ? { description: errorMessage(runs.error), onRetry: () => void runs.refetch() } : undefined}
        empty={
          <EmptyState
            bare
            title={status ? "Ninguna conciliación coincide" : "Aún no hay conciliaciones"}
            description={status ? "Prueba con otro estado." : "La primera se ejecuta sola en la próxima hora."}
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
        rowActions={(r) => (
          <Button
            size="sm"
            variant="tertiary"
            onClick={(e) => {
              e.stopPropagation();
              url.set({ [P.open]: r.id }, { keepPage: true });
            }}
          >
            Ver<span className="sr-only"> la conciliación del {fmtDateTime(r.startedAt)}</span>
          </Button>
        )}
        columns={[
          {
            id: "started",
            header: "Inicio",
            accessor: "startedAt",
            cell: (r) => (
              <time dateTime={r.startedAt} className="whitespace-nowrap">
                {fmtDateTime(r.startedAt)}
              </time>
            ),
          },
          {
            id: "status",
            header: "Resultado",
            accessor: "status",
            cell: (r) => (
              <Badge tone={reconciliationStatus(r.status).tone}>{reconciliationStatus(r.status).label}</Badge>
            ),
          },
          {
            id: "scope",
            header: "Alcance",
            accessor: "scope",
            cell: (r) => `${reconciliationScopeLabel(r.scope)} · ${reconciliationDepthLabel(r.depth).toLowerCase()}`,
          },
          {
            id: "trigger",
            header: "Origen",
            accessor: "trigger",
            hideBelow: "md",
            cell: (r) => reconciliationTriggerLabel(r.trigger),
          },
          {
            id: "checks",
            header: "Comprobaciones",
            accessor: "checks",
            numeric: true,
            cell: (r) => fmtNumber(r.checks),
          },
          {
            id: "issues",
            header: "Alertas abiertas",
            accessor: "issuesOpened",
            numeric: true,
            cell: (r) =>
              r.issuesOpened > 0 ? (
                <Badge tone="warning">{fmtNumber(r.issuesOpened)}</Badge>
              ) : (
                <span className="text-fg-subtle">0</span>
              ),
          },
          {
            id: "auto",
            header: "Cerradas solas",
            accessor: "issuesAutoResolved",
            numeric: true,
            hideBelow: "lg",
            cell: (r) => fmtNumber(r.issuesAutoResolved),
          },
        ]}
      />

      <RunPanel id={openId} onClose={() => url.set({ [P.open]: undefined }, { keepPage: true })} />
      {starting && <StartDialog onClose={() => setStarting(false)} />}
    </section>
  );
}

function RunPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const run = useReconciliationRun(id);
  const r = run.data;
  return (
    <SlideOver
      open={id !== null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title="Conciliación"
      description={r ? `Iniciada el ${fmtDateTime(r.startedAt)}` : undefined}
    >
      {run.isPending && id !== null ? (
        <SkeletonText lines={6} />
      ) : run.isError ? (
        <ErrorState
          bare
          title="No se pudo cargar la conciliación"
          description={errorMessage(run.error)}
          onRetry={() => void run.refetch()}
        />
      ) : r ? (
        <div className="grid gap-6">
          <KeyValueList
            items={[
              {
                term: "Resultado",
                value: <Badge tone={reconciliationStatus(r.status).tone}>{reconciliationStatus(r.status).label}</Badge>,
              },
              { term: "Alcance", value: reconciliationScopeLabel(r.scope) },
              ...(r.subjectId
                ? [{ term: "Sujeto", value: <span className="font-mono text-xs break-all">{r.subjectId}</span> }]
                : []),
              { term: "Profundidad", value: reconciliationDepthLabel(r.depth) },
              { term: "Origen", value: reconciliationTriggerLabel(r.trigger) },
              {
                term: "Fin",
                value: r.finishedAt ? (
                  <time dateTime={r.finishedAt}>{fmtDateTime(r.finishedAt)}</time>
                ) : (
                  <span className="text-fg-subtle">En curso</span>
                ),
              },
              { term: "Comprobaciones", value: fmtNumber(r.checks) },
              {
                term: "Alertas",
                value: `${fmtNumber(r.issuesOpened)} abiertas · ${fmtNumber(r.issuesAutoResolved)} cerradas solas`,
              },
            ]}
          />
          <section className="grid gap-3">
            <SectionHeader title="Alertas de esta conciliación" level={3} />
            <AlertList alerts={r.alerts} label="Alertas de la conciliación" />
          </section>
        </div>
      ) : null}
    </SlideOver>
  );
}

/** Lanzar una conciliación a mano (202): de todo, de un contrato o de una colección. */
function StartDialog({ onClose }: { onClose: () => void }) {
  const start = useStartReconciliation();
  const [scope, setScope] = useState<ReconciliationScope>("ALL");
  const [depth, setDepth] = useState<ReconciliationDepth>("FULL");
  const [subjectId, setSubjectId] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const error = start.error ? explainRuleError(start.error, ["subjectId"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const needsSubject = scope !== "ALL";
    const invalid = needsSubject && !subjectId.trim() ? "Indica qué se concilia." : undefined;
    setProblem(invalid);
    if (invalid) return;
    start.mutate(
      { scope, depth, ...(needsSubject ? { subjectId: subjectId.trim() } : {}) },
      {
        onSuccess: (run) => {
          const result = reconciliationStatus(run.status).label.toLowerCase();
          toast({
            title:
              run.status === "RUNNING" ? "Conciliación lanzada: está en curso." : `Conciliación terminada: ${result}.`,
            tone: run.status === "DIFFERENCES" || run.status === "ERROR" ? "warning" : "success",
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
      size="sm"
      title="Lanzar una conciliación"
      description="Compara ahora la base de datos con la red. No corrige nada: si encuentra diferencias, abre alertas."
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </ModalClose>
          <Button type="submit" form="lanzar-conciliacion" loading={start.isPending}>
            Lanzar
          </Button>
        </>
      }
    >
      <form id="lanzar-conciliacion" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && !error.fieldErrors.subjectId && <RuleErrorAlert error={error} />}
        <Field label="Alcance" required>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as ReconciliationScope)}
            options={RECONCILIATION_SCOPES.map((s) => ({ value: s, label: reconciliationScopeLabel(s) }))}
          />
        </Field>
        {scope !== "ALL" && (
          <Field
            label={scope === "CONTRACT" ? "Contrato" : "Colección"}
            required
            error={problem ?? error?.fieldErrors.subjectId}
            help={scope === "CONTRACT" ? "Id del contrato de la bodega." : "Id de la colección (está en su dirección)."}
          >
            <Input value={subjectId} spellCheck={false} onChange={(e) => setSubjectId(e.target.value)} />
          </Field>
        )}
        <Field label="Profundidad" required help="La completa comprueba el dueño de todos los NFT vendidos.">
          <Select
            value={depth}
            onValueChange={(v) => setDepth(v as ReconciliationDepth)}
            options={RECONCILIATION_DEPTHS.map((d) => ({ value: d, label: reconciliationDepthLabel(d) }))}
          />
        </Field>
      </form>
    </Modal>
  );
}
