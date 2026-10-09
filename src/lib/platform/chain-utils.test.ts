import { describe, expect, it } from "vitest";
import type { PlatformAccountStatus } from "@drinks-on-chain/mocks";
import { alertCodeLabel, collectionStatus, identityStatus, txErrorHelp, txKindLabel } from "./chain-labels";
import {
  alertFiltersFrom,
  anyTxInProgress,
  balanceWarnings,
  codeTtlLow,
  eventFiltersFrom,
  identityActions,
  identityInProgress,
  runStatusFrom,
  subjectHref,
  transactionsHref,
  txActions,
  txFiltersFrom,
  validateResolutionNote,
} from "./chain-utils";

const params = (query: string) => {
  const p = new URLSearchParams(query);
  return (key: string) => p.get(key);
};

const admin = { manage: true, admin: true };
const operations = { manage: true, admin: false };
const support = { manage: false, admin: false };

describe("filtros de la cadena ↔ URL", () => {
  it("transacciones: estado, tipo, bodega, sujeto y fechas", () => {
    expect(
      txFiltersFrom(
        params("estado=FAILED&tipo=MINT_BATCH&bodega=w1&sujeto=MINT&sujetoId=m1&desde=2026-10-01&hasta=2026-10-09"),
      ),
    ).toEqual({
      status: "FAILED",
      kind: "MINT_BATCH",
      wineryId: "w1",
      subjectType: "MINT",
      subjectId: "m1",
      from: "2026-10-01",
      to: "2026-10-09",
    });
    // Valores que el backend rechazaría (422) no se envían.
    const odd = txFiltersFrom(params("estado=DONE&tipo=x&sujeto=y&desde=ayer&hasta=09/10/2026"));
    expect(Object.values(odd).every((v) => v === undefined)).toBe(true);
  });

  it("enlaza con las transacciones filtradas o con una abierta en el panel", () => {
    expect(transactionsHref()).toBe("/cadena");
    expect(transactionsHref({ status: "FAILED" })).toBe("/cadena?estado=FAILED");
    expect(transactionsHref({ wineryId: "w1", open: "tx-1" })).toBe("/cadena?bodega=w1&tx=tx-1");
  });

  it("eventos: contrato, tipo, hash, solo los no originados por el sistema y fechas", () => {
    expect(eventFiltersFrom(params("contrato=+CABC+&tipo=role_granted&hash=ff&sinOrigen=1&desde=2026-10-01"))).toEqual({
      contract: "CABC",
      type: "role_granted",
      txHash: "ff",
      unmatched: true,
      from: "2026-10-01",
      to: undefined,
    });
    expect(eventFiltersFrom(params("sinOrigen=0")).unmatched).toBeUndefined();
  });

  it("alertas: por defecto las abiertas; `todas` no filtra por estado", () => {
    expect(alertFiltersFrom(params(""))).toEqual({
      status: "open",
      level: undefined,
      code: undefined,
      wineryId: undefined,
    });
    expect(alertFiltersFrom(params("estado=resolved&nivel=CRITICAL&codigo=UNEXPECTED_EVENT&bodega=w1"))).toEqual({
      status: "resolved",
      level: "CRITICAL",
      code: "UNEXPECTED_EVENT",
      wineryId: "w1",
    });
    expect(alertFiltersFrom(params("estado=todas&nivel=URGENTE"))).toMatchObject({
      status: undefined,
      level: undefined,
    });
    expect(runStatusFrom(params("estado=DIFFERENCES"))).toBe("DIFFERENCES");
    expect(runStatusFrom(params("estado=x"))).toBeUndefined();
  });
});

describe("transacciones", () => {
  it("hay transacciones en curso de `PENDING` a `RETRYING`", () => {
    expect(anyTxInProgress(undefined)).toBe(false);
    expect(anyTxInProgress([{ status: "CONFIRMED" }, { status: "FAILED" }])).toBe(false);
    for (const status of ["PENDING", "BUILDING", "SUBMITTED", "RETRYING"] as const) {
      expect(anyTxInProgress([{ status: "CONFIRMED" }, { status }]), status).toBe(true);
    }
  });

  it("solo se reintenta una fallida sin abandonar, con `chain.manage`", () => {
    const failed = { status: "FAILED", kind: "EXTEND_TTL", abandoned: null } as const;
    expect(txActions(failed, operations)).toEqual({ retry: true, abandon: false, abandonBlocked: null });
    expect(txActions(failed, admin)).toEqual({ retry: true, abandon: true, abandonBlocked: null });
    expect(txActions(failed, support)).toEqual({ retry: false, abandon: false, abandonBlocked: null });
    for (const status of ["PENDING", "SUBMITTED", "CONFIRMED", "RETRYING"] as const) {
      expect(txActions({ ...failed, status }, admin)).toEqual({ retry: false, abandon: false, abandonBlocked: null });
    }
    const abandoned = { ...failed, abandoned: { at: "2026-10-09T10:00:00Z", by: "Ana", reason: "x" } };
    expect(txActions(abandoned, admin)).toMatchObject({ retry: false, abandon: false });
  });

  it("emisiones, anclajes e identidad no se abandonan: deben terminar", () => {
    for (const kind of ["MINT_BATCH", "ANCHOR_DOSSIER", "CREATE_WINERY_ACCOUNT", "DEPLOY_WINERY_CONTRACT"] as const) {
      const actions = txActions({ status: "FAILED", kind, abandoned: null }, admin);
      expect(actions.abandon, kind).toBe(false);
      expect(actions.retry).toBe(true);
      expect(actions.abandonBlocked).toMatch(/deben terminar/);
    }
    // A operaciones no se le explica lo que de todos modos no puede hacer.
    expect(txActions({ status: "FAILED", kind: "MINT_BATCH", abandoned: null }, operations).abandonBlocked).toBeNull();
  });
});

describe("cuentas de la plataforma", () => {
  const account = (status: PlatformAccountStatus["status"]) => ({ status }) as PlatformAccountStatus;

  it("avisa del saldo bajo y de la cuenta sin configurar", () => {
    expect(balanceWarnings({ operations: account("OK"), anchor: account("OK") })).toEqual([]);
    expect(balanceWarnings({ operations: account("LOW"), anchor: account("MISSING") })).toEqual([
      { account: "operations", status: "LOW" },
      { account: "anchor", status: "MISSING" },
    ]);
  });

  it("avisa cuando al código del contrato le quedan menos de 14 días", () => {
    expect(codeTtlLow(null)).toBe(false);
    expect(codeTtlLow(14)).toBe(false);
    expect(codeTtlLow(13)).toBe(true);
  });
});

describe("identidad de la bodega", () => {
  const contract = (paused: boolean) => ({ paused }) as never;

  it("reaprovisionar: identidad fallida o sin aprovisionar, con `chain.manage`", () => {
    for (const status of ["FAILED", "NOT_PROVISIONED"] as const) {
      expect(identityActions({ status, contract: null }, operations).provision).toBe(true);
      expect(identityActions({ status, contract: null }, support).provision).toBe(false);
    }
    expect(identityActions({ status: "ACTIVE", contract: contract(false) }, admin).provision).toBe(false);
    expect(identityActions({ status: "PROVISIONING", contract: null }, admin).provision).toBe(false);
  });

  it("pausar y reanudar el contrato en la red es solo de administración", () => {
    const active = { status: "ACTIVE", contract: contract(false) } as const;
    const paused = { status: "PAUSED", contract: contract(true) } as const;
    expect(identityActions(active, admin)).toEqual({ provision: false, pause: true, unpause: false });
    expect(identityActions(paused, admin)).toEqual({ provision: false, pause: false, unpause: true });
    expect(identityActions(active, operations)).toEqual({ provision: false, pause: false, unpause: false });
    expect(identityActions(paused, operations)).toEqual({ provision: false, pause: false, unpause: false });
    // Sin contrato desplegado no hay nada que pausar.
    expect(identityActions({ status: "PROVISIONING", contract: null }, admin).pause).toBe(false);
  });

  it("se consulta cada 5 s mientras se aprovisiona o tenga transacciones en vuelo", () => {
    expect(identityInProgress(undefined)).toBe(false);
    expect(identityInProgress({ status: "PROVISIONING", pendingTransactions: [] })).toBe(true);
    expect(identityInProgress({ status: "ACTIVE", pendingTransactions: [] })).toBe(false);
    expect(identityInProgress({ status: "ACTIVE", pendingTransactions: [{ status: "SUBMITTED" }] as never })).toBe(
      true,
    );
  });
});

describe("alertas", () => {
  it("lleva del sujeto de la alerta a su pantalla", () => {
    expect(subjectHref({ type: "WINERY", id: "w1" }, null)).toBe("/bodegas/w1?pestana=cadena");
    expect(subjectHref({ type: "collection", id: "c1" }, "w1")).toBe("/colecciones/c1");
    expect(subjectHref({ type: "TRANSACTION", id: "t1" }, null)).toBe("/cadena?tx=t1");
    expect(subjectHref({ type: "ACCOUNT", id: "operations" }, null)).toBe("/cadena/cuentas");
    expect(subjectHref({ type: "PLATFORM_ACCOUNT", id: "anchor" }, null)).toBe("/cadena/cuentas");
    expect(subjectHref({ type: "CONTRACT", id: "x" }, "w1")).toBe("/bodegas/w1?pestana=cadena");
    expect(subjectHref({ type: "TOKEN", id: "x" }, null)).toBeNull();
  });

  it("la nota de resolución tiene entre 3 y 500 caracteres", () => {
    expect(validateResolutionNote(" ab ")).toMatch(/mínimo 3/);
    expect(validateResolutionNote("x".repeat(501))).toMatch(/500/);
    expect(validateResolutionNote("Rol concedido por error; revocado.")).toBeUndefined();
  });
});

describe("textos de los códigos de la Ola 3", () => {
  it("traduce los conocidos y deja tal cual los nuevos del backend", () => {
    expect(collectionStatus("READY")).toEqual({ label: "Lista para publicar", tone: "accent" });
    expect(collectionStatus("ARCHIVED")).toEqual({ label: "ARCHIVED", tone: "neutral" });
    expect(identityStatus("PAUSED").label).toBe("Pausada en la red");
    expect(txKindLabel("MINT_BATCH")).toBe("Emisión de NFT");
    expect(txKindLabel("NEW_KIND")).toBe("NEW_KIND");
    expect(alertCodeLabel("UNEXPECTED_EVENT")).toBe("Evento no originado por el sistema");
    expect(txErrorHelp("CHN_AUTH_FAILED")).toMatch(/reintenta a mano/);
    expect(txErrorHelp("CHN_OTRO")).toBeNull();
    expect(txErrorHelp(null)).toBeNull();
  });
});
