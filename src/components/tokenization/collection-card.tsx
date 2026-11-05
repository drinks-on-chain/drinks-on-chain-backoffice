"use client";

import Image from "next/image";
import Link from "next/link";
import { Wine } from "lucide-react";
import type { CollectionSummary } from "@drinks-on-chain/mocks";
import { Badge, Card, ExplorerLink, Progress, TextLink } from "@drinks-on-chain/ui";
import { fmtBob, fmtNumber } from "@/lib/format";
import { collectionStatus, mintStatus, saleStateLabel } from "@/lib/platform/chain-labels";
import { mintInProgress, mintedPercent } from "@/lib/platform/collections-utils";
import { lotProductLabel } from "@/lib/platform/labels";
import { assetUrl } from "./commercial-editor";

/** Estado comercial de la colección y, si está publicada, su estado de venta. */
export function CollectionStatusBadges({ collection: c }: { collection: CollectionSummary }) {
  const status = collectionStatus(c.status);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
      {c.saleState && <Badge tone="neutral">{saleStateLabel(c.saleState)}</Badge>}
      {c.redeemable && <Badge tone="success">Canjeable</Badge>}
    </span>
  );
}

/** Estado de la última emisión; con una ampliación en curso, cuántos NFT faltan por confirmarse. */
export function MintStatusBadge({ collection: c }: { collection: CollectionSummary }) {
  const status = mintStatus(c.mintStatus);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={status.tone}>Emisión: {status.label.toLowerCase()}</Badge>
      {c.pendingMintQuantity > 0 && mintInProgress(c) && (
        <span className="text-xs text-fg-muted tabular-nums">+{fmtNumber(c.pendingMintQuantity)} en camino</span>
      )}
    </span>
  );
}

/**
 * Tarjeta de una colección (`CollectionCard` de docs-front/05 §3.3): portada, estado, emisión,
 * cuota y enlace al contrato en el explorador (siempre el `explorerUrl` del backend).
 * Pendiente de llevar a @drinks-on-chain/ui: `CollectionCard`.
 */
export function CollectionCard({ collection: c }: { collection: CollectionSummary }) {
  const href = `/colecciones/${c.id}`;
  return (
    <Card className="grid grid-rows-[auto_1fr] overflow-hidden" padding="none">
      <div className="relative aspect-[16/9] bg-bg-sunken">
        {c.coverImageUrl ? (
          <Image
            src={assetUrl(c.coverImageUrl)}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-fg-subtle">
            <Wine aria-hidden="true" className="size-8" strokeWidth={1.25} />
          </span>
        )}
      </div>
      <div className="grid content-start gap-3 p-4">
        <div className="grid gap-1">
          <h2 className="m-0 font-ui text-md leading-snug font-semibold">
            <TextLink asChild variant="inline">
              <Link href={href}>{c.name}</Link>
            </TextLink>
          </h2>
          <p className="text-xs text-fg-muted">
            {c.winery.tradeName} · {lotProductLabel(c.lot.productType)} {c.lot.harvestYear} ·{" "}
            <span className="font-mono">{c.lot.reference}</span>
          </p>
        </div>
        <CollectionStatusBadges collection={c} />
        <MintStatusBadge collection={c} />
        <div className="grid gap-1">
          <Progress
            size="sm"
            value={mintedPercent(c)}
            tone={c.mintStatus === "FAILED" ? "danger" : c.mintStatus === "CONFIRMED" ? "success" : "info"}
            label={`NFT emitidos de ${c.name}`}
            valueText={`${fmtNumber(c.counts.minted)} de ${fmtNumber(c.quota)}`}
          />
          <p className="flex flex-wrap justify-between gap-x-3 text-xs text-fg-muted tabular-nums">
            <span>
              {fmtNumber(c.counts.minted)} de {fmtNumber(c.quota)} emitidos
            </span>
            <span>
              {fmtNumber(c.counts.available)} disponibles · {fmtNumber(c.counts.sold)} vendidos
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
          <span className="tabular-nums">{c.price ? fmtBob(c.price.amountMinor) : "Precio por anunciar"}</span>
          <ExplorerLink href={c.contract.explorerUrl} className="text-xs">
            Contrato en el explorador<span className="sr-only"> de {c.name}</span>
          </ExplorerLink>
        </div>
      </div>
    </Card>
  );
}
