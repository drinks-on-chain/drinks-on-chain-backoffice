"use client";

import { Combobox, Field } from "@drinks-on-chain/ui";
import { useAllWineries } from "@/lib/platform/wineries";

/**
 * Filtro «Bodega» de las listas de la Ola 3: escribe el id de la bodega en la URL. Devuelve también
 * el nombre para el chip del filtro activo (`wineryName`).
 */
export function WineryFilter({
  value,
  onChange,
  className = "w-64",
}: {
  value: string | undefined;
  onChange: (wineryId: string | undefined) => void;
  className?: string;
}) {
  const wineries = useAllWineries();
  const options = (wineries.data ?? []).map((w) => ({
    value: w.id,
    label: w.tradeName,
    keywords: [w.legalName, w.taxId, w.lotPrefix ?? ""],
  }));
  return (
    <Field label="Bodega" className={className}>
      <Combobox
        size="sm"
        clearable
        placeholder="Todas"
        value={value ?? null}
        options={options}
        loading={wineries.isPending}
        onValueChange={(v) => onChange(v ?? undefined)}
        labels={{ empty: "Ninguna bodega coincide", clear: "Quitar la bodega", toggle: "Desplegar las bodegas" }}
      />
    </Field>
  );
}

/** Nombre de una bodega por su id, para el chip del filtro (`undefined` mientras carga). */
export function useWineryName(wineryId: string | undefined): string | undefined {
  const wineries = useAllWineries(Boolean(wineryId));
  return wineryId ? wineries.data?.find((w) => w.id === wineryId)?.tradeName : undefined;
}
