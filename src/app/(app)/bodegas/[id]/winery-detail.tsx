"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, PauseCircle, Pencil, PlayCircle, ScrollText } from "lucide-react";
import type { WineryDetail } from "@drinks-on-chain/mocks";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  KeyValueList,
  Menu,
  SkeletonText,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextLink,
  Timeline,
  getStatusBadge,
  type MenuEntry,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { categoryLabel } from "@/lib/platform/labels";
import { LOT_PARAMS } from "@/lib/platform/lots";
import { can } from "@/lib/platform/permissions";
import { useWinery } from "@/lib/platform/wineries";
import { oneOf, useUrlParams } from "@/lib/use-url-params";
import { ChainPanel } from "./chain-panel";
import { EditProfilePanel, StatusActionDialog, TransferOwnershipDialog, type WineryDialog } from "./winery-actions";
import { LotsPanel } from "./lots-panel";
import { TeamPanel } from "./team-panel";

const TABS = ["perfil", "equipo", "lotes", "cadena", "historial"] as const;
type Tab = (typeof TABS)[number];

const muted = (text: string) => <span className="text-fg-subtle">{text}</span>;

/**
 * 4B · Ficha de bodega: perfil, estado e historial, equipo y acciones con motivo; lotes en lectura
 * (Ola 2) e identidad en la red (Ola 3, pestaña «Cadena»).
 */
export function WineryDetailView({ id }: { id: string }) {
  const me = useMe();
  const url = useUrlParams();
  const canSeeChain = can(me.data, "chain.read");
  const requested: Tab = oneOf(TABS, url.get("pestana")) ?? "perfil";
  const tab: Tab = requested === "cadena" && me.data && !canSeeChain ? "perfil" : requested;
  const winery = useWinery(id);
  const [dialog, setDialog] = useState<WineryDialog | null>(null);
  const w = winery.data;

  if (winery.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }
  if (winery.isError || !w) {
    const notFound = winery.error instanceof ApiError && winery.error.isNotFound;
    return (
      <div className="grid gap-6">
        <PageHeader title="Bodega" />
        {notFound ? (
          <EmptyState
            title="La bodega no existe"
            description="Puede que el enlace esté mal copiado."
            action={
              <Button asChild variant="secondary">
                <Link href="/bodegas">Volver al directorio</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="No se pudo cargar la bodega"
            description={errorMessage(winery.error)}
            onRetry={() => void winery.refetch()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Breadcrumbs
          linkComponent={Link}
          label="Ruta"
          items={[{ label: "Bodegas", href: "/bodegas" }, { label: w.tradeName }]}
        />
        <PageHeader
          eyebrow="Bodega"
          title={w.tradeName}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge kind="winery" status={w.status} />
              {w.lotPrefix && (
                <Badge tone="neutral" className="font-mono" title="Prefijo de los códigos de lote">
                  {w.lotPrefix}
                </Badge>
              )}
              <span>
                {w.legalName} · NIT {w.taxId}
              </span>
            </span>
          }
          actions={<HeaderActions winery={w} onOpen={setDialog} />}
        />
      </div>

      <Tabs
        value={tab}
        // Los filtros de la pestaña «Lotes» no acompañan a las demás.
        onValueChange={(v) =>
          url.set({ pestana: v === "perfil" ? undefined : v, [LOT_PARAMS.stage]: undefined, [LOT_PARAMS.q]: undefined })
        }
      >
        <TabsList aria-label="Secciones de la bodega">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="equipo">Equipo ({fmtNumber(w.membersCount)})</TabsTrigger>
          <TabsTrigger value="lotes">Lotes</TabsTrigger>
          {canSeeChain && <TabsTrigger value="cadena">Cadena</TabsTrigger>}
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil" className="pt-5">
          <ProfileTab winery={w} />
        </TabsContent>
        <TabsContent value="equipo" className="pt-5">
          <TeamPanel winery={w} />
        </TabsContent>
        <TabsContent value="lotes" className="pt-5">
          <LotsPanel winery={w} />
        </TabsContent>
        {canSeeChain && (
          <TabsContent value="cadena" className="pt-5">
            <ChainPanel winery={w} />
          </TabsContent>
        )}
        <TabsContent value="historial" className="pt-5">
          <HistoryTab winery={w} />
        </TabsContent>
      </Tabs>

      {dialog === "edit" && <EditProfilePanel winery={w} onClose={() => setDialog(null)} />}
      {dialog === "transfer" && <TransferOwnershipDialog winery={w} onClose={() => setDialog(null)} />}
      {(dialog === "suspend" || dialog === "reactivate" || dialog === "revoke") && (
        <StatusActionDialog winery={w} action={dialog} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function HeaderActions({ winery: w, onOpen }: { winery: WineryDetail; onOpen: (d: WineryDialog) => void }) {
  const me = useMe();
  const canEdit = can(me.data, "wineries.create");
  const canSuspend = can(me.data, "wineries.suspend");
  const more: MenuEntry[] = [];
  if (
    can(me.data, "wineries.transferOwnership") &&
    (w.status === "ACTIVE" || w.status === "SUSPENDED") &&
    w.owner?.userId
  ) {
    more.push({ label: "Transferir la titularidad", onSelect: () => onOpen("transfer") });
  }
  if (can(me.data, "wineries.revoke") && w.status !== "REVOKED") {
    more.push({ label: "Revocar la bodega", destructive: true, onSelect: () => onOpen("revoke") });
  }

  return (
    <>
      <Button asChild variant="tertiary" iconStart={<ScrollText aria-hidden="true" className="size-4" />}>
        <Link href={`/bitacora?organizacion=${w.id}`}>Ver la bitácora de esta bodega</Link>
      </Button>
      {canEdit && w.status !== "REVOKED" && (
        <Button
          variant="secondary"
          iconStart={<Pencil aria-hidden="true" className="size-4" />}
          onClick={() => onOpen("edit")}
        >
          Editar el perfil
        </Button>
      )}
      {canSuspend && w.status === "ACTIVE" && (
        <Button
          variant="secondary"
          iconStart={<PauseCircle aria-hidden="true" className="size-4" />}
          onClick={() => onOpen("suspend")}
        >
          Suspender
        </Button>
      )}
      {canSuspend && w.status === "SUSPENDED" && (
        <Button iconStart={<PlayCircle aria-hidden="true" className="size-4" />} onClick={() => onOpen("reactivate")}>
          Reactivar
        </Button>
      )}
      {more.length > 0 && (
        <Menu
          align="end"
          items={more}
          trigger={
            <IconButton variant="outline" label="Más acciones de la bodega">
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </IconButton>
          }
        />
      )}
    </>
  );
}

function ProfileTab({ winery: w }: { winery: WineryDetail }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid gap-5">
        <Card className="grid gap-4 p-5">
          <SectionHeader title="Datos legales" />
          <KeyValueList
            items={[
              { term: "Razón social", value: w.legalName },
              { term: "Nombre comercial", value: w.tradeName },
              { term: "NIT", value: <span className="tabular-nums">{w.taxId}</span> },
              { term: "Categoría", value: categoryLabel(w.category) },
              { term: "Región", value: w.region },
              { term: "Dirección", value: w.address ?? muted("Sin dirección") },
              { term: "Registro SENASAG", value: w.senasagRegistration ?? muted("Sin registro") },
            ]}
          />
        </Card>
        <Card className="grid gap-4 p-5">
          <SectionHeader title="Contacto y perfil público" />
          <KeyValueList
            items={[
              {
                term: "Correo",
                value: (
                  <TextLink variant="inline" href={`mailto:${w.contactEmail}`}>
                    {w.contactEmail}
                  </TextLink>
                ),
              },
              { term: "Teléfono", value: w.contactPhone ?? muted("Sin teléfono") },
              {
                term: "Sitio web",
                value: w.website ? (
                  <TextLink variant="inline" href={w.website} target="_blank" rel="noopener noreferrer">
                    {w.website}
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </TextLink>
                ) : (
                  muted("Sin sitio web")
                ),
              },
              { term: "Logo", value: w.logoUrl ?? muted("Sin logo") },
              { term: "Slug público", value: <span className="font-mono text-xs">{w.slug}</span> },
              {
                term: "Historia pública",
                value: w.publicStory ? (
                  <span className="whitespace-pre-line">{w.publicStory}</span>
                ) : (
                  muted("Sin historia")
                ),
              },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-5">
        <Card className="grid gap-4 p-5">
          <SectionHeader title="Estado" />
          <KeyValueList
            layout="stacked"
            items={[
              { term: "Estado", value: <StatusBadge kind="winery" status={w.status} /> },
              {
                term: "Prefijo de lote",
                value: w.lotPrefix ? (
                  <span className="font-mono text-md">{w.lotPrefix}</span>
                ) : (
                  muted("Se asigna al activarse (definitivo).")
                ),
              },
              { term: "Alta", value: <time dateTime={w.createdAt}>{fmtDate(w.createdAt)}</time> },
              {
                term: "Activación",
                value: w.activatedAt ? (
                  <time dateTime={w.activatedAt}>{fmtDate(w.activatedAt)}</time>
                ) : (
                  muted("Pendiente")
                ),
              },
            ]}
          />
        </Card>
        <Card className="grid gap-4 p-5">
          <SectionHeader
            title="Dueño"
            action={
              <TextLink asChild variant="inline">
                <Link href={`/bodegas/${w.id}?pestana=equipo`}>Ver el equipo</Link>
              </TextLink>
            }
          />
          {w.owner ? (
            <div className="grid gap-0.5">
              <span className="font-medium">{w.owner.fullName}</span>
              <span className="text-fg-muted">{w.owner.email}</span>
              {w.owner.userId === null && (
                <span className="text-xs text-fg-subtle">Invitación pendiente de aceptar.</span>
              )}
            </div>
          ) : (
            muted("Sin dueño")
          )}
        </Card>
      </div>
    </div>
  );
}

/** Historial de estados (`statusHistory`), del más reciente al más antiguo. */
function HistoryTab({ winery: w }: { winery: WineryDetail }) {
  const items = [...w.statusHistory].reverse();
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Historial de estados"
        description="Cada cambio con quién lo hizo y por qué."
        action={
          <TextLink asChild variant="inline">
            <Link href={`/bitacora?organizacion=${w.id}`}>Toda la actividad en la bitácora</Link>
          </TextLink>
        }
      />
      {items.length === 0 ? (
        <p className="text-fg-muted">Sin cambios de estado registrados.</p>
      ) : (
        <Timeline
          aria-label="Historial de estados"
          items={items.map((h, i) => ({
            key: `${h.at}-${i}`,
            title: getStatusBadge("winery", h.status).label,
            time: <time dateTime={h.at}>{fmtDateTime(h.at)}</time>,
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
  );
}
