"use client";

import { CHAIN_TX_KINDS, CHAIN_TX_STATUSES } from "@drinks-on-chain/mocks";
import {
  Button,
  ChainAddress,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Select,
  getTxStatus,
} from "@drinks-on-chain/ui";
import { TxStatus } from "@/components/chain/tx-ref";
import { WineryFilter } from "@/components/winery-filter";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { useChainTransactions } from "@/lib/platform/chain";
import { subjectTypeLabel, txKindLabel } from "@/lib/platform/chain-labels";
import { TX_PARAMS as P, anyTxInProgress, txFiltersFrom } from "@/lib/platform/chain-utils";
import { can } from "@/lib/platform/permissions";
import { useAllWineries } from "@/lib/platform/wineries";
import { PAGE_PARAM, pageFrom, useUrlParams } from "@/lib/use-url-params";
import { TransactionPanel } from "./transaction-panel";

const PAGE_SIZE = 20;
const ALL = "ALL";
const FILTER_KEYS = [P.status, P.kind, P.winery, P.subjectType, P.subjectId, P.from, P.to];

/**
 * Cadena · Transacciones (§2.4): todo lo que el firmante envía a la red, de la más reciente a la más
 * antigua. Filtros en la URL; el detalle (intentos e historial, reintentar, abandonar) se abre en un
 * panel con `?tx=`. La lista se refresca cada 5 s solo mientras alguna siga en curso.
 */
export function TransactionsView() {
  const me = useMe();
  const url = useUrlParams();
  const filters = txFiltersFrom(url.get);
  const { offset } = pageFrom(url.params, PAGE_SIZE);
  const transactions = useChainTransactions({ ...filters, limit: PAGE_SIZE, offset }, Boolean(me.data));
  const wineries = useAllWineries(Boolean(me.data));
  const page = transactions.data;
  const openId = url.get(P.open);
  const perms = { manage: can(me.data, "chain.manage"), admin: can(me.data, "chain.admin") };
  const wineryName = (id: string | null) => (id ? (wineries.data?.find((w) => w.id === id)?.tradeName ?? null) : null);
  const clear = () => url.set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));
  const live = anyTxInProgress(page?.items);

  const chips = [
    ...(filters.status ? [{ id: P.status, label: "Estado", value: getTxStatus(filters.status).label }] : []),
    ...(filters.kind ? [{ id: P.kind, label: "Tipo", value: txKindLabel(filters.kind) }] : []),
    ...(filters.wineryId ? [{ id: P.winery, label: "Bodega", value: wineryName(filters.wineryId) ?? "…" }] : []),
    ...(filters.subjectType
      ? [{ id: P.subjectType, label: "Sujeto", value: subjectTypeLabel(filters.subjectType) }]
      : []),
    ...(filters.subjectId ? [{ id: P.subjectId, label: "Id del sujeto", value: filters.subjectId }] : []),
    ...(filters.from ? [{ id: P.from, label: "Desde", value: fmtDate(filters.from) }] : []),
    ...(filters.to ? [{ id: P.to, label: "Hasta", value: fmtDate(filters.to) }] : []),
  ];

  return (
    <section aria-labelledby="transacciones" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="transacciones" className="m-0 font-ui text-md font-semibold text-fg">
          Transacciones
        </h2>
        {me.data && !perms.manage && (
          <p className="text-fg-muted" role="note">
            Consulta en modo lectura: reintentar es de operaciones y administración; abandonar, solo de administración.
          </p>
        )}
        <p className="text-xs text-fg-subtle" aria-live="polite">
          {live ? "Hay transacciones en curso: la lista se actualiza cada 5 segundos." : ""}
        </p>
      </div>

      <FilterBar
        filters={chips}
        onRemove={(id) => url.set({ [id]: undefined })}
        onClearAll={chips.length ? clear : undefined}
        resultCount={
          page ? `${fmtNumber(page.total)} ${page.total === 1 ? "transacción" : "transacciones"}` : undefined
        }
      >
        <Field label="Estado" className="w-44">
          <Select
            size="sm"
            value={filters.status ?? ALL}
            onValueChange={(v) => url.set({ [P.status]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...CHAIN_TX_STATUSES.map((s) => ({ value: s, label: getTxStatus(s).label })),
            ]}
          />
        </Field>
        <Field label="Tipo" className="w-60">
          <Select
            size="sm"
            value={filters.kind ?? ALL}
            onValueChange={(v) => url.set({ [P.kind]: v === ALL ? undefined : v })}
            options={[
              { value: ALL, label: "Todos" },
              ...CHAIN_TX_KINDS.map((k) => ({ value: k, label: txKindLabel(k) })),
            ]}
          />
        </Field>
        <WineryFilter value={filters.wineryId} onChange={(id) => url.set({ [P.winery]: id })} />
        <Field label="Desde" className="w-40">
          <Input
            size="sm"
            type="date"
            value={filters.from ?? ""}
            max={filters.to}
            onChange={(e) => url.set({ [P.from]: e.target.value })}
          />
        </Field>
        <Field label="Hasta" className="w-40">
          <Input
            size="sm"
            type="date"
            value={filters.to ?? ""}
            min={filters.from}
            onChange={(e) => url.set({ [P.to]: e.target.value })}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption="Transacciones de la red"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(t) => t.id}
        loading={transactions.isPending}
        activeRowId={openId ?? undefined}
        onRowClick={(t) => url.set({ [P.open]: t.id }, { keepPage: true })}
        error={
          transactions.isError
            ? { description: errorMessage(transactions.error), onRetry: () => void transactions.refetch() }
            : undefined
        }
        empty={
          <EmptyState
            bare
            title={chips.length ? "Ninguna transacción coincide" : "Aún no hay transacciones"}
            description={
              chips.length
                ? "Prueba con otro estado, tipo o fechas."
                : "Aparecen cuando una bodega se activa, se aprueba una emisión o se certifica un lote."
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
        rowActions={(t) => (
          <Button
            size="sm"
            variant="tertiary"
            onClick={(e) => {
              e.stopPropagation();
              url.set({ [P.open]: t.id }, { keepPage: true });
            }}
          >
            Ver<span className="sr-only"> la transacción: {txKindLabel(t.kind)}</span>
          </Button>
        )}
        columns={[
          {
            id: "kind",
            header: "Tipo",
            accessor: "kind",
            cell: (t) => (
              <div className="grid">
                <span className="font-medium">{txKindLabel(t.kind)}</span>
                <span className="text-xs text-fg-muted">{subjectTypeLabel(t.subject.type)}</span>
              </div>
            ),
          },
          {
            id: "winery",
            header: "Bodega",
            accessor: (t) => wineryName(t.wineryId) ?? "",
            hideBelow: "md",
            cell: (t) => wineryName(t.wineryId) ?? <span className="text-fg-subtle">Plataforma</span>,
          },
          {
            id: "status",
            header: "Estado",
            accessor: "status",
            // Tabla con muchas filas: los cambios de estado no se anuncian uno a uno.
            cell: (t) => (
              <span className="grid justify-items-start gap-0.5">
                <span onClick={(e) => e.stopPropagation()}>
                  <TxStatus tx={t} announce={false} />
                </span>
                {t.abandoned && <span className="text-xs text-fg-muted">Abandonada</span>}
              </span>
            ),
          },
          {
            id: "hash",
            header: "Hash",
            accessor: (t) => t.txHash ?? "",
            hideBelow: "lg",
            cell: (t) =>
              t.txHash ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <ChainAddress value={t.txHash} label="Hash de la transacción" size="sm" />
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          },
          {
            id: "created",
            header: "Creada",
            accessor: "createdAt",
            hideBelow: "md",
            cell: (t) => (
              <time dateTime={t.createdAt} className="whitespace-nowrap">
                {fmtDateTime(t.createdAt)}
              </time>
            ),
          },
        ]}
      />

      <TransactionPanel
        id={openId}
        perms={perms}
        wineryName={wineryName}
        onClose={() => url.set({ [P.open]: undefined }, { keepPage: true })}
      />
    </section>
  );
}
