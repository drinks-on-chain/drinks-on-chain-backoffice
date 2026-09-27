"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ExternalLink, Inbox, KeyRound, LogOut, UserPlus, UserRound } from "lucide-react";
import type { MeResponse } from "@drinks-on-chain/mocks";
import {
  AdminShell,
  Button,
  EmptyState,
  ErrorState,
  OrganizationSwitcher,
  Spinner,
  type CommandPaletteGroup,
} from "@drinks-on-chain/ui";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useIsAuthenticated, useLogout, useMe, useSwitchOrganization } from "@/lib/auth/hooks";
import { activeMembership } from "@/lib/auth/organization";
import { es } from "@/lib/i18n/es";
import { links } from "@/lib/links";
import { navItems, navigation, permissionsIcon } from "@/lib/navigation";
import { usePaletteSearch } from "./palette-search";
import { roleLabel } from "@/lib/platform/labels";
import {
  can,
  canUseBackoffice,
  isPlatformActive,
  platformMembership,
  wineryMemberships,
} from "@/lib/platform/permissions";

function FullScreenSpinner({ label = es.common.loading }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <Spinner label={label} />
    </div>
  );
}

/** Pantalla completa fuera del shell (sin acceso, error de sesión…), con su h1 para lectores. */
function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <h1 className="sr-only">{es.app.name}</h1>
      <div className="grid max-w-md justify-items-center gap-3">{children}</div>
    </main>
  );
}

/**
 * Protege las rutas privadas y monta el AdminShell. Mientras se recupera la sesión al arrancar
 * (renovación con la cookie) muestra un spinner; sin sesión lleva al login.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  const router = useRouter();

  useEffect(() => {
    if (authenticated === false) router.replace("/login");
  }, [authenticated, router]);

  if (!authenticated) return <FullScreenSpinner />;
  return <Guard>{children}</Guard>;
}

/**
 * Guardia del back office (contrato de la Ola 1 §0): audiencia STAFF y organización activa de
 * plataforma. Quien además es miembro de una bodega opera aquí solo con la plataforma: si la
 * activa es la bodega, se cambia a la plataforma (sin segundo factor en la sesión → 403
 * `AUTH_MFA_REQUIRED`: hay que volver a entrar).
 */
function Guard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const logout = useLogout();
  const me = useMe();
  const switchOrg = useSwitchOrganization();
  const switching = useRef(false);

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  const allowed = canUseBackoffice(me.data);
  const needsSwitch = allowed && !isPlatformActive(me.data);
  const platform = platformMembership(me.data);
  const { mutate: switchTo } = switchOrg;

  useEffect(() => {
    if (!needsSwitch || !platform || switching.current || switchOrg.isError) return;
    switching.current = true;
    switchTo(platform.organizationId, { onSettled: () => (switching.current = false) });
  }, [needsSwitch, platform, switchTo, switchOrg.isError]);

  if (me.isPending) return <FullScreenSpinner />;

  if (me.isError && !me.data) {
    return (
      <Gate>
        <ErrorState title={es.auth.sessionError} description={errorMessage(me.error)} onRetry={() => me.refetch()} />
        <Button variant="tertiary" onClick={() => void signOut()}>
          {es.auth.logout}
        </Button>
      </Gate>
    );
  }

  if (!allowed) {
    const erp = wineryMemberships(me.data).length > 0 ? links.erp : null;
    return (
      <Gate>
        <EmptyState
          title={es.auth.wrongAudience}
          description={erp ? es.auth.openErpBody : es.auth.wrongAudienceBody}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {erp && (
                <Button asChild>
                  <a href={erp}>{es.auth.openErp}</a>
                </Button>
              )}
              <Button variant={erp ? "secondary" : "primary"} onClick={() => void signOut()}>
                {es.auth.logout}
              </Button>
            </div>
          }
        />
      </Gate>
    );
  }

  if (needsSwitch) {
    if (switchOrg.isError) {
      const mfaMissing = switchOrg.error instanceof ApiError && switchOrg.error.code === "AUTH_MFA_REQUIRED";
      return (
        <Gate>
          {mfaMissing ? (
            <EmptyState
              title={es.auth.mfaRequired}
              description={es.auth.mfaRequiredBody}
              action={<Button onClick={() => void signOut()}>{es.auth.mfaRequiredAction}</Button>}
            />
          ) : (
            <ErrorState
              title={es.auth.sessionError}
              description={errorMessage(switchOrg.error)}
              onRetry={() => switchOrg.reset()}
            />
          )}
        </Gate>
      );
    }
    return <FullScreenSpinner label={es.auth.switchingToPlatform} />;
  }

  return <Shell me={me.data}>{children}</Shell>;
}

function Shell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const groups = useMemo(() => navigation(), []);
  const active = activeMembership(me);
  const erp = wineryMemberships(me).length > 0 ? links.erp : null;
  const search = usePaletteSearch(me);

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  const palette: CommandPaletteGroup[] = [
    ...search.groups,
    {
      heading: es.palette.navigation,
      items: [
        ...navItems(groups).map((item) => ({
          id: `nav:${item.href}`,
          label: item.label,
          icon: item.icon,
          keywords: item.keywords,
          onSelect: () => router.push(item.href),
        })),
        {
          id: "nav:/usuarios/permisos",
          label: es.palette.permissions,
          icon: permissionsIcon,
          keywords: ["roles", "matriz", "capacidades"],
          onSelect: () => router.push("/usuarios/permisos"),
        },
        {
          id: "nav:/perfil",
          label: es.nav.profile,
          icon: <UserRound aria-hidden="true" className="size-4" />,
          keywords: ["contraseña", "idioma", "nombre"],
          onSelect: () => router.push("/perfil"),
        },
      ],
    },
    {
      heading: es.palette.actions,
      items: [
        ...(can(me, "wineries.create")
          ? [
              {
                id: "action:new-winery",
                label: es.palette.newWinery,
                icon: <Building2 aria-hidden="true" className="size-4" />,
                keywords: ["alta", "directa", "crear", "bodega"],
                onSelect: () => router.push("/bodegas/nueva"),
              },
            ]
          : []),
        ...(can(me, "applications.read")
          ? [
              {
                id: "action:go-application",
                label: es.palette.goToApplication,
                description: es.palette.goToApplicationHelp,
                icon: <Inbox aria-hidden="true" className="size-4" />,
                keywords: ["solicitud", "buscar", "bandeja", "alta"],
                onSelect: () => router.push("/solicitudes"),
              },
            ]
          : []),
        ...(can(me, "users.invite")
          ? [
              {
                id: "action:invite",
                label: es.palette.inviteUser,
                icon: <UserPlus aria-hidden="true" className="size-4" />,
                keywords: ["usuario", "invitación", "alta"],
                onSelect: () => router.push("/usuarios?invitar=1"),
              },
            ]
          : []),
        ...(erp
          ? [
              {
                id: "action:erp",
                label: es.auth.openErp,
                icon: <ExternalLink aria-hidden="true" className="size-4" />,
                onSelect: () => window.open(erp, "_blank", "noopener"),
              },
            ]
          : []),
      ],
    },
    {
      heading: es.palette.session,
      items: [
        {
          id: "session:logout-all",
          label: es.auth.logoutAll,
          icon: <KeyRound aria-hidden="true" className="size-4" />,
          onSelect: () => router.push("/perfil#sesiones"),
        },
        {
          id: "session:logout",
          label: es.auth.logout,
          icon: <LogOut aria-hidden="true" className="size-4" />,
          onSelect: () => void signOut(),
        },
      ],
    },
  ];

  return (
    <>
      {/* Salta la barra lateral y la superior (WCAG 2.4.1). */}
      <a
        href="#contenido"
        className="sr-only rounded-md bg-bg px-4 py-2 font-medium text-fg shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        Saltar al contenido
      </a>
      <AdminShell
        navigation={groups}
        currentPath={pathname}
        linkComponent={Link}
        user={{ name: me.user.fullName, role: `${roleLabel(active?.role)} · ${active?.organizationName ?? ""}` }}
        userMenu={[
          { label: es.nav.profile, href: "/perfil" },
          { type: "separator" },
          { label: es.auth.logout, onSelect: () => void signOut() },
        ]}
        search={{ placeholder: "Buscar pantalla, solicitud o bodega…" }}
        commandPalette={{
          groups: palette,
          onQueryChange: search.onQueryChange,
          loading: search.loading,
          filter: search.filter,
          placeholder: es.palette.searchPlaceholder,
          labels: { title: "Paleta de comandos", input: "Buscar pantalla o acción" },
        }}
        organizationSwitcher={
          active ? (
            <OrganizationSwitcher
              label={es.organization.label}
              activeId={active.organizationId}
              organizations={[{ id: active.organizationId, name: active.organizationName, description: "Plataforma" }]}
              onChange={() => {}}
            />
          ) : null
        }
        topbarActions={
          erp ? (
            <Button asChild variant="secondary" size="sm">
              <a href={erp} target="_blank" rel="noopener noreferrer">
                {es.auth.openErp}
                <ExternalLink aria-hidden="true" className="size-4" />
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </Button>
          ) : null
        }
      >
        <div id="contenido" tabIndex={-1} className="outline-none">
          {children}
        </div>
      </AdminShell>
    </>
  );
}
