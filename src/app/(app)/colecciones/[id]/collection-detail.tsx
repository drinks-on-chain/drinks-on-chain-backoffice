"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, PauseCircle, Pencil, PlayCircle, RotateCcw, Send } from "lucide-react";
import type { ChainTxRef, Collection, Mint } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ChainAddress,
  DataTable,
  EmptyState,
  ErrorState,
  ExplorerLink,
  IconButton,
  KeyValueList,
  Menu,
  Progress,
  SkeletonText,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextLink,
  Timeline,
} from "@drinks-on-chain/ui";
import { TxRefList, TxStatus } from "@/components/chain/tx-ref";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { CollectionStatusBadges, MintStatusBadge } from "@/components/tokenization/collection-card";
import { ImageThumb } from "@/components/tokenization/commercial-editor";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtBob, fmtDate, fmtDateTime, fmtNumber, fmtXlm } from "@/lib/format";
import {
  closureStatus,
  collectionStatus,
  mintStatus,
  requestKindLabel,
  txErrorHelp,
  txKindLabel,
} from "@/lib/platform/chain-labels";
import { useCollection, useCollectionTransactions } from "@/lib/platform/collections";
import {
  TOKEN_PARAMS,
  collectionActions,
  collectionInProgress,
  collectionStamp,
  failedMintTx,
  heldMintTx,
  mintRangeLabel,
  mintedPercent,
  type CollectionAction,
} from "@/lib/platform/collections-utils";
import { LOT_STAGE_TONES, lotProductLabel, lotStageLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { oneOf, useUrlParams } from "@/lib/use-url-params";
import { ClosurePanel } from "./closure-panel";
import { CollectionActionDialog, EditCollectionPanel, RetryTransactionDialog } from "./collection-dialogs";
import { TokensPanel } from "./tokens-panel";

const TABS = ["resumen", "nft", "emisiones", "historial", "cierre"] as const;
type Tab = (typeof TABS)[number];

const muted = (text: string) => <span className="text-fg-subtle">{text}</span>;
const when = (iso: string) => <time dateTime={iso}>{fmtDateTime(iso)}</time>;

type Dialog = { kind: "action"; action: CollectionAction } | { kind: "edit" } | { kind: "retry"; tx: ChainTxRef };

/**
 * 4C · Detalle de una colección (contrato de la Ola 3 §6): datos comerciales, métricas, NFT por
 * botella, emisiones con sus transacciones, historiales y cierre con faltante. Mientras haya una
 * transacción suya en curso se consulta cada 5 s; si no, no hay consulta periódica.
 */
export function CollectionDetail({ id }: { id: string }) {
  const me = useMe();
  const url = useUrlParams();
  const collection = useCollection(id);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const tab: Tab = oneOf(TABS, url.get("pestana")) ?? "resumen";
  const c = collection.data;

  if (collection.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }
  if (collection.isError || !c) {
    const notFound = collection.error instanceof ApiError && collection.error.isNotFound;
    return (
      <div className="grid gap-6">
        <PageHeader title="Colección" />
        {notFound ? (
          <EmptyState
            title="La colección no existe"
            description="Puede que el enlace esté mal copiado."
            action={
              <Button asChild variant="secondary">
                <Link href="/colecciones">Volver a las colecciones</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="No se pudo cargar la colección"
            description={errorMessage(collection.error)}
            onRetry={() => void collection.refetch()}
          />
        )}
      </div>
    );
  }

  const manage = can(me.data, "tokenization.manage");
  const canRetry = can(me.data, "chain.manage");
  const { actions, edit } = collectionActions(c.status, manage);
  const failed = failedMintTx(c);
  const inProgress = collectionInProgress(c);
  const held = heldMintTx(c);
  const closure = c.closure;
  const open = (action: CollectionAction) => setDialog({ kind: "action", action });

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Breadcrumbs
          linkComponent={Link}
          label="Ruta"
          items={[{ label: "Colecciones", href: "/colecciones" }, { label: c.name }]}
        />
        <PageHeader
          eyebrow="Colección"
          title={c.name}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CollectionStatusBadges collection={c} />
              <TextLink asChild variant="inline">
                <Link href={`/bodegas/${c.wineryId}`}>{c.winery.tradeName}</Link>
              </TextLink>
              <span className="font-mono text-xs">{c.lot.reference}</span>
            </span>
          }
          actions={
            <>
              {edit && (
                <Button
                  variant="secondary"
                  iconStart={<Pencil aria-hidden="true" className="size-4" />}
                  onClick={() => setDialog({ kind: "edit" })}
                >
                  Editar datos y precio
                </Button>
              )}
              {actions.includes("pause") && (
                <Button
                  variant="secondary"
                  iconStart={<PauseCircle aria-hidden="true" className="size-4" />}
                  onClick={() => open("pause")}
                >
                  Pausar la venta
                </Button>
              )}
              {actions.includes("publish") && (
                <Button iconStart={<Send aria-hidden="true" className="size-4" />} onClick={() => open("publish")}>
                  Publicar
                </Button>
              )}
              {actions.includes("resume") && (
                <Button iconStart={<PlayCircle aria-hidden="true" className="size-4" />} onClick={() => open("resume")}>
                  Reanudar la venta
                </Button>
              )}
              {actions.includes("close") && (
                <Menu
                  align="end"
                  items={[{ label: "Cerrar la colección", destructive: true, onSelect: () => open("close") }]}
                  trigger={
                    <IconButton variant="outline" label="Más acciones de la colección">
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </IconButton>
                  }
                />
              )}
            </>
          }
        />
      </div>

      {me.data && !manage && (
        <Alert tone="info">
          Consulta en modo lectura: solo operaciones y administración publican, pausan, cierran o editan colecciones.
        </Alert>
      )}
      {failed && (
        <Alert
          tone="danger"
          title="La emisión falló"
          action={
            canRetry ? (
              <Button
                size="sm"
                variant="secondary"
                iconStart={<RotateCcw aria-hidden="true" className="size-4" />}
                onClick={() => setDialog({ kind: "retry", tx: failed })}
              >
                Reintentar la emisión
              </Button>
            ) : undefined
          }
        >
          {failed.lastError
            ? `${failed.lastError.message}. ${txErrorHelp(failed.lastError.code) ?? ""}`
            : "La red no confirmó la emisión."}{" "}
          Los NFT no existen hasta que se confirme: la colección no se puede publicar.
        </Alert>
      )}
      {held && !failed && (
        <Alert tone="warning" title="La emisión está en espera">
          {txErrorHelp(held.lastError?.code)} No hay nada que reintentar.
        </Alert>
      )}
      {inProgress && !failed && !held && (
        <Alert tone="info" title="Hay una operación en curso en la red">
          Esta pantalla se actualiza sola cada pocos segundos hasta que la red confirme.
        </Alert>
      )}
      {closure && closure.status === "SHORTFALL_OPEN" && tab !== "cierre" && (
        <Alert
          tone="warning"
          title="Cierre con faltante sin decidir"
          action={
            <Button size="sm" variant="secondary" onClick={() => url.set({ pestana: "cierre" })}>
              Ver el cierre
            </Button>
          }
        >
          El lote se embotelló con {fmtNumber(closure.bottles)} botellas y hay {fmtNumber(closure.minted)} NFT emitidos:
          faltan {fmtNumber(closure.shortfall)}.
        </Alert>
      )}

      <Tabs
        value={tab}
        // Los filtros de los NFT no acompañan a las demás pestañas.
        onValueChange={(v) =>
          url.set({
            pestana: v === "resumen" ? undefined : v,
            ...Object.fromEntries(Object.values(TOKEN_PARAMS).map((p) => [p, undefined])),
          })
        }
      >
        <TabsList aria-label="Secciones de la colección">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="nft">NFT ({fmtNumber(c.counts.minted)})</TabsTrigger>
          <TabsTrigger value="emisiones">Emisiones ({fmtNumber(c.mints.length)})</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="cierre">Cierre del lote</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen" className="pt-5">
          <SummaryTab collection={c} />
        </TabsContent>
        <TabsContent value="nft" className="pt-5">
          <TokensPanel collection={c} />
        </TabsContent>
        <TabsContent value="emisiones" className="pt-5">
          <MintsTab collection={c} onRetry={canRetry ? (tx) => setDialog({ kind: "retry", tx }) : undefined} />
        </TabsContent>
        <TabsContent value="historial" className="pt-5">
          <HistoryTab collection={c} />
        </TabsContent>
        <TabsContent value="cierre" className="pt-5">
          <ClosurePanel collection={c} />
        </TabsContent>
      </Tabs>

      {dialog?.kind === "action" && (
        <CollectionActionDialog collection={c} action={dialog.action} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "edit" && <EditCollectionPanel collection={c} onClose={() => setDialog(null)} />}
      {dialog?.kind === "retry" && <RetryTransactionDialog tx={dialog.tx} onClose={() => setDialog(null)} />}
    </div>
  );
}

function SummaryTab({ collection: c }: { collection: Collection }) {
  const m = c.metrics;
  const cm = c.commercial;
  return (
    <div className="grid gap-5">
      <section aria-label="Métricas de la colección" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="NFT emitidos"
          value={fmtNumber(m.counts.minted)}
          unit={`de ${fmtNumber(m.quota)}`}
          delta={
            m.authorizedVsEstimatePercent === null
              ? "Sin estimación del lote"
              : `La cuota es el ${fmtNumber(m.authorizedVsEstimatePercent, 1)} % de la estimación`
          }
          footer={
            <Progress
              size="sm"
              value={mintedPercent(c)}
              tone={c.mintStatus === "FAILED" ? "danger" : c.mintStatus === "CONFIRMED" ? "success" : "info"}
              label="NFT emitidos sobre la cuota"
              valueText={`${fmtNumber(m.counts.minted)} de ${fmtNumber(m.quota)}`}
            />
          }
        />
        <StatCard
          label="Disponibles"
          value={fmtNumber(m.counts.available)}
          delta={`${fmtNumber(m.counts.reserved)} reservados · ${fmtNumber(m.counts.sold)} vendidos`}
        />
        <StatCard
          label="Canjeables"
          value={fmtNumber(m.counts.redeemable)}
          delta={`${fmtNumber(m.counts.redeemed)} canjeados · ${fmtNumber(m.counts.burned)} quemados`}
        />
        <StatCard
          label="Coste en la red"
          value={<span className="text-2xl">{fmtXlm(m.chainCosts.feesChargedXlm)}</span>}
          delta={`${fmtNumber(m.chainCosts.transactions)} ${m.chainCosts.transactions === 1 ? "transacción" : "transacciones"} · lo paga la plataforma`}
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="grid gap-4 p-5">
          <SectionHeader title="Datos comerciales" description="Lo que ve el comprador en el Marketplace." />
          <KeyValueList
            items={[
              { term: "Nombre", value: cm.name },
              { term: "Descripción", value: <span className="whitespace-pre-line">{cm.description}</span> },
              { term: "Nota de cata", value: cm.tastingNotes ?? muted("Sin nota de cata") },
              { term: "Maridaje", value: cm.pairing ?? muted("Sin maridaje") },
              {
                term: "Fecha estimada de canje",
                value: cm.estimatedRedeemDate ? (
                  <time dateTime={cm.estimatedRedeemDate}>{fmtDate(cm.estimatedRedeemDate)}</time>
                ) : (
                  muted("Sin fecha")
                ),
              },
              { term: "Dirección pública", value: <span className="font-mono text-xs">{c.slug}</span> },
              {
                term: "Precio por botella",
                value: c.price ? (
                  <span className="tabular-nums">
                    {fmtBob(c.price.amountMinor)}{" "}
                    <span className="text-xs text-fg-muted">
                      · {c.price.source === "MANUAL" ? "manual" : "sugerido por la política"} · {c.price.setBy.fullName}
                    </span>
                  </span>
                ) : (
                  muted("Sin precio: el catálogo muestra «Precio por anunciar»")
                ),
              },
            ]}
          />
          {cm.images.length === 0 ? (
            <p className="text-fg-muted">Sin imágenes.</p>
          ) : (
            <ul className="flex flex-wrap gap-3" aria-label="Imágenes de la colección">
              {cm.images.map((image) => (
                <li key={image.id} className="grid w-20 gap-1">
                  <ImageThumb image={image} />
                  {image.isCover && <Badge tone="accent">Portada</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-5">
          <Card className="grid gap-4 p-5">
            <SectionHeader title="Emisión y contrato" />
            <KeyValueList
              layout="stacked"
              items={[
                { term: "Emisión", value: <MintStatusBadge collection={c} /> },
                {
                  term: "Contrato NFT de la bodega",
                  value: (
                    <span className="grid gap-1">
                      <ChainAddress value={c.contract.address} label="Contrato NFT de la bodega" size="sm" />
                      <ExplorerLink href={c.contract.explorerUrl} className="text-xs">
                        Ver el contrato en el explorador
                      </ExplorerLink>
                    </span>
                  ),
                },
                {
                  term: "Primera emisión",
                  value: m.firstMintedAt ? when(m.firstMintedAt) : muted("Sin confirmar"),
                },
                { term: "Publicada", value: c.publishedAt ? when(c.publishedAt) : muted("Sin publicar") },
                ...(c.closedAt ? [{ term: "Cerrada", value: when(c.closedAt) }] : []),
              ]}
            />
          </Card>
          <Card className="grid gap-4 p-5">
            <SectionHeader
              title="Lote"
              action={
                <TextLink asChild variant="inline">
                  <Link href={`/bodegas/${c.wineryId}?pestana=lotes&q=${encodeURIComponent(c.lot.reference)}`}>
                    Ver en la bodega
                  </Link>
                </TextLink>
              }
            />
            <KeyValueList
              layout="stacked"
              items={[
                { term: "Lote", value: `${c.lot.name} · ${lotProductLabel(c.lot.productType)} ${c.lot.harvestYear}` },
                {
                  term: "Etapa",
                  value: <Badge tone={LOT_STAGE_TONES[c.lot.stage] ?? "neutral"}>{lotStageLabel(c.lot.stage)}</Badge>,
                },
                {
                  term: "Código de lote",
                  value: c.lot.lotCode ? (
                    <span className="font-mono text-xs">{c.lot.lotCode}</span>
                  ) : (
                    muted("Sin embotellar")
                  ),
                },
                {
                  term: "Anclaje del expediente",
                  value: c.anchor ? <TxStatus tx={c.anchor.transaction} /> : muted("Se ancla al certificar el lote"),
                },
                {
                  term: "Canje",
                  value: c.redeemableSince ? (
                    <span>Canjeable desde el {when(c.redeemableSince)}</span>
                  ) : (
                    muted("Aún no es canjeable")
                  ),
                },
                ...(c.closure
                  ? [
                      {
                        term: "Cierre del lote",
                        value: (
                          <Badge tone={closureStatus(c.closure.status).tone}>
                            {closureStatus(c.closure.status).label}
                          </Badge>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Emisiones (una por solicitud aprobada) con sus transacciones, y todas las de la colección. */
function MintsTab({ collection: c, onRetry }: { collection: Collection; onRetry?: (tx: ChainTxRef) => void }) {
  const transactions = useCollectionTransactions(c.id, { limit: 50 }, collectionStamp(c));
  const mints = [...c.mints].sort((a, b) => b.sequence - a.sequence);
  return (
    <div className="grid gap-5">
      {mints.length === 0 ? (
        <EmptyState title="Sin emisiones" description="La emisión se crea al aprobar la solicitud." />
      ) : (
        mints.map((mint) => <MintCard key={mint.id} mint={mint} onRetry={onRetry} />)
      )}

      <Card className="grid gap-3 p-5">
        <SectionHeader
          title="Transacciones de la colección"
          description="Emisiones y quemas, de la más reciente a la más antigua."
        />
        <DataTable
          caption="Transacciones de la colección"
          captionHidden
          density="compact"
          data={transactions.data?.items ?? []}
          getRowId={(t) => t.id}
          loading={transactions.isPending}
          error={
            transactions.isError
              ? { description: errorMessage(transactions.error), onRetry: () => void transactions.refetch() }
              : undefined
          }
          empty={<EmptyState bare title="Sin transacciones" description="Aún no se envió nada a la red." />}
          columns={[
            { id: "kind", header: "Tipo", accessor: "kind", cell: (t) => txKindLabel(t.kind) },
            { id: "status", header: "Estado", accessor: "status", cell: (t) => <TxStatus tx={t} announce={false} /> },
            {
              id: "hash",
              header: "Hash",
              accessor: (t) => t.txHash ?? "",
              hideBelow: "lg",
              cell: (t) =>
                t.txHash ? <ChainAddress value={t.txHash} label="Hash de la transacción" size="sm" /> : muted("—"),
            },
            { id: "created", header: "Creada", accessor: "createdAt", hideBelow: "md", cell: (t) => when(t.createdAt) },
            {
              id: "detail",
              header: <span className="sr-only">Detalle</span>,
              cell: (t) => (
                <TextLink asChild variant="inline">
                  <Link href={`/cadena?tx=${t.id}`}>
                    Intentos<span className="sr-only"> de {txKindLabel(t.kind).toLowerCase()}</span>
                  </Link>
                </TextLink>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function MintCard({ mint, onRetry }: { mint: Mint; onRetry?: (tx: ChainTxRef) => void }) {
  const status = mintStatus(mint.status);
  const range = mintRangeLabel(mint);
  const failed = mint.transactions.find((t) => t.status === "FAILED");
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {mint.sequence === 1 ? "Emisión inicial" : `Ampliación n.º ${mint.sequence - 1}`} ·{" "}
            <span className="tabular-nums">{fmtNumber(mint.quantity)} NFT</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        description={
          <>
            Pedida el {when(mint.createdAt)}
            {mint.confirmedAt && <> · confirmada el {when(mint.confirmedAt)}</>} · lote en la red:{" "}
            <span className="font-mono">{mint.lotArg}</span>
          </>
        }
        action={
          failed && onRetry ? (
            <Button
              size="sm"
              variant="secondary"
              iconStart={<RotateCcw aria-hidden="true" className="size-4" />}
              onClick={() => onRetry(failed)}
            >
              Reintentar
            </Button>
          ) : undefined
        }
      />
      {range ? (
        <p className="tabular-nums">{range}</p>
      ) : (
        <p className="text-fg-muted">Los números de botella se fijan al confirmarse.</p>
      )}
      <TxRefList
        txs={mint.transactions}
        label={`Transacciones de la emisión ${mint.sequence}`}
        empty="La transacción se crea en cuanto el firmante toma la emisión."
      />
    </Card>
  );
}

/** Historial de cuota (solicitudes aprobadas), de precio y de estados de la colección. */
function HistoryTab({ collection: c }: { collection: Collection }) {
  const statuses = [...c.statusHistory].reverse();
  const prices = [...c.priceHistory].reverse();
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="grid gap-3 p-5">
        <SectionHeader title="Historial de cuota" description="Cada solicitud aprobada: la cuota no se reduce." />
        <DataTable
          caption="Historial de cuota"
          captionHidden
          density="compact"
          data={c.quotaHistory}
          getRowId={(q) => q.requestId}
          empty={<EmptyState bare title="Sin cambios de cuota" />}
          columns={[
            {
              id: "kind",
              header: "Solicitud",
              accessor: "kind",
              cell: (q) => (
                <TextLink asChild variant="inline">
                  <Link href={`/tokenizacion/${q.requestId}`}>{requestKindLabel(q.kind)}</Link>
                </TextLink>
              ),
            },
            {
              id: "quantity",
              header: "Botellas",
              accessor: "quantity",
              numeric: true,
              cell: (q) => `+${fmtNumber(q.quantity)}`,
            },
            {
              id: "quota",
              header: "Cuota",
              accessor: "resultingQuota",
              numeric: true,
              cell: (q) => fmtNumber(q.resultingQuota),
            },
            {
              id: "approved",
              header: "Aprobada",
              accessor: "approvedAt",
              cell: (q) => (
                <span className="grid">
                  {when(q.approvedAt)}
                  <span className="text-xs text-fg-muted">{q.approvedBy}</span>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Card className="grid gap-3 p-5">
        <SectionHeader title="Historial de precio" description="Del más reciente al más antiguo." />
        {prices.length === 0 ? (
          <p className="text-fg-muted">La colección nunca tuvo precio.</p>
        ) : (
          <ol className="grid divide-y divide-border" aria-label="Historial de precio">
            {prices.map((p, i) => (
              <li
                key={`${p.setAt}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <span className="font-medium tabular-nums">{fmtBob(p.amountMinor)}</span>
                <span className="text-xs text-fg-muted">
                  {p.source === "MANUAL" ? "Manual" : "Sugerido por la política"} · {p.setBy.fullName} · {when(p.setAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="grid gap-3 p-5 lg:col-span-2">
        <SectionHeader
          title="Historial de estados"
          action={
            <TextLink asChild variant="inline">
              <Link href={`/bitacora?recurso=collection&recursoId=${c.id}`}>Ver en la bitácora</Link>
            </TextLink>
          }
        />
        {statuses.length === 0 ? (
          <p className="text-fg-muted">Sin cambios de estado registrados.</p>
        ) : (
          <Timeline
            aria-label="Historial de estados de la colección"
            items={statuses.map((h, i) => ({
              key: `${h.at}-${i}`,
              title: collectionStatus(h.status).label,
              time: when(h.at),
              description: (
                <>
                  {h.by}
                  {h.reason ? <> · Motivo: «{h.reason}»</> : null}
                </>
              ),
              status: i === 0 ? "current" : "done",
            }))}
          />
        )}
      </Card>
    </div>
  );
}
