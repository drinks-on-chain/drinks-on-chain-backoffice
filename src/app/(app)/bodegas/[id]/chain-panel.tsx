"use client";

import { useState } from "react";
import Link from "next/link";
import { PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import type { WineryChainAccountView, WineryDetail } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  ChainAddress,
  DataTable,
  EmptyState,
  ErrorState,
  ExplorerLink,
  KeyValueList,
  SkeletonText,
  StatCard,
  TextLink,
} from "@drinks-on-chain/ui";
import { TxRefList, TxStatus } from "@/components/chain/tx-ref";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { SectionHeader } from "@/components/section-header";
import { SeriousReasonDialog } from "@/components/serious-reason-dialog";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber, fmtXlm } from "@/lib/format";
import {
  useChainConfigured,
  useProvisionWineryChain,
  useSetWineryContractPaused,
  useWineryChainAccount,
} from "@/lib/platform/chain";
import { collectionStatus, identityStatus, networkLabel } from "@/lib/platform/chain-labels";
import { identityActions, identityInProgress, transactionsHref } from "@/lib/platform/chain-utils";
import { collectionsHref } from "@/lib/platform/collections-utils";
import { can } from "@/lib/platform/permissions";
import { tokenizationHref } from "@/lib/platform/tokenization-utils";

const muted = (text: string) => <span className="text-fg-subtle">{text}</span>;
const when = (iso: string) => <time dateTime={iso}>{fmtDateTime(iso)}</time>;

type Dialog = "provision" | "pause" | "unpause";

/**
 * Ola 3 · Identidad de la bodega en la red (contrato §3): su cuenta y su contrato NFT, los NFT por
 * lote y sus últimas transacciones. Reaprovisionar una identidad fallida (operaciones) y pausar o
 * reanudar el contrato en la red (administración, con motivo y confirmación seria): la pausa en la
 * red detiene la emisión, las entregas y las quemas de toda la bodega.
 */
export function ChainPanel({ winery }: { winery: WineryDetail }) {
  const me = useMe();
  const account = useWineryChainAccount(winery.id);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const view = account.data;
  const configured = useChainConfigured(Boolean(view));

  if (account.isPending) return <SkeletonText lines={8} />;
  if (account.isError || !view) {
    return (
      <ErrorState
        title="No se pudo cargar la identidad en la red"
        description={errorMessage(account.error)}
        onRetry={() => void account.refetch()}
      />
    );
  }

  const { identity } = view;
  const status = identityStatus(identity.status);
  const perms = { manage: can(me.data, "chain.manage"), admin: can(me.data, "chain.admin") };
  const actions = identityActions(identity, perms);
  const symbol = identity.contract?.symbol ?? winery.lotPrefix ?? winery.tradeName;

  return (
    <section aria-labelledby="cadena" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="cadena" className="m-0 flex flex-wrap items-center gap-2 font-ui text-md font-semibold text-fg">
            Identidad en la red <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-xs font-normal text-fg-muted">{networkLabel(identity.network)}</span>
          </h2>
          <p className="max-w-2xl text-fg-muted">
            La cuenta y el contrato NFT de la bodega se crean al activarla. Las claves las custodia la plataforma: la
            bodega no firma ni paga comisiones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.provision && (
            <Button
              iconStart={<RefreshCw aria-hidden="true" className="size-4" />}
              onClick={() => setDialog("provision")}
            >
              Reaprovisionar
            </Button>
          )}
          {actions.pause && (
            <Button
              variant="destructive"
              iconStart={<PauseCircle aria-hidden="true" className="size-4" />}
              onClick={() => setDialog("pause")}
            >
              Pausar el contrato en la red
            </Button>
          )}
          {actions.unpause && (
            <Button
              iconStart={<PlayCircle aria-hidden="true" className="size-4" />}
              onClick={() => setDialog("unpause")}
            >
              Reanudar el contrato en la red
            </Button>
          )}
        </div>
      </div>

      {me.data && !perms.manage && (
        <Alert tone="info">
          Consulta en modo lectura: reaprovisionar es de operaciones y administración; pausar o reanudar el contrato,
          solo de administración.
        </Alert>
      )}
      {configured === false && (
        <Alert tone="warning" title="La cadena no está configurada en este entorno">
          Faltan las cuentas de la plataforma o el código del contrato en el servidor: mientras tanto no se puede
          aprovisionar la identidad de ninguna bodega ni pausar o reanudar contratos, y no se aprueban tokenizaciones.
        </Alert>
      )}
      {identity.status === "NOT_PROVISIONED" && configured !== false && (
        <Alert tone="info" title="Sin identidad en la red">
          {winery.status === "ACTIVE"
            ? "La bodega está activa pero aún no tiene cuenta ni contrato: sin ellos no se aprueba ninguna tokenización."
            : "La identidad se crea cuando la bodega se activa."}
        </Alert>
      )}
      {identityInProgress(identity) && (
        <Alert tone="info" title="Preparando la cuenta y el contrato en la red">
          Esta pantalla se actualiza sola cada pocos segundos hasta que la red confirme.
        </Alert>
      )}
      {identity.lastError && (
        <Alert tone="danger" title="La identidad falló">
          {identity.lastError.message} <span className="font-mono text-xs">{identity.lastError.code}</span>
        </Alert>
      )}
      {identity.contract?.paused && (
        <Alert tone="warning" title="Contrato pausado en la red">
          Mientras dure la pausa no se emite, no se entregan NFT ni se queman, y no se publican colecciones de esta
          bodega.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="grid gap-4 p-5">
          <SectionHeader title="Cuenta de la bodega" level={3} />
          {identity.account ? (
            <KeyValueList
              layout="stacked"
              items={[
                {
                  term: "Dirección",
                  value: (
                    <span className="grid gap-1">
                      <ChainAddress value={identity.account.address} label="Cuenta de la bodega" size="sm" />
                      <ExplorerLink href={identity.account.explorerUrl} className="text-xs">
                        Ver la cuenta en el explorador
                      </ExplorerLink>
                    </span>
                  ),
                },
                { term: "Dominio", value: identity.account.homeDomain ?? muted("Sin dominio") },
                { term: "Creación", value: <TxStatus tx={identity.account.createdTx} /> },
              ]}
            />
          ) : (
            <p className="text-fg-muted">Aún no tiene cuenta en la red.</p>
          )}
        </Card>

        <Card className="grid gap-4 p-5">
          <SectionHeader title="Contrato NFT" level={3} />
          {identity.contract ? (
            <KeyValueList
              layout="stacked"
              items={[
                {
                  term: "Dirección",
                  value: (
                    <span className="grid gap-1">
                      <ChainAddress value={identity.contract.address} label="Contrato NFT de la bodega" size="sm" />
                      <ExplorerLink href={identity.contract.explorerUrl} className="text-xs">
                        Ver el contrato en el explorador
                      </ExplorerLink>
                    </span>
                  ),
                },
                {
                  term: "Nombre y símbolo",
                  value: (
                    <span>
                      {identity.contract.name} · <span className="font-mono">{identity.contract.symbol}</span>
                    </span>
                  ),
                },
                {
                  term: "En la red",
                  value: identity.contract.paused ? (
                    <Badge tone="warning">Pausado</Badge>
                  ) : (
                    <Badge tone="success">En marcha</Badge>
                  ),
                },
                {
                  term: "URI base de los metadatos",
                  value: <span className="font-mono text-xs break-all">{identity.contract.baseUri}</span>,
                },
                {
                  term: "Operador (plataforma)",
                  value: <ChainAddress value={identity.contract.operatorAddress} label="Cuenta operadora" size="sm" />,
                },
                {
                  term: "Código",
                  value: (
                    <ChainAddress value={identity.contract.wasmHash} label="Hash del código del contrato" size="sm" />
                  ),
                },
                { term: "Despliegue", value: <TxStatus tx={identity.contract.deployedTx} /> },
              ]}
            />
          ) : (
            <p className="text-fg-muted">Aún no tiene contrato en la red.</p>
          )}
        </Card>
      </div>

      {identity.pendingTransactions.length > 0 && (
        <Card className="grid gap-3 p-5">
          <SectionHeader title="Transacciones en curso de la identidad" level={3} />
          <TxRefList txs={identity.pendingTransactions} label="Transacciones en curso de la identidad" />
        </Card>
      )}

      <NftByLot winery={winery} view={view} />

      <Card className="grid gap-3 p-5">
        <SectionHeader
          title="Últimas transacciones"
          level={3}
          description={
            view.chainCosts.since
              ? `La plataforma ha pagado ${fmtXlm(view.chainCosts.feesChargedXlm)} en comisiones por esta bodega desde el ${fmtDateTime(view.chainCosts.since)}.`
              : "La plataforma aún no ha pagado comisiones por esta bodega."
          }
          action={
            <TextLink asChild variant="inline">
              <Link href={transactionsHref({ wineryId: winery.id })}>Todas en «Cadena»</Link>
            </TextLink>
          }
        />
        <TxRefList txs={view.recentTransactions} label="Últimas transacciones de la bodega" />
      </Card>

      {dialog === "provision" && <ProvisionDialog winery={winery} onClose={() => setDialog(null)} />}
      {(dialog === "pause" || dialog === "unpause") && (
        <PauseDialog winery={winery} symbol={symbol} pause={dialog === "pause"} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}

function NftByLot({ winery, view }: { winery: WineryDetail; view: WineryChainAccountView }) {
  const t = view.totals;
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="NFT por lote"
        level={3}
        action={
          <span className="flex flex-wrap gap-3">
            <TextLink asChild variant="inline">
              <Link href={tokenizationHref({ wineryId: winery.id })}>Solicitudes abiertas</Link>
            </TextLink>
            <TextLink asChild variant="inline">
              <Link href={collectionsHref({ wineryId: winery.id })}>Colecciones</Link>
            </TextLink>
          </span>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Emitidos" value={fmtNumber(t.minted)} />
        <StatCard label="Disponibles" value={fmtNumber(t.available)} />
        <StatCard label="Vendidos" value={fmtNumber(t.sold + t.redeemable + t.passActive)} />
        <StatCard label="Quemados" value={fmtNumber(t.burned)} />
      </div>
      <DataTable
        caption={`NFT por lote de ${winery.tradeName}`}
        captionHidden
        density="compact"
        data={view.byLot}
        getRowId={(l) => l.collectionId}
        empty={
          <EmptyState
            bare
            title="Sin colecciones"
            description="Los NFT aparecen cuando se aprueba la primera tokenización de un lote."
          />
        }
        columns={[
          {
            id: "lot",
            header: "Lote",
            accessor: "name",
            cell: (l) => (
              <div className="grid">
                <TextLink asChild variant="inline" className="font-medium">
                  <Link href={`/colecciones/${l.collectionId}`}>{l.name}</Link>
                </TextLink>
                <span className="font-mono text-xs text-fg-muted">{l.reference}</span>
              </div>
            ),
          },
          {
            id: "status",
            header: "Colección",
            accessor: "collectionStatus",
            cell: (l) => (
              <Badge tone={collectionStatus(l.collectionStatus).tone}>
                {collectionStatus(l.collectionStatus).label}
              </Badge>
            ),
          },
          { id: "quota", header: "Cuota", accessor: "quota", numeric: true, cell: (l) => fmtNumber(l.quota) },
          {
            id: "minted",
            header: "Emitidos",
            accessor: (l) => l.counts.minted,
            numeric: true,
            cell: (l) => fmtNumber(l.counts.minted),
          },
          {
            id: "sold",
            header: "Vendidos",
            accessor: (l) => l.counts.sold,
            numeric: true,
            hideBelow: "md",
            cell: (l) => fmtNumber(l.counts.sold + l.counts.redeemable + l.counts.passActive),
          },
          {
            id: "burned",
            header: "Quemados",
            accessor: (l) => l.counts.burned,
            numeric: true,
            hideBelow: "md",
            cell: (l) => fmtNumber(l.counts.burned),
          },
          {
            id: "anchor",
            header: "Anclaje",
            accessor: (l) => l.anchor?.status ?? "",
            hideBelow: "lg",
            cell: (l) =>
              l.anchor ? (
                <span className="grid justify-items-start gap-0.5">
                  <TxStatus tx={l.anchor.transaction} announce={false} />
                  {l.anchor.anchoredAt && <span className="text-xs text-fg-muted">{when(l.anchor.anchoredAt)}</span>}
                </span>
              ) : (
                muted("Sin anclar")
              ),
          },
        ]}
      />
    </Card>
  );
}

function ProvisionDialog({ winery, onClose }: { winery: WineryDetail; onClose: () => void }) {
  const provision = useProvisionWineryChain(winery.id);
  return (
    <ReasonActionDialog
      copy={{
        title: "Reaprovisionar la identidad",
        description: `Se vuelve a pedir a la red la cuenta y el contrato NFT de ${winery.tradeName}. Es seguro repetirlo: si algo ya existe, no se crea dos veces.`,
        confirm: "Reaprovisionar",
        done: "Aprovisionamiento en curso: la cuenta y el contrato se están creando.",
      }}
      run={(reason) => provision.mutateAsync(reason)}
      onClose={onClose}
      onDone={onClose}
    />
  );
}

function PauseDialog({
  winery,
  symbol,
  pause,
  onClose,
}: {
  winery: WineryDetail;
  symbol: string;
  pause: boolean;
  onClose: () => void;
}) {
  const setPaused = useSetWineryContractPaused(winery.id);
  return (
    <SeriousReasonDialog
      title={pause ? "Pausar el contrato en la red" : "Reanudar el contrato en la red"}
      description={`Contrato NFT de ${winery.tradeName} (${symbol}). La operación se firma y se envía a la red: no es la pausa comercial de una colección.`}
      consequence={
        pause
          ? "Se detienen la emisión, las entregas y las quemas de TODA la bodega, y sus colecciones no se pueden publicar. Úsalo solo ante un incidente (clave comprometida, fallo del contrato)."
          : "El contrato vuelve a aceptar emisiones, entregas y quemas. La reanudación la firma la clave custodiada de la bodega. Las colecciones siguen pausadas hasta que se reanuden una a una."
      }
      confirmText={symbol}
      confirmLabel={pause ? "Pausar el contrato" : "Reanudar el contrato"}
      destructive={pause}
      done={pause ? "Pausa enviada a la red." : "Reanudación enviada a la red."}
      run={(reason) => setPaused.mutateAsync({ paused: pause, reason })}
      onClose={onClose}
    />
  );
}
