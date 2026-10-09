import {
  Building2,
  ClipboardList,
  Inbox,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListChecks,
  MapPin,
  ScrollText,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import type { NavGroup, NavItem } from "@drinks-on-chain/ui";
import { env } from "@/lib/env";
import { es } from "@/lib/i18n/es";
import type { PlatformAction } from "@/lib/platform/permissions";
import { WAITLIST_PATH } from "@/lib/platform/waitlist-utils";

// Menú del back office (docs-front/03 §8). 4A y 4B en la Ola 1 y 4C (tokenización, colecciones y
// cadena) en la Ola 3; los módulos de otras olas (4D, 4F) solo aparecen con su bandera
// NEXT_PUBLIC_FLAG_*. La lista de espera (O1b) y las secciones de la Ola 3 aparecen con su
// capacidad (`allowed`, normalmente `can(me, …)`).

type Item = NavItem & { keywords?: string[] };

const icon = (Icon: typeof Users) => <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />;

export const dashboardItem: Item = { label: es.nav.dashboard, href: "/", exact: true, icon: icon(LayoutDashboard) };

export function navigation(flags = env.flags, allowed: (action: PlatformAction) => boolean = () => true): NavGroup[] {
  const operations: Item[] = [
    { label: es.nav.applications, href: "/solicitudes", icon: icon(Inbox), keywords: ["alta", "bandeja"] },
    { label: es.nav.wineries, href: "/bodegas", icon: icon(Building2), keywords: ["socias", "directorio"] },
    ...(allowed("waitlist.read")
      ? [
          {
            label: es.nav.waitlist,
            href: WAITLIST_PATH,
            icon: icon(ListChecks),
            keywords: ["inscripciones", "consumidores", "interesados", "espera"],
          },
        ]
      : []),
    ...(flags.pickupPoints ? [{ label: es.nav.pickupPoints, href: "/puntos", icon: icon(MapPin) }] : []),
    ...(flags.support ? [{ label: es.nav.support, href: "/soporte", icon: icon(LifeBuoy) }] : []),
    ...(flags.orders ? [{ label: es.nav.orders, href: "/pedidos", icon: icon(ShoppingBag) }] : []),
  ];
  const platform: Item[] = [
    { label: es.nav.users, href: "/usuarios", icon: icon(Users), keywords: ["roles", "equipo", "personal"] },
    { label: es.nav.settings, href: "/configuracion", icon: icon(Settings), keywords: ["parámetros", "ajustes"] },
    { label: es.nav.audit, href: "/bitacora", icon: icon(ScrollText), keywords: ["auditoría", "registro"] },
  ];
  const tokenization: Item[] = [
    ...(allowed("tokenization.read")
      ? [
          {
            label: es.nav.tokenization,
            href: "/tokenizacion",
            icon: icon(Sparkles),
            keywords: ["solicitudes", "bandeja", "nft", "emisión", "cuota", "preventa"],
          },
          {
            label: es.nav.collections,
            href: "/colecciones",
            icon: icon(Layers),
            keywords: ["nft", "emisión", "publicar", "pausar", "faltante", "cierre", "precio"],
          },
        ]
      : []),
    ...(allowed("chain.read")
      ? [
          {
            label: es.nav.chain,
            href: "/cadena",
            icon: icon(Link2),
            keywords: ["red", "stellar", "transacciones", "saldos", "cuentas", "conciliación", "alertas", "eventos"],
          },
        ]
      : []),
  ];
  return [
    { items: [dashboardItem] },
    { label: es.nav.groupOperations, items: operations },
    ...(tokenization.length ? [{ label: es.nav.groupTokenization, items: tokenization }] : []),
    { label: es.nav.groupPlatform, items: platform },
  ];
}

/** Todos los elementos del menú, en orden (para la paleta de comandos). */
export const navItems = (groups: NavGroup[]): Item[] => groups.flatMap((g) => g.items as Item[]);

export const permissionsIcon = icon(ClipboardList);
