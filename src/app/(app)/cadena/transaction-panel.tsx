"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, RotateCcw } from "lucide-react";
import type { ChainTransaction } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  ChainAddress,
  DataTable,
  ErrorState,
  KeyValueList,
  SkeletonText,
  SlideOver,
  TextLink,
  getTxStatus,
} from "@drinks-on-chain/ui";
import { JsonBlock } from "@/components/chain/json-block";
import { TxStatus } from "@/components/chain/tx-ref";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime, fmtXlm } from "@/lib/format";
import { useAbandonChainTransaction, useChainTransaction, useRetryChainTransaction } from "@/lib/platform/chain";
import { networkLabel, signerRoleLabel, subjectTypeLabel, txErrorHelp, txKindLabel } from "@/lib/platform/chain-labels";
import { subjectHref, txActions } from "@/lib/platform/chain-utils";

const muted = (text = "—") => <span className="text-fg-subtle">{text}</span>;
const when = (iso: string) => <time dateTime={iso}>{fmtDateTime(iso)}</time>;

/** Stroops (cadena) → XLM con 7 decimales para mostrar. */
const stroopsToXlm = (stroops: string | null) => (stroops === null ? null : (Number(stroops) / 10_000_000).toFixed(7));

/**
 * Detalle de una transacción de la red (§2.3): la intención, quién firma y paga, comisiones,
 * resultado y cada intento con su error. Reintentar (`FAILED → PENDING`) y abandonar, con motivo.
 * Mientras siga en curso se consulta cada 5 s.
 */
export function TransactionPanel({
  id,
  perms,
  wineryName,
  onClose,
}: {
  id: string | null;
  perms: { manage: boolean; admin: boolean };
  wineryName: (wineryId: string | null) => string | null;
  onClose: () => void;
}) {
  const tx = useChainTransaction(id);
  const [dialog, setDialog] = useState<"retry" | "abandon" | null>(null);
  const t = tx.data;
  const actions = t ? txActions(t, perms) : null;

  return (
    <SlideOver
      open={id !== null}
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={t ? txKindLabel(t.kind) : "Transacción"}
      description={t ? `${networkLabel(t.network)} · creada el ${fmtDateTime(t.createdAt)}` : undefined}
      footer={
        actions && (actions.retry || actions.abandon) ? (
          <>
            {actions.abandon && (
              <Button
                variant="secondary"
                iconStart={<Ban aria-hidden="true" className="size-4" />}
                onClick={() => setDialog("abandon")}
              >
                Abandonar
              </Button>
            )}
            {actions.retry && (
              <Button
                iconStart={<RotateCcw aria-hidden="true" className="size-4" />}
                onClick={() => setDialog("retry")}
              >
                Reintentar
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {tx.isPending && id !== null ? (
        <SkeletonText lines={8} />
      ) : tx.isError ? (
        <ErrorState
          bare
          title="No se pudo cargar la transacción"
          description={errorMessage(tx.error)}
          onRetry={() => void tx.refetch()}
        />
      ) : t ? (
        <TransactionBody tx={t} wineryName={wineryName} abandonBlocked={actions?.abandonBlocked ?? null} />
      ) : null}

      {t && dialog && <TxActionDialog tx={t} action={dialog} onClose={() => setDialog(null)} />}
    </SlideOver>
  );
}

function TxActionDialog({
  tx,
  action,
  onClose,
}: {
  tx: ChainTransaction;
  action: "retry" | "abandon";
  onClose: () => void;
}) {
  const retry = useRetryChainTransaction();
  const abandon = useAbandonChainTransaction();
  const kind = txKindLabel(tx.kind);
  return action === "retry" ? (
    <ReasonActionDialog
      copy={{
        title: "Reintentar la transacción",
        description: `«${kind}» vuelve a la cola y el firmante la envía de nuevo. Antes de reconstruirla se comprueba en la red que la anterior no entró, así que no se ejecuta dos veces.`,
        confirm: "Reintentar",
        done: "Transacción en cola: se envía de nuevo a la red.",
      }}
      run={(reason) => retry.mutateAsync({ id: tx.id, reason })}
      onClose={onClose}
      onDone={onClose}
    />
  ) : (
    <ReasonActionDialog
      copy={{
        title: "Abandonar la transacción",
        description: `«${kind}» queda como fallida y no se volverá a intentar. Úsalo solo si ya no hace falta (p. ej. un mantenimiento sustituido por otro).`,
        confirm: "Abandonar",
        done: "Transacción abandonada.",
        destructive: true,
      }}
      run={(reason) => abandon.mutateAsync({ id: tx.id, reason })}
      onClose={onClose}
      onDone={onClose}
    />
  );
}

function TransactionBody({
  tx: t,
  wineryName,
  abandonBlocked,
}: {
  tx: ChainTransaction;
  wineryName: (wineryId: string | null) => string | null;
  abandonBlocked: string | null;
}) {
  const subject = subjectHref(t.subject, t.wineryId);
  const fee = stroopsToXlm(t.feeChargedStroops);
  const rent = stroopsToXlm(t.rentFeeStroops);
  const maxFee = stroopsToXlm(t.maxFeeStroops);
  const help = t.lastError ? txErrorHelp(t.lastError.code) : null;
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <TxStatus tx={t} />
        {help && <p className="text-fg-muted">{help}</p>}
        {t.nextAttemptAt && (
          <p className="text-xs text-fg-muted">Próximo intento automático: {when(t.nextAttemptAt)}</p>
        )}
      </div>
      {t.abandoned && (
        <Alert tone="warning" title="Transacción abandonada">
          {t.abandoned.by} · {when(t.abandoned.at)} · Motivo: «{t.abandoned.reason}»
        </Alert>
      )}
      {abandonBlocked && <Alert tone="info">{abandonBlocked}</Alert>}

      <section className="grid gap-3">
        <SectionHeader title="Intención" level={3} />
        <KeyValueList
          items={[
            { term: "Tipo", value: txKindLabel(t.kind) },
            {
              term: "Sujeto",
              value: subject ? (
                <TextLink asChild variant="inline">
                  <Link href={subject}>{subjectTypeLabel(t.subject.type)}</Link>
                </TextLink>
              ) : (
                <span>
                  {subjectTypeLabel(t.subject.type)} <span className="font-mono text-xs break-all">{t.subject.id}</span>
                </span>
              ),
            },
            {
              term: "Bodega",
              value: t.wineryId ? (
                <TextLink asChild variant="inline">
                  <Link href={`/bodegas/${t.wineryId}?pestana=cadena`}>
                    {wineryName(t.wineryId) ?? "Ver la bodega"}
                  </Link>
                </TextLink>
              ) : (
                muted("Plataforma")
              ),
            },
            {
              term: "Clave de la intención",
              value: <span className="font-mono text-xs break-all">{t.intentKey}</span>,
            },
            {
              term: "Pedida por",
              value: t.requestedBy.fullName ?? (t.requestedBy.source === "WORKER" ? "Sistema (worker)" : "API"),
            },
            {
              term: "Parámetros",
              value: <JsonBlock value={t.intent} label="Parámetros de la intención" />,
            },
          ]}
        />
      </section>

      <section className="grid gap-3">
        <SectionHeader title="En la red" level={3} />
        <KeyValueList
          items={[
            {
              term: "Hash",
              value: t.txHash ? (
                <ChainAddress value={t.txHash} label="Hash de la transacción" explorerUrl={t.explorerUrl} size="sm" />
              ) : (
                muted("Se conoce al firmar")
              ),
            },
            { term: "Ledger", value: t.ledger ?? muted() },
            { term: "Confirmada", value: t.confirmedAt ? when(t.confirmedAt) : muted("Sin confirmar") },
            {
              term: "Cuenta que paga",
              value: t.sourceAccount ? (
                <ChainAddress value={t.sourceAccount} label="Cuenta que paga la comisión" size="sm" />
              ) : (
                muted("Se fija al construirla")
              ),
            },
            {
              term: "Firmantes",
              value:
                t.signers.length === 0 ? (
                  muted("Sin firmar todavía")
                ) : (
                  <ul className="grid gap-1" aria-label="Firmantes">
                    {t.signers.map((s) => (
                      <li key={`${s.role}-${s.address}`} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-fg-muted">{signerRoleLabel(s.role)}</span>
                        <ChainAddress value={s.address} label={`Firmante: ${signerRoleLabel(s.role)}`} size="sm" />
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              term: "Comisión cobrada",
              value: fee ? (
                <span className="tabular-nums">
                  {fmtXlm(fee)}
                  {rent && <span className="text-xs text-fg-muted"> · renta {fmtXlm(rent)}</span>}
                </span>
              ) : (
                muted("Sin cobrar")
              ),
            },
            {
              term: "Tope de comisión",
              value: maxFee ? <span className="tabular-nums">{fmtXlm(maxFee)}</span> : muted(),
            },
            {
              term: "Resultado",
              value: t.result ? (
                <span className="grid gap-1">
                  <span className="font-mono text-xs break-all">{JSON.stringify(t.result.returnValue)}</span>
                  {t.result.contractEvents.length > 0 && (
                    <span className="text-xs text-fg-muted">Eventos: {t.result.contractEvents.join(", ")}</span>
                  )}
                </span>
              ) : (
                muted("Sin resultado")
              ),
            },
            {
              term: "Correlación",
              value: t.correlationId ? <span className="font-mono text-xs break-all">{t.correlationId}</span> : muted(),
            },
          ]}
        />
      </section>

      <section className="grid gap-3">
        <SectionHeader
          title="Intentos e historial"
          level={3}
          description={`${t.attempts} ${t.attempts === 1 ? "intento" : "intentos"}. Cada cambio de estado, del primero al último.`}
        />
        <DataTable
          caption="Historial de la transacción"
          captionHidden
          density="compact"
          data={t.history}
          getRowId={(h, index) => `${h.attempt}-${h.status}-${index}`}
          empty={<p className="text-fg-muted">El firmante aún no la tomó.</p>}
          columns={[
            { id: "attempt", header: "Intento", accessor: "attempt", numeric: true },
            { id: "status", header: "Estado", accessor: "status", cell: (h) => getTxStatus(h.status).label },
            { id: "at", header: "Cuándo", accessor: "at", cell: (h) => when(h.at) },
            {
              id: "hash",
              header: "Hash",
              accessor: (h) => h.txHash ?? "",
              cell: (h) => (h.txHash ? <ChainAddress value={h.txHash} label="Hash del intento" size="sm" /> : muted()),
            },
            {
              id: "error",
              header: "Error",
              accessor: (h) => h.errorCode ?? "",
              cell: (h) =>
                h.errorCode ? (
                  <span className="grid">
                    <span className="font-mono text-xs">{h.errorCode}</span>
                    {h.detail && <span className="text-xs text-fg-muted">{h.detail}</span>}
                  </span>
                ) : (
                  muted()
                ),
            },
          ]}
        />
      </section>
    </div>
  );
}
