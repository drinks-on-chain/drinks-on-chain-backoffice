"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hand } from "lucide-react";
import {
  TOKENIZATION_REQUEST_KINDS,
  TOKENIZATION_REQUEST_STATUSES,
  type TokenizationRequestSummary,
} from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Select,
  StatusBadge,
  TextLink,
  getStatusBadge,
  toast,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { WineryFilter, useWineryName } from "@/components/winery-filter";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtAge, fmtDateTime, fmtNumber, hoursSince } from "@/lib/format";
import { requestKindLabel } from "@/lib/platform/chain-labels";
import { lotProductLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { explainRuleError } from "@/lib/platform/rule-errors";
import { useTakeTokenizationRequest, useTokenizationRequests } from "@/lib/platform/tokenization";
import {
  MINE,
  TOKENIZATION_PARAMS as P,
  isOpenRequest,
  requestActions,
  tokenizationFiltersFrom,
} from "@/lib/platform/tokenization-utils";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 20;
const ALL = "ALL";
/** A partir de dos días sin decidir, la antigüedad se resalta. */
const OLD_HOURS = 48;

const statusLabel = (status: string) => getStatusBadge("tokenizationRequest", status).label;

/**
 * 4C · Bandeja de solicitudes de tokenización (`TokenizationInbox`, contrato de la Ola 3 §5.4): las
 * que envían las bodegas desde el ERP. Sin filtro de estado, las abiertas, de la más antigua a la
 * más reciente. Filtros en la URL: estado, bodega, tipo, asignada y búsqueda.
 */
export function TokenizationInbox() {
  const me = useMe();
  const router = useRouter();
  const url = useUrlParams();
  const userId = me.data?.user.id;
  const filters = tokenizationFiltersFrom(url.get, userId);
  const mine = url.get(P.assignee) === MINE;
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const requests = useTokenizationRequests({ ...filters, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const page = requests.data;
  const manage = can(me.data, "tokenization.manage");
  const wineryName = useWineryName(filters.wineryId);

  const chips = [
    ...(filters.q ? [{ id: P.q, label: "Búsqueda", value: `«${filters.q}»` }] : []),
    ...(filters.status ? [{ id: P.status, label: "Estado", value: statusLabel(filters.status) }] : []),
    ...(filters.wineryId ? [{ id: P.winery, label: "Bodega", value: wineryName ?? "…" }] : []),
    ...(filters.kind ? [{ id: P.kind, label: "Tipo", value: requestKindLabel(filters.kind) }] : []),
    ...(mine ? [{ id: P.assignee, label: "Asignada", value: "A mí" }] : []),
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Tokenización"
        title="Solicitudes de tokenización"
        description="Lo que las bodegas autorizan emitir desde el ERP: tómalas, revisa el lote, completa los datos comerciales y el precio, y aprueba, pide cambios o rechaza con motivo."
      />
      {me.data && !manage && (
        <p className="text-fg-muted" role="note">
          Consulta en modo lectura: solo operaciones y administración tramitan las solicitudes de tokenización.
        </p>
      )}

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={chips.length ? () => url.clear() : undefined}
        resultCount={page ? `${fmtNumber(page.total)} ${page.total === 1 ? "solicitud" : "solicitudes"}` : undefined}
      >
        <SearchField
          label="Buscar"
          placeholder="Bodega, lote, referencia o código"
          value={url.get(P.q) ?? ""}
          onChange={(v) => url.set({ [P.q]: v })}
        />
        <Field label="Estado" className="w-48">
          <Select
            size="sm"
            value={filters.status ?? ALL}
            onValueChange={(v) => url.set({ [P.status]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Abiertas" },
              ...TOKENIZATION_REQUEST_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
            ]}
          />
        </Field>
        <WineryFilter value={filters.wineryId} onChange={(id) => url.set({ [P.winery]: id })} />
        <Field label="Tipo" className="w-48">
          <Select
            size="sm"
            value={filters.kind ?? ALL}
            onValueChange={(v) => url.set({ [P.kind]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Cualquiera" },
              ...TOKENIZATION_REQUEST_KINDS.map((k) => ({ value: k, label: requestKindLabel(k) })),
            ]}
          />
        </Field>
        <Field label="Asignada" className="w-40">
          <Select
            size="sm"
            value={mine ? MINE : ALL}
            onValueChange={(v) => url.set({ [P.assignee]: v === MINE ? MINE : undefined })}
            options={[
              { value: ALL, label: "Cualquiera" },
              { value: MINE, label: "A mí" },
            ]}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption="Solicitudes de tokenización"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(r) => r.id}
        loading={requests.isPending}
        onRowClick={(r) => router.push(`/tokenizacion/${r.id}`)}
        error={
          requests.isError
            ? { description: errorMessage(requests.error), onRetry: () => void requests.refetch() }
            : undefined
        }
        empty={
          <EmptyState
            bare
            title={chips.length ? "Ninguna solicitud coincide" : "No hay solicitudes abiertas"}
            description={
              chips.length
                ? "Prueba con otro estado, bodega o búsqueda."
                : "Cuando una bodega autorice la tokenización de un lote en el ERP, aparecerá aquí."
            }
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
        rowActions={(r) => (requestActions(r.status, manage).take ? <TakeButton request={r} /> : null)}
        columns={[
          {
            id: "lot",
            header: "Lote",
            accessor: (r) => r.lot.name,
            cell: (r) => (
              <div className="grid">
                <TextLink asChild variant="inline" className="font-medium">
                  <Link href={`/tokenizacion/${r.id}`} onClick={(e) => e.stopPropagation()}>
                    {r.lot.name}
                  </Link>
                </TextLink>
                <span className="text-xs text-fg-muted">
                  <span className="font-mono">{r.lot.reference}</span> · {lotProductLabel(r.lot.productType)}{" "}
                  {r.lot.harvestYear}
                </span>
              </div>
            ),
          },
          {
            id: "winery",
            header: "Bodega",
            accessor: (r) => r.winery.tradeName,
            cell: (r) => r.winery.tradeName,
          },
          {
            id: "kind",
            header: "Tipo",
            accessor: "kind",
            hideBelow: "lg",
            cell: (r) => (
              <Badge tone={r.kind === "QUOTA_INCREASE" ? "accent" : "neutral"}>{requestKindLabel(r.kind)}</Badge>
            ),
          },
          {
            id: "quantity",
            header: "Botellas",
            accessor: "quantity",
            numeric: true,
            cell: (r) => (
              <div className="grid justify-items-end">
                <span>{fmtNumber(r.quantity)}</span>
                {r.kind === "QUOTA_INCREASE" && (
                  <span className="text-xs text-fg-muted">cuota {fmtNumber(r.resultingQuota)}</span>
                )}
              </div>
            ),
          },
          {
            id: "status",
            header: "Estado",
            accessor: "status",
            cell: (r) => <StatusBadge kind="tokenizationRequest" status={r.status} />,
          },
          {
            id: "assignee",
            header: "Asignada",
            accessor: (r) => r.assignee?.fullName ?? "",
            hideBelow: "md",
            cell: (r) =>
              r.assignee ? (
                <span>
                  {r.assignee.fullName}
                  {r.assignee.userId === userId && <span className="text-xs text-fg-subtle"> (tú)</span>}
                </span>
              ) : (
                <span className="text-fg-subtle">Sin asignar</span>
              ),
          },
          {
            id: "age",
            header: "Antigüedad",
            accessor: "submittedAt",
            cell: (r) => <Age request={r} />,
          },
        ]}
      />
    </div>
  );
}

/** Tiempo desde que la bodega la envió; en las abiertas se resalta a partir de dos días. */
function Age({ request: r }: { request: TokenizationRequestSummary }) {
  const hours = hoursSince(r.submittedAt);
  const old = isOpenRequest(r.status) && hours >= OLD_HOURS;
  return (
    <time dateTime={r.submittedAt} title={`Enviada el ${fmtDateTime(r.submittedAt)}`} className="whitespace-nowrap">
      {old ? <Badge tone="warning">{fmtAge(hours)}</Badge> : fmtAge(hours)}
    </time>
  );
}

/** «Tomar» desde la bandeja: `SUBMITTED → IN_REVIEW`, asignada a quien la toma, y abre el detalle. */
function TakeButton({ request: r }: { request: TokenizationRequestSummary }) {
  const router = useRouter();
  const take = useTakeTokenizationRequest(r.id);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={take.isPending}
      iconStart={<Hand aria-hidden="true" className="size-4" />}
      onClick={(e) => {
        e.stopPropagation();
        take.mutate(undefined, {
          onSuccess: () => {
            toast({ title: "Solicitud tomada: ahora está en revisión y asignada a ti.", tone: "success" });
            router.push(`/tokenizacion/${r.id}`);
          },
          onError: (error) => toast({ title: explainRuleError(error).message, tone: "danger" }),
        });
      }}
    >
      Tomar<span className="sr-only"> la solicitud de {r.lot.name}</span>
    </Button>
  );
}
