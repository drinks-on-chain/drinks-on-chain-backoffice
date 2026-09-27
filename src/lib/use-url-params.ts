"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Parámetro de la página en la URL (1, 2, 3…): las listas guardan filtros y página en la URL. */
export const PAGE_PARAM = "pagina";

export type ParamUpdates = Record<string, string | null | undefined>;

/**
 * Filtros persistentes en la URL (03-backoffice «Reglas»): leer y cambiar parámetros con
 * `router.replace` (sin entrada nueva en el historial ni salto de scroll). Cambiar un filtro
 * vuelve a la primera página.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (updates: ParamUpdates, { keepPage = false }: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!keepPage && !(PAGE_PARAM in updates)) next.delete(PAGE_PARAM);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Quita todos los parámetros salvo los indicados. */
  const clear = useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = params.get(key);
        if (value) next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { params, get: (key: string) => params.get(key), set, clear };
}

/** Página actual (1 por defecto) y su `offset` para un `limit` dado. */
export function pageFrom(params: URLSearchParams, limit: number) {
  const n = Number(params.get(PAGE_PARAM));
  const page = Number.isInteger(n) && n > 1 ? n : 1;
  return { page, offset: (page - 1) * limit };
}

/** Valor de una lista cerrada (o `undefined` si la URL trae otra cosa). */
export function oneOf<T extends string>(values: readonly T[], raw: string | null): T | undefined {
  return values.find((v) => v === raw);
}
