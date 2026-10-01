"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Inbox, Search } from "lucide-react";
import type { MeResponse } from "@/lib/auth/schemas";
import { getStatusBadge, matchesQuery, type CommandPaletteGroup, type CommandPaletteItem } from "@drinks-on-chain/ui";
import { useApplications } from "@/lib/platform/applications";
import { can } from "@/lib/platform/permissions";
import { useWineries } from "@/lib/platform/wineries";

const MIN_QUERY = 2;
const SEARCH = "search:";

/**
 * Búsqueda en el servidor desde la paleta de comandos (⌘K): al escribir, solicitudes y bodegas que
 * coinciden ("Ir a solicitud…", "Ir a bodega…"). Los resultados no se filtran otra vez en el
 * cliente (ya coinciden por nombre, NIT, contacto o región).
 */
export function usePaletteSearch(me: MeResponse) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const active = debounced.length >= MIN_QUERY;
  const applications = useApplications({ q: debounced, limit: 5 }, active && can(me, "applications.read"));
  const wineries = useWineries({ q: debounced, limit: 5 }, active && can(me, "wineries.read"));

  const groups: CommandPaletteGroup[] = [];
  const text = query.trim();
  if (text.length >= MIN_QUERY && active) {
    const icon = (I: typeof Inbox) => <I aria-hidden="true" className="size-4" />;
    const apps: CommandPaletteItem[] = (applications.data?.items ?? []).map((a) => ({
      id: `${SEARCH}application:${a.id}`,
      label: a.tradeName,
      description: `${getStatusBadge("application", a.status).label} · NIT ${a.taxId} · ${a.contactName}`,
      icon: icon(Inbox),
      onSelect: () => router.push(`/solicitudes/${a.id}`),
    }));
    groups.push({
      id: "search-applications",
      heading: "Ir a solicitud…",
      items: [
        ...apps,
        {
          id: `${SEARCH}applications`,
          label: `Buscar «${text}» en la bandeja de solicitudes`,
          icon: icon(Search),
          onSelect: () => router.push(`/solicitudes?q=${encodeURIComponent(text)}`),
        },
      ],
    });
    const found: CommandPaletteItem[] = (wineries.data?.items ?? []).map((w) => ({
      id: `${SEARCH}winery:${w.id}`,
      label: w.tradeName,
      description: `${getStatusBadge("winery", w.status).label} · NIT ${w.taxId} · ${w.region}`,
      icon: icon(Building2),
      onSelect: () => router.push(`/bodegas/${w.id}`),
    }));
    if (found.length) groups.push({ id: "search-wineries", heading: "Ir a bodega…", items: found });
  }

  return {
    groups,
    onQueryChange: setQuery,
    loading: text.length >= MIN_QUERY && (!active || applications.isFetching || wineries.isFetching),
    filter: (item: CommandPaletteItem, q: string) =>
      item.id.startsWith(SEARCH) || matchesQuery(q, item.label, ...(item.keywords ?? [])),
  };
}
