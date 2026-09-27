"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { APPLICATION_STATUSES, type WineryApplicationSummary } from "@drinks-on-chain/mocks";
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Select,
  StatusBadge,
  TextLink,
  getStatusBadge,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { useApplications } from "@/lib/platform/applications";
import { categoryLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { PAGE_PARAM, oneOf, pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 20;
const ALL = "ALL";
const MINE = "me";

/** 4B · Bandeja de solicitudes de alta (contrato de la Ola 1 §3). Filtros en la URL. */
export function ApplicationsView() {
  const me = useMe();
  const router = useRouter();
  const url = useUrlParams();
  const status = oneOf(APPLICATION_STATUSES, url.get("estado"));
  const mine = url.get("asignada") === MINE;
  const q = url.get("q") ?? "";
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const userId = me.data?.user.id;

  const applications = useApplications(
    { status, q: q || undefined, assigneeId: mine ? userId : undefined, limit: PAGE_SIZE, offset },
    Boolean(me.data),
  );
  const page = applications.data;
  const readOnly = me.data ? !can(me.data, "applications.manage") : false;

  const filters = [
    ...(status ? [{ id: "estado", label: "Estado", value: getStatusBadge("application", status).label }] : []),
    ...(mine ? [{ id: "asignada", label: "Asignada", value: "A mí" }] : []),
    ...(q ? [{ id: "q", label: "Búsqueda", value: `«${q}»` }] : []),
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Solicitudes"
        description="Solicitudes de alta que llegan desde el sitio de bodegas: tomarlas, hablar con la bodega y aprobar o rechazar con motivo."
      />
      {readOnly && (
        <p className="text-fg-muted" role="note">
          Consulta en modo lectura: solo operaciones y administración tramitan las solicitudes.
        </p>
      )}

      <FilterBar
        filters={filters}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={filters.length ? () => url.clear() : undefined}
        resultCount={page ? `${page.total} ${page.total === 1 ? "solicitud" : "solicitudes"}` : undefined}
      >
        <SearchField
          label="Buscar"
          placeholder="Nombre, NIT, contacto o región"
          value={q}
          onChange={(v) => url.set({ q: v })}
        />
        <Field label="Estado" className="w-48">
          <Select
            size="sm"
            value={status ?? ALL}
            onValueChange={(v) => url.set({ estado: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Verificadas (todas)" },
              ...APPLICATION_STATUSES.map((s) => ({ value: s, label: getStatusBadge("application", s).label })),
            ]}
          />
        </Field>
        <Field label="Asignada" className="w-40">
          <Select
            size="sm"
            value={mine ? MINE : ALL}
            onValueChange={(v) => url.set({ asignada: v === MINE ? MINE : undefined })}
            options={[
              { value: ALL, label: "Cualquiera" },
              { value: MINE, label: "A mí" },
            ]}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption="Solicitudes de alta"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(a) => a.id}
        loading={applications.isPending}
        onRowClick={(a) => router.push(`/solicitudes/${a.id}`)}
        error={
          applications.isError
            ? { description: "No se pudo cargar la bandeja.", onRetry: () => void applications.refetch() }
            : undefined
        }
        empty={
          <EmptyState
            bare
            title={filters.length ? "Ninguna solicitud coincide" : "No hay solicitudes"}
            description={
              filters.length
                ? "Prueba con otro estado o búsqueda."
                : "Cuando una bodega envíe el formulario y verifique su correo, aparecerá aquí."
            }
            action={
              filters.length ? (
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
            id: "winery",
            header: "Bodega",
            accessor: "tradeName",
            sortable: true,
            cell: (a) => (
              <div className="grid">
                <TextLink asChild variant="inline" className="font-medium">
                  <Link href={`/solicitudes/${a.id}`} onClick={(e) => e.stopPropagation()}>
                    {a.tradeName}
                  </Link>
                </TextLink>
                <span className="text-xs text-fg-muted">
                  {a.legalName} · NIT {a.taxId}
                </span>
              </div>
            ),
          },
          {
            id: "region",
            header: "Región",
            accessor: "region",
            sortable: true,
            hideBelow: "lg",
            cell: (a) => (
              <div className="grid">
                <span>{a.region}</span>
                <span className="text-xs text-fg-muted">{categoryLabel(a.category)}</span>
              </div>
            ),
          },
          {
            id: "contact",
            header: "Contacto",
            accessor: "contactName",
            hideBelow: "md",
            cell: (a) => (
              <div className="grid">
                <span>{a.contactName}</span>
                <span className="text-xs text-fg-muted">{a.contactEmail}</span>
              </div>
            ),
          },
          {
            id: "status",
            header: "Estado",
            accessor: "status",
            sortable: true,
            cell: (a) => <ApplicationStatusCell application={a} />,
          },
          {
            id: "assignee",
            header: "Asignada",
            accessor: (a) => a.assignee?.fullName ?? "",
            sortable: true,
            cell: (a) =>
              a.assignee ? (
                <span>
                  {a.assignee.fullName}
                  {a.assignee.userId === userId && <span className="text-xs text-fg-subtle"> (tú)</span>}
                </span>
              ) : (
                <span className="text-fg-subtle">Sin asignar</span>
              ),
          },
          {
            id: "created",
            header: "Recibida",
            accessor: "createdAt",
            sortable: true,
            hideBelow: "md",
            cell: (a) => (
              <time dateTime={a.createdAt} title={fmtDateTime(a.createdAt)}>
                {fmtRelative(a.createdAt)}
              </time>
            ),
          },
        ]}
      />
    </div>
  );
}

function ApplicationStatusCell({ application: a }: { application: WineryApplicationSummary }) {
  return (
    <div className="grid justify-items-start gap-0.5">
      <StatusBadge kind="application" status={a.status} />
      {a.status === "MEETING_SCHEDULED" && a.meeting && (
        <span className="text-xs text-fg-muted">
          <time dateTime={a.meeting.scheduledAt}>{fmtDateTime(a.meeting.scheduledAt)}</time>
        </span>
      )}
    </div>
  );
}
