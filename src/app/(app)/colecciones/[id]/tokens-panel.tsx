"use client";

import { useState } from "react";
import { TOKEN_STATUSES, type Collection, type Token } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  ChainAddress,
  DataTable,
  EmptyState,
  ExplorerLink,
  Field,
  FilterBar,
  Input,
  Select,
  type DataTableColumn,
} from "@drinks-on-chain/ui";
import { TxStatus } from "@/components/chain/tx-ref";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { burnReasonLabel, tokenStatus } from "@/lib/platform/chain-labels";
import { useCollectionTokens } from "@/lib/platform/collections";
import { TOKEN_PARAMS as P, tokenFiltersFrom } from "@/lib/platform/collections-utils";
import { pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 50;
const ALL = "ALL";

const dash = <span className="text-fg-subtle">—</span>;

const COLUMNS: DataTableColumn<Token>[] = [
  {
    id: "bottle",
    header: "Botella n.º",
    accessor: "bottleNumber",
    numeric: true,
    cell: (t) => fmtNumber(t.bottleNumber),
  },
  {
    id: "tokenId",
    header: "Id en la red",
    accessor: "tokenId",
    numeric: true,
    cell: (t) => <span className="font-mono text-xs">{t.tokenId}</span>,
  },
  {
    id: "status",
    header: "Estado",
    accessor: "status",
    cell: (t) => {
      const status = tokenStatus(t.status);
      return (
        <span className="grid justify-items-start gap-0.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {t.burnReason && <span className="text-xs text-fg-muted">{burnReasonLabel(t.burnReason)}</span>}
        </span>
      );
    },
  },
  {
    id: "owner",
    header: "Dueño",
    accessor: (t) => t.owner.address,
    cell: (t) => (
      <span className="grid gap-0.5">
        <span className="text-xs text-fg-muted">{t.owner.kind === "WINERY" ? "Bodega" : "Consumidor"}</span>
        <ChainAddress value={t.owner.address} label={`Dueño de la botella ${t.bottleNumber}`} size="sm" />
      </span>
    ),
  },
  {
    id: "mintTx",
    header: "Emisión",
    accessor: (t) => t.mintTx.status,
    hideBelow: "lg",
    // Muchas filas: los cambios de estado no se anuncian uno a uno.
    cell: (t) => <TxStatus tx={t.mintTx} announce={false} />,
  },
  {
    id: "burn",
    header: "Quema",
    accessor: (t) => t.burnedAt ?? "",
    hideBelow: "xl",
    cell: (t) =>
      t.burnTx ? (
        <span className="grid gap-0.5">
          <TxStatus tx={t.burnTx} announce={false} />
          {t.burnedAt && (
            <time dateTime={t.burnedAt} className="text-xs text-fg-muted">
              {fmtDateTime(t.burnedAt)}
            </time>
          )}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "metadata",
    header: "Metadatos",
    hideBelow: "xl",
    cell: (t) => (
      <ExplorerLink href={t.metadataUrl} iconOnly>
        Metadatos públicos de la botella {t.bottleNumber}
      </ExplorerLink>
    ),
  },
];

/**
 * NFT por botella de una colección (§6.3), paginados de 50 en 50 con filtro por estado y por rango
 * de números de botella. Sin datos del consumidor: solo el tipo de dueño y su dirección.
 */
export function TokensPanel({ collection: c }: { collection: Collection }) {
  const url = useUrlParams();
  const filters = tokenFiltersFrom(url.get);
  const { offset } = pageFrom(new URLSearchParams({ pagina: url.get(P.page) ?? "" }), PAGE_SIZE);
  const tokens = useCollectionTokens(c.id, { ...filters, limit: PAGE_SIZE, offset });
  const page = tokens.data;
  const [range, setRange] = useState({ from: url.get(P.from) ?? "", to: url.get(P.to) ?? "" });
  const filtered = Boolean(filters.status || filters.fromNumber || filters.toNumber);
  const keep = { keepPage: true } as const;
  const clear = () => {
    setRange({ from: "", to: "" });
    url.set({ [P.status]: undefined, [P.from]: undefined, [P.to]: undefined, [P.page]: undefined }, keep);
  };

  const chips = [
    ...(filters.status ? [{ id: P.status, label: "Estado", value: tokenStatus(filters.status).label }] : []),
    ...(filters.fromNumber ? [{ id: P.from, label: "Desde la botella", value: fmtNumber(filters.fromNumber) }] : []),
    ...(filters.toNumber ? [{ id: P.to, label: "Hasta la botella", value: fmtNumber(filters.toNumber) }] : []),
  ];

  return (
    <section aria-labelledby="nft" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="nft" className="m-0 font-ui text-md font-semibold text-fg">
          NFT por botella
        </h2>
        <p className="max-w-2xl text-fg-muted">
          Un NFT por botella de la preventa. El número de botella es su posición en la colección, no el serial físico:
          el enlace con la botella real se hace en el canje.
        </p>
      </div>

      <FilterBar
        filters={chips}
        onRemove={(id) => {
          if (id === P.from) setRange((r) => ({ ...r, from: "" }));
          if (id === P.to) setRange((r) => ({ ...r, to: "" }));
          url.set({ [id]: undefined, [P.page]: undefined }, keep);
        }}
        onClearAll={chips.length ? clear : undefined}
        resultCount={page ? `${fmtNumber(page.total)} NFT` : undefined}
      >
        <Field label="Estado" className="w-48">
          <Select
            size="sm"
            value={filters.status ?? ALL}
            onValueChange={(v) => url.set({ [P.status]: v === ALL ? undefined : v, [P.page]: undefined }, keep)}
            options={[
              { value: ALL, label: "Todos" },
              ...TOKEN_STATUSES.map((s) => ({ value: s, label: tokenStatus(s).label })),
            ]}
          />
        </Field>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            url.set({ [P.from]: range.from.trim(), [P.to]: range.to.trim(), [P.page]: undefined }, keep);
          }}
        >
          <Field label="Desde la botella" className="w-36">
            <Input
              size="sm"
              numeric
              inputMode="numeric"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value.replace(/\D/g, "") }))}
            />
          </Field>
          <Field label="Hasta la botella" className="w-36">
            <Input
              size="sm"
              numeric
              inputMode="numeric"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value.replace(/\D/g, "") }))}
            />
          </Field>
          <Button type="submit" size="sm" variant="secondary">
            Aplicar el rango
          </Button>
        </form>
      </FilterBar>

      <DataTable
        caption={`NFT de ${c.name}`}
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(t) => t.id}
        loading={tokens.isPending}
        error={
          tokens.isError ? { description: errorMessage(tokens.error), onRetry: () => void tokens.refetch() } : undefined
        }
        empty={
          <EmptyState
            bare
            title={filtered ? "Ningún NFT coincide" : "Aún no hay NFT emitidos"}
            description={
              filtered
                ? "Prueba con otro estado o rango de botellas."
                : "Los NFT aparecen cuando la red confirma la emisión."
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
                onOffsetChange: (o) => url.set({ [P.page]: o === 0 ? undefined : String(o / PAGE_SIZE + 1) }, keep),
              }
            : undefined
        }
        columns={COLUMNS}
      />
    </section>
  );
}
