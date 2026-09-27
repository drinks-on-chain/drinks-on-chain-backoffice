"use client";

import type { AuditEvent } from "@drinks-on-chain/mocks";
import { KeyValueList, SlideOver } from "@drinks-on-chain/ui";
import { SectionHeader } from "@/components/section-header";
import { fmtDateTime } from "@/lib/format";
import { auditDiff, formatAuditValue } from "@/lib/platform/derive";
import { auditActionLabel, clientAppLabel, resourceTypeLabel, roleLabel } from "@/lib/platform/labels";

const mono = (v: string | null) => (v ? <span className="font-mono text-xs break-all">{v}</span> : "—");

/** Detalle de un evento de la bitácora: quién, desde dónde, sobre qué, motivo y antes/después. */
export function AuditEventPanel({
  event,
  organizations,
  onClose,
}: {
  event: AuditEvent | null;
  organizations: Map<string, string>;
  onClose: () => void;
}) {
  const e = event;
  const rows = e ? auditDiff(e.before, e.after) : [];
  return (
    <SlideOver
      open={e !== null}
      onOpenChange={(open) => !open && onClose()}
      title={e ? auditActionLabel(e.action) : "Evento"}
      description={e ? `Evento nº ${e.seq} · ${fmtDateTime(e.occurredAt)}` : undefined}
      size="lg"
    >
      {e && (
        <div className="grid gap-6">
          <KeyValueList
            items={[
              {
                term: "Quién",
                value: e.actor.fullName ? (
                  <span>
                    {e.actor.fullName}
                    {e.actor.role ? ` · ${roleLabel(e.actor.role)}` : ""}
                    {e.actor.viaPlatform ? " · vía plataforma" : ""}
                  </span>
                ) : (
                  "Sistema"
                ),
              },
              {
                term: "Organización afectada",
                value: e.organizationId ? (organizations.get(e.organizationId) ?? mono(e.organizationId)) : "—",
              },
              {
                term: "Desde",
                value: `${clientAppLabel(e.source.app)}${e.source.ip ? ` · IP ${e.source.ip}` : ""}${e.source.deviceId ? ` · dispositivo ${e.source.deviceId}` : ""}`,
              },
              {
                term: "Recurso",
                value: (
                  <span className="grid">
                    <span>{resourceTypeLabel(e.resource.type)}</span>
                    {mono(e.resource.id)}
                  </span>
                ),
              },
              { term: "Código", value: mono(e.action) },
              {
                term: "Motivo",
                value: e.reason ? `«${e.reason}»` : <span className="text-fg-subtle">Sin motivo</span>,
              },
              { term: "Correlación", value: mono(e.correlationId) },
            ]}
          />

          <section aria-labelledby="cambios" className="grid gap-3">
            <SectionHeader
              id="cambios"
              level={3}
              title="Cambios"
              description="Antes y después (sin datos sensibles)."
            />
            {rows.length === 0 ? (
              <p className="text-fg-muted">El evento no guarda cambios de valores.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Antes y después del evento nº {e.seq}</caption>
                  <thead className="bg-bg-sunken text-2xs tracking-label text-fg-subtle uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Campo
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Antes
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Después
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.key} className={r.changed ? undefined : "text-fg-muted"}>
                        <th scope="row" className="px-3 py-2 font-mono text-xs font-normal">
                          {r.key}
                        </th>
                        <td className="px-3 py-2 break-words">
                          {r.changed && r.before !== undefined ? (
                            <del className="text-danger-text decoration-1">{formatAuditValue(r.before)}</del>
                          ) : (
                            formatAuditValue(r.before)
                          )}
                        </td>
                        <td className="px-3 py-2 break-words">
                          {r.changed && r.after !== undefined ? (
                            <ins className="font-medium text-success-text no-underline">
                              {formatAuditValue(r.after)}
                            </ins>
                          ) : (
                            formatAuditValue(r.after)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="cadena" className="grid gap-3">
            <SectionHeader
              id="cadena"
              level={3}
              title="Cadena"
              description="Cada evento guarda el hash del anterior: si alguien lo cambiara, la verificación lo detecta."
            />
            <KeyValueList
              layout="stacked"
              items={[
                { term: "Hash", value: mono(e.hash) },
                { term: "Hash anterior", value: mono(e.prevHash) },
              ]}
            />
          </section>
        </div>
      )}
    </SlideOver>
  );
}
