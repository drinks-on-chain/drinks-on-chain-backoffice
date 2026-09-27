import {
  Building2,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
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

// Menú del back office (docs-front/03 §8). 4A y 4B en la Ola 1; los módulos de otras olas (4C,
// 4D, 4F) solo aparecen con su bandera NEXT_PUBLIC_FLAG_*.

type Item = NavItem & { keywords?: string[] };

const icon = (Icon: typeof Users) => <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />;

export const dashboardItem: Item = { label: es.nav.dashboard, href: "/", exact: true, icon: icon(LayoutDashboard) };

export function navigation(flags = env.flags): NavGroup[] {
  const operations: Item[] = [
    { label: es.nav.applications, href: "/solicitudes", icon: icon(Inbox), keywords: ["alta", "bandeja"] },
    { label: es.nav.wineries, href: "/bodegas", icon: icon(Building2), keywords: ["socias", "directorio"] },
    ...(flags.tokenization ? [{ label: es.nav.tokenization, href: "/tokenizacion", icon: icon(Sparkles) }] : []),
    ...(flags.pickupPoints ? [{ label: es.nav.pickupPoints, href: "/puntos", icon: icon(MapPin) }] : []),
    ...(flags.support ? [{ label: es.nav.support, href: "/soporte", icon: icon(LifeBuoy) }] : []),
    ...(flags.orders ? [{ label: es.nav.orders, href: "/pedidos", icon: icon(ShoppingBag) }] : []),
  ];
  const platform: Item[] = [
    { label: es.nav.users, href: "/usuarios", icon: icon(Users), keywords: ["roles", "equipo", "personal"] },
    { label: es.nav.settings, href: "/configuracion", icon: icon(Settings), keywords: ["parámetros", "ajustes"] },
    { label: es.nav.audit, href: "/bitacora", icon: icon(ScrollText), keywords: ["auditoría", "registro"] },
  ];
  return [
    { items: [dashboardItem] },
    { label: es.nav.groupOperations, items: operations },
    { label: es.nav.groupPlatform, items: platform },
  ];
}

/** Todos los elementos del menú, en orden (para la paleta de comandos). */
export const navItems = (groups: NavGroup[]): Item[] => groups.flatMap((g) => g.items as Item[]);

export const permissionsIcon = icon(ClipboardList);
