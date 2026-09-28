import type { Membership, PlatformRole, PlatformUser } from "@drinks-on-chain/mocks";
import type { MeResponse } from "@/lib/auth/schemas";
import { activeMembership, isUsableMembership } from "@/lib/auth/organization";

// Quién puede qué en el back office (contrato de la Ola 1 §9 y matriz de docs-back/05 §3). El
// backend decide (responde 403): esto solo oculta o desactiva lo que fallaría. Los permisos salen
// de la membresía de PLATAFORMA activa; el superusuario tiene lo mismo que administración.

export type PlatformAction =
  | "dashboard.read"
  | "permissions.read"
  // Usuarios internos (§5): solo administración.
  | "users.read"
  | "users.invite"
  | "users.changeRole"
  | "users.block"
  | "users.resetMfa"
  | "users.manageInvitations"
  | "users.sendPasswordReset"
  // Solicitudes y bodegas (§3, §4).
  | "applications.read"
  | "applications.manage"
  | "wineries.read"
  | "wineries.create"
  | "wineries.suspend"
  | "wineries.revoke"
  | "wineries.transferOwnership"
  | "accounts.block"
  // Equipo de una bodega (§5), configuración (§6) y bitácora (§7).
  | "team.manage"
  | "settings.read"
  | "settings.write"
  | "audit.read"
  | "audit.verify";

const ADMINS: readonly PlatformRole[] = ["SUPERADMIN", "ADMIN"];
const OPS: readonly PlatformRole[] = [...ADMINS, "OPERATIONS"];
const STAFF: readonly PlatformRole[] = [...OPS, "SUPPORT"];

const RULES: Record<PlatformAction, readonly PlatformRole[]> = {
  "dashboard.read": STAFF,
  "permissions.read": STAFF,
  "users.read": ADMINS,
  "users.invite": ADMINS,
  "users.changeRole": ADMINS,
  "users.block": ADMINS,
  "users.resetMfa": ADMINS,
  "users.manageInvitations": ADMINS,
  "users.sendPasswordReset": STAFF,
  "applications.read": STAFF,
  "applications.manage": OPS,
  "wineries.read": STAFF,
  "wineries.create": OPS,
  "wineries.suspend": OPS,
  "wineries.revoke": ADMINS,
  "wineries.transferOwnership": ADMINS,
  "accounts.block": ADMINS,
  "team.manage": STAFF,
  "settings.read": STAFF,
  "settings.write": ADMINS,
  "audit.read": STAFF,
  "audit.verify": ADMINS,
};

const PLATFORM_ROLES: readonly string[] = STAFF;
const isPlatformRole = (role: string): role is PlatformRole => PLATFORM_ROLES.includes(role);

/** Membresía de plataforma utilizable (activa y no revocada), aunque no sea la activa. */
export function platformMembership(me: MeResponse | undefined): Membership | undefined {
  return me?.memberships.find((m) => m.organizationType === "PLATFORM" && isUsableMembership(m));
}

/** Membresías de bodega utilizables: el Backoffice no opera con ellas, ofrece abrir el ERP. */
export function wineryMemberships(me: MeResponse | undefined): Membership[] {
  return me?.memberships.filter((m) => m.organizationType === "WINERY" && isUsableMembership(m)) ?? [];
}

/** Personal interno: audiencia STAFF con una membresía de plataforma utilizable. */
export function canUseBackoffice(me: MeResponse | undefined): boolean {
  return me?.user.audience === "STAFF" && platformMembership(me) !== undefined;
}

/** La organización activa es la plataforma (si no, hay que cambiar a ella antes de operar). */
export function isPlatformActive(me: MeResponse | undefined): boolean {
  return activeMembership(me)?.organizationType === "PLATFORM";
}

/** Rol de plataforma con el que se opera ahora (`null` si la plataforma no es la activa). */
export function platformRole(me: MeResponse | undefined): PlatformRole | null {
  const active = activeMembership(me);
  if (!active || active.organizationType !== "PLATFORM" || !isUsableMembership(active)) return null;
  return isPlatformRole(active.role) ? active.role : null;
}

export function can(me: MeResponse | undefined, action: PlatformAction): boolean {
  const role = platformRole(me);
  return role !== null && RULES[action].includes(role);
}

/** El superusuario no se bloquea ni se degrada (403 `PLATFORM_SUPERADMIN_PROTECTED`). */
export const isProtectedUser = (target: Pick<PlatformUser, "role">) => target.role === "SUPERADMIN";

/** Acciones sobre otra persona interna: nunca sobre el superusuario ni sobre uno mismo. */
export type UserAction = "users.changeRole" | "users.block" | "users.resetMfa";

export function canActOnUser(
  me: MeResponse | undefined,
  target: Pick<PlatformUser, "role" | "userId" | "membershipId">,
  action: UserAction,
): boolean {
  if (!can(me, action) || !target.membershipId) return false;
  if (isProtectedUser(target)) return false;
  return target.userId !== me?.user.id;
}
