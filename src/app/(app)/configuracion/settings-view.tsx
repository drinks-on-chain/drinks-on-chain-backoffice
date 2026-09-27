"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SettingDefinition } from "@drinks-on-chain/mocks";
import { Badge, Card, DataTable, ErrorState, SkeletonText, TextLink } from "@drinks-on-chain/ui";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtNumber } from "@/lib/format";
import { can } from "@/lib/platform/permissions";
import {
  APPLIES_AT_LABELS,
  LEVEL_LABELS,
  formatSettingValue,
  groupSettings,
  legalMinimumLabel,
} from "@/lib/platform/setting-value";
import { useSettings } from "@/lib/platform/settings";

export const settingHref = (key: string) => `/configuracion/${encodeURIComponent(key)}`;

/** 4B · Configuración en dos niveles (contrato de la Ola 1 §6): parámetros agrupados por prefijo. */
export function SettingsView() {
  const me = useMe();
  const router = useRouter();
  const settings = useSettings();
  const canWrite = can(me.data, "settings.write");

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Plataforma"
        title="Configuración"
        description="Estándar general de cada parámetro y ajustes por bodega. Las reglas de trazabilidad se fijan en el lote al crearlo; las operativas se aplican de inmediato."
      />
      {!canWrite && me.data && (
        <p className="text-fg-muted" role="note">
          Consulta en modo lectura: solo administración cambia la configuración.
        </p>
      )}

      {settings.isPending ? (
        <Card className="p-5" aria-busy="true">
          <SkeletonText lines={10} />
        </Card>
      ) : settings.isError ? (
        <Card className="p-6">
          <ErrorState
            bare
            title="No se pudo cargar la configuración"
            description={errorMessage(settings.error)}
            onRetry={() => void settings.refetch()}
          />
        </Card>
      ) : (
        groupSettings(settings.data).map((group) => (
          <Card key={group.prefix} className="grid gap-3 p-5">
            <SectionHeader
              id={`grupo-${group.prefix}`}
              title={group.label}
              description={`${group.items.length} ${group.items.length === 1 ? "parámetro" : "parámetros"} · ${group.prefix}.*`}
            />
            <DataTable<SettingDefinition>
              caption={`Parámetros de ${group.label}`}
              captionHidden
              density="compact"
              data={group.items}
              getRowId={(s) => s.key}
              onRowClick={(s) => router.push(settingHref(s.key))}
              columns={[
                {
                  id: "setting",
                  header: "Parámetro",
                  accessor: "description",
                  cell: (s) => (
                    <div className="grid max-w-md">
                      <TextLink asChild variant="inline" className="font-medium">
                        <Link href={settingHref(s.key)} onClick={(e) => e.stopPropagation()}>
                          {s.description}
                        </Link>
                      </TextLink>
                      <span className="font-mono text-2xs text-fg-subtle">{s.key}</span>
                    </div>
                  ),
                },
                {
                  id: "value",
                  header: "Valor general",
                  accessor: (s) => formatSettingValue(s, s.globalValue),
                  cell: (s) => (
                    <span className="block max-w-60 truncate" title={formatSettingValue(s, s.globalValue)}>
                      {s.levels === "WINERY" ? (
                        <span className="text-fg-subtle">Por bodega · {formatSettingValue(s, s.default)}</span>
                      ) : (
                        formatSettingValue(s, s.globalValue)
                      )}
                    </span>
                  ),
                },
                {
                  id: "levels",
                  header: "Nivel",
                  accessor: (s) => LEVEL_LABELS[s.levels],
                  hideBelow: "lg",
                },
                {
                  id: "appliesAt",
                  header: "Cuándo aplica",
                  accessor: (s) => APPLIES_AT_LABELS[s.appliesAt],
                  hideBelow: "xl",
                },
                {
                  id: "legal",
                  header: "Mínimo legal",
                  accessor: (s) => legalMinimumLabel(s) ?? "",
                  hideBelow: "lg",
                  cell: (s) => legalMinimumLabel(s) ?? <span className="text-fg-subtle">—</span>,
                },
                {
                  id: "overrides",
                  header: "Ajustes",
                  accessor: "overridesCount",
                  numeric: true,
                  cell: (s) =>
                    s.overridesCount > 0 ? (
                      <Badge tone="info">{fmtNumber(s.overridesCount)}</Badge>
                    ) : (
                      <span className="text-fg-subtle">0</span>
                    ),
                },
              ]}
            />
          </Card>
        ))
      )}
    </div>
  );
}
