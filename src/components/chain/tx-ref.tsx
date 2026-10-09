"use client";

import Link from "next/link";
import type { ChainTxRef } from "@drinks-on-chain/mocks";
import { ChainAddress, TextLink, TxStatusBadge } from "@drinks-on-chain/ui";
import { fmtDateTime } from "@/lib/format";
import { txErrorHelp, txKindLabel } from "@/lib/platform/chain-labels";
import { transactionsHref } from "@/lib/platform/chain-utils";

/**
 * Estado de una transacción de la red con `TxStatusBadge` (texto además del color, intentos, error
 * legible y enlace al explorador, siempre desde el `explorerUrl` del backend). En tablas con muchas
 * filas se pasa `announce={false}` para no saturar a los lectores de pantalla.
 */
export function TxStatus({ tx, announce = true }: { tx: ChainTxRef; announce?: boolean }) {
  return (
    <TxStatusBadge
      status={tx.status}
      explorerUrl={tx.explorerUrl}
      lastError={tx.lastError}
      attempts={tx.attempts}
      announce={announce}
    />
  );
}

/** Lista de transacciones incrustadas (`ChainTxRef`) de una emisión, una identidad o un cierre. */
export function TxRefList({
  txs,
  label,
  detailLinks = true,
  empty = "Sin transacciones todavía.",
}: {
  txs: ChainTxRef[];
  label: string;
  /** Enlace al detalle en «Cadena» (intentos e historial). */
  detailLinks?: boolean;
  empty?: string;
}) {
  if (txs.length === 0) return <p className="text-fg-muted">{empty}</p>;
  return (
    <ul aria-label={label} className="grid divide-y divide-border">
      {txs.map((tx) => {
        const help = tx.lastError ? txErrorHelp(tx.lastError.code) : null;
        return (
          <li key={tx.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="font-medium">{txKindLabel(tx.kind)}</span>
              <time dateTime={tx.createdAt} className="text-xs text-fg-subtle">
                {fmtDateTime(tx.createdAt)}
              </time>
            </div>
            <TxStatus tx={tx} />
            {help && <p className="text-xs text-fg-muted">{help}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {tx.txHash && <ChainAddress value={tx.txHash} label="Hash de la transacción" size="sm" />}
              {tx.ledger !== null && <span className="text-fg-muted">Ledger {tx.ledger}</span>}
              {detailLinks && (
                <TextLink asChild variant="inline">
                  <Link href={transactionsHref({ open: tx.id })}>
                    Ver intentos<span className="sr-only"> de {txKindLabel(tx.kind).toLowerCase()}</span>
                  </Link>
                </TextLink>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
