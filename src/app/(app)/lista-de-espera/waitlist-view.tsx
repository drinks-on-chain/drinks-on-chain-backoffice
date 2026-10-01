"use client";

import { useState } from "react";
import { Download, Eye } from "lucide-react";
import {
  WAITLIST_EXPORT_MAX_ROWS,
  WAITLIST_STATUSES,
  type WaitlistEntry,
  type WaitlistSource,
  type WaitlistType,
} from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  DataTable,
  DateRangePicker,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  lastDaysRange,
  toast,
  type DataTableColumn,
  type DateRange,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { saveFile } from "@/lib/platform/audit";
import { WAITLIST_STATUS_TONES, waitlistDrinkLabel, waitlistStatusLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { isExportTooLarge, useExportWaitlist, useWaitlist, useWaitlistSources } from "@/lib/platform/waitlist";
import {
  WAITLIST_PARAMS as P,
  WAITLIST_TABS,
  hasWaitlistFilters,
  tabOf,
  waitlistExportFilename,
  waitlistFiltersFrom,
  type WaitlistFilters,
} from "@/lib/platform/waitlist-utils";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";
import { WaitlistEntryPanel } from "./waitlist-entry-panel";

const PAGE_SIZE = 20;
const ALL = "ALL";

const total = (sources: WaitlistSource[] | undefined) => sources?.reduce((sum, s) => sum + s.count, 0);

const entries = (n: number) => `${fmtNumber(n)} ${n === 1 ? "inscripción" : "inscripciones"}`;

/**
 * O1b · Lista de espera (contrato O1b §2): inscripciones de consumidores (landing) y de bodegas
 * (sitio de bodegas) en dos pestañas, con filtros en la URL, detalle con seguimiento (contactar,
 * descartar, notas) y exportación CSV con los filtros activos. Soporte solo consulta.
 */
export function WaitlistView() {
  const me = useMe();
  const url = useUrlParams();
  const filters = waitlistFiltersFrom(url.get);
  const ready = Boolean(me.data);
  const canManage = can(me.data, "waitlist.manage");
  const exporter = useExportWaitlist();
  // Los orígenes de cada tipo dan las opciones del filtro y, sumados, el total de su pestaña.
  const sources = {
    CONSUMER: useWaitlistSources("CONSUMER", ready),
    WINERY: useWaitlistSources("WINERY", ready),
  } satisfies Record<WaitlistType, unknown>;

  async function onExport() {
    try {
      const file = await exporter.mutateAsync(filters);
      saveFile(file.blob, file.filename ?? waitlistExportFilename());
      toast({ title: `Lista de espera exportada: ${entries(file.rows)} en CSV.`, tone: "success" });
    } catch (error) {
      toast({
        title: isExportTooLarge(error)
          ? `La exportación supera las ${fmtNumber(WAITLIST_EXPORT_MAX_ROWS)} filas: acota las fechas o los filtros y vuelve a intentarlo.`
          : `No se pudo exportar: ${errorMessage(error)}`,
        tone: "danger",
      });
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Operación"
        title="Lista de espera"
        description="Personas y bodegas que pidieron enterarse del lanzamiento desde los sitios públicos: a quién se contactó, con qué resultado y de dónde llegó cada inscripción."
        actions={
          canManage ? (
            <Button
              variant="secondary"
              iconStart={<Download aria-hidden="true" className="size-4" />}
              loading={exporter.isPending}
              onClick={() => void onExport()}
            >
              Exportar CSV
            </Button>
          ) : null
        }
      />
      {me.data && !canManage && (
        <p className="text-fg-muted" role="note">
          Consulta en modo lectura: solo operaciones y administración contactan, descartan y exportan la lista.
        </p>
      )}

      <Tabs
        value={tabOf(filters.type)}
        // Los orígenes son distintos en cada pestaña: al cambiar se quita ese filtro (y la página).
        onValueChange={(tab) =>
          url.set({ [P.type]: tab === WAITLIST_TABS[0].value ? undefined : tab, [P.source]: undefined })
        }
      >
        <TabsList aria-label="Tipo de inscripción">
          {WAITLIST_TABS.map((t) => {
            const count = total(sources[t.type].data);
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {count !== undefined && <span className="tabular-nums"> ({fmtNumber(count)})</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {WAITLIST_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="grid gap-5 pt-1">
            <WaitlistList
              filters={{ ...filters, type: t.type }}
              sources={sources[t.type].data}
              enabled={ready}
              canManage={canManage}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Filtros, tabla y detalle de un tipo de inscripción (el contenido de una pestaña). */
function WaitlistList({
  filters,
  sources,
  enabled,
  canManage,
}: {
  filters: WaitlistFilters;
  sources: WaitlistSource[] | undefined;
  enabled: boolean;
  canManage: boolean;
}) {
  const url = useUrlParams();
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const list = useWaitlist({ ...filters, limit: PAGE_SIZE, offset }, enabled);
  const [selected, setSelected] = useState<WaitlistEntry | null>(null);
  const page = list.data;
  const winery = filters.type === "WINERY";
  const filtered = hasWaitlistFilters(filters);
  const clear = () => url.clear([P.type]);

  const range: DateRange = { from: filters.from ?? null, to: filters.to ?? null };
  const chips = [
    ...(filters.q ? [{ id: P.q, label: "Búsqueda", value: `«${filters.q}»` }] : []),
    ...(filters.status ? [{ id: P.status, label: "Estado", value: waitlistStatusLabel(filters.status) }] : []),
    ...(filters.source ? [{ id: P.source, label: "Origen", value: filters.source }] : []),
    ...(filters.from || filters.to
      ? [{ id: "fechas", label: "Fechas", value: `${filters.from ?? "el inicio"} – ${filters.to ?? "hoy"}` }]
      : []),
  ];

  // La API filtra por un origen exacto y no permite pedir «sin origen»: esa fila no es una opción.
  const named = (sources ?? []).flatMap((s) => (s.source ? [{ source: s.source, count: s.count }] : []));
  const sourceOptions = [
    { value: ALL, label: "Todos" },
    ...named.map((s) => ({ value: s.source, label: `${s.source} (${fmtNumber(s.count)})` })),
    ...(filters.source && !named.some((s) => s.source === filters.source)
      ? [{ value: filters.source, label: filters.source }]
      : []),
  ];

  const text = (value: string | null, className = "max-w-44") =>
    value ? (
      <span className={`block truncate ${className}`} title={value}>
        {value}
      </span>
    ) : (
      <span className="text-fg-subtle">—</span>
    );

  const position: DataTableColumn<WaitlistEntry> = {
    id: "position",
    header: "Orden",
    accessor: "position",
    numeric: true,
    width: "72px",
    cell: (e) => <span className="text-fg-subtle tabular-nums">{fmtNumber(e.position)}</span>,
  };
  const person = (header: string, hideBelow?: "md"): DataTableColumn<WaitlistEntry> => ({
    id: "fullName",
    header,
    accessor: "fullName",
    hideBelow,
    cell: (e) => (winery ? text(e.fullName) : <span className="font-medium">{text(e.fullName, "max-w-56")}</span>),
  });
  const email = (hideBelow: "md" | "lg"): DataTableColumn<WaitlistEntry> => ({
    id: "email",
    header: "Correo",
    accessor: "email",
    hideBelow,
    cell: (e) => text(e.email, "max-w-56"),
  });
  const phone = (hideBelow: "lg" | "xl"): DataTableColumn<WaitlistEntry> => ({
    id: "phone",
    header: "WhatsApp",
    accessor: (e) => e.phone ?? "",
    hideBelow,
    cell: (e) =>
      e.phone ? (
        <span className="whitespace-nowrap tabular-nums">{e.phone}</span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  });
  const tail: DataTableColumn<WaitlistEntry>[] = [
    {
      id: "source",
      header: "Origen",
      accessor: (e) => e.source ?? "",
      hideBelow: "xl",
      cell: (e) =>
        e.source ? (
          <span className="font-mono text-xs">{e.source}</span>
        ) : (
          <span className="text-fg-subtle">Sin origen</span>
        ),
    },
    {
      id: "createdAt",
      header: "Fecha",
      accessor: "createdAt",
      cell: (e) => (
        <time dateTime={e.createdAt} className="whitespace-nowrap tabular-nums">
          {fmtDateTime(e.createdAt)}
        </time>
      ),
    },
    {
      id: "status",
      header: "Estado",
      accessor: "status",
      cell: (e) => <Badge tone={WAITLIST_STATUS_TONES[e.status] ?? "neutral"}>{waitlistStatusLabel(e.status)}</Badge>,
    },
  ];

  const columns: DataTableColumn<WaitlistEntry>[] = winery
    ? [
        position,
        {
          id: "wineryName",
          header: "Bodega",
          accessor: (e) => e.wineryName ?? "",
          cell: (e) => <span className="font-medium">{text(e.wineryName, "max-w-56")}</span>,
        },
        person("Contacto", "md"),
        email("lg"),
        phone("xl"),
        {
          id: "region",
          header: "Región",
          accessor: (e) => e.region ?? "",
          hideBelow: "lg",
          cell: (e) => text(e.region),
        },
        {
          id: "produces",
          header: "Produce",
          accessor: (e) => e.produces ?? "",
          hideBelow: "xl",
          cell: (e) => waitlistDrinkLabel(e.produces),
        },
        ...tail,
      ]
    : [
        position,
        person("Nombre"),
        email("md"),
        phone("lg"),
        { id: "city", header: "Ciudad", accessor: (e) => e.city ?? "", hideBelow: "lg", cell: (e) => text(e.city) },
        {
          id: "interest",
          header: "Interés",
          accessor: (e) => e.interest ?? "",
          hideBelow: "xl",
          cell: (e) => waitlistDrinkLabel(e.interest),
        },
        ...tail,
      ];

  return (
    <>
      <FilterBar
        filters={chips}
        onRemove={(id) => url.set(id === "fechas" ? { [P.from]: undefined, [P.to]: undefined } : { [id]: undefined })}
        onClearAll={chips.length ? clear : undefined}
        resultCount={page ? entries(page.total) : undefined}
      >
        <SearchField
          label="Buscar"
          placeholder={winery ? "Bodega, contacto, correo o teléfono" : "Nombre, correo o teléfono"}
          // El texto de la URL tal cual (el campo lo sigue); la API recibe como mucho 200 caracteres.
          value={url.get(P.q) ?? ""}
          onChange={(v) => url.set({ [P.q]: v })}
        />
        <Field label="Estado" className="w-40">
          <Select
            size="sm"
            value={filters.status ?? ALL}
            onValueChange={(v) => url.set({ [P.status]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...WAITLIST_STATUSES.map((s) => ({ value: s, label: waitlistStatusLabel(s) })),
            ]}
          />
        </Field>
        <Field label="Origen" className="w-52">
          <Select
            size="sm"
            value={filters.source ?? ALL}
            onValueChange={(v) => url.set({ [P.source]: v === ALL ? undefined : v })}
            options={sourceOptions}
          />
        </Field>
        <DateRangePicker
          label="Fechas"
          size="sm"
          value={range}
          onValueChange={(next, error) => {
            if (!error) url.set({ [P.from]: next.from ?? undefined, [P.to]: next.to ?? undefined });
          }}
          presets={[
            { label: "7 días", range: lastDaysRange(7) },
            { label: "30 días", range: lastDaysRange(30) },
          ]}
        />
      </FilterBar>

      <DataTable
        caption={winery ? "Bodegas en la lista de espera" : "Consumidores en la lista de espera"}
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(e) => e.id}
        loading={list.isPending}
        activeRowId={selected?.id}
        onRowClick={setSelected}
        error={list.isError ? { description: errorMessage(list.error), onRetry: () => void list.refetch() } : undefined}
        empty={
          <EmptyState
            bare
            title={filtered ? "Ninguna inscripción coincide" : "Aún no hay inscripciones"}
            description={
              filtered
                ? "Prueba con otro estado, origen o fechas."
                : winery
                  ? "Cuando una bodega se apunte desde el sitio de bodegas, aparecerá aquí."
                  : "Cuando alguien se apunte desde la página principal, aparecerá aquí."
            }
            action={
              filtered ? (
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
        columns={columns}
        rowActions={(e) => (
          <IconButton
            size="sm"
            variant="ghost"
            label={`Ver la inscripción de ${e.wineryName ?? e.fullName}`}
            onClick={() => setSelected(e)}
          >
            <Eye aria-hidden="true" className="size-4" />
          </IconButton>
        )}
      />

      <WaitlistEntryPanel
        entry={selected}
        canManage={canManage}
        onUpdated={setSelected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
