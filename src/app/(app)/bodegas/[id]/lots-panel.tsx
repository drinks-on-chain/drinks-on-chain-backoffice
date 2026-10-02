"use client";

import { ExternalLink } from "lucide-react";
import { LOT_STAGE_CODES, type LotSummary, type WineryDetail } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Select,
  TextLink,
  type DataTableColumn,
} from "@drinks-on-chain/ui";
import { SearchField } from "@/components/search-field";
import { errorMessage } from "@/lib/api/errors";
import { fmtNumber } from "@/lib/format";
import { links } from "@/lib/links";
import {
  LAB_STATUS_TONES,
  LOT_STAGE_TONES,
  labStatusLabel,
  lotProductLabel,
  lotStageLabel,
} from "@/lib/platform/labels";
import { LOT_PARAMS as P, hasLotFilters, lockLabel, lotFiltersFrom, useWineryLots } from "@/lib/platform/lots";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 20;
const ALL = "ALL";

/** Solo desde 2xl: en pantallas más estrechas la tabla cabe sin desplazarse. */
const WIDE = { className: "max-2xl:hidden", headerClassName: "max-2xl:hidden" };

const dash = <span className="text-fg-subtle">—</span>;

const COLUMNS: DataTableColumn<LotSummary>[] = [
  {
    id: "reference",
    header: "Referencia",
    accessor: "reference",
    cell: (l) => <span className="font-mono text-xs whitespace-nowrap">{l.reference}</span>,
  },
  {
    id: "name",
    header: "Nombre",
    accessor: "name",
    cell: (l) => (
      <span className="block max-w-56 truncate font-medium" title={l.name}>
        {l.name}
      </span>
    ),
  },
  { id: "type", header: "Tipo", accessor: (l) => lotProductLabel(l.productType), hideBelow: "lg" },
  {
    id: "stage",
    header: "Etapa",
    accessor: "stage",
    cell: (l) => <Badge tone={LOT_STAGE_TONES[l.stage] ?? "neutral"}>{lotStageLabel(l.stage)}</Badge>,
  },
  {
    id: "lock",
    header: "Candado siguiente",
    accessor: (l) => l.nextLock?.unlockDate ?? "",
    hideBelow: "xl",
    cell: (l) => lockLabel(l.nextLock) ?? dash,
  },
  {
    id: "bottles",
    header: "Botellas",
    accessor: (l) => l.bottles ?? -1,
    numeric: true,
    hideBelow: "md",
    cell: (l) => (l.bottles === null ? dash : fmtNumber(l.bottles)),
  },
  {
    id: "lab",
    header: "Laboratorio",
    accessor: "labStatus",
    cell: (l) => <Badge tone={LAB_STATUS_TONES[l.labStatus] ?? "neutral"}>{labStatusLabel(l.labStatus)}</Badge>,
    ...WIDE,
  },
  {
    id: "lotCode",
    header: "Código de lote",
    accessor: (l) => l.lotCode ?? "",
    hideBelow: "lg",
    cell: (l) => <LotCode lot={l} />,
  },
  {
    id: "issues",
    header: "Incidencias abiertas",
    accessor: "complianceIssuesOpen",
    numeric: true,
    cell: (l) =>
      l.complianceIssuesOpen > 0 ? (
        <Badge tone="warning">{fmtNumber(l.complianceIssuesOpen)}</Badge>
      ) : (
        <span className="text-fg-subtle">0</span>
      ),
  },
];

/** Código de lote de la etiqueta y, con el Marketplace configurado, su pasaporte público. */
function LotCode({ lot }: { lot: LotSummary }) {
  if (!lot.lotCode) return dash;
  const passport = links.passport(lot.lotCode);
  return (
    <span className="grid gap-0.5">
      <span className="font-mono text-xs whitespace-nowrap">{lot.lotCode}</span>
      {passport && (
        <TextLink
          variant="inline"
          href={passport}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs whitespace-nowrap"
        >
          Ver pasaporte público
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only"> de {lot.lotCode} (se abre en otra pestaña)</span>
        </TextLink>
      )}
    </span>
  );
}

/**
 * Ola 2 · Lotes de la bodega, en solo lectura (contrato de la Ola 2 §17 y §20): la trazabilidad la
 * registra la bodega en el ERP y la plataforma solo la consulta. Etapa y búsqueda en la URL.
 */
export function LotsPanel({ winery }: { winery: WineryDetail }) {
  const url = useUrlParams();
  const filters = lotFiltersFrom(url.get);
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const lots = useWineryLots(winery.id, { ...filters, limit: PAGE_SIZE, offset });
  const page = lots.data;
  const filtered = hasLotFilters(filters);
  const clear = () => url.set({ [P.stage]: undefined, [P.q]: undefined });

  const chips = [
    ...(filters.q ? [{ id: P.q, label: "Búsqueda", value: `«${filters.q}»` }] : []),
    ...(filters.stage ? [{ id: P.stage, label: "Etapa", value: lotStageLabel(filters.stage) }] : []),
  ];

  return (
    <section aria-labelledby="lotes" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="lotes" className="m-0 font-ui text-md font-semibold text-fg">
          Lotes
        </h2>
        <p className="max-w-2xl text-fg-muted" role="note">
          Solo lectura: la trazabilidad la registra la bodega en el ERP y la plataforma no la modifica. Cada lote
          conserva las reglas con las que se creó.
        </p>
      </div>

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={chips.length ? clear : undefined}
        resultCount={page ? `${fmtNumber(page.total)} ${page.total === 1 ? "lote" : "lotes"}` : undefined}
      >
        <SearchField
          label="Buscar"
          className="w-72"
          placeholder="Nombre, referencia o código de lote"
          value={url.get(P.q) ?? ""}
          onChange={(v) => url.set({ [P.q]: v })}
        />
        <Field label="Etapa" className="w-48">
          <Select
            size="sm"
            value={filters.stage ?? ALL}
            onValueChange={(v) => url.set({ [P.stage]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todas" },
              ...LOT_STAGE_CODES.map((s) => ({ value: s, label: lotStageLabel(s) })),
            ]}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption={`Lotes de ${winery.tradeName}`}
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(l) => l.id}
        loading={lots.isPending}
        error={lots.isError ? { description: errorMessage(lots.error), onRetry: () => void lots.refetch() } : undefined}
        empty={
          <EmptyState
            bare
            title={filtered ? "Ningún lote coincide" : "Esta bodega aún no tiene lotes"}
            description={
              filtered
                ? "Prueba con otra etapa o búsqueda."
                : "Cuando la bodega cree su primer lote en el ERP, aparecerá aquí."
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
        columns={COLUMNS}
      />
    </section>
  );
}
