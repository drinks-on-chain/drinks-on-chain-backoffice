"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Hand, NotebookPen, XCircle } from "lucide-react";
import type { ApproveApplicationResponse, WineryApplication } from "@drinks-on-chain/mocks";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  KeyValueList,
  SkeletonText,
  StatusBadge,
  TextLink,
  Textarea,
  Timeline,
  toast,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtLocalDateTime, fmtRelative } from "@/lib/format";
import { useAddApplicationNote, useApplication, useTakeApplication } from "@/lib/platform/applications";
import { useAudit } from "@/lib/platform/audit";
import { validateNote } from "@/lib/platform/forms";
import { auditActionLabel, auditActorLabel, categoryLabel, meetingChannelLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { useWinery } from "@/lib/platform/wineries";
import {
  ApproveDialog,
  MeetingDoneDialog,
  RejectDialog,
  ScheduleMeetingDialog,
  type ApplicationDialog,
} from "./application-dialogs";

const icon = "size-4";

/** 4B · Detalle de una solicitud de alta: datos, notas, reunión, decisión e historial. */
export function ApplicationDetail({ id }: { id: string }) {
  const me = useMe();
  const application = useApplication(id);
  const [dialog, setDialog] = useState<ApplicationDialog | null>(null);
  const [approved, setApproved] = useState<ApproveApplicationResponse | null>(null);
  const a = application.data;

  if (application.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }
  if (application.isError || !a) {
    const notFound = application.error instanceof ApiError && application.error.isNotFound;
    return (
      <div className="grid gap-6">
        <PageHeader title="Solicitud" />
        {notFound ? (
          <EmptyState
            title="La solicitud no existe"
            description="Puede que el enlace esté mal copiado."
            action={
              <Button asChild variant="secondary">
                <Link href="/solicitudes">Volver a la bandeja</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="No se pudo cargar la solicitud"
            description={errorMessage(application.error)}
            onRetry={() => void application.refetch()}
          />
        )}
      </div>
    );
  }

  const manage = can(me.data, "applications.manage");

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Breadcrumbs
          linkComponent={Link}
          label="Ruta"
          items={[{ label: "Solicitudes", href: "/solicitudes" }, { label: a.tradeName }]}
        />
        <PageHeader
          eyebrow="Solicitud de alta"
          title={a.tradeName}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge kind="application" status={a.status} />
              <span>
                {a.legalName} · NIT {a.taxId}
              </span>
            </span>
          }
          actions={manage ? <Actions application={a} onOpen={setDialog} /> : null}
        />
      </div>

      {!manage && (
        <Alert tone="info">Consulta en modo lectura: solo operaciones y administración tramitan las solicitudes.</Alert>
      )}
      {approved && <ApprovedNotice result={approved} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <Card className="grid gap-4 p-5">
            <SectionHeader title="Datos de la solicitud" />
            <KeyValueList
              items={[
                { term: "Razón social", value: a.legalName },
                { term: "Nombre comercial", value: a.tradeName },
                { term: "NIT", value: <span className="tabular-nums">{a.taxId}</span> },
                { term: "Categoría", value: categoryLabel(a.category) },
                { term: "Región", value: a.region },
                {
                  term: "Contacto",
                  value: (
                    <span className="grid">
                      <span>{a.contactName}</span>
                      <TextLink variant="inline" href={`mailto:${a.contactEmail}`}>
                        {a.contactEmail}
                      </TextLink>
                      {a.contactPhone && <span>{a.contactPhone}</span>}
                    </span>
                  ),
                },
                {
                  term: "Recibida",
                  value: <time dateTime={a.createdAt}>{fmtDateTime(a.createdAt)}</time>,
                },
                {
                  term: "Asignada a",
                  value: a.assignee ? a.assignee.fullName : <span className="text-fg-subtle">Sin asignar</span>,
                },
              ]}
            />
            {a.message && (
              <div className="grid gap-1">
                <h3 className="text-xs font-medium tracking-label text-fg-subtle uppercase">Mensaje de la bodega</h3>
                <blockquote className="border-l-2 border-accent pl-3 whitespace-pre-line text-fg-muted">
                  {a.message}
                </blockquote>
              </div>
            )}
          </Card>

          {a.meeting && <MeetingCard application={a} />}
          {a.decision && <DecisionCard application={a} />}
          <NotesCard application={a} canWrite={manage && a.status !== "UNVERIFIED"} />
        </div>

        <HistoryCard application={a} />
      </div>

      {dialog === "approve" && (
        <ApproveDialog
          application={a}
          onClose={() => setDialog(null)}
          onApproved={(result) => {
            setApproved(result);
            setDialog(null);
          }}
        />
      )}
      {dialog === "reject" && <RejectDialog application={a} onClose={() => setDialog(null)} />}
      {dialog === "meeting" && <ScheduleMeetingDialog application={a} onClose={() => setDialog(null)} />}
      {dialog === "meeting-done" && <MeetingDoneDialog application={a} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Acciones según el estado (transiciones del contrato §3); el oro es la acción principal. */
function Actions({
  application: a,
  onOpen,
}: {
  application: WineryApplication;
  onOpen: (dialog: ApplicationDialog) => void;
}) {
  const take = useTakeApplication(a.id);
  switch (a.status) {
    case "RECEIVED":
      return (
        <Button
          loading={take.isPending}
          iconStart={<Hand aria-hidden="true" className={icon} />}
          onClick={() =>
            take.mutate(undefined, {
              onSuccess: () =>
                toast({ title: "Solicitud tomada: ahora está en revisión y asignada a ti.", tone: "success" }),
              onError: (error) => toast({ title: errorMessage(error), tone: "danger" }),
            })
          }
        >
          Tomar la solicitud
        </Button>
      );
    case "IN_REVIEW":
      return (
        <>
          <Button
            variant="secondary"
            iconStart={<XCircle aria-hidden="true" className={icon} />}
            onClick={() => onOpen("reject")}
          >
            Rechazar
          </Button>
          <Button
            variant="secondary"
            iconStart={<CalendarClock aria-hidden="true" className={icon} />}
            onClick={() => onOpen("meeting")}
          >
            Agendar reunión
          </Button>
          <Button iconStart={<CheckCircle2 aria-hidden="true" className={icon} />} onClick={() => onOpen("approve")}>
            Aprobar
          </Button>
        </>
      );
    case "MEETING_SCHEDULED":
      return (
        <Button iconStart={<NotebookPen aria-hidden="true" className={icon} />} onClick={() => onOpen("meeting-done")}>
          Registrar la reunión
        </Button>
      );
    default:
      return null;
  }
}

/** Resultado de aprobar: enlaces a la bodega creada y a la invitación enviada. */
function ApprovedNotice({ result }: { result: ApproveApplicationResponse }) {
  const { winery, invitation } = result;
  return (
    <Alert tone="success" title="Bodega creada e invitación enviada">
      <p>
        <TextLink asChild variant="inline">
          <Link href={`/bodegas/${winery.id}`}>{winery.tradeName}</Link>
        </TextLink>{" "}
        queda «Invitada» hasta que su dueño acepte. Invitación enviada a <strong>{invitation.email}</strong> (caduca el{" "}
        <time dateTime={invitation.expiresAt}>{fmtDateTime(invitation.expiresAt)}</time>):{" "}
        <TextLink asChild variant="inline">
          <Link href={`/bodegas/${winery.id}?pestana=equipo`}>ver la invitación en el equipo</Link>
        </TextLink>
        .
      </p>
    </Alert>
  );
}

function MeetingCard({ application: a }: { application: WineryApplication }) {
  const meeting = a.meeting!;
  return (
    <Card className="grid gap-3 p-5">
      <SectionHeader
        title="Reunión"
        description={a.status === "MEETING_SCHEDULED" ? "Pendiente de registrar cómo fue." : "Hecha."}
      />
      <KeyValueList
        items={[
          {
            term: "Cuándo",
            value: <time dateTime={meeting.scheduledAt}>{fmtLocalDateTime(meeting.scheduledAt)}</time>,
          },
          { term: "Canal", value: meetingChannelLabel(meeting.channel) },
          { term: "Notas", value: meeting.notes ?? <span className="text-fg-subtle">Sin notas</span> },
        ]}
      />
    </Card>
  );
}

function DecisionCard({ application: a }: { application: WineryApplication }) {
  const decision = a.decision!;
  const winery = useWinery(a.wineryId ?? "", Boolean(a.wineryId));
  const w = a.wineryId ? winery.data : undefined;
  return (
    <Card className="grid gap-3 p-5">
      <SectionHeader title={a.status === "APPROVED" ? "Aprobada" : "Rechazada"} />
      <KeyValueList
        items={[
          { term: "Por", value: decision.by },
          { term: "Cuándo", value: <time dateTime={decision.at}>{fmtDateTime(decision.at)}</time> },
          { term: "Motivo", value: decision.reason ?? <span className="text-fg-subtle">Sin motivo</span> },
          ...(a.wineryId
            ? [
                {
                  term: "Bodega",
                  value: (
                    <span className="flex flex-wrap items-center gap-2">
                      <TextLink asChild variant="inline">
                        <Link href={`/bodegas/${a.wineryId}`}>{w?.tradeName ?? a.tradeName}</Link>
                      </TextLink>
                      {w && <StatusBadge kind="winery" status={w.status} />}
                    </span>
                  ),
                },
                {
                  term: "Invitación al dueño",
                  value: w?.owner ? (
                    <span>
                      {w.owner.fullName} · {w.owner.email}
                      {w.owner.userId === null ? (
                        <>
                          {" "}
                          · pendiente de aceptar (
                          <TextLink asChild variant="inline">
                            <Link href={`/bodegas/${a.wineryId}?pestana=equipo`}>ver en el equipo</Link>
                          </TextLink>
                          )
                        </>
                      ) : (
                        " · aceptada"
                      )}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}

function NotesCard({ application: a, canWrite }: { application: WineryApplication; canWrite: boolean }) {
  const add = useAddApplicationNote(a.id);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const server = fieldErrorsFrom(add.error, ["text"]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = validateNote(text);
    setError(problem);
    if (problem) return;
    add.mutate(text.trim(), {
      onSuccess: () => {
        setText("");
        toast({ title: "Nota añadida.", tone: "success" });
      },
    });
  }

  const other = add.error && !server.fieldErrors.text ? errorMessage(add.error) : null;

  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader title="Notas" description="Solo las ve el equipo de Drinks on Chain." />
      {a.notes.length === 0 ? (
        <p className="text-fg-muted">Aún no hay notas.</p>
      ) : (
        <ol className="grid divide-y divide-border" aria-label="Notas de la solicitud">
          {[...a.notes].reverse().map((n) => (
            <li key={n.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
              <p className="whitespace-pre-line">{n.text}</p>
              <p className="text-xs text-fg-muted">
                {n.by} ·{" "}
                <time dateTime={n.at} title={fmtDateTime(n.at)}>
                  {fmtRelative(n.at)}
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}
      {canWrite && (
        <form onSubmit={onSubmit} className="grid gap-2" noValidate>
          {other && <Alert tone="danger">{other}</Alert>}
          <Field label="Nota nueva" error={error ?? server.fieldErrors.text}>
            <Textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={add.isPending}>
              Añadir la nota
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** Historial de la solicitud: sus eventos de la bitácora, del más reciente al más antiguo. */
function HistoryCard({ application: a }: { application: WineryApplication }) {
  const audit = useAudit({ resourceType: "winery_application", resourceId: a.id, limit: 100 });
  // El detalle cambia con cada acción: se relee el historial.
  const events = audit.data?.items ?? [];
  return (
    <Card className="grid gap-3 p-5">
      <SectionHeader
        title="Historial"
        action={
          <TextLink asChild variant="inline">
            <Link href={`/bitacora?recurso=winery_application&recursoId=${a.id}`}>Ver en la bitácora</Link>
          </TextLink>
        }
      />
      {audit.isPending ? (
        <SkeletonText lines={5} />
      ) : audit.isError ? (
        <ErrorState bare title="No se pudo cargar el historial" onRetry={() => void audit.refetch()} />
      ) : events.length === 0 ? (
        <p className="text-fg-muted">Sin movimientos registrados.</p>
      ) : (
        <Timeline
          aria-label="Historial de la solicitud"
          items={events.map((e, i) => ({
            key: e.id,
            title: auditActionLabel(e.action),
            time: <time dateTime={e.occurredAt}>{fmtDateTime(e.occurredAt)}</time>,
            description: (
              <>
                {auditActorLabel(e.actor)}
                {e.reason ? <> · Motivo: «{e.reason}»</> : null}
              </>
            ),
            status: i === 0 ? "current" : "done",
          }))}
        />
      )}
    </Card>
  );
}
