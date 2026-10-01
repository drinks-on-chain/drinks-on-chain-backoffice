"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import type { WaitlistEntry, WaitlistStatus } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Field,
  KeyValueList,
  SlideOver,
  TextLink,
  Textarea,
  toast,
  type KeyValueItem,
} from "@drinks-on-chain/ui";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { links } from "@/lib/links";
import { WAITLIST_STATUS_TONES, localeLabel, waitlistDrinkLabel, waitlistStatusLabel } from "@/lib/platform/labels";
import { useUpdateWaitlistEntry } from "@/lib/platform/waitlist";
import { WAITLIST_NOTES_MAX, nextStatuses, normalizeNotes, waitlistUpdateBody } from "@/lib/platform/waitlist-utils";

const none = (text = "—") => <span className="text-fg-subtle">{text}</span>;
const when = (iso: string) => <time dateTime={iso}>{fmtDateTime(iso)}</time>;

/** Botón y aviso de cada cambio de estado. */
const STATUS_ACTIONS: Record<WaitlistStatus, { label: string; done: string }> = {
  CONTACTED: { label: "Marcar como contactado", done: "Inscripción marcada como contactada." },
  DISCARDED: { label: "Descartar", done: "Inscripción descartada." },
  NEW: { label: "Volver a nuevo", done: "La inscripción vuelve a estar como nueva." },
};

/**
 * Detalle de una inscripción de la lista de espera: datos, mensaje, consentimiento y seguimiento
 * (estado, quién la contactó y notas internas). Sin `canManage` (soporte), todo en solo lectura.
 */
export function WaitlistEntryPanel({
  entry,
  canManage,
  onUpdated,
  onClose,
}: {
  entry: WaitlistEntry | null;
  canManage: boolean;
  onUpdated: (entry: WaitlistEntry) => void;
  onClose: () => void;
}) {
  const e = entry;
  const winery = e?.type === "WINERY";
  return (
    <SlideOver
      open={e !== null}
      onOpenChange={(open) => !open && onClose()}
      title={e ? (e.wineryName ?? e.fullName) : "Inscripción"}
      description={
        e ? `${winery ? "Bodega" : "Consumidor"} · inscripción nº ${fmtNumber(e.position)} de su lista` : undefined
      }
      size="lg"
    >
      {/* La clave reinicia el borrador de las notas al abrir otra inscripción. */}
      {e && <EntryDetail key={e.id} entry={e} canManage={canManage} onUpdated={onUpdated} />}
    </SlideOver>
  );
}

function EntryDetail({
  entry: e,
  canManage,
  onUpdated,
}: {
  entry: WaitlistEntry;
  canManage: boolean;
  onUpdated: (entry: WaitlistEntry) => void;
}) {
  const update = useUpdateWaitlistEntry();
  const [draft, setDraft] = useState(e.notes ?? "");
  const winery = e.type === "WINERY";
  const whatsapp = links.whatsapp(e.phone);
  const dirty = normalizeNotes(draft) !== normalizeNotes(e.notes);
  const server = fieldErrorsFrom(update.error, ["notes", "status"] as const);
  const failed = update.isError && !server.fieldErrors.notes;
  /** Cambio en curso: un estado o, sin él, solo las notas. */
  const pending = update.isPending ? (update.variables.body.status ?? "notes") : null;

  /** Un solo PATCH: el cambio de estado lleva también las notas si se tocaron. */
  function save(status?: WaitlistStatus) {
    const body = waitlistUpdateBody(e, { status, notes: draft });
    if (!body) return;
    update.mutate(
      { id: e.id, body },
      {
        onSuccess: (updated) => {
          onUpdated(updated);
          setDraft(updated.notes ?? "");
          toast({ title: status ? STATUS_ACTIONS[status].done : "Notas guardadas.", tone: "success" });
        },
      },
    );
  }

  const data: KeyValueItem[] = [
    ...(winery ? [{ term: "Bodega", value: e.wineryName ?? none() }] : []),
    { term: winery ? "Persona de contacto" : "Nombre", value: e.fullName },
    {
      term: "Correo",
      value: (
        <TextLink variant="inline" href={`mailto:${e.email}`} className="inline-flex items-center gap-1.5 break-all">
          <Mail aria-hidden="true" className="size-4 shrink-0" />
          {e.email}
        </TextLink>
      ),
    },
    {
      term: "WhatsApp",
      value: !e.phone ? (
        none("No lo dejó")
      ) : whatsapp ? (
        <TextLink
          variant="inline"
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5"
        >
          <MessageCircle aria-hidden="true" className="size-4 shrink-0" />
          <span className="tabular-nums">{e.phone}</span>
          <span className="sr-only"> (abre WhatsApp en otra pestaña)</span>
        </TextLink>
      ) : (
        <span className="tabular-nums">{e.phone}</span>
      ),
    },
    ...(winery
      ? [
          { term: "Región", value: e.region ?? none() },
          { term: "Produce", value: e.produces ? waitlistDrinkLabel(e.produces) : none() },
        ]
      : [
          { term: "Ciudad", value: e.city ?? none() },
          { term: "Le interesa", value: e.interest ? waitlistDrinkLabel(e.interest) : none() },
        ]),
    {
      term: "Origen",
      value: e.source ? <span className="font-mono text-xs">{e.source}</span> : none("Sin origen"),
    },
    { term: "Idioma", value: localeLabel(e.locale) },
    { term: "Se inscribió", value: when(e.createdAt) },
    { term: "Consentimiento", value: <>Aceptó ser contactado el {when(e.consentAt)}</> },
  ];

  return (
    <div className="grid gap-6">
      <KeyValueList items={data} />

      <section aria-labelledby="mensaje" className="grid gap-2">
        <SectionHeader id="mensaje" level={3} title="Mensaje" />
        {e.message ? (
          <blockquote className="m-0 border-l-2 border-border-strong pl-3 break-words whitespace-pre-line">
            {e.message}
          </blockquote>
        ) : (
          <p className="text-fg-muted">No dejó ningún mensaje.</p>
        )}
      </section>

      <section aria-labelledby="seguimiento" className="grid gap-3">
        <SectionHeader
          id="seguimiento"
          level={3}
          title="Seguimiento"
          description={canManage ? undefined : "Solo operaciones y administración cambian el estado y las notas."}
        />
        <KeyValueList
          items={[
            {
              term: "Estado",
              value: <Badge tone={WAITLIST_STATUS_TONES[e.status] ?? "neutral"}>{waitlistStatusLabel(e.status)}</Badge>,
            },
            {
              term: "Contactada",
              value: e.contactedAt ? (
                <>
                  {when(e.contactedAt)}
                  {e.contactedBy ? ` · ${e.contactedBy}` : ""}
                </>
              ) : (
                none("Aún no")
              ),
            },
            ...(canManage
              ? []
              : [
                  {
                    term: "Notas internas",
                    value: e.notes ? (
                      <span className="break-words whitespace-pre-line">{e.notes}</span>
                    ) : (
                      none("Sin notas")
                    ),
                  },
                ]),
          ]}
        />

        {canManage && (
          <form
            className="grid gap-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            {failed && (
              <Alert tone="danger">
                No se pudo guardar: {server.fieldErrors.status ?? server.formErrors[0] ?? errorMessage(update.error)}
              </Alert>
            )}
            <Field
              label="Notas internas"
              help={`${fmtNumber(draft.length)} de ${fmtNumber(WAITLIST_NOTES_MAX)} caracteres. Solo las ve el equipo; se guardan también al cambiar el estado.`}
              error={server.fieldErrors.notes}
            >
              <Textarea
                rows={4}
                maxLength={WAITLIST_NOTES_MAX}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="submit"
                variant="tertiary"
                disabled={!dirty || update.isPending}
                loading={pending === "notes"}
              >
                Guardar notas
              </Button>
              {nextStatuses(e.status).map((status) => (
                <Button
                  key={status}
                  type="button"
                  // Un solo botón en oro: contactar es la acción principal de la pantalla.
                  variant={status === "CONTACTED" ? "primary" : "secondary"}
                  disabled={update.isPending}
                  loading={pending === status}
                  onClick={() => save(status)}
                >
                  {STATUS_ACTIONS[status].label}
                </Button>
              ))}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
