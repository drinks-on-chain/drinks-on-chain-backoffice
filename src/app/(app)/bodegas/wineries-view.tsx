"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { WINERY_CATEGORIES, WINERY_STATUSES } from "@drinks-on-chain/mocks";
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
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { useMe } from "@/lib/auth/hooks";
import { fmtDate, fmtNumber } from "@/lib/format";
import { categoryLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { useWineries } from "@/lib/platform/wineries";
import { PAGE_PARAM, oneOf, pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 20;
const ALL = "ALL";

/** 4B · Directorio de bodegas (contrato de la Ola 1 §4) con filtros en la URL y alta directa. */
export function WineriesView() {
  const me = useMe();
  const router = useRouter();
  const url = useUrlParams();
  const status = oneOf(WINERY_STATUSES, url.get("estado"));
  const category = oneOf(WINERY_CATEGORIES, url.get("categoria"));
  const region = url.get("region") ?? "";
  const q = url.get("q") ?? "";
  const { offset } = pageFrom(url.params, PAGE_SIZE);

  const wineries = useWineries(
    { status, category, region: region || undefined, q: q || undefined, limit: PAGE_SIZE, offset },
    Boolean(me.data),
  );
  const page = wineries.data;

  const filters = [
    ...(status ? [{ id: "estado", label: "Estado", value: getStatusBadge("winery", status).label }] : []),
    ...(category ? [{ id: "categoria", label: "Categoría", value: categoryLabel(category) }] : []),
    ...(region ? [{ id: "region", label: "Región", value: region }] : []),
    ...(q ? [{ id: "q", label: "Búsqueda", value: `«${q}»` }] : []),
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Bodegas"
        description="Bodegas socias: su estado, su dueño y su equipo. El alta directa invita al dueño por correo; nunca se envían contraseñas."
        actions={
          can(me.data, "wineries.create") ? (
            <Button asChild iconStart={<Building2 aria-hidden="true" className="size-4" />}>
              <Link href="/bodegas/nueva">Nueva bodega</Link>
            </Button>
          ) : null
        }
      />

      <FilterBar
        filters={filters}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={filters.length ? () => url.clear() : undefined}
        resultCount={page ? `${page.total} ${page.total === 1 ? "bodega" : "bodegas"}` : undefined}
      >
        <SearchField
          label="Buscar"
          placeholder="Nombre, razón social o NIT"
          value={q}
          onChange={(v) => url.set({ q: v })}
        />
        <Field label="Estado" className="w-40">
          <Select
            size="sm"
            value={status ?? ALL}
            onValueChange={(v) => url.set({ estado: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...WINERY_STATUSES.map((s) => ({ value: s, label: getStatusBadge("winery", s).label })),
            ]}
          />
        </Field>
        <Field label="Categoría" className="w-44">
          <Select
            size="sm"
            value={category ?? ALL}
            onValueChange={(v) => url.set({ categoria: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todas" },
              ...WINERY_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
            ]}
          />
        </Field>
        <SearchField
          label="Región"
          placeholder="Tarija, Cinti…"
          value={region}
          className="w-44"
          onChange={(v) => url.set({ region: v })}
        />
      </FilterBar>

      <DataTable
        caption="Directorio de bodegas"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(w) => w.id}
        loading={wineries.isPending}
        onRowClick={(w) => router.push(`/bodegas/${w.id}`)}
        error={
          wineries.isError
            ? { description: "No se pudo cargar el directorio.", onRetry: () => void wineries.refetch() }
            : undefined
        }
        empty={
          <EmptyState
            bare
            title={filters.length ? "Ninguna bodega coincide" : "Aún no hay bodegas"}
            description={
              filters.length ? "Prueba con otros filtros." : "Aprueba una solicitud o da de alta una bodega."
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
            cell: (w) => (
              <div className="grid">
                <TextLink asChild variant="inline" className="font-medium">
                  <Link href={`/bodegas/${w.id}`} onClick={(e) => e.stopPropagation()}>
                    {w.tradeName}
                  </Link>
                </TextLink>
                <span className="text-xs text-fg-muted">
                  {w.legalName} · NIT {w.taxId}
                </span>
              </div>
            ),
          },
          {
            id: "region",
            header: "Región",
            accessor: "region",
            sortable: true,
            hideBelow: "md",
            cell: (w) => (
              <div className="grid">
                <span>{w.region}</span>
                <span className="text-xs text-fg-muted">{categoryLabel(w.category)}</span>
              </div>
            ),
          },
          {
            id: "status",
            header: "Estado",
            accessor: "status",
            sortable: true,
            cell: (w) => <StatusBadge kind="winery" status={w.status} />,
          },
          {
            id: "prefix",
            header: "Prefijo",
            accessor: (w) => w.lotPrefix ?? "",
            sortable: true,
            cell: (w) =>
              w.lotPrefix ? (
                <Badge tone="neutral" className="font-mono">
                  {w.lotPrefix}
                </Badge>
              ) : (
                <span className="text-fg-subtle" title="Se asigna al activarse">
                  —
                </span>
              ),
          },
          {
            id: "owner",
            header: "Dueño",
            accessor: (w) => w.owner?.fullName ?? "",
            hideBelow: "lg",
            cell: (w) =>
              w.owner ? (
                <div className="grid">
                  <span>{w.owner.fullName}</span>
                  <span className="text-xs text-fg-muted">
                    {w.owner.userId ? w.owner.email : `Invitación pendiente · ${w.owner.email}`}
                  </span>
                </div>
              ) : (
                <span className="text-fg-subtle">Sin dueño</span>
              ),
          },
          {
            id: "members",
            header: "Equipo",
            accessor: "membersCount",
            numeric: true,
            sortable: true,
            hideBelow: "lg",
            cell: (w) => fmtNumber(w.membersCount),
          },
          {
            id: "created",
            header: "Alta",
            accessor: "createdAt",
            sortable: true,
            hideBelow: "xl",
            cell: (w) => <time dateTime={w.createdAt}>{fmtDate(w.createdAt)}</time>,
          },
        ]}
      />
    </div>
  );
}
