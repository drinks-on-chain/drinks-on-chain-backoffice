"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  KeyRound,
  Lock,
  MailPlus,
  MoreHorizontal,
  RotateCcw,
  ShieldOff,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react";
import type { PlatformUser } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  Menu,
  Select,
  StatusBadge,
  TextLink,
  type MenuEntry,
} from "@drinks-on-chain/ui";
import { useMe } from "@/lib/auth/hooks";
import { fmtRelative } from "@/lib/format";
import { roleLabel } from "@/lib/platform/labels";
import { usePlatformUsers } from "@/lib/platform/hooks";
import { can, canActOnUser, isProtectedUser } from "@/lib/platform/permissions";
import { InviteUserDialog } from "./invite-user-dialog";
import { UserActionDialog, type UserDialog } from "./user-action-dialog";

const PAGE_SIZE = 20;
const STATUSES = ["ACTIVE", "BLOCKED", "INVITED"] as const;
const ROLES = ["SUPERADMIN", "ADMIN", "OPERATIONS", "SUPPORT"] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  ACTIVE: "Activo",
  BLOCKED: "Bloqueado",
  INVITED: "Invitado",
};
const ALL = "ALL";

type Status = (typeof STATUSES)[number];
const asStatus = (v: string | null): Status | undefined => STATUSES.find((s) => s === v);
const asRole = (v: string | null) => ROLES.find((r) => r === v);

/** 4A · Usuarios internos (contrato de la Ola 1 §5): lista, invitaciones y acciones con motivo. */
export function UsersView() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = asStatus(params.get("estado"));
  const role = asRole(params.get("rol"));
  const [offset, setOffset] = useState(0);
  const [dialog, setDialog] = useState<UserDialog | null>(null);
  const allowed = can(me.data, "users.read");
  const inviteOpen = params.get("invitar") === "1" && can(me.data, "users.invite");

  const users = usePlatformUsers({ status, role, limit: PAGE_SIZE, offset }, allowed);

  /** Cambia un parámetro de la URL (filtros persistentes, 03-backoffice «Reglas»). */
  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    setOffset(0);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (me.data && !allowed) {
    return (
      <div className="grid gap-5">
        <Alert tone="info">
          Solo administración gestiona los usuarios internos. Puedes consultar qué hace cada rol en la{" "}
          <TextLink asChild variant="inline">
            <Link href="/usuarios/permisos">matriz de permisos</Link>
          </TextLink>
          .
        </Alert>
      </div>
    );
  }

  const filters = [
    ...(status ? [{ id: "estado", label: "Estado", value: STATUS_LABELS[status] }] : []),
    ...(role ? [{ id: "rol", label: "Rol", value: roleLabel(role) }] : []),
  ];
  const page = users.data;

  function actionsFor(user: PlatformUser): MenuEntry[] {
    const entries: MenuEntry[] = [];
    if (user.status === "INVITED") {
      if (user.invitationId && can(me.data, "users.manageInvitations")) {
        entries.push(
          {
            label: "Reenviar la invitación",
            icon: <MailPlus aria-hidden="true" className="size-4" />,
            onSelect: () => setDialog({ kind: "resend", user }),
          },
          {
            label: "Anular la invitación",
            icon: <UserX aria-hidden="true" className="size-4" />,
            destructive: true,
            onSelect: () => setDialog({ kind: "revoke", user }),
          },
        );
      }
      return entries;
    }
    if (canActOnUser(me.data, user, "users.changeRole")) {
      entries.push({
        label: "Cambiar el rol",
        icon: <UserCog aria-hidden="true" className="size-4" />,
        onSelect: () => setDialog({ kind: "role", user }),
      });
    }
    if (canActOnUser(me.data, user, "users.resetMfa") && user.mfaEnabled) {
      entries.push({
        label: "Restablecer el segundo factor",
        icon: <RotateCcw aria-hidden="true" className="size-4" />,
        onSelect: () => setDialog({ kind: "reset-mfa", user }),
      });
    }
    if (user.userId && can(me.data, "users.sendPasswordReset") && user.userId !== me.data?.user.id) {
      entries.push({
        label: "Enviar enlace de contraseña",
        icon: <KeyRound aria-hidden="true" className="size-4" />,
        onSelect: () => setDialog({ kind: "password", user }),
      });
    }
    if (canActOnUser(me.data, user, "users.block")) {
      if (entries.length) entries.push({ type: "separator" });
      entries.push(
        user.status === "BLOCKED"
          ? {
              label: "Desbloquear",
              icon: <UserCheck aria-hidden="true" className="size-4" />,
              onSelect: () => setDialog({ kind: "unblock", user }),
            }
          : {
              label: "Bloquear",
              icon: <ShieldOff aria-hidden="true" className="size-4" />,
              destructive: true,
              onSelect: () => setDialog({ kind: "block", user }),
            },
      );
    }
    return entries;
  }

  return (
    <div className="grid gap-5">
      <FilterBar
        actions={
          can(me.data, "users.invite") ? (
            <Button
              onClick={() => setParam("invitar", "1")}
              iconStart={<MailPlus aria-hidden="true" className="size-4" />}
            >
              Invitar usuario interno
            </Button>
          ) : null
        }
        filters={filters}
        onRemove={(id) => setParam(id, undefined)}
        onClearAll={
          filters.length
            ? () => {
                setOffset(0);
                router.replace(pathname, { scroll: false });
              }
            : undefined
        }
        resultCount={page ? `${page.total} ${page.total === 1 ? "persona" : "personas"}` : undefined}
      >
        <Field label="Estado" className="w-44">
          <Select
            size="sm"
            value={status ?? ALL}
            onValueChange={(v) => setParam("estado", v === ALL ? undefined : v)}
            options={[{ value: ALL, label: "Todos" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
          />
        </Field>
        <Field label="Rol" className="w-48">
          <Select
            size="sm"
            value={role ?? ALL}
            onValueChange={(v) => setParam("rol", v === ALL ? undefined : v)}
            options={[{ value: ALL, label: "Todos" }, ...ROLES.map((r) => ({ value: r, label: roleLabel(r) }))]}
          />
        </Field>
      </FilterBar>

      <DataTable
        caption="Usuarios internos"
        captionHidden
        density="compact"
        data={page?.items ?? []}
        getRowId={(u) => u.membershipId ?? u.invitationId ?? u.email}
        loading={users.isPending}
        error={
          users.isError
            ? { description: "No se pudo cargar la lista de usuarios internos.", onRetry: () => void users.refetch() }
            : undefined
        }
        empty={
          <EmptyState
            bare
            title={filters.length ? "Nadie coincide con los filtros" : "Aún no hay usuarios internos"}
            description={filters.length ? "Prueba con otro estado o rol." : "Invita al primero para empezar."}
            action={
              filters.length ? (
                <Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>
                  Limpiar filtros
                </Button>
              ) : undefined
            }
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
            cell: (u) => (
              <div className="grid">
                <span className="flex items-center gap-2 font-medium">
                  {u.fullName}
                  {u.userId === me.data?.user.id && <span className="text-xs font-normal text-fg-subtle">(tú)</span>}
                </span>
                {/* Una invitación a un correo sin cuenta no tiene nombre: el backend repite el correo. */}
                <span className="text-xs text-fg-muted">
                  {u.fullName === u.email ? "Invitación pendiente de aceptar" : u.email}
                </span>
              </div>
            ),
          },
          {
            id: "role",
            header: "Rol",
            accessor: (u) => roleLabel(u.role),
            sortable: true,
            cell: (u) =>
              isProtectedUser(u) ? (
                <span className="inline-flex items-center gap-1.5">
                  {roleLabel(u.role)}
                  <Badge tone="neutral" title="No se puede bloquear ni degradar">
                    <Lock aria-hidden="true" className="size-3" /> Protegido
                  </Badge>
                </span>
              ) : (
                roleLabel(u.role)
              ),
          },
          {
            id: "status",
            header: "Estado",
            accessor: "status",
            sortable: true,
            cell: (u) => (
              <div className="grid justify-items-start gap-0.5">
                <StatusBadge kind="member" status={u.status} />
                {u.status === "BLOCKED" && u.blockedReason && (
                  <span className="max-w-64 truncate text-xs text-fg-muted" title={u.blockedReason}>
                    {u.blockedReason}
                  </span>
                )}
              </div>
            ),
          },
          {
            id: "mfa",
            header: "Segundo factor",
            accessor: (u) => (u.mfaEnabled ? 1 : 0),
            sortable: true,
            hideBelow: "lg",
            cell: (u) =>
              u.status === "INVITED" ? (
                <span className="text-fg-subtle">—</span>
              ) : u.mfaEnabled ? (
                <Badge tone="success">Activo</Badge>
              ) : (
                <Badge tone="warning">Sin inscribir</Badge>
              ),
          },
          {
            id: "lastLogin",
            header: "Último acceso",
            accessor: (u) => u.lastLoginAt ?? "",
            sortable: true,
            hideBelow: "md",
            cell: (u) =>
              u.lastLoginAt ? (
                <time dateTime={u.lastLoginAt}>{fmtRelative(u.lastLoginAt)}</time>
              ) : (
                <span className="text-fg-subtle">{u.status === "INVITED" ? "Pendiente de aceptar" : "Nunca"}</span>
              ),
          },
        ]}
        rowActions={(u) => {
          const items = actionsFor(u);
          if (items.length === 0) {
            return isProtectedUser(u) ? <span className="sr-only">Sin acciones: usuario protegido</span> : null;
          }
          return (
            <Menu
              align="end"
              items={items}
              trigger={
                <IconButton size="sm" variant="ghost" label={`Acciones de ${u.fullName}`}>
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </IconButton>
              }
            />
          );
        }}
      />

      <InviteUserDialog open={inviteOpen} onOpenChange={(open) => !open && setParam("invitar", undefined)} />
      <UserActionDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
