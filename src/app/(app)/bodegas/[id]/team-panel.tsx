"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  KeyRound,
  MailPlus,
  MoreHorizontal,
  RotateCcw,
  ShieldOff,
  UserCheck,
  UserCog,
  UserRound,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { WINERY_ROLES, type Invitation, type Member, type WineryDetail, type WineryRole } from "@drinks-on-chain/mocks";
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  KeyValueList,
  Menu,
  Modal,
  Select,
  SkeletonText,
  SlideOver,
  StatusBadge,
  TextLink,
  getStatusBadge,
  Textarea,
  toast,
  type MenuEntry,
} from "@drinks-on-chain/ui";
import { ReasonActionDialog, type ReasonActionCopy } from "@/components/reason-action-dialog";
import { SectionHeader } from "@/components/section-header";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { fieldErrorsFrom } from "@/lib/api/field-errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import { validateInvite, type FormErrors, type InviteForm } from "@/lib/platform/forms";
import { roleLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import {
  useAccount,
  useChangeMemberRole,
  useInviteMember,
  useManageOrganizationInvitation,
  useMembers,
  useOrganizationInvitations,
  useSendMemberPasswordReset,
  useSetAccountBlocked,
  useSetMemberBlocked,
} from "@/lib/platform/team";

const PAGE_SIZE = 20;
const ALL = "ALL";
const icon = (Icon: LucideIcon) => <Icon aria-hidden="true" className="size-4" />;
/** Roles que se pueden asignar o invitar (el de dueño solo en el alta o la transferencia). */
const ASSIGNABLE: WineryRole[] = WINERY_ROLES.filter((r): r is WineryRole => r !== "OWNER");

type MemberDialog =
  | { kind: "role" | "block" | "unblock" | "password"; member: Member }
  | { kind: "account-block" | "account-unblock"; member: Member }
  | { kind: "resend" | "revoke"; invitation: Invitation };

const teamOpen = (w: WineryDetail) => w.status === "ACTIVE" || w.status === "SUSPENDED";

/** Quién bloqueó: el dueño no puede levantar un bloqueo de la plataforma. */
const blockedByLabel = (m: Pick<Member, "blockedBy">) =>
  m.blockedBy === "PLATFORM"
    ? "Bloqueado por la plataforma"
    : m.blockedBy === "OWNER"
      ? "Bloqueado por el dueño"
      : "Bloqueado";

/**
 * 4B · Equipo de cualquier bodega (contrato de la Ola 1 §5): miembros con su estado y quién
 * bloqueó, invitaciones pendientes, invitar, rol, bloqueo con motivo, enlace de contraseña y,
 * desde la persona, bloqueo de la cuenta completa (solo administración).
 */
export function TeamPanel({ winery }: { winery: WineryDetail }) {
  const me = useMe();
  const [status, setStatus] = useState<"ACTIVE" | "BLOCKED" | undefined>();
  const [offset, setOffset] = useState(0);
  const [dialog, setDialog] = useState<MemberDialog | null>(null);
  const [inviting, setInviting] = useState(false);
  const [person, setPerson] = useState<Member | null>(null);
  const members = useMembers(winery.id, { status, limit: PAGE_SIZE, offset });
  const invitations = useOrganizationInvitations(winery.id);
  const manage = can(me.data, "team.manage");
  const page = members.data;

  function actionsFor(m: Member): MenuEntry[] {
    const entries: MenuEntry[] = [{ label: "Ver la persona", icon: icon(UserRound), onSelect: () => setPerson(m) }];
    if (!manage) return entries;
    if (m.role !== "OWNER") {
      entries.push({
        label: "Cambiar el rol",
        icon: icon(UserCog),
        onSelect: () => setDialog({ kind: "role", member: m }),
      });
    }
    if (can(me.data, "users.sendPasswordReset")) {
      entries.push({
        label: "Enviar enlace de contraseña",
        icon: icon(KeyRound),
        onSelect: () => setDialog({ kind: "password", member: m }),
      });
    }
    entries.push({ type: "separator" });
    entries.push(
      m.status === "BLOCKED"
        ? { label: "Desbloquear", icon: icon(UserCheck), onSelect: () => setDialog({ kind: "unblock", member: m }) }
        : {
            label: "Bloquear en esta bodega",
            icon: icon(ShieldOff),
            destructive: true,
            onSelect: () => setDialog({ kind: "block", member: m }),
          },
    );
    return entries;
  }

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5">
        <SectionHeader
          title="Miembros"
          description="Bloquear cierra sus sesiones en esta bodega al instante. El dueño recibe un aviso de cada cambio."
          action={
            <>
              <Field label="Estado" hideLabel className="w-40">
                <Select
                  size="sm"
                  aria-label="Filtrar miembros por estado"
                  value={status ?? ALL}
                  onValueChange={(v) => {
                    setOffset(0);
                    setStatus(v === ALL ? undefined : (v as "ACTIVE" | "BLOCKED"));
                  }}
                  options={[
                    { value: ALL, label: "Todos" },
                    { value: "ACTIVE", label: "Activos" },
                    { value: "BLOCKED", label: "Bloqueados" },
                  ]}
                />
              </Field>
              {manage && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!teamOpen(winery)}
                  iconStart={icon(MailPlus)}
                  onClick={() => setInviting(true)}
                >
                  Invitar a alguien
                </Button>
              )}
            </>
          }
        />
        {manage && !teamOpen(winery) && (
          <p className="text-xs text-fg-muted" role="note">
            {winery.status === "INVITED"
              ? "Se invita al equipo cuando el dueño active la bodega."
              : "Una bodega revocada ya no admite invitaciones."}
          </p>
        )}
        <DataTable
          caption={`Miembros de ${winery.tradeName}`}
          captionHidden
          density="compact"
          data={page?.items ?? []}
          getRowId={(m) => m.membershipId}
          loading={members.isPending}
          error={
            members.isError
              ? { description: "No se pudo cargar el equipo.", onRetry: () => void members.refetch() }
              : undefined
          }
          empty={
            <EmptyState
              bare
              title={status ? "Nadie con ese estado" : "Aún no hay miembros"}
              description={status ? "Prueba con otro estado." : "El dueño aparece aquí al aceptar su invitación."}
            />
          }
          pagination={
            page && page.total > PAGE_SIZE
              ? { total: page.total, limit: PAGE_SIZE, offset, onOffsetChange: setOffset }
              : undefined
          }
          columns={[
            {
              id: "person",
              header: "Persona",
              accessor: "fullName",
              sortable: true,
              cell: (m) => (
                <div className="grid">
                  <span className="font-medium">{m.fullName}</span>
                  <span className="text-xs text-fg-muted">{m.email}</span>
                </div>
              ),
            },
            { id: "role", header: "Rol", accessor: (m) => roleLabel(m.role), sortable: true },
            {
              id: "status",
              header: "Estado",
              accessor: "status",
              sortable: true,
              cell: (m) => (
                <div className="grid justify-items-start gap-0.5">
                  <StatusBadge
                    kind="member"
                    status={m.status}
                    label={m.status === "BLOCKED" ? blockedByLabel(m) : undefined}
                  />
                  {m.blockedReason && (
                    <span className="max-w-64 truncate text-xs text-fg-muted" title={m.blockedReason}>
                      {m.blockedReason}
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: "joined",
              header: "En el equipo desde",
              accessor: "joinedAt",
              sortable: true,
              hideBelow: "lg",
              cell: (m) => <time dateTime={m.joinedAt}>{fmtDate(m.joinedAt)}</time>,
            },
            {
              id: "lastLogin",
              header: "Último acceso",
              accessor: (m) => m.lastLoginAt ?? "",
              sortable: true,
              hideBelow: "md",
              cell: (m) =>
                m.lastLoginAt ? (
                  <time dateTime={m.lastLoginAt} title={fmtDateTime(m.lastLoginAt)}>
                    {fmtRelative(m.lastLoginAt)}
                  </time>
                ) : (
                  <span className="text-fg-subtle">Nunca</span>
                ),
            },
          ]}
          rowActions={(m) => (
            <Menu
              align="end"
              items={actionsFor(m)}
              trigger={
                <IconButton size="sm" variant="ghost" label={`Acciones de ${m.fullName}`}>
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </IconButton>
              }
            />
          )}
        />
      </Card>

      <Card className="grid gap-4 p-5">
        <SectionHeader
          title="Invitaciones"
          description="Pendientes y caducadas. Reenviar genera un enlace nuevo con otra caducidad; el anterior deja de valer."
        />
        {invitations.isPending ? (
          <SkeletonText lines={3} />
        ) : invitations.isError ? (
          <Alert
            tone="danger"
            action={
              <Button size="sm" variant="secondary" onClick={() => void invitations.refetch()}>
                Reintentar
              </Button>
            }
          >
            No se pudieron cargar las invitaciones: {errorMessage(invitations.error)}
          </Alert>
        ) : (
          <DataTable
            caption={`Invitaciones de ${winery.tradeName}`}
            captionHidden
            density="compact"
            data={invitations.data ?? []}
            getRowId={(i) => i.id}
            empty={<p className="p-4 text-fg-muted">No hay invitaciones pendientes.</p>}
            columns={[
              {
                id: "email",
                header: "Correo",
                accessor: "email",
                cell: (i) => <span className="font-medium">{i.email}</span>,
              },
              { id: "role", header: "Rol", accessor: (i) => roleLabel(i.role) },
              {
                id: "status",
                header: "Estado",
                accessor: "status",
                cell: (i) => <StatusBadge kind="invitation" status={i.status} />,
              },
              {
                id: "expires",
                header: "Caduca",
                accessor: "expiresAt",
                cell: (i) => <time dateTime={i.expiresAt}>{fmtDateTime(i.expiresAt)}</time>,
              },
              {
                id: "by",
                header: "Invitó",
                accessor: (i) => i.invitedBy.fullName,
                hideBelow: "lg",
                cell: (i) => (
                  <span>
                    {i.invitedBy.fullName}
                    {i.invitedBy.viaPlatform && <span className="text-xs text-fg-subtle"> · plataforma</span>}
                  </span>
                ),
              },
            ]}
            rowActions={(i) =>
              manage ? (
                <Menu
                  align="end"
                  items={[
                    {
                      label: "Reenviar la invitación",
                      icon: icon(RotateCcw),
                      onSelect: () => setDialog({ kind: "resend", invitation: i }),
                    },
                    ...(i.status === "PENDING"
                      ? [
                          {
                            label: "Anular la invitación",
                            icon: icon(UserX),
                            destructive: true,
                            onSelect: () => setDialog({ kind: "revoke", invitation: i }),
                          },
                        ]
                      : []),
                  ]}
                  trigger={
                    <IconButton size="sm" variant="ghost" label={`Acciones de la invitación a ${i.email}`}>
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </IconButton>
                  }
                />
              ) : null
            }
          />
        )}
      </Card>

      {inviting && <InviteMemberDialog winery={winery} onClose={() => setInviting(false)} />}
      {dialog && (
        <TeamActionDialog key={dialogKey(dialog)} winery={winery} dialog={dialog} onClose={() => setDialog(null)} />
      )}
      <PersonPanel
        winery={winery}
        member={person}
        onClose={() => setPerson(null)}
        onAction={(d) => {
          // Un solo diálogo a la vez: el panel se cierra y se abre el de la acción.
          setPerson(null);
          setDialog(d);
        }}
      />
    </div>
  );
}

const dialogKey = (d: MemberDialog) =>
  "member" in d ? `${d.kind}:${d.member.membershipId}` : `${d.kind}:${d.invitation.id}`;

// ---------------------------------------------------------------------------
// Invitar
// ---------------------------------------------------------------------------

const EMAIL_CONFLICTS = ["ORG_ALREADY_MEMBER", "INVITATION_ALREADY_PENDING", "ORG_MEMBER_LIMIT_REACHED"];

function InviteMemberDialog({ winery, onClose }: { winery: WineryDetail; onClose: () => void }) {
  const invite = useInviteMember(winery.id);
  const [form, setForm] = useState<InviteForm>({ email: "", role: "ENOLOGIST", reason: "" });
  const [errors, setErrors] = useState<FormErrors<keyof InviteForm>>({});
  const server = fieldErrorsFrom(invite.error, ["email", "role", "reason"]);
  const conflict =
    invite.error instanceof ApiError && EMAIL_CONFLICTS.includes(invite.error.code) && !server.fieldErrors.email
      ? invite.error.message
      : undefined;
  const general =
    invite.error && !conflict && Object.keys(server.fieldErrors).length === 0 ? errorMessage(invite.error) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    invite.reset();
    const problems = validateInvite(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    invite.mutate(
      { email: form.email.trim(), role: form.role as WineryRole, reason: form.reason.trim() || null },
      {
        onSuccess: (inv) => {
          toast({ title: `Invitación enviada a ${inv.email}.`, tone: "success" });
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Invitar al equipo de ${winery.tradeName}`}
      description="En nombre de la bodega: le llega un correo con un enlace al ERP (caduca en 72 horas) y el dueño recibe un aviso."
      size="md"
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {general && <Alert tone="danger">{general}</Alert>}
        <Field label="Correo electrónico" required error={errors.email ?? server.fieldErrors.email ?? conflict}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field
          label="Rol"
          required
          error={errors.role ?? server.fieldErrors.role}
          help="El rol de dueño solo se asigna en el alta o al transferir la titularidad."
        >
          <Select
            value={form.role}
            onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
            options={ASSIGNABLE.map((r) => ({ value: r, label: roleLabel(r) }))}
          />
        </Field>
        <Field label="Motivo" help="Opcional. Queda en la bitácora." error={errors.reason ?? server.fieldErrors.reason}>
          <Textarea
            rows={2}
            maxLength={500}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={invite.isPending}>
            Enviar la invitación
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Acciones con motivo
// ---------------------------------------------------------------------------

function copyFor(winery: WineryDetail, d: MemberDialog): ReasonActionCopy {
  if ("invitation" in d) {
    const email = d.invitation.email;
    return d.kind === "resend"
      ? {
          title: `Reenviar la invitación a ${email}`,
          description: "Se envía un enlace nuevo con otra caducidad; el anterior deja de valer.",
          confirm: "Reenviar",
          done: `Invitación reenviada a ${email}.`,
        }
      : {
          title: `Anular la invitación a ${email}`,
          description: "El enlace deja de valer. Se podrá invitar de nuevo a este correo más adelante.",
          confirm: "Anular la invitación",
          destructive: true,
          done: `Invitación a ${email} anulada.`,
        };
  }
  const who = d.member.fullName;
  switch (d.kind) {
    case "role":
      return {
        title: `Cambiar el rol de ${who}`,
        description: `En ${winery.tradeName}. El dueño recibe un aviso con el motivo.`,
        confirm: "Cambiar el rol",
        done: `Rol de ${who} cambiado.`,
      };
    case "block":
      return {
        title: `Bloquear a ${who} en ${winery.tradeName}`,
        description:
          "Sus sesiones en esta bodega se cierran al instante. Solo la plataforma podrá desbloquearlo. El dueño recibe un aviso con el motivo.",
        confirm: "Bloquear",
        destructive: true,
        done: `${who} quedó bloqueado en ${winery.tradeName}.`,
      };
    case "unblock":
      return {
        title: `Desbloquear a ${who}`,
        description: `Podrá volver a operar en ${winery.tradeName} con su rol.`,
        confirm: "Desbloquear",
        done: `${who} ya puede operar en ${winery.tradeName}.`,
      };
    case "password":
      return {
        title: `Enviar a ${who} un enlace de contraseña`,
        description: `Le llega a ${d.member.email} un enlace de un solo uso (caduca en 60 minutos).`,
        confirm: "Enviar el enlace",
        done: `Enlace enviado a ${d.member.email}.`,
      };
    case "account-block":
      return {
        title: `Bloquear la cuenta completa de ${who}`,
        description:
          "No podrá entrar a ningún sistema de Drinks on Chain (ERP, back office, tienda) y se cierran todas sus sesiones.",
        confirm: "Bloquear la cuenta",
        destructive: true,
        done: `Cuenta de ${who} bloqueada.`,
      };
    case "account-unblock":
      return {
        title: `Desbloquear la cuenta de ${who}`,
        description: "Podrá volver a entrar con su contraseña en los sistemas donde tenga membresía.",
        confirm: "Desbloquear la cuenta",
        done: `Cuenta de ${who} desbloqueada.`,
      };
  }
}

function TeamActionDialog({
  winery,
  dialog,
  onClose,
}: {
  winery: WineryDetail;
  dialog: MemberDialog;
  onClose: () => void;
}) {
  const initialRole =
    "member" in dialog ? (ASSIGNABLE.find((r) => r !== dialog.member.role) ?? "ENOLOGIST") : "ENOLOGIST";
  const [role, setRole] = useState<WineryRole>(initialRole);
  const [roleError, setRoleError] = useState<string | undefined>();
  const changeRole = useChangeMemberRole(winery.id);
  const setBlocked = useSetMemberBlocked(winery.id);
  const sendReset = useSendMemberPasswordReset();
  const account = useSetAccountBlocked(winery.id);
  const invitation = useManageOrganizationInvitation(winery.id);

  function run(reason: string): Promise<unknown> {
    if ("invitation" in dialog) {
      return invitation.mutateAsync({ invitationId: dialog.invitation.id, action: dialog.kind, reason });
    }
    const m = dialog.member;
    switch (dialog.kind) {
      case "role":
        return changeRole.mutateAsync({ membershipId: m.membershipId, role, reason });
      case "block":
      case "unblock":
        return setBlocked.mutateAsync({ membershipId: m.membershipId, blocked: dialog.kind === "block", reason });
      case "password":
        return sendReset.mutateAsync({ userId: m.userId, reason });
      case "account-block":
      case "account-unblock":
        return account.mutateAsync({ userId: m.userId, blocked: dialog.kind === "account-block", reason });
    }
  }

  return (
    <ReasonActionDialog
      copy={copyFor(winery, dialog)}
      run={run}
      onClose={onClose}
      fields={["role"]}
      onFieldErrors={(e) => setRoleError(e.role)}
    >
      {dialog.kind === "role" && "member" in dialog && (
        <Field label="Rol nuevo" required error={roleError} help={`Rol actual: ${roleLabel(dialog.member.role)}.`}>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as WineryRole)}
            options={ASSIGNABLE.map((r) => ({ value: r, label: roleLabel(r), disabled: r === dialog.member.role }))}
          />
        </Field>
      )}
    </ReasonActionDialog>
  );
}

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

/** Panel de una persona del equipo: su membresía, su cuenta completa (estado y membresías) y las acciones. */
function PersonPanel({
  winery,
  member,
  onClose,
  onAction,
}: {
  winery: WineryDetail;
  member: Member | null;
  onClose: () => void;
  onAction: (d: MemberDialog) => void;
}) {
  const me = useMe();
  const account = useAccount(member?.userId ?? null);
  const isSelf = member?.userId === me.data?.user.id;
  const canAccount = can(me.data, "accounts.block") && !isSelf;
  const detail = account.data;
  const blocked = detail?.status === "BLOCKED";

  return (
    <SlideOver
      open={member !== null}
      onOpenChange={(open) => !open && onClose()}
      title={member?.fullName ?? "Persona"}
      description={member ? `${roleLabel(member.role)} en ${winery.tradeName}` : undefined}
      size="md"
    >
      {member && (
        <div className="grid gap-5">
          <KeyValueList
            layout="stacked"
            items={[
              { term: "Correo", value: member.email },
              {
                term: "En esta bodega",
                value: (
                  <span className="grid justify-items-start gap-0.5">
                    <StatusBadge
                      kind="member"
                      status={member.status}
                      label={member.status === "BLOCKED" ? blockedByLabel(member) : undefined}
                    />
                    {member.blockedReason && (
                      <span className="text-xs text-fg-muted">Motivo: {member.blockedReason}</span>
                    )}
                  </span>
                ),
              },
              {
                term: "Cuenta completa",
                value: account.isPending ? (
                  <SkeletonText lines={1} />
                ) : account.isError ? (
                  <span className="text-xs text-fg-muted">
                    No se pudo leer la cuenta: {errorMessage(account.error)}{" "}
                    <Button size="sm" variant="tertiary" onClick={() => void account.refetch()}>
                      Reintentar
                    </Button>
                  </span>
                ) : blocked ? (
                  <span className="grid justify-items-start gap-0.5">
                    <StatusBadge kind="member" status="BLOCKED" label="Cuenta bloqueada" />
                    {detail?.blockedReason && (
                      <span className="text-xs text-fg-muted">Motivo: {detail.blockedReason}</span>
                    )}
                    {detail?.blockedAt && (
                      <span className="text-xs text-fg-muted">
                        Desde el <time dateTime={detail.blockedAt}>{fmtDateTime(detail.blockedAt)}</time>
                      </span>
                    )}
                  </span>
                ) : (
                  <StatusBadge kind="member" status="ACTIVE" label="Cuenta activa" />
                ),
              },
              {
                term: "Último acceso",
                value: member.lastLoginAt ? fmtDateTime(member.lastLoginAt) : "Nunca",
              },
            ]}
          />

          {detail && detail.memberships.length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-xs font-medium tracking-label text-fg-subtle uppercase">Membresías</h3>
              <ul
                className="grid divide-y divide-border rounded-md border border-border"
                aria-label="Membresías de la persona"
              >
                {detail.memberships.map((m) => (
                  <li key={m.membershipId} className="grid gap-0.5 px-3 py-2">
                    <span className="font-medium">
                      {m.organizationType === "WINERY" && m.organizationId !== winery.id ? (
                        <TextLink asChild variant="inline">
                          <Link href={`/bodegas/${m.organizationId}`}>{m.organizationName}</Link>
                        </TextLink>
                      ) : (
                        m.organizationName
                      )}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {roleLabel(m.role)} · {m.status === "BLOCKED" ? blockedByLabel(m).toLowerCase() : "activo"} ·
                      organización {getStatusBadge("winery", m.organizationStatus).label.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            <h3 className="text-xs font-medium tracking-label text-fg-subtle uppercase">Acciones</h3>
            {can(me.data, "users.sendPasswordReset") && (
              <Button
                variant="secondary"
                iconStart={icon(KeyRound)}
                onClick={() => onAction({ kind: "password", member })}
              >
                Enviar enlace de contraseña
              </Button>
            )}
            {canAccount &&
              (blocked ? (
                <Button
                  variant="secondary"
                  iconStart={icon(UserCheck)}
                  onClick={() => onAction({ kind: "account-unblock", member })}
                >
                  Desbloquear la cuenta completa
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  iconStart={icon(ShieldOff)}
                  disabled={!detail}
                  onClick={() => onAction({ kind: "account-block", member })}
                >
                  Bloquear la cuenta completa
                </Button>
              ))}
            {!can(me.data, "accounts.block") && (
              <p className="text-xs text-fg-muted">Solo administración bloquea la cuenta completa de una persona.</p>
            )}
            <TextLink asChild variant="inline">
              <Link href={`/bitacora?persona=${member.userId}`}>Ver su actividad en la bitácora</Link>
            </TextLink>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
