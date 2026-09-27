"use client";

import { useState, type FormEvent } from "react";
import type { ApproveApplicationResponse, MeetingChannel, WineryApplication } from "@drinks-on-chain/mocks";
import { Alert, Button, Field, Input, Modal, RadioGroup, Textarea, toast } from "@drinks-on-chain/ui";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { localInputToIso } from "@/lib/format";
import {
  useApproveApplication,
  useMarkMeetingDone,
  useRejectApplication,
  useScheduleMeeting,
} from "@/lib/platform/applications";
import { validateApprove, validateMeeting, validateNote, type FormErrors } from "@/lib/platform/forms";
import { MEETING_CHANNEL_LABELS } from "@/lib/platform/labels";

export type ApplicationDialog = "approve" | "reject" | "meeting" | "meeting-done";

/** Error general de un formulario: lo que no es de un campo (409, 403, red…). */
function generalError(error: unknown, fieldCount: number, formErrors: string[]): string | null {
  if (!error) return null;
  if (formErrors.length) return formErrors.join(" ");
  if (fieldCount > 0) return null;
  if (error instanceof ApiError && error.code === "APPLICATION_INVALID_TRANSITION") {
    return "La solicitud cambió de estado mientras la mirabas: se recargó con su estado actual.";
  }
  return errorMessage(error);
}

// ---------------------------------------------------------------------------
// Aprobar
// ---------------------------------------------------------------------------

/**
 * Aprobar crea la bodega `INVITED` e invita al dueño (por defecto el contacto, editable). Nunca
 * se envían contraseñas: el dueño crea la suya al aceptar la invitación en el ERP.
 */
export function ApproveDialog({
  application,
  onClose,
  onApproved,
}: {
  application: WineryApplication;
  onClose: () => void;
  onApproved: (result: ApproveApplicationResponse) => void;
}) {
  const approve = useApproveApplication(application.id);
  const [form, setForm] = useState({
    ownerFullName: application.contactName,
    ownerEmail: application.contactEmail,
    reason: "",
  });
  const [errors, setErrors] = useState<FormErrors<keyof typeof form>>({});

  const server = fieldErrorsFrom(approve.error, ["ownerFullName", "ownerEmail", "reason"]);
  const fieldError = (f: keyof typeof form) => errors[f] ?? server.fieldErrors[f];
  const general = generalError(approve.error, Object.keys(server.fieldErrors).length, server.formErrors);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = validateApprove(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const custom = form.ownerEmail.trim().toLowerCase() !== application.contactEmail.toLowerCase();
    approve.mutate(
      {
        ownerFullName: form.ownerFullName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        reason: form.reason.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          toast({
            title: `${result.winery.tradeName} aprobada. Invitación enviada a ${result.invitation.email}${custom ? "" : " (el contacto)"}.`,
            tone: "success",
          });
          onApproved(result);
        },
      },
    );
  }

  const set = (f: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((s) => ({ ...s, [f]: e.target.value }));

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Aprobar ${application.tradeName}`}
      description="Se crea la bodega en estado «Invitada» y su dueño recibe una invitación por correo para activarla en el ERP (caduca en 72 horas)."
      size="md"
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {general && <Alert tone="danger">{general}</Alert>}
        <Field
          label="Nombre del dueño"
          required
          error={fieldError("ownerFullName")}
          help="Por defecto, el contacto de la solicitud."
        >
          <Input value={form.ownerFullName} onChange={set("ownerFullName")} autoComplete="off" />
        </Field>
        <Field
          label="Correo del dueño"
          required
          error={fieldError("ownerEmail")}
          help="La invitación llega a este correo."
        >
          <Input type="email" value={form.ownerEmail} onChange={set("ownerEmail")} autoComplete="off" />
        </Field>
        <Field label="Motivo" help="Opcional. Queda en la bitácora." error={fieldError("reason")}>
          <Textarea rows={2} maxLength={500} value={form.reason} onChange={set("reason")} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={approve.isPending}>
            Aprobar y enviar la invitación
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rechazar
// ---------------------------------------------------------------------------

export function RejectDialog({ application, onClose }: { application: WineryApplication; onClose: () => void }) {
  const reject = useRejectApplication(application.id);
  return (
    <ReasonActionDialog
      copy={{
        title: `Rechazar la solicitud de ${application.tradeName}`,
        description: `El contacto (${application.contactEmail}) recibe un correo con el motivo. La solicitud queda cerrada.`,
        confirm: "Rechazar",
        destructive: true,
        done: `Solicitud de ${application.tradeName} rechazada.`,
      }}
      run={(reason) => reject.mutateAsync(reason)}
      onClose={onClose}
    />
  );
}

// ---------------------------------------------------------------------------
// Reunión
// ---------------------------------------------------------------------------

const CHANNELS: MeetingChannel[] = ["VIDEO", "CALL", "IN_PERSON"];

export function ScheduleMeetingDialog({
  application,
  onClose,
}: {
  application: WineryApplication;
  onClose: () => void;
}) {
  const schedule = useScheduleMeeting(application.id);
  const [form, setForm] = useState({ scheduledAt: "", channel: "VIDEO", notes: "" });
  const [errors, setErrors] = useState<FormErrors<keyof typeof form>>({});
  const server = fieldErrorsFrom(schedule.error, ["scheduledAt", "channel", "notes"]);
  const general = generalError(schedule.error, Object.keys(server.fieldErrors).length, server.formErrors);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problems = validateMeeting(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    schedule.mutate(
      {
        scheduledAt: localInputToIso(form.scheduledAt)!,
        channel: form.channel as MeetingChannel,
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Reunión agendada.", tone: "success" });
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Agendar una reunión"
      description={`Con ${application.contactName} (${application.tradeName}). La solicitud queda en «Reunión agendada» hasta que registres cómo fue.`}
      size="md"
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {general && <Alert tone="danger">{general}</Alert>}
        <Field
          label="Fecha y hora"
          required
          error={errors.scheduledAt ?? server.fieldErrors.scheduledAt}
          help="En tu hora local."
        >
          <Input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm((s) => ({ ...s, scheduledAt: e.target.value }))}
          />
        </Field>
        <Field label="Canal" required error={errors.channel ?? server.fieldErrors.channel}>
          <RadioGroup
            value={form.channel}
            onValueChange={(v) => setForm((s) => ({ ...s, channel: v }))}
            orientation="horizontal"
            options={CHANNELS.map((c) => ({ value: c, label: MEETING_CHANNEL_LABELS[c] }))}
          />
        </Field>
        <Field label="Notas" help="Opcional: enlace, lugar o temas." error={errors.notes ?? server.fieldErrors.notes}>
          <Textarea
            rows={3}
            maxLength={2000}
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={schedule.isPending}>
            Agendar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MeetingDoneDialog({ application, onClose }: { application: WineryApplication; onClose: () => void }) {
  const done = useMarkMeetingDone(application.id);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();
  const server = fieldErrorsFrom(done.error, ["notes"]);
  const general = generalError(done.error, Object.keys(server.fieldErrors).length, server.formErrors);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = validateNote(notes);
    setError(problem);
    if (problem) return;
    done.mutate(notes.trim(), {
      onSuccess: () => {
        toast({ title: "Reunión registrada: la solicitud vuelve a revisión.", tone: "success" });
        onClose();
      },
    });
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Registrar la reunión"
      description="Las notas quedan en la solicitud y la solicitud vuelve a «En revisión» para decidir."
      size="md"
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {general && <Alert tone="danger">{general}</Alert>}
        <Field label="Cómo fue la reunión" required error={error ?? server.fieldErrors.notes}>
          <Textarea rows={4} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={done.isPending}>
            Guardar y volver a revisión
          </Button>
        </div>
      </form>
    </Modal>
  );
}
