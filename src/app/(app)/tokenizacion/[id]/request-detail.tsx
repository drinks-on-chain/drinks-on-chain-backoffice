"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Hand, MessageSquareWarning, XCircle } from "lucide-react";
import type { PlatformTokenizationRequest, TokenizationApproval } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ChainAddress,
  EmptyState,
  ErrorState,
  Field,
  KeyValueList,
  SkeletonText,
  StatusBadge,
  TextLink,
  Textarea,
  Timeline,
  getStatusBadge,
  toast,
} from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { SectionHeader } from "@/components/section-header";
import { CommercialEditor, ImageThumb } from "@/components/tokenization/commercial-editor";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtAge, fmtBob, fmtDate, fmtDateTime, fmtNumber, fmtRelative, hoursSince } from "@/lib/format";
import { collectionStatus, identityStatus, networkLabel, requestKindLabel } from "@/lib/platform/chain-labels";
import { validateNote } from "@/lib/platform/forms";
import {
  LAB_STATUS_TONES,
  LOT_STAGE_TONES,
  labStatusLabel,
  lotProductLabel,
  lotStageLabel,
  roleLabel,
} from "@/lib/platform/labels";
import { lockLabel } from "@/lib/platform/lots";
import { can } from "@/lib/platform/permissions";
import { explainRuleError, type ExplainedError } from "@/lib/platform/rule-errors";
import {
  useAddTokenizationNote,
  useReviewTokenizationRequest,
  useTakeTokenizationRequest,
} from "@/lib/platform/tokenization";
import {
  COMMERCIAL_FIELDS,
  changeFieldLabel,
  commercialBody,
  commercialChanged,
  commercialFormFrom,
  exceedsLimits,
  isOpenRequest,
  limitsSummary,
  priceBody,
  requestActions,
  requestHint,
  validateCommercial,
  type CommercialField,
  type CommercialForm,
} from "@/lib/platform/tokenization-utils";
import { useTokenizationRequest } from "@/lib/platform/tokenization";
import { ApproveDialog, RejectDialog, RequestChangesDialog, type RequestDialog } from "./request-dialogs";

const icon = "size-4";
const muted = (text: string) => <span className="text-fg-subtle">{text}</span>;
const when = (iso: string) => <time dateTime={iso}>{fmtDateTime(iso)}</time>;

const DO_LABELS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ELIGIBLE: { label: "Apta para la D.O.", tone: "success" },
  ELIGIBLE_BY_EXCEPTION: { label: "Apta por excepción", tone: "warning" },
  NOT_ELIGIBLE: { label: "No apta para la D.O.", tone: "danger" },
  NOT_APPLICABLE: { label: "No aplica", tone: "neutral" },
};

const formOf = (r: PlatformTokenizationRequest): CommercialForm =>
  commercialFormFrom(
    r.commercialDraft,
    r.commercialDraft.imageKeys.map((i) => ({ key: i.key, alt: i.alt, isCover: i.isCover ?? false })),
    r.price,
  );

/** 4C · Detalle de una solicitud de tokenización: revisión del lote, datos comerciales y decisión. */
export function RequestDetail({ id }: { id: string }) {
  const request = useTokenizationRequest(id);
  const r = request.data;

  if (request.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <SkeletonText lines={2} />
        <SkeletonText lines={8} />
      </div>
    );
  }
  if (request.isError || !r) {
    const notFound = request.error instanceof ApiError && request.error.isNotFound;
    return (
      <div className="grid gap-6">
        <PageHeader title="Solicitud de tokenización" />
        {notFound ? (
          <EmptyState
            title="La solicitud no existe"
            description="Puede que el enlace esté mal copiado."
            action={
              <Button asChild variant="secondary">
                <Link href="/tokenizacion">Volver a la bandeja</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="No se pudo cargar la solicitud"
            description={errorMessage(request.error)}
            onRetry={() => void request.refetch()}
          />
        )}
      </div>
    );
  }
  // El formulario de la revisión nace de la solicitud: una solicitud distinta, otro formulario.
  return <RequestBody key={r.id} request={r} />;
}

function RequestBody({ request: r }: { request: PlatformTokenizationRequest }) {
  const me = useMe();
  const manage = can(me.data, "tokenization.manage");
  const actions = requestActions(r.status, manage);
  const take = useTakeTokenizationRequest(r.id);
  const save = useReviewTokenizationRequest(r.id);
  const [dialog, setDialog] = useState<RequestDialog | null>(null);
  const [approved, setApproved] = useState<TokenizationApproval | null>(null);
  const [form, setForm] = useState<CommercialForm>(() => formOf(r));
  const [baseline, setBaseline] = useState<CommercialForm>(() => formOf(r));
  const [errors, setErrors] = useState<Partial<Record<CommercialField, string>>>({});
  const [saveError, setSaveError] = useState<ExplainedError | null>(null);
  const dirty = commercialChanged(form, baseline);
  const review = r.review;
  const identity = review.chainIdentity;
  const hint = requestHint(r.status);

  function onTake() {
    take.mutate(undefined, {
      onSuccess: () => toast({ title: "Solicitud tomada: ahora está en revisión y asignada a ti.", tone: "success" }),
      onError: (error) => toast({ title: explainRuleError(error).message, tone: "danger" }),
    });
  }

  function onSave() {
    const problems = validateCommercial(form, { strict: false });
    setErrors(problems);
    setSaveError(null);
    if (Object.keys(problems).length) return;
    save.mutate(
      { commercial: commercialBody(form), price: priceBody(form) },
      {
        onSuccess: (updated) => {
          const next = formOf(updated);
          // Las vistas previas locales de las imágenes recién subidas se conservan.
          const withPreviews = {
            ...next,
            images: next.images.map((i) => ({ ...i, url: form.images.find((f) => f.key === i.key)?.url })),
          };
          setForm(withPreviews);
          setBaseline(withPreviews);
          toast({ title: "Datos comerciales guardados.", tone: "success" });
        },
        onError: (error) => {
          const explained = explainRuleError(error, COMMERCIAL_FIELDS);
          setErrors(explained.fieldErrors);
          setSaveError(explained);
        },
      },
    );
  }

  /** Antes de abrir «Aprobar»: lo obligatorio (nombre, descripción y portada) se valida aquí. */
  function onApprove() {
    const problems = validateCommercial(form, { strict: true });
    setErrors(problems);
    setSaveError(null);
    if (Object.keys(problems).length) {
      toast({ title: "Completa los datos comerciales marcados antes de aprobar.", tone: "danger" });
      return;
    }
    setDialog("approve");
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Breadcrumbs
          linkComponent={Link}
          label="Ruta"
          items={[{ label: "Tokenización", href: "/tokenizacion" }, { label: r.lot.name }]}
        />
        <PageHeader
          eyebrow={`Solicitud de tokenización · ${requestKindLabel(r.kind)}`}
          title={r.lot.name}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge kind="tokenizationRequest" status={r.status} />
              <TextLink asChild variant="inline">
                <Link href={`/bodegas/${r.wineryId}`}>{r.winery.tradeName}</Link>
              </TextLink>
              <span className="font-mono text-xs">{r.lot.reference}</span>
              <span className="tabular-nums">{fmtNumber(r.quantity)} botellas</span>
            </span>
          }
          actions={
            <>
              {actions.take && (
                <Button
                  loading={take.isPending}
                  iconStart={<Hand aria-hidden="true" className={icon} />}
                  onClick={onTake}
                >
                  Tomar la solicitud
                </Button>
              )}
              {actions.review && (
                <>
                  <Button
                    variant="secondary"
                    iconStart={<XCircle aria-hidden="true" className={icon} />}
                    onClick={() => setDialog("reject")}
                  >
                    Rechazar
                  </Button>
                  <Button
                    variant="secondary"
                    iconStart={<MessageSquareWarning aria-hidden="true" className={icon} />}
                    onClick={() => setDialog("changes")}
                  >
                    Pedir cambios
                  </Button>
                  <Button iconStart={<CheckCircle2 aria-hidden="true" className={icon} />} onClick={onApprove}>
                    {r.kind === "INITIAL" ? "Aprobar y emitir" : "Aprobar la ampliación"}
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      {me.data && !manage && (
        <Alert tone="info">
          Consulta en modo lectura: solo operaciones y administración tramitan las solicitudes de tokenización.
        </Alert>
      )}
      {manage && hint && isOpenRequest(r.status) && r.status !== "IN_REVIEW" && <Alert tone="info">{hint}</Alert>}
      {approved && <ApprovedNotice result={approved} />}
      {!approved && r.status === "APPROVED" && r.collectionId && (
        <Alert tone="success" title="Solicitud aprobada">
          <TextLink asChild variant="inline">
            <Link href={`/colecciones/${r.collectionId}`}>Ver la colección y su emisión</Link>
          </TextLink>
          .
        </Alert>
      )}
      {actions.review && identity.status !== "ACTIVE" && (
        <Alert tone="warning" title="La bodega aún no está lista en la red">
          Su identidad está «{identityStatus(identity.status).label}»: no se puede aprobar hasta que su cuenta y su
          contrato estén activos.{" "}
          <TextLink asChild variant="inline">
            <Link href={`/bodegas/${r.wineryId}?pestana=cadena`}>Ver la identidad de la bodega</Link>
          </TextLink>
          .
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <RequestCard request={r} />
          <ReviewCard request={r} />

          <Card className="grid gap-4 p-5">
            <SectionHeader
              title="Datos comerciales y precio"
              description={
                actions.review
                  ? "Lo que verá el comprador. Obligatorios para aprobar: nombre, descripción y una imagen de portada; el precio puede quedar vacío."
                  : "Lo que envió la bodega y completó operaciones."
              }
            />
            {actions.review ? (
              <>
                {saveError && Object.keys(saveError.fieldErrors).length === 0 && <RuleErrorAlert error={saveError} />}
                <CommercialEditor
                  form={form}
                  onChange={setForm}
                  errors={errors}
                  priceSuggestion={review.priceSuggestion}
                  disabled={save.isPending}
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {dirty && <span className="text-xs text-fg-subtle">Hay cambios sin guardar.</span>}
                  <Button variant="secondary" disabled={!dirty} loading={save.isPending} onClick={onSave}>
                    Guardar los datos
                  </Button>
                </div>
              </>
            ) : (
              <CommercialSummary request={r} form={baseline} />
            )}
          </Card>

          {r.changeRequests.length > 0 && <ChangeRequestsCard request={r} />}
          <NotesCard request={r} canWrite={actions.note} />
        </div>

        <div className="grid gap-5">
          <IdentityCard request={r} />
          {(r.decision || r.withdrawn) && <OutcomeCard request={r} />}
          {review.otherCollectionsOfWinery.length > 0 && <OtherCollectionsCard request={r} />}
          <HistoryCard request={r} />
        </div>
      </div>

      {dialog === "changes" && <RequestChangesDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === "reject" && <RejectDialog request={r} onClose={() => setDialog(null)} />}
      {dialog === "approve" && (
        <ApproveDialog
          request={r}
          form={form}
          onFieldErrors={setErrors}
          onClose={() => setDialog(null)}
          onApproved={(result) => {
            setApproved(result);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/** Resultado de aprobar: enlace a la colección y a su emisión. */
function ApprovedNotice({ result }: { result: TokenizationApproval }) {
  const { collection, mint } = result;
  return (
    <Alert tone="success" title="Solicitud aprobada: emisión en curso">
      <p>
        Se pidió a la red la emisión de {fmtNumber(mint.quantity)} NFT de «{collection.name}» a nombre de{" "}
        {collection.winery.tradeName}.{" "}
        <TextLink asChild variant="inline">
          <Link href={`/colecciones/${collection.id}?pestana=emisiones`}>Seguir la emisión en la colección</Link>
        </TextLink>
        .
      </p>
    </Alert>
  );
}

function RequestCard({ request: r }: { request: PlatformTokenizationRequest }) {
  const l = r.limitsAtSubmission;
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader title="Solicitud" description="Lo que autorizó la bodega desde el ERP." />
      <KeyValueList
        items={[
          { term: "Tipo", value: requestKindLabel(r.kind) },
          {
            term: r.kind === "INITIAL" ? "Botellas a tokenizar" : "Botellas adicionales",
            value: <span className="tabular-nums">{fmtNumber(r.quantity)}</span>,
          },
          { term: "Cuota resultante", value: <span className="tabular-nums">{fmtNumber(r.resultingQuota)}</span> },
          {
            term: "Enviada",
            value: (
              <span>
                {when(r.submittedAt)} · hace {fmtAge(hoursSince(r.submittedAt))}
              </span>
            ),
          },
          { term: "Por", value: `${r.submittedBy.fullName} · ${roleLabel(r.submittedBy.role)}` },
          {
            term: "Asignada a",
            value: r.assignee ? r.assignee.fullName : muted("Sin asignar"),
          },
          {
            term: "Límite al enviar",
            value: (
              <span className="tabular-nums">
                {fmtNumber(l.maxQuantity)} disponibles sobre{" "}
                {l.basis === "BOTTLES" ? "las botellas con código" : "la estimación"} (
                {fmtNumber((l.basis === "BOTTLES" ? l.bottles : l.estimatedBottles) ?? 0)})
              </span>
            ),
          },
          {
            term: "Aprobación",
            value: r.requiresApproval ? "Requiere la aprobación de operaciones" : "Autoaprobación activada al enviar",
          },
        ]}
      />
      {r.wineryNotes && (
        <div className="grid gap-1">
          <h3 className="text-xs font-medium tracking-label text-fg-subtle uppercase">Notas de la bodega</h3>
          <blockquote className="border-l-2 border-accent pl-3 whitespace-pre-line text-fg-muted">
            {r.wineryNotes}
          </blockquote>
        </div>
      )}
    </Card>
  );
}

/** Lo que operaciones revisa (§5.4): el lote en lectura, candados, fecha, D.O., incidencias y límites. */
function ReviewCard({ request: r }: { request: PlatformTokenizationRequest }) {
  const { lot, traceability: t, limits } = r.review;
  const denomination = DO_LABELS[t.denomination.status] ?? { label: t.denomination.status, tone: "neutral" as const };
  const over = isOpenRequest(r.status) && exceedsLimits(r.resultingQuota, limits);
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Revisión del lote"
        description="Solo lectura: la trazabilidad la registra la bodega en el ERP."
        action={
          <TextLink asChild variant="inline">
            <Link href={`/bodegas/${r.wineryId}?pestana=lotes&q=${encodeURIComponent(lot.reference)}`}>
              Ver el lote en la bodega
            </Link>
          </TextLink>
        }
      />
      <KeyValueList
        items={[
          { term: "Referencia", value: <span className="font-mono text-xs">{lot.reference}</span> },
          {
            term: "Código de lote",
            value: lot.lotCode ? (
              <span className="font-mono text-xs">{lot.lotCode}</span>
            ) : (
              muted("Se asigna al embotellar")
            ),
          },
          { term: "Bebida y añada", value: `${lotProductLabel(lot.productType)} · ${lot.harvestYear}` },
          {
            term: "Etapa",
            value: <Badge tone={LOT_STAGE_TONES[lot.stage] ?? "neutral"}>{lotStageLabel(lot.stage)}</Badge>,
          },
          {
            term: "Botellas",
            value: (
              <span className="tabular-nums">
                {lot.estimatedBottles === null ? "Sin estimación" : `${fmtNumber(lot.estimatedBottles)} estimadas`}
                {lot.bottles !== null && ` · ${fmtNumber(lot.bottles)} embotelladas con código`}
              </span>
            ),
          },
          {
            term: "Candados",
            value:
              t.locks.length === 0 ? (
                muted("Sin candados")
              ) : (
                <ul className="grid gap-0.5" aria-label="Candados del lote">
                  {t.locks.map((lock) => (
                    <li key={`${lock.kind}-${lock.sourceId}`}>{lockLabel(lock)}</li>
                  ))}
                </ul>
              ),
          },
          {
            term: "Fecha estimada de salida",
            value: t.estimatedReadyDate ? (
              <time dateTime={t.estimatedReadyDate}>{fmtDate(t.estimatedReadyDate)}</time>
            ) : (
              muted("Sin fecha")
            ),
          },
          {
            term: "Denominación de origen",
            value: (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={denomination.tone}>{denomination.label}</Badge>
                {t.denomination.checks.length > 0 && (
                  <span className="text-xs text-fg-muted">
                    {t.denomination.checks.filter((c) => c.pass).length} de {t.denomination.checks.length}{" "}
                    comprobaciones cumplidas
                  </span>
                )}
              </span>
            ),
          },
          {
            term: "Incidencias abiertas",
            value:
              t.complianceIssuesOpen > 0 ? (
                <Badge tone="warning">{fmtNumber(t.complianceIssuesOpen)}</Badge>
              ) : (
                <span className="text-fg-subtle">0</span>
              ),
          },
          {
            term: "Laboratorio",
            value: <Badge tone={LAB_STATUS_TONES[lot.labStatus] ?? "neutral"}>{labStatusLabel(lot.labStatus)}</Badge>,
          },
          { term: "Expediente", value: t.dossierStatus === "CLOSED" ? "Cerrado" : "Abierto" },
          {
            term: "Línea de tiempo",
            value: (
              <span>
                {fmtNumber(t.publicEventsCount)} hechos públicos
                {t.lastEvent && (
                  <span className="text-fg-muted">
                    {" "}
                    · último: {t.lastEvent.summary} ({fmtRelative(t.lastEvent.occurredAt)})
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />
      <div className="grid gap-2">
        <h3 className="text-xs font-medium tracking-label text-fg-subtle uppercase">Límites recalculados ahora</h3>
        <p className="tabular-nums">{limitsSummary(limits)}</p>
        {over && (
          <Alert tone="warning">
            La cuota resultante ({fmtNumber(r.resultingQuota)}) ya no cabe en el límite del lote: al aprobar se volverá
            a validar y se rechazará. Pide a la bodega que ajuste la cantidad.
          </Alert>
        )}
      </div>
    </Card>
  );
}

/** Datos comerciales en lectura (soporte, o solicitud que ya no está en revisión). */
function CommercialSummary({ request: r, form }: { request: PlatformTokenizationRequest; form: CommercialForm }) {
  const d = r.commercialDraft;
  const suggestion = r.review.priceSuggestion;
  return (
    <div className="grid gap-4">
      <KeyValueList
        items={[
          { term: "Nombre", value: d.name ?? muted("Sin nombre") },
          {
            term: "Descripción",
            value: d.description ? (
              <span className="whitespace-pre-line">{d.description}</span>
            ) : (
              muted("Sin descripción")
            ),
          },
          { term: "Nota de cata", value: d.tastingNotes ?? muted("Sin nota de cata") },
          { term: "Maridaje", value: d.pairing ?? muted("Sin maridaje") },
          {
            term: "Fecha estimada de canje",
            value: d.estimatedRedeemDate ? (
              <time dateTime={d.estimatedRedeemDate}>{fmtDate(d.estimatedRedeemDate)}</time>
            ) : (
              muted("La del lote")
            ),
          },
          {
            term: "Precio por botella",
            value: r.price ? (
              <span className="tabular-nums">{fmtBob(r.price.amountMinor)}</span>
            ) : (
              muted("Sin precio («Precio por anunciar»)")
            ),
          },
        ]}
      />
      {form.images.length === 0 ? (
        <p className="text-fg-muted">Sin imágenes.</p>
      ) : (
        <ul className="flex flex-wrap gap-3" aria-label="Imágenes de la colección">
          {form.images.map((image) => (
            <li key={image.key} className="grid w-20 gap-1">
              <ImageThumb image={image} />
              {image.isCover && <Badge tone="accent">Portada</Badge>}
            </li>
          ))}
        </ul>
      )}
      {isOpenRequest(r.status) && !suggestion.available && (
        <p className="text-xs text-fg-subtle">
          Política de precio sin definir; puedes fijar un precio manual o dejarlo vacío.
        </p>
      )}
    </div>
  );
}

function ChangeRequestsCard({ request: r }: { request: PlatformTokenizationRequest }) {
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader title="Cambios pedidos" description="Lo que operaciones pidió corregir a la bodega." />
      <ol className="grid divide-y divide-border" aria-label="Cambios pedidos">
        {[...r.changeRequests].reverse().map((c) => (
          <li key={c.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
            <p className="whitespace-pre-line">{c.message}</p>
            {c.fields.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {c.fields.map((f) => (
                  <Badge key={f} tone="neutral">
                    {changeFieldLabel(f)}
                  </Badge>
                ))}
              </p>
            )}
            <p className="text-xs text-fg-muted">
              {c.by.fullName} · {when(c.at)} ·{" "}
              {c.resolvedAt ? <>resuelto el {when(c.resolvedAt)}</> : "pendiente de la bodega"}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function NotesCard({ request: r, canWrite }: { request: PlatformTokenizationRequest; canWrite: boolean }) {
  const add = useAddTokenizationNote(r.id);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const error = add.error ? explainRuleError(add.error, ["text"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateNote(text);
    setProblem(invalid);
    if (invalid) return;
    add.mutate(text.trim(), {
      onSuccess: () => {
        setText("");
        toast({ title: "Nota añadida.", tone: "success" });
      },
    });
  }

  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader title="Notas internas" description="Solo las ve el equipo de Drinks on Chain." />
      {r.internalNotes.length === 0 ? (
        <p className="text-fg-muted">Aún no hay notas.</p>
      ) : (
        <ol className="grid divide-y divide-border" aria-label="Notas internas de la solicitud">
          {[...r.internalNotes].reverse().map((n) => (
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
          {error && !error.fieldErrors.text && <RuleErrorAlert error={error} />}
          <Field label="Nota nueva" error={problem ?? error?.fieldErrors.text}>
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

/** Identidad de la bodega en la red: sin ella `ACTIVE` no se aprueba (`TOK_WINERY_CHAIN_NOT_READY`). */
function IdentityCard({ request: r }: { request: PlatformTokenizationRequest }) {
  const identity = r.review.chainIdentity;
  const status = identityStatus(identity.status);
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Identidad en la red"
        level={2}
        action={
          <TextLink asChild variant="inline">
            <Link href={`/bodegas/${r.wineryId}?pestana=cadena`}>Ver en la bodega</Link>
          </TextLink>
        }
      />
      <KeyValueList
        layout="stacked"
        items={[
          {
            term: "Estado",
            value: (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="text-xs text-fg-muted">{networkLabel(identity.network)}</span>
              </span>
            ),
          },
          {
            term: "Cuenta de la bodega",
            value: identity.account ? (
              <ChainAddress
                value={identity.account.address}
                label="Cuenta de la bodega"
                explorerUrl={identity.account.explorerUrl}
                size="sm"
              />
            ) : (
              muted("Sin cuenta")
            ),
          },
          {
            term: "Contrato NFT",
            value: identity.contract ? (
              <span className="grid gap-1">
                <ChainAddress
                  value={identity.contract.address}
                  label="Contrato NFT de la bodega"
                  explorerUrl={identity.contract.explorerUrl}
                  size="sm"
                />
                <span className="text-xs text-fg-muted">
                  Símbolo <span className="font-mono">{identity.contract.symbol}</span>
                  {identity.contract.paused && " · pausado en la red"}
                </span>
              </span>
            ) : (
              muted("Sin contrato")
            ),
          },
        ]}
      />
    </Card>
  );
}

function OutcomeCard({ request: r }: { request: PlatformTokenizationRequest }) {
  if (r.withdrawn) {
    return (
      <Card className="grid gap-3 p-5">
        <SectionHeader title="Retirada por la bodega" />
        <KeyValueList
          layout="stacked"
          items={[
            { term: "Por", value: r.withdrawn.by.fullName },
            { term: "Cuándo", value: when(r.withdrawn.at) },
            { term: "Motivo", value: r.withdrawn.reason },
          ]}
        />
      </Card>
    );
  }
  const decision = r.decision!;
  return (
    <Card className="grid gap-3 p-5">
      <SectionHeader title={decision.outcome === "APPROVED" ? "Aprobada" : "Rechazada"} />
      <KeyValueList
        layout="stacked"
        items={[
          { term: "Por", value: decision.by.system ? "Sistema (autoaprobación)" : (decision.by.fullName ?? "—") },
          { term: "Cuándo", value: when(decision.at) },
          { term: "Motivo", value: decision.reason ?? muted("Sin motivo") },
          ...(r.collectionId
            ? [
                {
                  term: "Colección",
                  value: (
                    <TextLink asChild variant="inline">
                      <Link href={`/colecciones/${r.collectionId}`}>Ver la colección</Link>
                    </TextLink>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}

function OtherCollectionsCard({ request: r }: { request: PlatformTokenizationRequest }) {
  return (
    <Card className="grid gap-3 p-5">
      <SectionHeader title="Otras colecciones de la bodega" />
      <ul className="grid divide-y divide-border" aria-label="Otras colecciones de la bodega">
        {r.review.otherCollectionsOfWinery.map((c) => {
          const status = collectionStatus(c.status);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <TextLink asChild variant="inline">
                <Link href={`/colecciones/${c.id}`}>{c.name}</Link>
              </TextLink>
              <span className="flex items-center gap-2 text-xs text-fg-muted">
                <span className="tabular-nums">{fmtNumber(c.quota)} NFT</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Historial de estados de la solicitud, del más reciente al más antiguo. */
function HistoryCard({ request: r }: { request: PlatformTokenizationRequest }) {
  const items = [...r.history].reverse();
  return (
    <Card className="grid gap-3 p-5">
      <SectionHeader
        title="Historial"
        action={
          <TextLink asChild variant="inline">
            <Link href={`/bitacora?recurso=tokenization_request&recursoId=${r.id}`}>Ver en la bitácora</Link>
          </TextLink>
        }
      />
      {items.length === 0 ? (
        <p className="text-fg-muted">Sin movimientos registrados.</p>
      ) : (
        <Timeline
          aria-label="Historial de la solicitud"
          items={items.map((h, i) => ({
            key: `${h.at}-${i}`,
            title: getStatusBadge("tokenizationRequest", h.status).label,
            time: when(h.at),
            description: (
              <>
                {h.by}
                {h.note ? <> · «{h.note}»</> : null}
              </>
            ),
            status: i === 0 ? "current" : "done",
          }))}
        />
      )}
    </Card>
  );
}
