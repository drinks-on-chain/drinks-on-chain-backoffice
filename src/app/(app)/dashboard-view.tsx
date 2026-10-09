"use client";

import Link from "next/link";
import type { AuditEvent, Dashboard } from "@drinks-on-chain/mocks";
import { AlertsFeed, Button, Card, CardHeader, ErrorState, KpiCard, SkeletonText, TextLink } from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtAge, fmtDateTime, fmtNumber, fmtRelative, fmtXlm } from "@/lib/format";
import { networkLabel, reconciliationStatus } from "@/lib/platform/chain-labels";
import { transactionsHref } from "@/lib/platform/chain-utils";
import { collectionsHref } from "@/lib/platform/collections-utils";
import { auditActionLabel, auditActorLabel } from "@/lib/platform/labels";
import { useDashboard } from "@/lib/platform/hooks";
import { can } from "@/lib/platform/permissions";
import { tokenizationHref } from "@/lib/platform/tokenization-utils";
import { waitlistHref } from "@/lib/platform/waitlist-utils";

// 4A · Tablero (`GET /v1/platform/dashboard`, contrato de la Ola 1 §8, PLT-06), con los bloques
// `tokenization` y `chain` de la Ola 3 (contrato O3 §11).
export function DashboardView() {
  const me = useMe();
  const dashboard = useDashboard();
  const d = dashboard.data;
  const loading = dashboard.isPending;
  // Lista de espera (contrato O1b): una tarjeta más para quien tiene la capacidad `waitlist`.
  const showWaitlist = can(me.data, "waitlist.read");
  const kpiColumns = showWaitlist ? "lg:grid-cols-3 2xl:grid-cols-5" : "xl:grid-cols-4";
  const showTokenization = can(me.data, "tokenization.read");
  const showChain = can(me.data, "chain.read");

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Tablero"
        description="Solicitudes, bodegas, invitaciones, equipo, lista de espera, tokenización y red de un vistazo, con las alertas y la última actividad."
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
          <section aria-label="Indicadores" className={`grid gap-4 sm:grid-cols-2 ${kpiColumns}`}>
            <KpiCard
              label="Solicitudes abiertas"
              loading={loading}
              loadingLabel="Cargando solicitudes"
              value={d ? fmtNumber(openApplications(d)) : "—"}
              delta={
                d ? (
                  <Link href="/solicitudes?estado=UNVERIFIED" className={kpiLink}>
                    {fmtNumber(d.applications.unverified)} sin verificar
                  </Link>
                ) : undefined
              }
              breakdown={
                d
                  ? [
                      breakdownLink("received", "Recibidas", d.applications.received, "/solicitudes?estado=RECEIVED"),
                      breakdownLink(
                        "inReview",
                        "En revisión",
                        d.applications.inReview,
                        "/solicitudes?estado=IN_REVIEW",
                      ),
                      breakdownLink(
                        "meeting",
                        "Reunión",
                        d.applications.meetingScheduled,
                        "/solicitudes?estado=MEETING_SCHEDULED",
                      ),
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
                      breakdownLink("invited", "Invitadas", d.wineries.invited, "/bodegas?estado=INVITED"),
                      breakdownLink("suspended", "Suspendidas", d.wineries.suspended, "/bodegas?estado=SUSPENDED"),
                    ]
                  : undefined
              }
              href="/bodegas?estado=ACTIVE"
              linkLabel="Ver bodegas activas"
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
              href={can(me.data, "users.read") ? "/usuarios?estado=INVITED" : "/bodegas?estado=INVITED"}
              linkLabel={can(me.data, "users.read") ? "Ver invitaciones internas" : "Ver bodegas invitadas"}
              linkComponent={Link}
            />
            <KpiCard
              label="Miembros bloqueados"
              loading={loading}
              loadingLabel="Cargando equipo"
              value={d ? fmtNumber(d.team.blockedMembers) : "—"}
              delta="En bodegas y en la plataforma"
              href="/bitacora?accion=MEMBER_BLOCKED"
              linkLabel="Ver bloqueos en la bitácora"
              linkComponent={Link}
            />
            {showWaitlist && (
              <KpiCard
                label="Lista de espera"
                loading={loading}
                loadingLabel="Cargando la lista de espera"
                value={d ? fmtNumber(d.waitlist.consumers + d.waitlist.wineries) : "—"}
                delta={d ? last24hLabel(d.waitlist.last24h) : undefined}
                trend={d && d.waitlist.last24h > 0 ? "up" : "neutral"}
                breakdown={
                  d
                    ? [
                        breakdownLink("consumers", "Consumidores", d.waitlist.consumers, waitlistHref()),
                        breakdownLink("wineries", "Bodegas", d.waitlist.wineries, waitlistHref({ type: "WINERY" })),
                      ]
                    : undefined
                }
                href={waitlistHref()}
                linkLabel="Ver la lista de espera"
                linkComponent={Link}
              />
            )}
          </section>

          {(showTokenization || showChain) && (
            <section aria-labelledby="tablero-tokenizacion" className="grid gap-3">
              <h2 id="tablero-tokenizacion" className="m-0 font-ui text-md font-semibold text-fg">
                Tokenización y cadena
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {showTokenization && (
                  <>
                    <KpiCard
                      label="Solicitudes de tokenización"
                      loading={loading}
                      loadingLabel="Cargando las solicitudes de tokenización"
                      value={d ? fmtNumber(openTokenization(d)) : "—"}
                      tone={d && d.tokenization.submitted > 0 ? "warning" : "neutral"}
                      delta={d ? oldestLabel(openTokenization(d), d.tokenization.oldestOpenHours) : undefined}
                      breakdown={
                        d
                          ? [
                              breakdownLink(
                                "submitted",
                                "Sin tomar",
                                d.tokenization.submitted,
                                tokenizationHref({ status: "SUBMITTED" }),
                              ),
                              breakdownLink(
                                "inReview",
                                "En revisión",
                                d.tokenization.inReview,
                                tokenizationHref({ status: "IN_REVIEW" }),
                              ),
                              breakdownLink(
                                "changes",
                                "Cambios pedidos",
                                d.tokenization.changesRequested,
                                tokenizationHref({ status: "CHANGES_REQUESTED" }),
                              ),
                            ]
                          : undefined
                      }
                      href={tokenizationHref()}
                      linkLabel="Ver la bandeja de tokenización"
                      linkComponent={Link}
                    />
                    <KpiCard
                      label="Colecciones publicadas"
                      loading={loading}
                      loadingLabel="Cargando las colecciones"
                      value={d ? fmtNumber(d.tokenization.collectionsPublished) : "—"}
                      tone={
                        d && d.tokenization.mintFailures > 0
                          ? "danger"
                          : d && d.tokenization.shortfallsOpen > 0
                            ? "warning"
                            : "neutral"
                      }
                      breakdown={
                        d
                          ? [
                              breakdownLink(
                                "minting",
                                "Emitiendo",
                                d.tokenization.collectionsMinting,
                                collectionsHref({ status: "MINTING" }),
                              ),
                              breakdownLink(
                                "mintFailures",
                                "Emisiones fallidas",
                                d.tokenization.mintFailures,
                                collectionsHref({ mintStatus: "FAILED" }),
                              ),
                              breakdownLink(
                                "shortfalls",
                                "Faltantes sin decidir",
                                d.tokenization.shortfallsOpen,
                                collectionsHref(),
                              ),
                            ]
                          : undefined
                      }
                      href={collectionsHref({ status: "PUBLISHED" })}
                      linkLabel="Ver las colecciones publicadas"
                      linkComponent={Link}
                    />
                  </>
                )}
                {showChain && (
                  <>
                    <KpiCard
                      label="Alertas de la cadena"
                      loading={loading}
                      loadingLabel="Cargando el estado de la red"
                      value={d ? fmtNumber(d.chain.openAlerts.critical + d.chain.openAlerts.warning) : "—"}
                      tone={
                        d && d.chain.openAlerts.critical > 0
                          ? "danger"
                          : d && d.chain.openAlerts.warning > 0
                            ? "warning"
                            : "neutral"
                      }
                      delta={d ? reconciliationLabel(d) : undefined}
                      breakdown={
                        d
                          ? [
                              breakdownLink(
                                "critical",
                                "Críticas",
                                d.chain.openAlerts.critical,
                                "/cadena/alertas?nivel=CRITICAL",
                              ),
                              breakdownLink(
                                "failed",
                                "Transacciones fallidas",
                                d.chain.failedTransactions,
                                transactionsHref({ status: "FAILED" }),
                              ),
                              breakdownLink(
                                "stuck",
                                "Atascadas",
                                d.chain.stuckTransactions,
                                transactionsHref({ status: "SUBMITTED" }),
                              ),
                            ]
                          : undefined
                      }
                      href="/cadena/alertas"
                      linkLabel="Ver las alertas de la cadena"
                      linkComponent={Link}
                    />
                    <KpiCard
                      label={d ? `Saldo de operaciones · ${networkLabel(d.chain.network)}` : "Saldo de operaciones"}
                      loading={loading}
                      loadingLabel="Cargando los saldos de la plataforma"
                      value={d ? <span className="text-2xl">{fmtXlm(d.chain.operationsBalanceXlm)}</span> : "—"}
                      delta={d ? `Indexador: ${fmtNumber(d.chain.indexerLagSeconds)} s de retraso` : undefined}
                      breakdown={
                        d
                          ? [{ key: "anchor", label: "Cuenta de anclaje", value: fmtXlm(d.chain.anchorBalanceXlm) }]
                          : undefined
                      }
                      href="/cadena/cuentas"
                      linkLabel="Ver las cuentas de la plataforma"
                      linkComponent={Link}
                    />
                  </>
                )}
              </div>
            </section>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card className="p-5">
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
            </Card>
            <RecentActivity events={d?.recentAudit} loading={loading} />
          </div>
        </>
      )}
    </div>
  );
}

const kpiLink =
  "rounded-sm underline decoration-border-strong underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Cifra del desglose como enlace a la lista filtrada. */
function breakdownLink(key: string, label: string, value: number, href: string) {
  return {
    key,
    label,
    value: (
      <Link href={href} className={kpiLink}>
        {fmtNumber(value)}
        <span className="sr-only"> {label.toLowerCase()}: ver la lista</span>
      </Link>
    ),
  };
}

const openApplications = (d: Dashboard) =>
  d.applications.received + d.applications.inReview + d.applications.meetingScheduled;

const openTokenization = (d: Dashboard) =>
  d.tokenization.submitted + d.tokenization.inReview + d.tokenization.changesRequested;

/** Antigüedad de la solicitud de tokenización abierta más antigua. */
const oldestLabel = (open: number, hours: number) =>
  open === 0 ? "Ninguna abierta" : `La más antigua lleva ${fmtAge(hours)}`;

/** Última conciliación con la red: resultado y cuándo. */
function reconciliationLabel(d: Dashboard) {
  const last = d.chain.lastReconciliation;
  if (!last) return "Sin conciliaciones todavía";
  return `Última conciliación: ${reconciliationStatus(last.status).label.toLowerCase()} · ${fmtRelative(last.at)}`;
}

const last24hLabel = (n: number) => (n === 0 ? "Ninguna en las últimas 24 h" : `${fmtNumber(n)} en las últimas 24 h`);

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
          <TextLink asChild variant="inline">
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
