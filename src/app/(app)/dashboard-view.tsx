"use client";

import Link from "next/link";
import type { AuditEvent, Dashboard } from "@drinks-on-chain/mocks";
import { AlertsFeed, Button, Card, CardHeader, ErrorState, KpiCard, SkeletonText, TextLink } from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber, fmtRelative } from "@/lib/format";
import { auditActionLabel, auditActorLabel } from "@/lib/platform/labels";
import { useDashboard } from "@/lib/platform/hooks";
import { can } from "@/lib/platform/permissions";

// 4A · Tablero (`GET /v1/platform/dashboard`, contrato de la Ola 1 §8, PLT-06).
export function DashboardView() {
  const me = useMe();
  const dashboard = useDashboard();
  const d = dashboard.data;
  const loading = dashboard.isPending;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Tablero"
        description="Solicitudes, bodegas, invitaciones y equipo de un vistazo, con las alertas y la última actividad."
      />

      {dashboard.isError ? (
        <Card className="p-6">
          <ErrorState
            bare
            title="No se pudo cargar el tablero"
            description={errorMessage(dashboard.error)}
            onRetry={() => dashboard.refetch()}
            retrying={dashboard.isFetching}
          />
        </Card>
      ) : (
        <>
          <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Solicitudes abiertas"
              loading={loading}
              loadingLabel="Cargando solicitudes"
              value={d ? fmtNumber(openApplications(d)) : "—"}
              delta={d ? `${fmtNumber(d.applications.unverified)} sin verificar` : undefined}
              breakdown={
                d
                  ? [
                      { key: "received", label: "Recibidas", value: fmtNumber(d.applications.received) },
                      { key: "inReview", label: "En revisión", value: fmtNumber(d.applications.inReview) },
                      { key: "meeting", label: "Reunión", value: fmtNumber(d.applications.meetingScheduled) },
                    ]
                  : undefined
              }
              href="/solicitudes"
              linkLabel="Ver bandeja"
              linkComponent={Link}
            />
            <KpiCard
              label="Bodegas activas"
              loading={loading}
              loadingLabel="Cargando bodegas"
              value={d ? fmtNumber(d.wineries.active) : "—"}
              breakdown={
                d
                  ? [
                      { key: "invited", label: "Invitadas", value: fmtNumber(d.wineries.invited) },
                      { key: "suspended", label: "Suspendidas", value: fmtNumber(d.wineries.suspended) },
                    ]
                  : undefined
              }
              href="/bodegas"
              linkLabel="Ver directorio"
              linkComponent={Link}
            />
            <KpiCard
              label="Invitaciones pendientes"
              loading={loading}
              loadingLabel="Cargando invitaciones"
              value={d ? fmtNumber(d.invitations.pending) : "—"}
              tone={d && d.invitations.expiringIn24h > 0 ? "warning" : "neutral"}
              delta={d ? expiringLabel(d.invitations.expiringIn24h) : undefined}
              trend={d && d.invitations.expiringIn24h > 0 ? "down" : "neutral"}
              href={can(me.data, "users.read") ? "/usuarios?estado=INVITED" : undefined}
              linkLabel="Ver invitaciones internas"
              linkComponent={Link}
            />
            <KpiCard
              label="Miembros bloqueados"
              loading={loading}
              loadingLabel="Cargando equipo"
              value={d ? fmtNumber(d.team.blockedMembers) : "—"}
              delta="En bodegas y en la plataforma"
            />
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <AlertsFeed
              title="Alertas"
              headingLevel={2}
              loading={loading}
              items={(d?.alerts ?? []).map((a) => ({
                id: a.id,
                level: a.level,
                message: a.message,
                time: <time dateTime={a.createdAt}>{fmtRelative(a.createdAt)}</time>,
                action: a.link ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={a.link}>
                      Ver<span className="sr-only">: {a.message}</span>
                    </Link>
                  </Button>
                ) : undefined,
              }))}
              empty="Sin alertas: todo en orden."
            />
            <RecentActivity events={d?.recentAudit} loading={loading} />
          </div>
        </>
      )}
    </div>
  );
}

const openApplications = (d: Dashboard) =>
  d.applications.received + d.applications.inReview + d.applications.meetingScheduled;

const expiringLabel = (n: number) =>
  n === 0 ? "Ninguna caduca en 24 h" : n === 1 ? "1 caduca en 24 h" : `${fmtNumber(n)} caducan en 24 h`;

/** Últimos 5 eventos de la bitácora (`recentAudit`), con enlace a la bitácora completa. */
function RecentActivity({ events, loading }: { events: AuditEvent[] | undefined; loading: boolean }) {
  return (
    <Card className="grid gap-3 p-5">
      <CardHeader
        title="Actividad reciente"
        description="Últimos movimientos de la bitácora."
        action={
          <TextLink asChild>
            <Link href="/bitacora">Ver la bitácora</Link>
          </TextLink>
        }
      />
      {loading ? (
        <SkeletonText lines={5} />
      ) : !events || events.length === 0 ? (
        <p className="text-fg-muted">Aún no hay actividad registrada.</p>
      ) : (
        <ol className="grid divide-y divide-border" aria-label="Actividad reciente">
          {events.map((e) => (
            <li key={e.id} className="grid gap-0.5 py-2.5 first:pt-0 last:pb-0">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{auditActionLabel(e.action)}</span>
                <time dateTime={e.occurredAt} title={fmtDateTime(e.occurredAt)} className="text-xs text-fg-subtle">
                  {fmtRelative(e.occurredAt)}
                </time>
              </p>
              <p className="text-xs text-fg-muted">
                {auditActorLabel(e.actor)}
                {e.reason ? <> · Motivo: «{e.reason}»</> : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
