import { describe, expect, it } from "vitest";
import type { ChainTxRef, Collection, LotClosure } from "@drinks-on-chain/mocks";
import {
  POLL_MS,
  closureBlockedReason,
  closureNeedsDecision,
  closurePolicies,
  collectionActions,
  collectionFiltersFrom,
  collectionInProgress,
  collectionsHref,
  collectionsViewFrom,
  failedMintTx,
  mintInProgress,
  mintRangeLabel,
  mintedPercent,
  needsIdempotencyKey,
  pendingClosureItems,
  pollWhile,
  reasonRequired,
  shortfallSummary,
  tokenFiltersFrom,
} from "./collections-utils";

const params = (query: string) => {
  const p = new URLSearchParams(query);
  return (key: string) => p.get(key);
};

const tx = (status: ChainTxRef["status"], id = `tx-${status}`): ChainTxRef =>
  ({ id, kind: "MINT_BATCH", status, lastError: null }) as ChainTxRef;

const collection = (over: Partial<Collection> = {}): Collection =>
  ({
    mintStatus: "CONFIRMED",
    mints: [{ transactions: [tx("CONFIRMED")], ranges: [] }],
    closure: null,
    quota: 100,
    counts: { minted: 100 },
    ...over,
  }) as unknown as Collection;

const closure = (over: Partial<LotClosure> = {}): LotClosure =>
  ({
    status: "SHORTFALL_OPEN",
    shortfall: 20,
    unsoldToBurn: 20,
    soldWithoutBottle: 0,
    decision: null,
    items: [],
    ...over,
  }) as LotClosure;

describe("filtros de las colecciones ↔ URL", () => {
  it("lee estado, venta, emisión, bodega, búsqueda y vista", () => {
    expect(
      collectionFiltersFrom(params("estado=PUBLISHED&venta=PRESALE&emision=FAILED&bodega=w1&q=+portillo+")),
    ).toEqual({ status: "PUBLISHED", saleState: "PRESALE", mintStatus: "FAILED", wineryId: "w1", q: "portillo" });
    expect(collectionFiltersFrom(params("estado=IN_REVIEW&venta=x&emision=y"))).toEqual({
      status: undefined,
      saleState: undefined,
      mintStatus: undefined,
      wineryId: undefined,
      q: undefined,
    });
    expect(collectionsViewFrom(params(""))).toBe("tarjetas");
    expect(collectionsViewFrom(params("vista=tabla"))).toBe("tabla");
    expect(collectionsViewFrom(params("vista=otra"))).toBe("tarjetas");
  });

  it("construye los enlaces del tablero", () => {
    expect(collectionsHref()).toBe("/colecciones");
    expect(collectionsHref({ status: "MINTING" })).toBe("/colecciones?estado=MINTING");
    expect(collectionsHref({ mintStatus: "FAILED", wineryId: "w1" })).toBe("/colecciones?emision=FAILED&bodega=w1");
  });

  it("lee el filtro de los NFT: estado y rango de botellas (enteros desde 1)", () => {
    expect(tokenFiltersFrom(params("nft=BURNED&desde=81&hasta=100"))).toEqual({
      status: "BURNED",
      fromNumber: 81,
      toNumber: 100,
    });
    expect(tokenFiltersFrom(params("nft=x&desde=0&hasta=1,5"))).toEqual({
      status: undefined,
      fromNumber: undefined,
      toNumber: undefined,
    });
  });
});

describe("refresco cada 5 s solo mientras haya algo en curso", () => {
  it("una emisión en cola o en curso mantiene la consulta; confirmada o fallida, no", () => {
    expect(mintInProgress({ mintStatus: "PENDING" })).toBe(true);
    expect(mintInProgress({ mintStatus: "IN_PROGRESS" })).toBe(true);
    expect(mintInProgress({ mintStatus: "CONFIRMED" })).toBe(false);
    expect(mintInProgress({ mintStatus: "FAILED" })).toBe(false);
    expect(pollWhile(true)).toBe(POLL_MS);
    expect(POLL_MS).toBe(5000);
    expect(pollWhile(false)).toBe(false);
  });

  it("mira las transacciones de las emisiones y las quemas del cierre", () => {
    expect(collectionInProgress(undefined)).toBe(false);
    expect(collectionInProgress(collection())).toBe(false);
    expect(collectionInProgress(collection({ mintStatus: "IN_PROGRESS" }))).toBe(true);
    for (const status of ["PENDING", "BUILDING", "SUBMITTED", "RETRYING"] as const) {
      expect(
        collectionInProgress(collection({ mints: [{ transactions: [tx(status)] }] } as unknown as Partial<Collection>)),
        status,
      ).toBe(true);
    }
    // Una emisión fallida espera a que alguien la reintente: no se consulta en bucle.
    const failed = collection({
      mintStatus: "FAILED",
      mints: [{ transactions: [tx("FAILED")] }],
    } as unknown as Partial<Collection>);
    expect(collectionInProgress(failed)).toBe(false);
    expect(failedMintTx(failed)?.id).toBe("tx-FAILED");
    expect(failedMintTx(collection())).toBeNull();
    const burning = collection({
      closure: closure({ items: [{ burnTx: tx("SUBMITTED") }, { burnTx: null }] } as unknown as Partial<LotClosure>),
    });
    expect(collectionInProgress(burning)).toBe(true);
  });

  it("describe el rango de botellas y de ids de una emisión", () => {
    expect(mintRangeLabel({ ranges: [] })).toBeNull();
    expect(
      mintRangeLabel({
        ranges: [{ firstTokenId: 100, lastTokenId: 149, firstBottleNumber: 101, lastBottleNumber: 150 }],
      }),
    ).toBe("Botellas 101–150 · ids 100–149");
    // Emisión de más de 32.000 en dos trozos: del primero al último.
    expect(
      mintRangeLabel({
        ranges: [
          { firstTokenId: 0, lastTokenId: 31999, firstBottleNumber: 1, lastBottleNumber: 32000 },
          { firstTokenId: 32000, lastTokenId: 32000, firstBottleNumber: 32001, lastBottleNumber: 32001 },
        ],
      }),
    ).toBe("Botellas 1–32.001 · ids 0–32000");
    expect(mintedPercent({ quota: 150, counts: { minted: 100 } } as Collection)).toBe(67);
  });
});

describe("acciones de la colección", () => {
  it("sigue las transiciones del contrato §6.2", () => {
    expect(collectionActions("MINTING", true)).toEqual({ actions: [], edit: true });
    expect(collectionActions("READY", true)).toEqual({ actions: ["publish", "close"], edit: true });
    expect(collectionActions("PUBLISHED", true)).toEqual({ actions: ["pause", "close"], edit: true });
    expect(collectionActions("PAUSED", true)).toEqual({ actions: ["resume", "close"], edit: true });
    expect(collectionActions("CLOSED", true)).toEqual({ actions: [], edit: false });
  });

  it("soporte no ve ninguna acción", () => {
    for (const status of ["MINTING", "READY", "PUBLISHED", "PAUSED", "CLOSED"] as const) {
      expect(collectionActions(status, false)).toEqual({ actions: [], edit: false });
    }
  });

  it("pausar y cerrar exigen motivo; cerrar no lleva Idempotency-Key", () => {
    expect((["publish", "pause", "resume", "close"] as const).filter(reasonRequired)).toEqual(["pause", "close"]);
    expect((["publish", "pause", "resume", "close"] as const).filter(needsIdempotencyKey)).toEqual([
      "publish",
      "pause",
      "resume",
    ]);
  });
});

describe("cierre con faltante", () => {
  const admin = { manage: true, admin: true };
  const operations = { manage: true, admin: false };
  const support = { manage: false, admin: false };

  it("con faltante solo decide administración (las quemas son de `chain.admin`)", () => {
    const open = closure();
    expect(closureNeedsDecision(open)).toBe(true);
    expect(closurePolicies(open, admin)).toEqual(["KEEP_ON_SALE", "BURN"]);
    expect(closurePolicies(open, operations)).toEqual([]);
    expect(closureBlockedReason(open, operations)).toMatch(/solo la toma administración/);
    expect(closureBlockedReason(open, support)).toMatch(/modo lectura/);
    expect(closureBlockedReason(open, admin)).toBeNull();
  });

  it("sin faltante, operaciones solo decide «siguen a la venta»", () => {
    const none = closure({ status: "NO_SHORTFALL", shortfall: 0, unsoldToBurn: 0 });
    expect(closureNeedsDecision(none)).toBe(true);
    expect(closurePolicies(none, operations)).toEqual(["KEEP_ON_SALE"]);
    expect(closurePolicies(none, admin)).toEqual(["KEEP_ON_SALE", "BURN"]);
    expect(closurePolicies(none, support)).toEqual([]);
    expect(closureBlockedReason(none, operations)).toBeNull();
  });

  it("decidido o resuelto ya no admite otra decisión", () => {
    const decision = { by: { userId: "u", fullName: "Ana" }, at: "2026-10-09T10:00:00Z", reason: "x" };
    for (const status of ["DECIDED", "RESOLVED"] as const) {
      const done = closure({ status, decision });
      expect(closureNeedsDecision(done)).toBe(false);
      expect(closurePolicies(done, admin)).toEqual([]);
      expect(closureBlockedReason(done, operations)).toBeNull();
    }
    expect(closureNeedsDecision(closure({ status: "NO_SHORTFALL", shortfall: 0, decision }))).toBe(false);
  });

  it("resume el faltante y lista los ítems por resolver a mano", () => {
    expect(shortfallSummary(closure())).toBe(
      "Faltan 20 botellas: 20 NFT sin vender se queman y 0 vendidos quedan sin botella (devolución o sustitución a mano).",
    );
    expect(shortfallSummary(closure({ shortfall: 0 }))).toMatch(/no hay faltante/);
    const items = [{ outcome: "PENDING" }, { outcome: "BURN_UNSOLD" }, { outcome: "MANUAL_REFUND" }];
    expect(pendingClosureItems({ items } as unknown as LotClosure)).toHaveLength(1);
  });
});
