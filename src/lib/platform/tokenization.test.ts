import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  mockChain,
  mockTokenization,
  resetErpDb,
  resetScenario,
  setScenario,
  setupMockServer,
} from "@drinks-on-chain/mocks/node";
import { CHAIN_ALERT_CODES, CHAIN_ALERT_SUBJECT_TYPES } from "@drinks-on-chain/mocks";
import { DEMO_PASSWORD, demoUsers, generateTotp } from "@drinks-on-chain/mocks/fixtures";
import { api } from "@/lib/api/client";
import { resetSessionForTests } from "@/lib/api/session";
import { applySession, login, verifyMfa } from "@/lib/auth/api";
import { isMfaChallenge } from "@/lib/auth/schemas";
import { fetchDashboard, fetchPermissions } from "./api";
import { fetchWineries } from "./wineries";
import {
  abandonChainTransaction,
  fetchChainAccounts,
  fetchChainRegistry,
  fetchChainAlerts,
  fetchChainEvents,
  fetchChainTransaction,
  fetchChainTransactions,
  fetchReconciliationRun,
  fetchReconciliationRuns,
  fetchWineryChainAccount,
  provisionWineryChain,
  resolveChainAlert,
  retryChainTransaction,
  setWineryContractPaused,
  startReconciliation,
} from "./chain";
import { alertCodeLabel, subjectTypeLabel } from "./chain-labels";
import { balanceWarnings, chainConfigured, identityActions, txActions } from "./chain-utils";
import {
  decideClosure,
  fetchClosure,
  fetchCollection,
  fetchCollectionTokens,
  fetchCollectionTransactions,
  fetchCollections,
  fetchLotClosures,
  resolveClosureItem,
  runCollectionAction,
  updateCollection,
} from "./collections";
import {
  closurePolicies,
  collectionInProgress,
  collectionStamp,
  mintRangeLabel,
  pendingClosureItems,
} from "./collections-utils";
import { explainRuleError } from "./rule-errors";
import {
  addTokenizationNote,
  approveTokenizationRequest,
  fetchTokenizationRequest,
  fetchTokenizationRequests,
  fetchUploadUrl,
  rejectTokenizationRequest,
  requestTokenizationChanges,
  reviewTokenizationRequest,
  takeTokenizationRequest,
} from "./tokenization";
import { COMMERCIAL_FIELDS } from "./tokenization-utils";

// Cliente de la Ola 3 contra los handlers reales de `@drinks-on-chain/mocks` 0.6 (sin `fetch`
// simulado) y con su red simulada en modo manual (`mockChain.settle()`): si el paquete o el contrato
// cambian, esta prueba lo avisa antes que las e2e. Recorre las rutas que usan las pantallas.

const key = () => crypto.randomUUID();
const denied = { status: 403 };

describe("tokenización, colecciones y cadena contra los handlers de los mocks", () => {
  const server = setupMockServer();

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  beforeEach(() => resetSessionForTests());
  afterEach(() => {
    server.resetHandlers();
    resetScenario();
    resetErpDb();
    resetSessionForTests();
  });
  afterAll(() => server.close());

  async function signIn(userKey: string) {
    const user = demoUsers.find((u) => u.key === userKey);
    if (!user) throw new Error(`No hay persona de demo «${userKey}»`);
    const challenge = await login({ email: user.email, password: DEMO_PASSWORD });
    if (!isMfaChallenge(challenge)) throw new Error("se esperaba el reto de segundo factor");
    const session = await verifyMfa({ mfaToken: challenge.mfa.mfaToken, code: generateTotp(user.mfa!.secret!) });
    applySession(session);
    return { ...user, id: session.user.id };
  }

  const requestOf = async (lotName: string, status?: Parameters<typeof fetchTokenizationRequests>[0]["status"]) => {
    const page = await fetchTokenizationRequests({ status, q: lotName, limit: 100 });
    const found = page.items.find((r) => r.lot.name === lotName);
    if (!found) throw new Error(`No hay solicitud de «${lotName}»`);
    return found;
  };

  // Desde los mocks 0.6.0-rc.2 dos bodegas tienen una «Singani Preventa 2026»: se busca con la bodega.
  const collectionOf = async (name: string, winery = "Destilería Cinti Viejo") => {
    const page = await fetchCollections({ q: name, limit: 100 });
    const found = page.items.find((c) => (c.name === name || c.lot.name === name) && c.winery.tradeName === winery);
    if (!found) throw new Error(`No hay colección de «${name}» en ${winery}`);
    return found;
  };

  it("bandeja: por defecto las abiertas de la más antigua a la más reciente, filtros y tablero", async () => {
    const user = await signIn("operaciones");
    const open = await fetchTokenizationRequests({ limit: 20, offset: 0 });
    expect(open).toMatchObject({ limit: 20, offset: 0 });
    expect(open.items.map((r) => r.status).sort()).toEqual(["CHANGES_REQUESTED", "IN_REVIEW", "SUBMITTED"]);
    const dates = open.items.map((r) => r.submittedAt);
    expect(dates).toEqual([...dates].sort());

    const approved = await fetchTokenizationRequests({ status: "APPROVED", limit: 100 });
    expect(approved.items.every((r) => r.status === "APPROVED" && r.collectionId !== null)).toBe(true);
    const increases = await fetchTokenizationRequests({ kind: "QUOTA_INCREASE", limit: 100 });
    expect(increases.items.map((r) => r.lot.name)).toEqual(["Singani El Portillo 2025"]);
    const mine = await fetchTokenizationRequests({ assigneeId: user.id, limit: 100 });
    expect(mine.items.every((r) => r.assignee?.userId === user.id)).toBe(true);
    const byWinery = await fetchTokenizationRequests({ wineryId: open.items[0]!.wineryId, limit: 100 });
    expect(byWinery.items.every((r) => r.wineryId === open.items[0]!.wineryId)).toBe(true);

    const dashboard = await fetchDashboard();
    expect(dashboard.tokenization).toMatchObject({
      submitted: 1,
      inReview: 1,
      changesRequested: 1,
      collectionsPublished: 3,
    });
    expect(dashboard.chain.network).toBe("TESTNET");

    const matrix = await fetchPermissions();
    const levels = (capability: string) => matrix.capabilities.find((c) => c.key === capability)?.roles;
    expect(levels("tokenization")).toMatchObject({ ADMIN: "FULL", OPERATIONS: "FULL", SUPPORT: "READ" });
    expect(levels("chain")).toMatchObject({ OPERATIONS: "FULL", SUPPORT: "READ" });
    expect(levels("chain.admin")).toMatchObject({ ADMIN: "FULL", OPERATIONS: "NONE", SUPPORT: "NONE" });
  });

  it("detalle con la revisión; tomar, nota y pedir cambios; después ya no admite otra acción", async () => {
    const user = await signIn("operaciones");
    const summary = await requestOf("Singani El Portillo 2025");
    expect(summary).toMatchObject({ kind: "QUOTA_INCREASE", status: "SUBMITTED", assignee: null });

    const detail = await fetchTokenizationRequest(summary.id);
    expect(detail.priceSuggestion).toEqual({ available: false, reason: "POLICY_UNDEFINED" });
    expect(detail.review.lot.name).toBe("Singani El Portillo 2025");
    expect(detail.review.limits.basis).toBe("BOTTLES");
    expect(detail.review.chainIdentity.status).toBe("ACTIVE");
    expect(detail.internalNotes).toEqual([]);

    const taken = await takeTokenizationRequest(summary.id);
    expect(taken).toMatchObject({ status: "IN_REVIEW", assignee: { userId: user.id } });
    const noted = await addTokenizationNote(summary.id, "Confirmar las botellas con la bodega.");
    expect(noted.internalNotes.at(-1)?.text).toBe("Confirmar las botellas con la bodega.");

    const changes = await requestTokenizationChanges(summary.id, {
      message: "Falta la nota de cata.",
      fields: ["commercial.tastingNotes"],
    });
    expect(changes.status).toBe("CHANGES_REQUESTED");
    expect(changes.changeRequests.at(-1)).toMatchObject({
      message: "Falta la nota de cata.",
      fields: ["commercial.tastingNotes"],
      resolvedAt: null,
    });

    const stale = await takeTokenizationRequest(summary.id).catch((e: unknown) => e);
    expect(stale).toMatchObject({ status: 409, code: "TOK_REQUEST_INVALID_TRANSITION" });
    expect(explainRuleError(stale).message).toMatch(/cambió de estado/);
    await expect(rejectTokenizationRequest(summary.id, "Ya no aplica")).rejects.toMatchObject({ status: 409 });
  });

  it("aprobar: datos incompletos campo a campo, sin Idempotency-Key, y emisión confirmada → publicar, pausar, reanudar", async () => {
    await signIn("operaciones");
    const summary = await requestOf("Singani El Molino 2026");
    expect(summary.status).toBe("IN_REVIEW");
    const path = `/v1/platform/tokenization-requests/${summary.id}/approve`;

    // Sin la cabecera obligatoria.
    await expect(api(path, { method: "POST", body: {} })).rejects.toMatchObject({
      status: 422,
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });

    // Sin portada: 422 con un detalle por campo.
    const incomplete = await approveTokenizationRequest(summary.id, { commercial: { imageKeys: [] } }, key()).catch(
      (e: unknown) => e,
    );
    expect(incomplete).toMatchObject({ status: 422, code: "TOK_COMMERCIAL_DATA_INCOMPLETE" });
    expect(explainRuleError(incomplete, COMMERCIAL_FIELDS).fieldErrors).toHaveProperty("images");

    // El borrador no cambió: se completa el precio (centavos enteros) y se aprueba.
    const detail = await fetchTokenizationRequest(summary.id);
    const image = detail.commercialDraft.imageKeys[0]!;
    await expect(fetchUploadUrl(image.key)).resolves.toMatchObject({ key: image.key });
    const priced = await reviewTokenizationRequest(summary.id, { price: { amountMinor: 18050, currency: "BOB" } });
    expect(priced.price).toMatchObject({ amountMinor: 18050, source: "MANUAL" });
    await expect(
      reviewTokenizationRequest(summary.id, { price: { amountMinor: 0, currency: "BOB" } }),
    ).rejects.toMatchObject({ status: 422 });

    const idempotencyKey = key();
    const approval = await approveTokenizationRequest(summary.id, { publishOnMint: false }, idempotencyKey);
    expect(approval.request).toMatchObject({ status: "APPROVED", collectionId: approval.collection.id });
    expect(approval.collection).toMatchObject({ status: "MINTING", quota: 400, price: { amountMinor: 18050 } });
    expect(approval.mint).toMatchObject({ quantity: 400, sequence: 1 });
    expect(collectionInProgress(approval.collection)).toBe(true);
    // La misma clave con el mismo cuerpo devuelve el mismo resultado: una sola colección.
    const replay = await approveTokenizationRequest(summary.id, { publishOnMint: false }, idempotencyKey);
    expect(replay.collection.id).toBe(approval.collection.id);
    expect((await fetchCollections({ q: "Molino", limit: 100 })).total).toBe(1);

    const id = approval.collection.id;
    const early = await runCollectionAction(id, "publish", { reason: null }, key()).catch((e: unknown) => e);
    expect(early).toMatchObject({ status: 409 });
    expect(explainRuleError(early).message.length).toBeGreaterThan(10);

    mockChain.settle();
    const ready = await fetchCollection(id);
    expect(ready).toMatchObject({ status: "READY", mintStatus: "CONFIRMED" });
    expect(ready.counts.minted).toBe(400);
    expect(collectionInProgress(ready)).toBe(false);
    expect(mintRangeLabel(ready.mints[0]!)).toMatch(/^Botellas 1–400 · ids \d+–\d+$/);
    expect(ready.mints[0]!.transactions[0]).toMatchObject({ kind: "MINT_BATCH", status: "CONFIRMED" });
    expect(ready.mints[0]!.transactions[0]!.explorerUrl).toMatch(/^https:\/\//);

    const tokens = await fetchCollectionTokens(id, { fromNumber: 391, toNumber: 400, limit: 50 });
    expect(tokens.total).toBe(10);
    expect(tokens.items.every((t) => t.status === "MINTED" && t.owner.kind === "WINERY")).toBe(true);
    const txs = await fetchCollectionTransactions(id, { limit: 50 });
    expect(txs.items.map((t) => t.kind)).toContain("MINT_BATCH");

    // Publicar sin Idempotency-Key no pasa; con ella, PRESALE. Pausar exige motivo.
    await expect(api(`/v1/platform/collections/${id}/publish`, { method: "POST", body: {} })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
    const published = await runCollectionAction(id, "publish", { reason: null }, key());
    expect(published).toMatchObject({ status: "PUBLISHED", saleState: "PRESALE" });
    await expect(runCollectionAction(id, "pause", { reason: "" }, key())).rejects.toMatchObject({ status: 422 });
    const paused = await runCollectionAction(id, "pause", { reason: "Revisión de la ficha" }, key());
    expect(paused).toMatchObject({ status: "PAUSED", saleState: null });
    const resumed = await runCollectionAction(id, "resume", { reason: null }, key());
    expect(resumed.status).toBe("PUBLISHED");
    expect(resumed.statusHistory.map((h) => h.status).slice(-3)).toEqual(["PUBLISHED", "PAUSED", "PUBLISHED"]);

    // Editar el precio con motivo deja historial.
    const edited = await updateCollection(id, {
      price: { amountMinor: 20000, currency: "BOB" },
      reason: "Precio de feria",
    });
    expect(edited.price?.amountMinor).toBe(20000);
    expect(edited.priceHistory.map((p) => p.amountMinor)).toEqual([18050, 20000]);
  });

  it("emisión fallida: alerta, reintento con motivo y confirmación sin doble emisión", async () => {
    setScenario("emision-fallida");
    await signIn("operaciones");
    const summary = await collectionOf("Singani Preventa 2026");
    expect(summary).toMatchObject({ status: "MINTING", mintStatus: "FAILED" });
    const collection = await fetchCollection(summary.id);
    const failed = collection.mints[0]!.transactions.find((t) => t.status === "FAILED")!;
    expect(failed.lastError).toMatchObject({ code: "CHN_AUTH_FAILED", retryable: false });
    // Una emisión fallida no se consulta en bucle: espera al reintento manual.
    expect(collectionInProgress(collection)).toBe(false);

    const listed = await fetchChainTransactions({ status: "FAILED", kind: "MINT_BATCH", limit: 20 });
    expect(listed.items.map((t) => t.id)).toContain(failed.id);
    const tx = await fetchChainTransaction(failed.id);
    expect(tx.history.at(-1)).toMatchObject({ status: "FAILED", errorCode: "CHN_AUTH_FAILED" });
    expect(txActions(tx, { manage: true, admin: true })).toMatchObject({ retry: true, abandon: false });
    const alerts = await fetchChainAlerts({ status: "open", code: "TX_FAILED", limit: 20 });
    expect(alerts.total).toBeGreaterThan(0);

    // Reintentar exige la clave de idempotencia y un motivo.
    await expect(
      api(`/v1/platform/chain/transactions/${failed.id}/retry`, {
        method: "POST",
        body: { reason: "Custodia revisada" },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const retried = await retryChainTransaction(failed.id, "Custodia revisada", key());
    expect(retried.status).toBe("PENDING");
    await expect(retryChainTransaction(failed.id, "Otra vez", key())).rejects.toMatchObject({
      status: 409,
      code: "CHN_TX_NOT_RETRYABLE",
    });

    mockChain.settle();
    const confirmed = await fetchCollection(summary.id);
    expect(confirmed).toMatchObject({ status: "READY", mintStatus: "CONFIRMED" });
    expect(confirmed.counts.minted).toBe(100);
    expect((await fetchChainTransaction(failed.id)).status).toBe("CONFIRMED");
  });

  it("faltante de botellas: operaciones no decide; administración decide y las quemas se confirman", async () => {
    setScenario("faltante-botellas");
    await signIn("operaciones");
    const closures = await fetchLotClosures({ status: "SHORTFALL_OPEN", limit: 100 });
    expect(closures.total).toBe(1);
    const collectionId = closures.items[0]!.collectionId;
    const open = (await fetchClosure(collectionId))!;
    expect(open).toMatchObject({ status: "SHORTFALL_OPEN", shortfall: 20, unsoldToBurn: 20, soldWithoutBottle: 0 });
    expect(closurePolicies(open, { manage: true, admin: false })).toEqual([]);
    const forbidden = await decideClosure(
      collectionId,
      { unsoldPolicy: "KEEP_ON_SALE", reason: "Embotellado corto" },
      key(),
    ).catch((e: unknown) => e);
    expect(forbidden).toMatchObject(denied);
    expect(explainRuleError(forbidden).message).toMatch(/Tu rol no permite/);
    // Cerrar la colección con el faltante abierto no pasa.
    await expect(runCollectionAction(collectionId, "close", { reason: "Fin de la preventa" })).rejects.toMatchObject({
      status: 409,
      code: "TOK_CLOSURE_PENDING",
    });

    resetSessionForTests();
    await signIn("bo_admin");
    await expect(
      api(`/v1/platform/collections/${collectionId}/closure/decide`, {
        method: "POST",
        body: { unsoldPolicy: "KEEP_ON_SALE", reason: "Embotellado corto" },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    const decided = await decideClosure(
      collectionId,
      { unsoldPolicy: "KEEP_ON_SALE", reason: "Embotellado corto" },
      key(),
    );
    expect(decided.unsoldPolicy).toBe("KEEP_ON_SALE");
    expect(decided.decision?.reason).toBe("Embotellado corto");
    const burns = decided.items.filter((i) => i.outcome === "BURN_UNSOLD");
    expect(burns).toHaveLength(20);
    // Se queman primero los números de botella más altos.
    expect(Math.min(...burns.map((i) => i.bottleNumber))).toBe(1041);

    mockChain.settle();
    const resolved = (await fetchClosure(collectionId))!;
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.items.every((i) => i.burnTx?.status === "CONFIRMED")).toBe(true);
    const burned = await fetchCollectionTokens(collectionId, { status: "BURNED", limit: 50 });
    expect(burned.total).toBe(20);
    expect(burned.items.every((t) => t.burnReason === "SHORTFALL")).toBe(true);

    // Sin embotellar no hay cierre: `null`, no un error.
    const preventa = await collectionOf("Singani Preventa 2026");
    await expect(fetchClosure(preventa.id)).resolves.toBeNull();
  });

  it("alerta de evento inesperado: se lista, se resuelve con nota y no se resuelve dos veces", async () => {
    setScenario("alerta-evento-inesperado");
    await signIn("operaciones");
    const critical = await fetchChainAlerts({ status: "open", level: "CRITICAL", limit: 20 });
    const alert = critical.items.find((a) => a.code === "UNEXPECTED_EVENT")!;
    expect(alert).toMatchObject({ level: "CRITICAL", resolvedAt: null });
    expect((await fetchDashboard()).chain.openAlerts.critical).toBeGreaterThan(0);

    const unmatched = await fetchChainEvents({ unmatched: true, limit: 50 });
    expect(unmatched.items.some((e) => e.type === "role_granted" && !e.originatedBySystem)).toBe(true);
    const byType = await fetchChainEvents({ type: "lot_minted", limit: 50 });
    expect(byType.items.every((e) => e.type === "lot_minted")).toBe(true);

    await expect(resolveChainAlert(alert.id, "x")).rejects.toMatchObject({ status: 422 });
    const resolved = await resolveChainAlert(alert.id, "Rol concedido en una prueba; revocado.");
    expect(resolved.resolution).toMatchObject({ note: "Rol concedido en una prueba; revocado.", auto: false });
    const again = await resolveChainAlert(alert.id, "Otra vez").catch((e: unknown) => e);
    expect(again).toMatchObject({ status: 409, code: "CHN_ALERT_ALREADY_RESOLVED" });
    expect(explainRuleError(again).message).toBe("La alerta ya estaba resuelta.");
    const stillOpen = await fetchChainAlerts({ status: "open", code: "UNEXPECTED_EVENT", limit: 20 });
    expect(stillOpen.total).toBe(0);
  });

  it("cuentas, conciliaciones e identidad: reaprovisionar, pausar y reanudar el contrato (administración)", async () => {
    setScenario("identidad-preparandose");
    await signIn("operaciones");

    const accounts = await fetchChainAccounts();
    expect(accounts.network).toBe("TESTNET");
    expect(accounts.operations.explorerUrl).toMatch(/^https:\/\//);
    expect(balanceWarnings(accounts)).toEqual([]);

    const run = await startReconciliation({ scope: "ALL", depth: "FULL" });
    expect(run).toMatchObject({ scope: "ALL", depth: "FULL", trigger: "MANUAL" });
    const detail = await fetchReconciliationRun(run.id);
    expect(Array.isArray(detail.alerts)).toBe(true);
    expect((await fetchReconciliationRuns({ limit: 20 })).items[0]!.id).toBe(run.id);
    await expect(startReconciliation({ scope: "CONTRACT" })).rejects.toMatchObject({ status: 422 });

    // Altos recién activada: su identidad se está creando y se confirma al avanzar la red.
    const wineries = await fetchTokenizationRequests({ status: "CHANGES_REQUESTED", limit: 10 });
    const altosId = wineries.items.find((r) => r.winery.tradeName === "Bodega Altos de Calamuchita")!.wineryId;
    const provisioning = await fetchWineryChainAccount(altosId);
    expect(provisioning.identity.status).toBe("PROVISIONING");
    expect(identityActions(provisioning.identity, { manage: true, admin: true })).toEqual({
      provision: false,
      pause: false,
      unpause: false,
    });
    mockChain.settle();
    const active = await fetchWineryChainAccount(altosId);
    expect(active.identity).toMatchObject({ status: "ACTIVE", contract: { paused: false } });
    await expect(provisionWineryChain(altosId, "Por si acaso")).rejects.toMatchObject({
      status: 409,
      code: "CHN_IDENTITY_ALREADY_ACTIVE",
    });

    // Operaciones no pausa contratos; administración sí, con motivo e Idempotency-Key.
    await expect(setWineryContractPaused(altosId, true, "Incidente", key())).rejects.toMatchObject(denied);
    resetSessionForTests();
    await signIn("bo_admin");
    const pausing = await setWineryContractPaused(altosId, true, "Clave comprometida", key());
    expect(pausing.wineryId).toBe(altosId);
    mockChain.settle();
    const paused = await fetchWineryChainAccount(altosId);
    expect(paused.identity).toMatchObject({ status: "PAUSED", contract: { paused: true } });
    expect(identityActions(paused.identity, { manage: true, admin: true })).toMatchObject({
      pause: false,
      unpause: true,
    });
    const twice = await setWineryContractPaused(altosId, true, "Otra vez", key()).catch((e: unknown) => e);
    expect(twice).toMatchObject({ status: 409, code: "CHN_CONTRACT_ALREADY_PAUSED" });
    await setWineryContractPaused(altosId, false, "Incidente cerrado", key());
    mockChain.settle();
    expect((await fetchWineryChainAccount(altosId)).identity.contract?.paused).toBe(false);

    // Las transacciones de identidad no se abandonan.
    const identityTx = (await fetchChainTransactions({ kind: "PAUSE_CONTRACT", wineryId: altosId, limit: 5 }))
      .items[0]!;
    await expect(abandonChainTransaction(identityTx.id, "No hace falta")).rejects.toMatchObject({ status: 409 });
  });

  it("ciclo completo: pedir cambios → la bodega reenvía → tomar de nuevo → aprobar", async () => {
    await signIn("operaciones");
    const summary = await requestOf("Tannat La Angostura 2024");
    expect(summary.status).toBe("CHANGES_REQUESTED");

    // La bodega atiende lo pedido (falta la portada) y reenvía: vuelve a la bandeja sin asignar.
    mockTokenization.resubmitAsWinery(summary.id, { message: "Portada añadida." });
    const resubmitted = await fetchTokenizationRequest(summary.id);
    expect(resubmitted).toMatchObject({ status: "SUBMITTED", assignee: null });
    expect(resubmitted.changeRequests.every((c) => c.resolvedAt !== null)).toBe(true);
    expect(resubmitted.commercialDraft.imageKeys).toHaveLength(1);

    await takeTokenizationRequest(summary.id);
    const approval = await approveTokenizationRequest(summary.id, { publishOnMint: true }, key());
    expect(approval.collection.status).toBe("MINTING");
    // rc.2: la respuesta ya trae las transacciones de la emisión, en cola y sin hash.
    expect(approval.mint.transactions[0]).toMatchObject({ kind: "MINT_BATCH", status: "PENDING", txHash: null });
    const before = collectionStamp(approval.collection);
    mockChain.settle();
    const published = await fetchCollection(approval.collection.id);
    expect(published).toMatchObject({ status: "PUBLISHED", mintStatus: "CONFIRMED" });
    // La huella cambia al confirmarse: las listas de transacciones y de NFT se vuelven a pedir.
    expect(collectionStamp(published)).not.toBe(before);
    const txs = await fetchCollectionTransactions(published.id, { limit: 50 });
    expect(txs.items.every((t) => t.status === "CONFIRMED")).toBe(true);
  });

  it("faltante con vendidos: tras decidir, los NFT vendidos sin botella se resuelven uno a uno", async () => {
    setScenario("faltante-vendidos");
    await signIn("bo_admin");
    const closures = await fetchLotClosures({ status: "SHORTFALL_OPEN", limit: 100 });
    const collectionId = closures.items[0]!.collectionId;
    const open = (await fetchClosure(collectionId))!;
    expect(open).toMatchObject({ shortfall: 20, unsoldToBurn: 10, soldWithoutBottle: 10 });

    const decided = await decideClosure(
      collectionId,
      { unsoldPolicy: "KEEP_ON_SALE", reason: "Merma al embotellar" },
      key(),
    );
    mockChain.settle();
    const pending = pendingClosureItems((await fetchClosure(collectionId))!);
    expect(decided.items.filter((i) => i.outcome === "BURN_UNSOLD")).toHaveLength(10);
    expect(pending).toHaveLength(10);
    expect(pending.every((i) => i.orderId !== null && i.paidAt !== null)).toBe(true);

    await expect(
      resolveClosureItem(collectionId, pending[0]!.tokenId, { outcome: "MANUAL_REFUND", note: "x" }),
    ).rejects.toMatchObject({ status: 422 });
    let closure = await resolveClosureItem(collectionId, pending[0]!.tokenId, {
      outcome: "MANUAL_REFUND",
      note: "Importe devuelto por transferencia.",
    });
    expect(closure.status).toBe("DECIDED");
    expect(closure.items.find((i) => i.tokenId === pending[0]!.tokenId)).toMatchObject({
      outcome: "MANUAL_REFUND",
      note: "Importe devuelto por transferencia.",
    });
    for (const item of pending.slice(1)) {
      closure = await resolveClosureItem(collectionId, item.tokenId, {
        outcome: "MANUAL_SUBSTITUTE",
        note: "Botella de otra añada acordada con el comprador.",
      });
    }
    // Resuelto el último, el cierre queda resuelto.
    expect(closure.status).toBe("RESOLVED");
  });

  it("cadena sin configurar: 409 CHN_DISABLED explicado y registro público sin cuentas", async () => {
    setScenario("cadena-sin-configurar");
    await signIn("bo_admin");
    expect(chainConfigured(await fetchChainRegistry())).toBe(false);
    const altosId = (await fetchWineries({ q: "Altos de Calamuchita", limit: 5 })).items[0]!.id;
    expect((await fetchWineryChainAccount(altosId)).identity.status).toBe("NOT_PROVISIONED");
    const disabled = await provisionWineryChain(altosId, "Primer aprovisionamiento").catch((e: unknown) => e);
    expect(disabled).toMatchObject({ status: 409, code: "CHN_DISABLED" });
    expect(explainRuleError(disabled).message).toMatch(/La cadena no está configurada en este entorno/);
    const cinti = await collectionOf("Singani Gran Reserva 2026");
    await expect(setWineryContractPaused(cinti.wineryId, true, "Incidente", key())).rejects.toMatchObject({
      code: "CHN_DISABLED",
    });
  });

  it("los códigos y sujetos de alerta del paquete tienen su texto", async () => {
    for (const code of CHAIN_ALERT_CODES) expect(alertCodeLabel(code), code).not.toBe(code);
    for (const type of CHAIN_ALERT_SUBJECT_TYPES) expect(subjectTypeLabel(type), type).not.toBe(type);
    // Con la cadena configurada, el registro publica la cuenta de operaciones.
    await signIn("soporte");
    expect(chainConfigured(await fetchChainRegistry())).toBe(true);
  });

  it("soporte lee todo y no escribe nada (403)", async () => {
    await signIn("soporte");
    const open = await fetchTokenizationRequests({ limit: 20 });
    expect(open.total).toBe(3);
    const submitted = open.items.find((r) => r.status === "SUBMITTED")!;
    const inReview = open.items.find((r) => r.status === "IN_REVIEW")!;
    await expect(fetchTokenizationRequest(inReview.id)).resolves.toMatchObject({ id: inReview.id });

    await expect(takeTokenizationRequest(submitted.id)).rejects.toMatchObject(denied);
    await expect(addTokenizationNote(inReview.id, "Nota de soporte")).rejects.toMatchObject(denied);
    await expect(approveTokenizationRequest(inReview.id, {}, key())).rejects.toMatchObject(denied);
    await expect(rejectTokenizationRequest(inReview.id, "No procede")).rejects.toMatchObject(denied);

    const collections = await fetchCollections({ limit: 20 });
    expect(collections.total).toBe(4);
    const ready = collections.items.find((c) => c.status === "READY")!;
    await expect(fetchCollection(ready.id)).resolves.toMatchObject({ id: ready.id });
    await expect(fetchCollectionTokens(ready.id, { limit: 5 })).resolves.toMatchObject({ total: 240 });
    await expect(runCollectionAction(ready.id, "publish", { reason: null }, key())).rejects.toMatchObject(denied);
    await expect(updateCollection(ready.id, { reason: "Cambio de soporte" })).rejects.toMatchObject(denied);

    await expect(fetchChainAccounts()).resolves.toMatchObject({ network: "TESTNET" });
    const txs = await fetchChainTransactions({ limit: 5 });
    expect(txs.total).toBeGreaterThan(0);
    await expect(retryChainTransaction(txs.items[0]!.id, "Reintento", key())).rejects.toMatchObject(denied);
    await expect(startReconciliation({ scope: "ALL" })).rejects.toMatchObject(denied);
    const alerts = await fetchChainAlerts({ limit: 5 });
    await expect(resolveChainAlert(alerts.items[0]!.id, "Resuelta por soporte")).rejects.toMatchObject(denied);
    await expect(provisionWineryChain(ready.wineryId, "Reaprovisionar")).rejects.toMatchObject(denied);
    await expect(fetchWineryChainAccount(ready.wineryId)).resolves.toMatchObject({ identity: { status: "ACTIVE" } });
  });
});
