"use client";

import { useState, type FormEvent } from "react";
import type { Collection, LotClosure, LotClosureItem, UnsoldPolicy } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  Modal,
  ModalClose,
  RadioGroup,
  Select,
  SkeletonText,
  StatCard,
  Textarea,
  toast,
} from "@drinks-on-chain/ui";
import { TxStatus } from "@/components/chain/tx-ref";
import { RuleErrorAlert } from "@/components/rule-error-alert";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber, shortHash } from "@/lib/format";
import { closureOutcome, closureStatus, tokenStatus, unsoldPolicyLabel } from "@/lib/platform/chain-labels";
import { useClosure, useDecideClosure, useResolveClosureItem } from "@/lib/platform/collections";
import {
  closureBlockedReason,
  closureItemResolvable,
  closureNeedsDecision,
  closurePolicies,
  shortfallSummary,
} from "@/lib/platform/collections-utils";
import { reasonProblem } from "@/lib/platform/forms";
import { lotStageLabel } from "@/lib/platform/labels";
import { can } from "@/lib/platform/permissions";
import { explainRuleError } from "@/lib/platform/rule-errors";

const POLICY_HELP: Record<UnsoldPolicy, string> = {
  KEEP_ON_SALE: "Los NFT sin vender que sí tienen botella siguen a la venta.",
  BURN: "Los NFT sin vender que sí tienen botella también se queman: la colección deja de tener disponibles.",
};

/**
 * Cierre del lote con faltante (§8.4): al embotellar, si hay menos botellas que NFT, los no vendidos
 * sin botella se queman (decisión de administración) y los vendidos sin botella se resuelven a mano
 * (devolución o sustitución). Sin faltante, se decide qué pasa con los no vendidos.
 */
export function ClosurePanel({ collection: c }: { collection: Collection }) {
  const me = useMe();
  const closure = useClosure(c.id);
  const perms = { manage: can(me.data, "tokenization.manage"), admin: can(me.data, "chain.admin") };
  const [deciding, setDeciding] = useState(false);
  const [resolving, setResolving] = useState<LotClosureItem | null>(null);
  const k = closure.data;

  if (closure.isPending) return <SkeletonText lines={6} />;
  if (closure.isError) {
    return (
      <ErrorState
        title="No se pudo cargar el cierre"
        description={errorMessage(closure.error)}
        onRetry={() => void closure.refetch()}
      />
    );
  }
  if (!k) {
    return (
      <EmptyState
        title="Todavía no hay cierre"
        description={`El cierre se calcula cuando el lote se embotella o se descarta; ahora está en «${lotStageLabel(c.lot.stage)}». Mientras tanto, la colección puede seguir a la venta.`}
      />
    );
  }

  const status = closureStatus(k.status);
  const policies = closurePolicies(k, perms);
  const blocked = closureBlockedReason(k, perms);
  const burning = k.items.filter((i) => i.outcome === "BURN_UNSOLD");

  return (
    <section aria-labelledby="cierre" className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="cierre" className="m-0 flex flex-wrap items-center gap-2 font-ui text-md font-semibold text-fg">
            Cierre del lote <Badge tone={status.tone}>{status.label}</Badge>
          </h2>
          <p className="max-w-2xl text-fg-muted">
            {shortfallSummary(k)} Calculado el <time dateTime={k.computedAt}>{fmtDateTime(k.computedAt)}</time>.
          </p>
        </div>
        {policies.length > 0 && (
          <Button variant={k.shortfall > 0 ? "destructive" : "primary"} onClick={() => setDeciding(true)}>
            {k.shortfall > 0 ? "Decidir el cierre y quemar" : k.decision ? "Cambiar la decisión" : "Decidir el cierre"}
          </Button>
        )}
      </div>

      {closureNeedsDecision(k) && blocked && <Alert tone="info">{blocked}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cifras del cierre">
        <StatCard label="Botellas con código" value={fmtNumber(k.bottles)} />
        <StatCard
          label="NFT emitidos"
          value={fmtNumber(k.minted)}
          delta={`${fmtNumber(k.sold)} vendidos · ${fmtNumber(k.reserved)} reservados`}
        />
        <StatCard
          label="Faltante"
          value={fmtNumber(k.shortfall)}
          tone={k.shortfall > 0 ? "danger" : "success"}
          delta={k.shortfall > 0 ? "NFT sin botella" : "Hay botella para cada NFT"}
        />
        <StatCard
          label="Sin vender"
          value={fmtNumber(k.unsold)}
          delta={`${fmtNumber(k.unsoldToBurn)} a quemar · ${fmtNumber(k.soldWithoutBottle)} vendidos sin botella`}
        />
      </div>

      {k.decision && (
        <Card className="grid gap-3 p-5">
          <SectionHeader title="Decisión" level={3} />
          <KeyValueList
            items={[
              { term: "No vendidos con botella", value: unsoldPolicyLabel(k.unsoldPolicy) },
              { term: "Por", value: k.decision.by.fullName },
              { term: "Cuándo", value: <time dateTime={k.decision.at}>{fmtDateTime(k.decision.at)}</time> },
              { term: "Motivo", value: k.decision.reason },
            ]}
          />
        </Card>
      )}

      {k.items.length > 0 && (
        <Card className="grid gap-3 p-5">
          <SectionHeader
            title="NFT afectados"
            level={3}
            description={
              burning.length > 0
                ? "Las quemas se envían a la red tras la decisión; los vendidos sin botella se resuelven uno a uno."
                : "Se queman primero los no vendidos con el número de botella más alto."
            }
          />
          <DataTable
            caption="NFT afectados por el cierre"
            captionHidden
            density="compact"
            data={k.items}
            getRowId={(i) => String(i.tokenId)}
            rowActions={(i) =>
              perms.manage && closureItemResolvable(i) ? (
                <Button size="sm" variant="secondary" onClick={() => setResolving(i)}>
                  Resolver<span className="sr-only"> la botella {i.bottleNumber}</span>
                </Button>
              ) : null
            }
            columns={[
              {
                id: "bottle",
                header: "Botella n.º",
                accessor: "bottleNumber",
                numeric: true,
                cell: (i) => fmtNumber(i.bottleNumber),
              },
              {
                id: "tokenId",
                header: "Id en la red",
                accessor: "tokenId",
                numeric: true,
                cell: (i) => <span className="font-mono text-xs">{i.tokenId}</span>,
              },
              {
                id: "status",
                header: "Estado del NFT",
                accessor: "status",
                cell: (i) => <Badge tone={tokenStatus(i.status).tone}>{tokenStatus(i.status).label}</Badge>,
              },
              {
                id: "outcome",
                header: "Resolución",
                accessor: "outcome",
                cell: (i) => (
                  <span className="grid justify-items-start gap-0.5">
                    <Badge tone={closureOutcome(i.outcome).tone}>{closureOutcome(i.outcome).label}</Badge>
                    {i.note && <span className="text-xs text-fg-muted">{i.note}</span>}
                  </span>
                ),
              },
              {
                id: "order",
                header: "Pedido",
                accessor: (i) => i.paidAt ?? "",
                hideBelow: "lg",
                cell: (i) =>
                  i.orderId ? (
                    <span className="grid">
                      <span className="font-mono text-xs">{shortHash(i.orderId, 8, 0)}</span>
                      {i.paidAt && (
                        <time dateTime={i.paidAt} className="text-xs text-fg-muted">
                          Pagado el {fmtDateTime(i.paidAt)}
                        </time>
                      )}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">Sin vender</span>
                  ),
              },
              {
                id: "burn",
                header: "Quema en la red",
                accessor: (i) => i.burnTx?.status ?? "",
                cell: (i) =>
                  i.burnTx ? <TxStatus tx={i.burnTx} announce={false} /> : <span className="text-fg-subtle">—</span>,
              },
            ]}
          />
        </Card>
      )}

      {deciding && <DecideDialog collection={c} closure={k} policies={policies} onClose={() => setDeciding(false)} />}
      {resolving && <ResolveItemDialog collection={c} item={resolving} onClose={() => setResolving(null)} />}
    </section>
  );
}

/**
 * Decisión del cierre. Con faltante es irreversible (encola quemas en la red): se pide el motivo y
 * escribir la cifra de NFT a quemar para confirmar.
 */
function DecideDialog({
  collection: c,
  closure: k,
  policies,
  onClose,
}: {
  collection: Collection;
  closure: LotClosure;
  policies: UnsoldPolicy[];
  onClose: () => void;
}) {
  const decide = useDecideClosure(c.id);
  const [policy, setPolicy] = useState<UnsoldPolicy>(policies[0]!);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const withBottle = Math.max(0, k.unsold - k.unsoldToBurn);
  const burns = k.unsoldToBurn + (policy === "BURN" ? withBottle : 0);
  const serious = burns > 0;
  const confirmation = String(burns);
  const error = decide.error ? explainRuleError(decide.error, ["reason", "unsoldPolicy"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid = reasonProblem(reason);
    setProblem(invalid);
    if (invalid || (serious && typed.trim() !== confirmation)) return;
    decide.mutate(
      { unsoldPolicy: policy, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({
            title: serious ? "Cierre decidido: las quemas van camino de la red." : "Cierre decidido.",
            tone: "success",
          });
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title="Decidir el cierre del lote"
      description={`«${c.name}» · ${shortfallSummary(k)}`}
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </ModalClose>
          <Button
            type="submit"
            form="decidir-cierre"
            variant={serious ? "destructive" : "primary"}
            disabled={serious && typed.trim() !== confirmation}
            loading={decide.isPending}
          >
            {serious ? `Decidir y quemar ${fmtNumber(burns)} NFT` : "Decidir el cierre"}
          </Button>
        </>
      }
    >
      <form id="decidir-cierre" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && !error.fieldErrors.reason && <RuleErrorAlert error={error} />}
        {serious && (
          <Alert tone="danger" title="Las quemas no se pueden deshacer">
            Se quemarán {fmtNumber(burns)} NFT sin vender en la red. Los NFT vendidos no se tocan: los que queden sin
            botella se resuelven después, uno a uno.
          </Alert>
        )}
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">
            Qué hacer con los {fmtNumber(withBottle)} NFT sin vender que sí tienen botella
          </legend>
          <RadioGroup
            value={policy}
            onValueChange={(v) => {
              setPolicy(v as UnsoldPolicy);
              setTyped("");
            }}
            aria-label="Política de los NFT sin vender"
            options={policies.map((p) => ({ value: p, label: unsoldPolicyLabel(p), description: POLICY_HELP[p] }))}
          />
        </fieldset>
        <Field
          label="Motivo"
          required
          error={problem ?? error?.fieldErrors.reason}
          help="Queda en la bitácora. Entre 3 y 500 caracteres."
        >
          <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {serious && (
          <Field label={`Escribe ${confirmation} (los NFT que se queman) para confirmar`} required>
            <Input
              numeric
              inputMode="numeric"
              autoComplete="off"
              wrapperClassName="w-40"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
        )}
      </form>
    </Modal>
  );
}

/** Resolver un NFT vendido sin botella: devolución o sustitución, con la nota de lo que se hizo. */
function ResolveItemDialog({
  collection: c,
  item,
  onClose,
}: {
  collection: Collection;
  item: LotClosureItem;
  onClose: () => void;
}) {
  const resolve = useResolveClosureItem(c.id);
  const [outcome, setOutcome] = useState<"MANUAL_REFUND" | "MANUAL_SUBSTITUTE">("MANUAL_REFUND");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const error = resolve.error ? explainRuleError(resolve.error, ["note", "outcome"]) : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const length = note.trim().length;
    const invalid =
      length < 3
        ? "Explica qué se hizo (mínimo 3 caracteres)."
        : length > 1000
          ? "Como máximo 1.000 caracteres."
          : undefined;
    setProblem(invalid);
    if (invalid) return;
    resolve.mutate(
      { tokenId: item.tokenId, body: { outcome, note: note.trim() } },
      {
        onSuccess: () => {
          toast({ title: `Botella ${item.bottleNumber} resuelta.`, tone: "success" });
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="sm"
      title={`Resolver la botella ${item.bottleNumber}`}
      description="NFT vendido sin botella: se resuelve a mano con el comprador. El NFT sigue vivo hasta entonces."
      footer={
        <>
          <ModalClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </ModalClose>
          <Button type="submit" form="resolver-item" loading={resolve.isPending}>
            Registrar la resolución
          </Button>
        </>
      }
    >
      <form id="resolver-item" onSubmit={onSubmit} className="grid gap-4" noValidate>
        {error && !error.fieldErrors.note && <RuleErrorAlert error={error} />}
        <Field label="Resolución" required>
          <Select
            value={outcome}
            onValueChange={(v) => setOutcome(v as typeof outcome)}
            options={[
              { value: "MANUAL_REFUND", label: "Devolución del importe" },
              { value: "MANUAL_SUBSTITUTE", label: "Sustitución por otra botella" },
            ]}
          />
        </Field>
        <Field label="Nota" required error={problem ?? error?.fieldErrors.note} help="Qué se acordó con el comprador.">
          <Textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
