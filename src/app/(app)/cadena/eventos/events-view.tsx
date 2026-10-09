"use client";

import { useState } from "react";
import Link from "next/link";
import type { ChainEvent } from "@drinks-on-chain/mocks";
import {
  Badge,
  Button,
  ChainAddress,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  KeyValueList,
  Select,
  SlideOver,
  TextLink,
} from "@drinks-on-chain/ui";
import { JsonBlock } from "@/components/chain/json-block";
import { SearchField } from "@/components/search-field";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDate, fmtDateTime, fmtNumber, shortHash } from "@/lib/format";
import { useChainEvents } from "@/lib/platform/chain";
import { networkLabel } from "@/lib/platform/chain-labels";
import { EVENT_PARAMS as P, EVENT_TYPES, eventFiltersFrom, transactionsHref } from "@/lib/platform/chain-utils";
import { useAllWineries } from "@/lib/platform/wineries";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";

const PAGE_SIZE = 50;
const ALL = "ALL";
const FILTER_KEYS = Object.values(P);

/**
 * Cadena · Eventos de los contratos que lee el indexador (§8.1). Todo evento sin transacción propia
 * (no originado por el sistema) abre una alerta crítica; el indexador nunca corrige la base.
 */
export function EventsView() {
  const me = useMe();
  const url = useUrlParams();
  const filters = eventFiltersFrom(url.get);
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const events = useChainEvents({ ...filters, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const wineries = useAllWineries(Boolean(me.data));
  const [open, setOpen] = useState<ChainEvent | null>(null);
  const page = events.data;
  const wineryName = (id: string | null) => (id ? (wineries.data?.find((w) => w.id === id)?.tradeName ?? null) : null);
  const clear = () => url.set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));

  const chips = [
    ...(filters.type ? [{ id: P.type, label: "Tipo", value: filters.type }] : []),
    ...(filters.contract ? [{ id: P.contract, label: "Contrato", value: shortHash(filters.contract, 6, 4) }] : []),
    ...(filters.txHash ? [{ id: P.txHash, label: "Hash", value: shortHash(filters.txHash, 6, 4) }] : []),
    ...(filters.unmatched ? [{ id: P.unmatched, label: "Origen", value: "No originados por el sistema" }] : []),
    ...(filters.from ? [{ id: P.from, label: "Desde", value: fmtDate(filters.from) }] : []),
    ...(filters.to ? [{ id: P.to, label: "Hasta", value: fmtDate(filters.to) }] : []),
  ];

  return (
    <section aria-labelledby="eventos" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="eventos" className="m-0 font-ui text-md font-semibold text-fg">
          Eventos de los contratos
        </h2>
        <p className="max-w-2xl text-fg-muted">
          Lo que emiten en la red los contratos de las bodegas, del más reciente al más antiguo. Solo lectura.
        </p>
      </div>

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={chips.length ? clear : undefined}
        resultCount={page ? `${fmtNumber(page.total)} ${page.total === 1 ? "evento" : "eventos"}` : undefined}
      >
        <Field label="Tipo" className="w-52">
          <Select
            size="sm"
            value={filters.type ?? ALL}
            onValueChange={(v) => url.set({ [P.type]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              // Un tipo que llegó por la URL y no está en la lista se conserva.
              ...[...new Set([...EVENT_TYPES, ...(filters.type ? [filters.type] : [])])].map((t) => ({
                value: t,
                label: <span className="font-mono text-xs">{t}</span>,
              })),
            ]}
          />
        </Field>
        <SearchField
          label="Contrato"
          placeholder="Dirección C… completa"
          value={url.get(P.contract) ?? ""}
          onChange={(v) => url.set({ [P.contract]: v })}
        />
        <SearchField
          label="Hash de la transacción"
          placeholder="Hash completo"
          value={url.get(P.txHash) ?? ""}
          onChange={(v) => url.set({ [P.txHash]: v })}
        />
        <Field label="Desde" className="w-40">
          <Input
            size="sm"
            type="date"
            value={filters.from ?? ""}
            onChange={(e) => url.set({ [P.from]: e.target.value })}
          />
        </Field>
        <Field label="Hasta" className="w-40">
          <Input size="sm" type="date" value={filters.to ?? ""} onChange={(e) => url.set({ [P.to]: e.target.value })} />
        </Field>
        <div className="self-end pb-1.5">
          <Checkbox
            label="Solo los no originados por el sistema"
            checked={filters.unmatched === true}
            onCheckedChange={(checked) => url.set({ [P.unmatched]: checked === true ? "1" : undefined })}
          />
        </div>
      </FilterBar>

      <DataTable
        caption="Eventos de los contratos"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(e) => e.id}
        loading={events.isPending}
        onRowClick={setOpen}
        error={
          events.isError ? { description: errorMessage(events.error), onRetry: () => void events.refetch() } : undefined
        }
        empty={
          <EmptyState
            bare
            title={chips.length ? "Ningún evento coincide" : "Aún no hay eventos"}
            description={
              chips.length ? "Prueba con otro tipo, contrato o fechas." : "El indexador los lee cada minuto."
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
        rowActions={(e) => (
          <Button
            size="sm"
            variant="tertiary"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(e);
            }}
          >
            Ver
            <span className="sr-only">
              {" "}
              el evento {e.type} del ledger {e.ledger}
            </span>
          </Button>
        )}
        columns={[
          {
            id: "type",
            header: "Tipo",
            accessor: "type",
            cell: (e) => <span className="font-mono text-xs">{e.type}</span>,
          },
          {
            id: "origin",
            header: "Origen",
            accessor: "originatedBySystem",
            cell: (e) =>
              e.originatedBySystem ? (
                <Badge tone="neutral">Del sistema</Badge>
              ) : (
                <Badge tone="danger">No originado por el sistema</Badge>
              ),
          },
          {
            id: "winery",
            header: "Bodega",
            accessor: (e) => wineryName(e.wineryId) ?? "",
            hideBelow: "md",
            cell: (e) => wineryName(e.wineryId) ?? <span className="text-fg-subtle">—</span>,
          },
          {
            id: "contract",
            header: "Contrato",
            accessor: "contractAddress",
            hideBelow: "lg",
            cell: (e) => (
              <span onClick={(event) => event.stopPropagation()}>
                <ChainAddress value={e.contractAddress} label="Contrato que emitió el evento" size="sm" />
              </span>
            ),
          },
          { id: "ledger", header: "Ledger", accessor: "ledger", numeric: true, cell: (e) => e.ledger },
          {
            id: "closed",
            header: "Cuándo",
            accessor: "ledgerClosedAt",
            hideBelow: "md",
            cell: (e) => (
              <time dateTime={e.ledgerClosedAt} className="whitespace-nowrap">
                {fmtDateTime(e.ledgerClosedAt)}
              </time>
            ),
          },
        ]}
      />

      <SlideOver
        open={open !== null}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        size="lg"
        title={open ? `Evento ${open.type}` : "Evento"}
        description={
          open
            ? `${networkLabel(open.network)} · ledger ${open.ledger} · ${fmtDateTime(open.ledgerClosedAt)}`
            : undefined
        }
      >
        {open && (
          <KeyValueList
            items={[
              {
                term: "Origen",
                value: open.originatedBySystem ? (
                  "Originado por el sistema"
                ) : (
                  <span className="grid gap-1">
                    <Badge tone="danger">No originado por el sistema</Badge>
                    <TextLink asChild variant="inline">
                      <Link href="/cadena/alertas?codigo=UNEXPECTED_EVENT">Ver las alertas de eventos inesperados</Link>
                    </TextLink>
                  </span>
                ),
              },
              {
                term: "Transacción propia",
                value: open.matchedTransactionId ? (
                  <TextLink asChild variant="inline">
                    <Link href={transactionsHref({ open: open.matchedTransactionId })}>Ver la transacción</Link>
                  </TextLink>
                ) : (
                  <span className="text-fg-subtle">Ninguna</span>
                ),
              },
              { term: "Bodega", value: wineryName(open.wineryId) ?? <span className="text-fg-subtle">—</span> },
              {
                term: "Contrato",
                value: <ChainAddress value={open.contractAddress} label="Contrato que emitió el evento" size="sm" />,
              },
              { term: "Hash", value: <ChainAddress value={open.txHash} label="Hash de la transacción" size="sm" /> },
              { term: "Id del evento", value: <span className="font-mono text-xs break-all">{open.rpcEventId}</span> },
              { term: "Procesado", value: <time dateTime={open.processedAt}>{fmtDateTime(open.processedAt)}</time> },
              {
                term: "Topics",
                value: <JsonBlock value={open.topics} label="Topics del evento" />,
              },
              {
                term: "Datos",
                value: <JsonBlock value={open.data} label="Datos del evento" className="max-h-60" />,
              },
            ]}
          />
        )}
      </SlideOver>
    </section>
  );
}
