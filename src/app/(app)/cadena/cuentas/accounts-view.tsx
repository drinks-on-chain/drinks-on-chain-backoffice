"use client";

import type { PlatformAccountStatus } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Card,
  ChainAddress,
  ErrorState,
  ExplorerLink,
  KeyValueList,
  SkeletonText,
} from "@drinks-on-chain/ui";
import { SectionHeader } from "@/components/section-header";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/auth/hooks";
import { fmtDateTime, fmtNumber, fmtXlm } from "@/lib/format";
import { useChainAccounts } from "@/lib/platform/chain";
import { accountBalanceStatus, networkLabel } from "@/lib/platform/chain-labels";
import { balanceWarnings, codeTtlLow } from "@/lib/platform/chain-utils";

const ACCOUNTS = {
  operations: {
    title: "Cuenta de operaciones",
    description: "Paga todas las comisiones y la renta, crea las cuentas de las bodegas y despliega sus contratos.",
  },
  anchor: {
    title: "Cuenta de anclaje",
    description: "Publica la huella de cada expediente certificado. Es la cuenta oficial que comprueba el visor.",
  },
} as const;

const WARNING: Record<"LOW" | "MISSING", (name: string) => string> = {
  LOW: (name) =>
    `${name}: el saldo está por debajo del mínimo. Recárgala antes de que las transacciones empiecen a fallar por saldo insuficiente.`,
  MISSING: (name) => `${name}: no está configurada en este entorno. Sin ella no se puede enviar nada a la red.`,
};

/** Cadena · Cuentas de la plataforma y saldos (§2.4), con aviso de saldo bajo. */
export function AccountsView() {
  const me = useMe();
  const accounts = useChainAccounts(Boolean(me.data));
  const a = accounts.data;

  if (accounts.isPending) return <SkeletonText lines={8} />;
  if (accounts.isError || !a) {
    return (
      <ErrorState
        title="No se pudieron cargar las cuentas"
        description={errorMessage(accounts.error)}
        onRetry={() => void accounts.refetch()}
      />
    );
  }
  const warnings = balanceWarnings(a);

  return (
    <section aria-labelledby="cuentas" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="cuentas" className="m-0 font-ui text-md font-semibold text-fg">
          Cuentas de la plataforma · {networkLabel(a.network)}
        </h2>
        <p className="max-w-2xl text-fg-muted">
          Las claves viven en el custodio: aquí solo se ven las direcciones públicas y sus saldos. Las bodegas nunca
          pagan comisiones.
        </p>
      </div>

      {warnings.length > 0 && (
        <Alert tone={warnings.some((w) => w.status === "MISSING") ? "danger" : "warning"} title="Revisa los saldos">
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w.account}>{WARNING[w.status](ACCOUNTS[w.account].title)}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard kind="operations" account={a.operations} />
        <AccountCard kind="anchor" account={a.anchor} />
      </div>

      <Card className="grid gap-4 p-5">
        <SectionHeader
          title="Código del contrato NFT"
          description="El mismo código para el contrato de cada bodega. Su vida en la red se extiende sola cada día."
        />
        <KeyValueList
          items={[
            {
              term: "Hash del código",
              value: a.wasmHash ? (
                <ChainAddress value={a.wasmHash} label="Hash del código del contrato" size="sm" />
              ) : (
                <span className="text-fg-subtle">Sin configurar</span>
              ),
            },
            {
              term: "Vida restante",
              value:
                a.codeTtlDays === null ? (
                  <span className="text-fg-subtle">Sin leer de la red</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2 tabular-nums">
                    {fmtNumber(a.codeTtlDays)} días
                    {codeTtlLow(a.codeTtlDays) && <Badge tone="warning">Por caducar</Badge>}
                  </span>
                ),
            },
          ]}
        />
      </Card>
    </section>
  );
}

function AccountCard({ kind, account }: { kind: keyof typeof ACCOUNTS; account: PlatformAccountStatus }) {
  const copy = ACCOUNTS[kind];
  const status = accountBalanceStatus(account.status);
  return (
    <Card className="grid content-start gap-4 p-5">
      <SectionHeader
        title={copy.title}
        description={copy.description}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <p className="font-display text-4xl leading-none tabular-nums">{fmtXlm(account.balanceXlm)}</p>
      <KeyValueList
        items={[
          { term: "Saldo mínimo", value: <span className="tabular-nums">{fmtXlm(account.minBalanceXlm)}</span> },
          {
            term: "Dirección",
            value: account.address ? (
              <span className="grid gap-1">
                <ChainAddress value={account.address} label={copy.title} size="sm" />
                <ExplorerLink href={account.explorerUrl} className="text-xs">
                  Ver en el explorador<span className="sr-only">: {copy.title.toLowerCase()}</span>
                </ExplorerLink>
              </span>
            ) : (
              <span className="text-fg-subtle">Sin configurar</span>
            ),
          },
          {
            term: "Última lectura",
            value: account.checkedAt ? (
              <time dateTime={account.checkedAt}>{fmtDateTime(account.checkedAt)}</time>
            ) : (
              <span className="text-fg-subtle">Sin leer de la red</span>
            ),
          },
        ]}
      />
    </Card>
  );
}
