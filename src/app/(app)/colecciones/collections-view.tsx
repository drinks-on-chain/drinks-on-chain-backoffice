"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";
import { MINT_STATUSES, SALE_STATES, TOKENIZATION_COLLECTION_STATUSES } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  ChainAddress,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Pagination,
  Pill,
  PillGroup,
  Select,
  Skeleton,
  TextLink,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { CollectionCard, CollectionStatusBadges, MintStatusBadge } from "@/components/tokenization/collection-card";
import { WineryFilter, useWineryName } from "@/components/winery-filter";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtBob, fmtNumber } from "@/lib/format";
import { collectionStatus, mintStatus, saleStateLabel } from "@/lib/platform/chain-labels";
import { useCollections, useOpenShortfalls } from "@/lib/platform/collections";
import { COLLECTION_PARAMS as P, collectionFiltersFrom, collectionsViewFrom } from "@/lib/platform/collections-utils";
import { can } from "@/lib/platform/permissions";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 20;
const ALL = "ALL";

/**
 * 4C · Colecciones (contrato de la Ola 3 §6): una por lote tokenizado, con su estado comercial, su
 * emisión y el contrato en el explorador. Vista de tarjetas o de tabla; filtros y vista en la URL.
 */
export function CollectionsView() {
  const me = useMe();
  const router = useRouter();
  const url = useUrlParams();
  const filters = collectionFiltersFrom(url.get);
  const view = collectionsViewFrom(url.get);
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const collections = useCollections({ ...filters, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const shortfalls = useOpenShortfalls(Boolean(me.data));
  const page = collections.data;
  const manage = can(me.data, "tokenization.manage");
  const wineryName = useWineryName(filters.wineryId);
  const filterKeys = [P.q, P.status, P.mintStatus, P.saleState, P.winery];
  const clear = () => url.set(Object.fromEntries(filterKeys.map((k) => [k, undefined])));
  const onOffsetChange = (o: number) => url.set({ [PAGE_PARAM]: String(o / PAGE_SIZE + 1) }, { keepPage: true });

  const chips = [
    ...(filters.q ? [{ id: P.q, label: "Búsqueda", value: `«${filters.q}»` }] : []),
    ...(filters.status ? [{ id: P.status, label: "Estado", value: collectionStatus(filters.status).label }] : []),
    ...(filters.mintStatus
      ? [{ id: P.mintStatus, label: "Emisión", value: mintStatus(filters.mintStatus).label }]
      : []),
    ...(filters.saleState ? [{ id: P.saleState, label: "Venta", value: saleStateLabel(filters.saleState) }] : []),
    ...(filters.wineryId ? [{ id: P.winery, label: "Bodega", value: wineryName ?? "…" }] : []),
  ];

  const empty = (
    <EmptyState
      bare
      title={chips.length ? "Ninguna colección coincide" : "Aún no hay colecciones"}
      description={
        chips.length
          ? "Prueba con otro estado, bodega o búsqueda."
          : "Una colección nace al aprobar una solicitud de tokenización en la bandeja."
      }
      action={
        chips.length ? (
          <Button variant="secondary" onClick={clear}>
            Limpiar filtros
          </Button>
        ) : (
          <Button asChild variant="secondary">
            <Link href="/tokenizacion">Ir a la bandeja de solicitudes</Link>
          </Button>
        )
      }
    />
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Tokenización"
        title="Colecciones"
        description="Los NFT emitidos de cada lote: publicar, pausar, reanudar y cerrar la venta, y seguir la emisión en la red. Ampliar la cuota lo pide la bodega desde el ERP y se aprueba en la bandeja."
        actions={
          <PillGroup label="Vista de las colecciones">
            <Pill
              pressed={view === "tarjetas"}
              onPressedChange={() => url.set({ [P.view]: undefined }, { keepPage: true })}
            >
              <LayoutGrid aria-hidden="true" className="size-4" /> Tarjetas
            </Pill>
            <Pill pressed={view === "tabla"} onPressedChange={() => url.set({ [P.view]: "tabla" }, { keepPage: true })}>
              <Rows3 aria-hidden="true" className="size-4" /> Tabla
            </Pill>
          </PillGroup>
        }
      />
      {me.data && !manage && (
        <p className="text-fg-muted" role="note">
          Consulta en modo lectura: solo operaciones y administración publican, pausan, cierran o editan colecciones.
        </p>
      )}

      {shortfalls.data && shortfalls.data.total > 0 && (
        <Alert tone="warning" title="Cierres con faltante sin decidir">
          <p>Hay lotes embotellados con menos botellas que NFT emitidos. Revisa cada cierre:</p>
          <ul className="mt-1 list-disc pl-5">
            {shortfalls.data.items.map((closure) => (
              <li key={closure.id}>
                <TextLink asChild variant="inline">
                  <Link href={`/colecciones/${closure.collectionId}?pestana=cierre`}>
                    Faltan {fmtNumber(closure.shortfall)} botellas ({fmtNumber(closure.minted)} NFT frente a{" "}
                    {fmtNumber(closure.bottles)} botellas)
                  </Link>
                </TextLink>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={chips.length ? clear : undefined}
        resultCount={page ? `${fmtNumber(page.total)} ${page.total === 1 ? "colección" : "colecciones"}` : undefined}
      >
        <SearchField
          label="Buscar"
          placeholder="Colección, bodega, lote o referencia"
          value={url.get(P.q) ?? ""}
          onChange={(v) => url.set({ [P.q]: v })}
        />
        <Field label="Estado" className="w-48">
          <Select
            size="sm"
            value={filters.status ?? ALL}
            onValueChange={(v) => url.set({ [P.status]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...TOKENIZATION_COLLECTION_STATUSES.map((s) => ({ value: s, label: collectionStatus(s).label })),
            ]}
          />
        </Field>
        <Field label="Emisión" className="w-40">
          <Select
            size="sm"
            value={filters.mintStatus ?? ALL}
            onValueChange={(v) => url.set({ [P.mintStatus]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Cualquiera" },
              ...MINT_STATUSES.map((s) => ({ value: s, label: mintStatus(s).label })),
            ]}
          />
        </Field>
        <Field label="Venta" className="w-40">
          <Select
            size="sm"
            value={filters.saleState ?? ALL}
            onValueChange={(v) => url.set({ [P.saleState]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Cualquiera" },
              ...SALE_STATES.map((s) => ({ value: s, label: saleStateLabel(s) })),
            ]}
          />
        </Field>
        <WineryFilter value={filters.wineryId} onChange={(id) => url.set({ [P.winery]: id })} />
      </FilterBar>

      {view === "tabla" ? (
        <DataTable
          caption="Colecciones"
          captionHidden
          density="compact"
          data={page?.items ?? []}
          getRowId={(c) => c.id}
          loading={collections.isPending}
          onRowClick={(c) => router.push(`/colecciones/${c.id}`)}
          error={
            collections.isError
              ? { description: errorMessage(collections.error), onRetry: () => void collections.refetch() }
              : undefined
          }
          empty={empty}
          pagination={
            page && page.total > PAGE_SIZE ? { total: page.total, limit: PAGE_SIZE, offset, onOffsetChange } : undefined
          }
          columns={[
            {
              id: "name",
              header: "Colección",
              accessor: "name",
              cell: (c) => (
                <div className="grid">
                  <TextLink asChild variant="inline" className="font-medium">
                    <Link href={`/colecciones/${c.id}`} onClick={(e) => e.stopPropagation()}>
                      {c.name}
                    </Link>
                  </TextLink>
                  <span className="font-mono text-xs text-fg-muted">{c.lot.reference}</span>
                </div>
              ),
            },
            { id: "winery", header: "Bodega", accessor: (c) => c.winery.tradeName, cell: (c) => c.winery.tradeName },
            {
              id: "status",
              header: "Estado",
              accessor: "status",
              cell: (c) => <CollectionStatusBadges collection={c} />,
            },
            {
              id: "mint",
              header: "Emisión",
              accessor: "mintStatus",
              cell: (c) => <MintStatusBadge collection={c} />,
            },
            {
              id: "minted",
              header: "Emitidos",
              accessor: (c) => c.counts.minted,
              numeric: true,
              cell: (c) => `${fmtNumber(c.counts.minted)} / ${fmtNumber(c.quota)}`,
            },
            {
              id: "available",
              header: "Disponibles",
              accessor: (c) => c.counts.available,
              numeric: true,
              hideBelow: "lg",
              cell: (c) => fmtNumber(c.counts.available),
            },
            {
              id: "price",
              header: "Precio",
              accessor: (c) => c.price?.amountMinor ?? -1,
              numeric: true,
              hideBelow: "lg",
              cell: (c) =>
                c.price ? fmtBob(c.price.amountMinor) : <span className="text-fg-subtle">Por anunciar</span>,
            },
            {
              id: "contract",
              header: "Contrato",
              accessor: (c) => c.contract.address,
              hideBelow: "xl",
              cell: (c) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <ChainAddress
                    value={c.contract.address}
                    label={`Contrato de ${c.name}`}
                    explorerUrl={c.contract.explorerUrl}
                    size="sm"
                  />
                </span>
              ),
            },
          ]}
        />
      ) : collections.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : collections.isError ? (
        <ErrorState
          title="No se pudieron cargar las colecciones"
          description={errorMessage(collections.error)}
          onRetry={() => void collections.refetch()}
        />
      ) : page && page.items.length === 0 ? (
        empty
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Colecciones">
            {page?.items.map((c) => (
              <li key={c.id} className="grid">
                <CollectionCard collection={c} />
              </li>
            ))}
          </ul>
          {page && page.total > PAGE_SIZE && (
            <Pagination
              total={page.total}
              limit={PAGE_SIZE}
              offset={offset}
              onOffsetChange={onOffsetChange}
              showRange
            />
          )}
        </>
      )}
    </div>
  );
}
