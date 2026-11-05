"use client";

import Link from "next/link";
import type { ChainAlert } from "@drinks-on-chain/mocks";
import { StatusBadge, TextLink } from "@drinks-on-chain/ui";
import { JsonBlock } from "@/components/chain/json-block";
import { fmtDateTime } from "@/lib/format";
import { alertCodeLabel, subjectTypeLabel } from "@/lib/platform/chain-labels";
import { subjectHref } from "@/lib/platform/chain-utils";

/** Valor esperado o real de una alerta (lo que dice la base frente a lo que dice la red). */
export function AlertValue({ value, label }: { value: unknown; label: string }) {
  if (value === null || value === undefined) return <span className="text-fg-subtle">—</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="font-mono text-xs break-all">{String(value)}</span>;
  }
  return <JsonBlock value={value} label={label} />;
}

/** Enlace a la pantalla del sujeto de una alerta (bodega, colección, transacción, cuentas). */
export function AlertSubject({ alert }: { alert: ChainAlert }) {
  const href = subjectHref(alert.subject, alert.wineryId);
  const label = subjectTypeLabel(alert.subject.type);
  return href ? (
    <TextLink asChild variant="inline">
      <Link href={href} onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>
    </TextLink>
  ) : (
    <span>{label}</span>
  );
}

/** Alertas de una conciliación, en lista (panel lateral). */
export function AlertList({ alerts, label }: { alerts: ChainAlert[]; label: string }) {
  if (alerts.length === 0) return <p className="text-fg-muted">Esta conciliación no abrió ninguna alerta.</p>;
  return (
    <ul aria-label={label} className="grid divide-y divide-border">
      {alerts.map((a) => (
        <li key={a.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
          <p className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="alert" status={a.level} />
            <span className="font-medium">{alertCodeLabel(a.code)}</span>
            <span className="text-xs text-fg-muted">{a.resolvedAt ? "Resuelta" : "Abierta"}</span>
          </p>
          <p>{a.message}</p>
          <p className="text-xs text-fg-muted">
            <AlertSubject alert={a} /> · <time dateTime={a.detectedAt}>{fmtDateTime(a.detectedAt)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
