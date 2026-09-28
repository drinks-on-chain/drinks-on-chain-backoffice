"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  SCENARIOS,
  expireAccessTokens,
  getScenario,
  mockMailbox,
  resetErpDb,
  setScenario,
  type ScenarioName,
} from "@drinks-on-chain/mocks/browser";
import {
  DEMO_PASSWORD,
  DEMO_TOTP_SECRET,
  demoUsers,
  generateTotp,
  type DemoUser,
} from "@drinks-on-chain/mocks/fixtures";
import type { MockEmail } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Field,
  Input,
  Select,
  TextLink,
  toast,
} from "@drinks-on-chain/ui";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/api/errors";
import { login, verifyMfa } from "@/lib/auth/api";
import { useStartSession } from "@/lib/auth/hooks";
import { fmtDateTime } from "@/lib/format";
import { es } from "@/lib/i18n/es";
import { roleLabel } from "@/lib/platform/labels";

const SCENARIO_LABELS: Record<ScenarioName, string> = {
  normal: "Normal",
  empty: "Listas vacías",
  error: "Error del servidor (500)",
  slow: "Lento (+2,5 s)",
  offline: "Sin conexión",
};

export function MocksPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const startSession = useStartSession();
  const [scenario, setScenarioState] = useState<ScenarioName>(() => getScenario());
  const [entering, setEntering] = useState<string | null>(null);
  const staff = demoUsers.filter((u) => u.platformRole);
  const others = demoUsers.filter((u) => !u.platformRole);

  function changeScenario(value: string) {
    const next = value as ScenarioName;
    setScenario(next);
    setScenarioState(next);
    void queryClient.invalidateQueries();
  }

  /** Entra como una persona de demo; el personal inscrito pasa el TOTP con el secreto de demo. */
  async function enterAs(user: DemoUser) {
    setEntering(user.email);
    try {
      const res = await login({ email: user.email, password: DEMO_PASSWORD });
      if ("mfa" in res) {
        if (!res.mfa.enrolled || !user.mfa?.secret) {
          toast({
            title: "Esta persona aún no inscribió el TOTP: entra desde el login para inscribirlo.",
            tone: "info",
          });
          router.push("/login");
          return;
        }
        startSession(await verifyMfa({ mfaToken: res.mfa.mfaToken, code: generateTotp(user.mfa.secret) }));
      } else {
        startSession(res);
      }
      router.push("/");
    } catch (e) {
      toast({ title: errorMessage(e), tone: "danger" });
    } finally {
      setEntering(null);
    }
  }

  const enterColumn = {
    id: "enter",
    header: <span className="sr-only">Acción</span>,
    align: "right" as const,
    cell: (u: DemoUser) => (
      <Button size="sm" variant="secondary" onClick={() => void enterAs(u)} loading={entering === u.email}>
        Entrar<span className="sr-only"> como {u.fullName}</span>
      </Button>
    ),
  };

  return (
    <main className="mx-auto grid max-w-(--doc-content-max) gap-6 p-6 text-sm">
      <header className="grid gap-1">
        <p className="text-2xs tracking-label text-fg-subtle uppercase">Solo desarrollo</p>
        <h1 className="font-display text-3xl">{es.mocks.title}</h1>
      </header>

      {!env.mocks && (
        <Alert tone="warning">
          MSW está apagado. Arranca con <code>NEXT_PUBLIC_MOCKS=1</code> (<code>pnpm dev:mocks</code>) para usar este
          panel.
        </Alert>
      )}

      <Card className="grid gap-4 p-6">
        <CardHeader title={es.mocks.scenario} />
        <div className="flex flex-wrap items-end gap-4">
          <Field label={es.mocks.scenario} hideLabel className="w-72">
            <Select
              value={scenario}
              onValueChange={changeScenario}
              options={SCENARIOS.map((s) => ({ value: s, label: SCENARIO_LABELS[s] }))}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              resetErpDb();
              void queryClient.invalidateQueries();
              toast({ title: es.mocks.resetDone, tone: "success" });
            }}
          >
            {es.mocks.reset}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              expireAccessTokens();
              toast({ title: es.mocks.expireDone, tone: "info" });
            }}
          >
            {es.mocks.expire}
          </Button>
        </div>
      </Card>

      <Card className="grid gap-4 p-6">
        <CardHeader
          title={es.mocks.staff}
          description={`Contraseña de todos: ${DEMO_PASSWORD}. Secreto TOTP de demo: ${DEMO_TOTP_SECRET}.`}
          action={<TotpNow />}
        />
        <DataTable
          density="compact"
          caption={es.mocks.staff}
          captionHidden
          getRowId={(u) => u.key}
          data={staff}
          columns={[
            { id: "name", header: "Nombre", cell: (u) => u.fullName },
            { id: "email", header: "Correo", cell: (u) => u.email },
            { id: "role", header: "Rol", cell: (u) => <Badge>{roleLabel(u.platformRole)}</Badge> },
            {
              id: "mfa",
              header: "TOTP",
              cell: (u) =>
                u.mfa?.enrolled ? <Badge tone="success">Inscrito</Badge> : <Badge tone="warning">Sin inscribir</Badge>,
            },
            enterColumn,
          ]}
        />
      </Card>

      <Mailbox />

      <Card className="grid gap-4 p-6">
        <CardHeader
          title={es.mocks.others}
          description="Sin membresía de plataforma: el back office les niega el acceso (y ofrece el ERP)."
        />
        <DataTable
          density="compact"
          caption={es.mocks.others}
          captionHidden
          getRowId={(u) => u.key}
          data={others}
          columns={[
            { id: "name", header: "Nombre", cell: (u) => u.fullName },
            { id: "email", header: "Correo", cell: (u) => u.email },
            { id: "role", header: "Rol", cell: (u) => <Badge>{roleLabel(u.role)}</Badge> },
            { id: "winery", header: "Bodega activa", cell: (u) => u.wineryName ?? "—" },
            enterColumn,
          ]}
        />
      </Card>
    </main>
  );
}

/** Código TOTP actual del secreto de demo (cambia cada 30 s). */
function TotpNow() {
  const [code, setCode] = useState(() => generateTotp(DEMO_TOTP_SECRET));
  useEffect(() => {
    const id = window.setInterval(() => setCode(generateTotp(DEMO_TOTP_SECRET)), 2_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="text-right text-xs text-fg-muted">
      {es.mocks.totp}
      <br />
      <span className="font-mono text-lg tracking-widest text-fg tabular-nums">{code}</span>
    </p>
  );
}

/** Ruta del back office si el enlace es de esta app; si no, `null` (se abre como enlace externo). */
function internalPath(email: MockEmail): string | null {
  if (!email.link || email.app !== "BACKOFFICE") return null;
  try {
    const url = new URL(email.link);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Buzón simulado de los mocks (como Mailpit): invitaciones, recuperaciones y avisos. */
function Mailbox() {
  const [to, setTo] = useState("");
  const [version, setVersion] = useState(0);
  const emails = useMemo(() => {
    void version;
    const filter = to.trim() ? { to: to.trim().toLowerCase() } : undefined;
    return [...mockMailbox.list(filter)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [to, version]);

  // El buzón cambia con cada escritura de los mocks: se relee cada pocos segundos.
  useEffect(() => {
    const id = window.setInterval(() => setVersion((v) => v + 1), 3_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card className="grid gap-4 p-6">
      <CardHeader
        title={es.mocks.mailbox}
        description={es.mocks.mailboxBody}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setVersion((v) => v + 1)}>
              {es.mocks.refresh}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => {
                mockMailbox.clear();
                setVersion((v) => v + 1);
              }}
            >
              {es.mocks.clear}
            </Button>
          </div>
        }
      />
      <Field label="Filtrar por destinatario" className="max-w-sm">
        <Input type="search" value={to} onChange={(e) => setTo(e.target.value)} placeholder="correo@ejemplo.test" />
      </Field>
      <DataTable
        density="compact"
        caption={es.mocks.mailbox}
        captionHidden
        getRowId={(m) => m.id}
        data={emails}
        maxHeight="28rem"
        empty={<p className="p-4 text-fg-muted">{es.mocks.mailboxEmpty}</p>}
        columns={[
          {
            id: "date",
            header: "Fecha",
            cell: (m) => <time dateTime={m.createdAt}>{fmtDateTime(m.createdAt)}</time>,
          },
          { id: "to", header: "Para", cell: (m) => m.to },
          { id: "subject", header: "Asunto", cell: (m) => m.subject },
          { id: "template", header: "Tipo", cell: (m) => <Badge tone="neutral">{m.template}</Badge> },
          {
            id: "link",
            header: "Enlace",
            cell: (m) => {
              const path = internalPath(m);
              if (path) {
                return (
                  <TextLink asChild variant="inline">
                    <Link href={path}>
                      Abrir
                      <span className="sr-only">
                        : {m.subject} para {m.to}
                      </span>
                    </Link>
                  </TextLink>
                );
              }
              return m.link ? (
                <TextLink variant="inline" href={m.link} target="_blank" rel="noopener noreferrer">
                  {m.app ?? "Enlace"}
                  <span className="sr-only">
                    : {m.subject} para {m.to} (otra app)
                  </span>
                </TextLink>
              ) : (
                <span className="text-fg-subtle">—</span>
              );
            },
          },
        ]}
      />
    </Card>
  );
}
